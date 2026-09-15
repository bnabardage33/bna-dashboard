import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calculerDevis } from "@/lib/devisCalcul";
import { ChantierIntrouvableError, servirPayloadMetreComplet } from "@/lib/servir-metre-complet";
import { scoreConceptVsItem } from "@/lib/catalogueMatching";
import {
  construireContexteBNA,
  decisionDemarrageAnalyse,
  normaliserAnalyseBrute,
  calculerEstimations,
  FRAICHEUR_VERROU_MS,
  ErreurAnalyse,
  type OuvrageAnalyse,
  type StatutAnalyse,
} from "@/lib/devisAnalyse";
import { preparerRemplacement, type AnalysePersistee } from "@/lib/devisHistorique";
import type { Json } from "@/types/supabase";

export const dynamic = "force-dynamic";

const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const PROMPT_MAX_CHARS = 6000;

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function lireParams(contexte: { params: Promise<{ devis_id: string }> }): Promise<string> {
  return contexte.params.then((p) => texte(p.devis_id));
}

type CatalogueOuvrage = {
  id: string;
  designation: string;
  description: string | null;
  famille_label: string;
  unite: string;
  pu_ht: number | null;
  pu_revient: number | null;
  type_cout: string | null;
};

function versOuvrageAnalyse(o: CatalogueOuvrage): OuvrageAnalyse {
  const { id, designation, unite, pu_ht, pu_revient, type_cout } = o;
  return {
    id,
    designation,
    unite,
    pu_ht,
    pu_revient,
    type_cout: type_cout === "main_oeuvre" ? "main_oeuvre" : type_cout === "matiere" ? "matiere" : null,
  };
}

async function chargerCatalogue(): Promise<{ complet: CatalogueOuvrage[]; parId: Map<string, OuvrageAnalyse> }> {
  const { data } = await supabaseAdmin
    .from("catalogue_ouvrages")
    .select("id, designation, description, famille_label, unite, pu_ht, pu_revient, type_cout");
  const complet: CatalogueOuvrage[] = (data ?? []).map((o) => o as unknown as CatalogueOuvrage);
  const parId = new Map<string, OuvrageAnalyse>(
    complet.map((o) => [o.id, versOuvrageAnalyse(o)])
  );
  return { complet, parId };
}

function selectionnerContexteCatalogue(
  catalogueComplet: CatalogueOuvrage[],
  reference: string,
): CatalogueOuvrage[] {
  if (catalogueComplet.length <= 40) return catalogueComplet;
  return [...catalogueComplet]
    .sort(
      (a, b) =>
        scoreConceptVsItem(reference, {
          id: b.id,
          designation: b.designation,
          description: b.description,
          famille_label: b.famille_label,
          unite: b.unite,
          type_cout: b.type_cout ?? "",
        }).score -
        scoreConceptVsItem(reference, {
          id: a.id,
          designation: a.designation,
          description: a.description,
          famille_label: a.famille_label,
          unite: a.unite,
          type_cout: a.type_cout ?? "",
        }).score,
    )
    .slice(0, 30);
}

async function revendiquerAnalyse(devisId: string): Promise<{
  ok: boolean;
  id: string;
  ancienne: AnalysePersistee | null;
  motif?: string;
}> {
  const { data: existante } = await supabaseAdmin
    .from("devis_ia")
    .select(
      "id, statut, version, updated_at, analyse_resultats, lignes_proposees, alertes, recommandations, total_estime, marge_estimee, marge_pct",
    )
    .eq("devis_id", devisId)
    .maybeSingle();

  const decision = decisionDemarrageAnalyse({
    existe: !!existante,
    statut: (existante?.statut as StatutAnalyse | undefined) ?? null,
    derniereMaj: existante?.updated_at ?? null,
  });
  if (!decision.autorise) {
    return { ok: false, id: "", ancienne: null, motif: decision.raison };
  }

  if (!existante) {
    // Première analyse : l'INSERT (contrainte UNIQUE(devis_id)) est atomique.
    // Un seul POST concurrent peut créer la ligne ; les autres échouent (23505).
    const { data: cree, error: errInsert } = await supabaseAdmin
      .from("devis_ia")
      .insert({ devis_id: devisId, statut: "en_cours", version: 1 })
      .select("id")
      .single();
    if (errInsert || !cree) {
      return {
        ok: false,
        id: "",
        ancienne: null,
        motif: errInsert?.code === "23505" ? "verrouille" : "indisponible",
      };
    }
    return { ok: true, id: cree.id, ancienne: null };
  }

  // Remplacement d'une analyse existante : la revendication se fait par un
  // UPDATE CONDITIONNEL atomique. Si 0 ligne est mise à jour, un concurrent
  // a déjà pris le verrou → refus.
  const seuilExpiration = new Date(Date.now() - FRAICHEUR_VERROU_MS).toISOString();
  const { data: misAJour, error: errUpdate } = await supabaseAdmin
    .from("devis_ia")
    .update({ statut: "en_cours", updated_at: new Date().toISOString() })
    .eq("devis_id", devisId)
    .or(`statut.in.(terminee,en_echec),updated_at.lt.${seuilExpiration}`)
    .select("id, version")
    .single();
  if (errUpdate || !misAJour) {
    return { ok: false, id: "", ancienne: null, motif: "verrouille" };
  }

  return {
    ok: true,
    id: existante.id,
    ancienne: {
      version: existante.version,
      analyse_resultats: existante.analyse_resultats,
      lignes_proposees: existante.lignes_proposees,
      alertes: existante.alertes,
      recommandations: existante.recommandations,
      total_estime: existante.total_estime,
      marge_estimee: existante.marge_estimee,
      marge_pct: existante.marge_pct,
    },
  };
}

// ── POST : lancer (ou relancer) une analyse IA d'un devis. ─────────────

export async function POST(req: NextRequest, contexte: { params: Promise<{ devis_id: string }> }) {
  const devisId = await lireParams(contexte);
  if (!devisId) {
    return NextResponse.json({ error: "devis_id manquant." }, { status: 400 });
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return NextResponse.json({ error: "Clé API Google AI manquante dans la configuration." }, { status: 503 });
  }

  try {
    const { data: devis, error: errDevis } = await supabaseAdmin
      .from("devis")
      .select("id, lignes, chantier_id, surface_m2")
      .eq("id", devisId)
      .maybeSingle();
    if (errDevis || !devis) {
      return NextResponse.json({ error: "Devis introuvable." }, { status: 404 });
    }

    const { complet: catalogueComplet, parId: catalogueParId } = await chargerCatalogue();

    // Contexte métre (optionnel) : aucune quantité n'est inventée ici.
    let payload: unknown = null;
    if (devis.chantier_id) {
      try {
        payload = await servirPayloadMetreComplet(devis.chantier_id);
      } catch (errMetre) {
        if (errMetre instanceof ChantierIntrouvableError) {
          payload = null;
        } else {
          throw errMetre;
        }
      }
    }

    // ── Verrou de concurrence (décision pure + revendication atomique). ──
    const revendication = await revendiquerAnalyse(devisId);
    if (!revendication.ok) {
      if (revendication.motif === "verrouille") {
        return NextResponse.json(
          { error: "Une analyse est déjà en cours pour ce devis." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Analyse indisponible." }, { status: 409 });
    }
    const devisIaId = revendication.id;

    try {
      const contexte = construireContexteBNA({
        devis: { id: devis.id, lignes: devis.lignes, surface_m2: devis.surface_m2 ?? null },
        payloadMetreComplet: payload,
        catalogue: catalogueComplet,
      });

      const reference =
        `${devis.id} ` +
        contexte.lignes.map((l) => l.designation).join(" ") +
        (contexte.chantier ? ` ${contexte.chantier.nom}` : "") +
        (contexte.zones.map((z) => z.nom).join(" ") || "");

      const catalogueContexte = selectionnerContexteCatalogue(catalogueComplet, reference).map(
        (c) => ({
          id: c.id,
          designation: c.designation,
          famille: c.famille_label,
          unite: c.unite,
          type: c.type_cout === "main_oeuvre" ? "main-d'œuvre" : "matériau",
        }),
      );

      const lignesExistantes = contexte.lignes.map((l) => ({
        designation: l.designation,
        qte: l.qte ?? null,
        unite: l.unite,
        prix: l.pu_ht ?? (l.a_chiffrer ? null : l.pu_ht ?? null),
        a_chiffrer: l.a_chiffrer ?? false,
        zone_id: l.zone_id ?? null,
      }));

      const chatierLigne = contexte.chantier
        ? `\nCHANTIER : ${contexte.chantier.nom}` + (contexte.chantier.adresse ? ` (${contexte.chantier.adresse})` : "")
        : "\nAUCUN chantier lié au devis.";

      const zonesLignes =
        contexte.zones.length > 0
          ? "\nZONES DU MÉTRÉ RÉEL :\n" +
            JSON.stringify(
              contexte.zones.map((z) => ({
                nom: z.nom,
                metrage_calcule: z.metrage,
                pose_calculee: z.pose,
                calepinage_calcule: z.calepinage,
              })),
            )
          : "\nAUCUNE zone de métré disponible.";

      const systemAnalyse =
        "Tu es un analyste de devis pour un métreur en bâtiment (bardage/ITE/charpente métallique). " +
        "Tu relis un devis EXISTANT (lignes persistées, prix déjà fixés) pour produire une ANALYSE critique et des lignes PROPOSÉES. " +
        "Interdiction stricte : NE RÉDIGE AUCUN PRIX ni montant. Le serveur réattribuera les prix à partir du catalogue. " +
        "Tu ne modifies JAMAIS un prix existant : les lignes persistées sont une source de vérité." +
        "\n\n" +
        "CONTEXTE DU DEVIS :\n" +
        `Total actuel : ${contexte.total_ht} € HT\n` +
        `Surface annoncée : ${contexte.surface_m2 ?? "inconnue"} m²\n` +
        `Nombre de lignes persistées : ${contexte.lignes.length}\n` +
        chatierLigne +
        zonesLignes +
        "\n\nLIGNES PERSISTÉES DU DEVIS :\n" +
        JSON.stringify(lignesExistantes) +
        "\n\nCATALOGUE DE L'ENTREPRISE (sources des désignations unitaires) :\n" +
        JSON.stringify(catalogueContexte) +
        "\n\nRÉPONSE STRICTEMENT JSON — sans texte avant/après, sans markdown :" +
        '{"analyse_resultats":{"resume":"<appréciation en 1-2 phrases>","nb_lignes_persistees":<nombre>,"nb_a_chiffrer":<nombre>},"lignes_proposees":[{"catalogue_id":"<id exact du catalogue ou null>","designation":"<désignation courte>","qte":nombre|null,"description":"<note courte>"}],"alertes":["<alerte>"],"recommandations":["<recommandation>"]}' +
        "\nRÈGLES IMPÉRATIVES :" +
        "\n1. catalogue_id : UNIQUEMENT un id EXACT présent dans le catalogue fourni. Sinon null." +
        "\n2. Sauf incohérence, reprends les lignes persistées chiffrées telles quelles (désignation + quantité + catalogue_id correspondant)." +
        "\n3. Relève les quantités manquantes (a_chiffrer) comme lignes PROPOSÉES via une référence catalogue correspondante quand le GROS ŒUVRE/le métré réel la justifie (zone calculée) ; sinon catalogue_id null." +
        "\n4. qte : uniquement un NOMBRE, ou null si aucune quantité n'est justifiable. Ne déduis jamais une surface." +
        "\n5. alertes : incohérences, quantités suspectes, doublons, prix manquants." +
        "\n6. recommandations : pistes d'optimisation chiffrables uniquement via le métré/catalogue réel." +
        "\n7. MAXIMUM 20 lignes proposées.";

      const prompt = JSON.stringify({
        devis_id: contexte.devisId,
        total_ht_actuel: contexte.total_ht,
        lignes_existantes: lignesExistantes,
        zones: contexte.zones,
      }).slice(0, PROMPT_MAX_CHARS);

      const { text: texteReponse } = await generateText({
        model: googleProvider("gemini-3.5-flash-lite"),
        system: systemAnalyse,
        prompt,
        temperature: 0.2,
      });
      // Marqueur d'observabilité : UNE analyse = UN appel LLM (vérifiable au test de concurrence).
      console.info(`[devis_ia] analyse LLM lancée devis_id=${devisId}`);

      let brute: unknown;
      try {
        const nettoye = texteReponse.trim().replace(/```json/g, "").replace(/```/g, "").trim();
        brute = JSON.parse(nettoye);
      } catch (errParse) {
        console.error("Erreur de parsing JSON Analyse IA. Texte reçu :", texteReponse);
        throw new ErreurAnalyse("L'IA n'a pas renvoyé de JSON valide.");
      }

      const lue = normaliserAnalyseBrute(brute, catalogueParId);
      const estims = calculerEstimations(lue.lignes_proposees);
      const { snapshot, version } = preparerRemplacement(revendication.ancienne);
      const nb_a_chiffrer = calculerDevis(lue.lignes_proposees).nb_a_chiffrer;

      // Historique append-only : snapshot de l'ancienne AVANT remplacement.
      if (snapshot) {
        const { error: errArchive } = await supabaseAdmin
          .from("devis_ia_historique")
          .insert({
            devis_ia_id: devisIaId,
            version: snapshot.version,
            snapshot: snapshot.contenu as unknown as Json,
          });
        if (errArchive) {
          console.error("Erreur archivage historique devis_ia :", errArchive.message);
          throw new ErreurAnalyse("Impossible d'archiver l'historique.");
        }
      }

      const { error: errEcriture } = await supabaseAdmin
        .from("devis_ia")
        .update({
          statut: "terminee",
          analyse_resultats: lue.analyse_resultats as unknown as Json,
          lignes_proposees: lue.lignes_proposees as unknown as Json,
          alertes: lue.alertes as unknown as Json,
          recommandations: lue.recommandations as unknown as Json,
          total_estime: estims.total_estime,
          marge_estimee: estims.marge_estimee,
          marge_pct: estims.marge_pct,
          version,
          updated_at: new Date().toISOString(),
        })
        .eq("devis_id", devisId);
      if (errEcriture) {
        console.error("Erreur écriture devis_ia :", errEcriture.message);
        throw new ErreurAnalyse("Impossible d'enregistrer l'analyse.");
      }

      return NextResponse.json({
        ok: true,
        id: devisIaId,
        version,
        statut: "terminee",
        total_estime: estims.total_estime,
        marge_estimee: estims.marge_estimee,
        marge_pct: estims.marge_pct,
        nb_a_chiffrer,
        nb_alertes: lue.alertes.length,
        lignes: lue.lignes_proposees,
      });
    } catch (errAnalyse) {
      // Échec après revendication → on relâche le verrou sans inventer.
      await supabaseAdmin
        .from("devis_ia")
        .update({ statut: "en_echec", updated_at: new Date().toISOString() })
        .eq("devis_id", devisId);
      throw errAnalyse;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Erreur Analyse IA Devis:", message);
    return NextResponse.json(
      { error: "L'analyse a échoué: " + message },
      { status: err instanceof ErreurAnalyse ? 422 : 500 },
    );
  }
}

// ── GET : lecture de l'analyse existante (+ historique optionnel). ─────

export async function GET(req: NextRequest, contexte: { params: Promise<{ devis_id: string }> }) {
  const devisId = await lireParams(contexte);
  if (!devisId) {
    return NextResponse.json({ error: "devis_id manquant." }, { status: 400 });
  }

  try {
    const { data: analyse, error: errAnalyse } = await supabaseAdmin
      .from("devis_ia")
      .select(
        "id, devis_id, analyse_resultats, lignes_proposees, alertes, recommandations, total_estime, marge_estimee, marge_pct, version, statut, created_at, updated_at",
      )
      .eq("devis_id", devisId)
      .maybeSingle();
    if (errAnalyse || !analyse) {
      return NextResponse.json({ error: "Aucune analyse pour ce devis." }, { status: 404 });
    }

    const avecHistorique = req.nextUrl.searchParams.get("avec_historique") === "true";
    let historique = null;
    if (avecHistorique) {
      const { data: hist } = await supabaseAdmin
        .from("devis_ia_historique")
        .select("id, version, snapshot, cree_le")
        .eq("devis_ia_id", analyse.id)
        .order("cree_le", { ascending: true });
      historique = hist ?? null;
    }

    return NextResponse.json({ analyse, historique });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Erreur Lecture Analyse IA Devis:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}