import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculerDevis,
  creerLigneAChiffrer,
  type CoutType,
  type LigneDevis,
} from "@/lib/devisCalcul";
import {
  meilleureCorrespondance,
  scoreConceptVsItem,
  normaliser as normaliserMatching,
  type Correspondance,
  type ItemCatalogue,
} from "@/lib/catalogueMatching";
import { servirPayloadMetreComplet, ChantierIntrouvableError } from "@/lib/servir-metre-complet";
import { mapperQuantitesPersistees } from "@/lib/metreVersPostes";
import {
  construireLignesDepuisPostes,
  construireLignesAChiffrerManquantes,
  cheminMetreDisponible,
} from "@/lib/iaDevisMetre";

const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const PROMPT_MAX_CHARS = 6000;

// ── CHEMIN LEGACY (sans chantier_id) ───────────────────────────────────
// Quantités OSSATURE (DTU 41.2) — uniquement quand aucun payload metre-complet
// n'est disponible (pas de chantier_id). Les règles 1,5 / 2 / 6 ne sont
// JAMAIS utilisées lorsque le chemin metre-complet est actif (chantier_id fourni).
type RegleOssature = { matcher: RegExp; facteur: number; type: "ml" | "unite" };
const REGLES_OSSATURE: RegleOssature[] = [
  { matcher: /chevron/i, facteur: 1.5, type: "ml" },
  { matcher: /équerre|equerre/i, facteur: 2, type: "unite" },
  { matcher: /cheville/i, facteur: 6, type: "unite" },
];

function estUniteM2(unite: string): boolean {
  const u = unite.toLowerCase().replace(/\s+/g, "");
  return u === "m²" || u === "m2" || u === "m^2" || u === "mq";
}

function estUnitePiece(unite: string): boolean {
  const u = unite.toLowerCase();
  return u === "u" || u === "unité" || u === "unite" || u.includes("pièce") || u.includes("piece") || u.includes("unit");
}

/** Vrai si la demande contient une quantité EXPLICITE. */
function quantiteExpliciteDansLaDemande(prompt: string): boolean {
  return /(\d+(?:[.,]\d+)?)\s*(?:m2|mq|m\s?carre|unit\w*|pieces?|heures?|chevrons?|vis|equerres?)/.test(
    normaliserMatching(prompt)
  );
}

type CatalogueOuvrage = {
  id: string;
  designation: string;
  description: string | null;
  famille_label: string;
  unite: string;
  pu_ht: number;
  pu_revient: number;
  type_cout: string;
};

function versItemCatalogue(o: CatalogueOuvrage): ItemCatalogue {
  return {
    id: o.id,
    designation: o.designation,
    description: o.description,
    famille_label: o.famille_label,
    unite: o.unite,
    type_cout: o.type_cout,
  };
}

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function estNombrePositif(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function appliquerQuantitesFactuelles(
  ligne: LigneDevis,
  surface: number | null,
  catalogue: Map<string, CatalogueOuvrage>,
  qteExplicite: boolean
): LigneDevis {
  if (ligne.a_chiffrer || !ligne.catalogue_id) return ligne;
  if (qteExplicite) return ligne;
  const ouvrage = catalogue.get(ligne.catalogue_id);
  if (!ouvrage) return ligne;

  const designation = ouvrage.designation;
  const regle = REGLES_OSSATURE.find((r) => r.matcher.test(designation));

  if (surface !== null) {
    if (regle) {
      let qte = surface * regle.facteur;
      if (regle.type === "unite" || estUnitePiece(ouvrage.unite)) qte = Math.ceil(qte);
      else qte = Math.round(qte * 100) / 100;
      return { ...ligne, qte };
    }
    if (estUniteM2(ouvrage.unite)) {
      return { ...ligne, qte: Math.round(surface * 100) / 100 };
    }
    return ligne;
  }

  return ligne;
}

function construireLigne(
  ouvrage: CatalogueOuvrage,
  description: string,
  qte: number | null,
  surface: number | null,
  catalogueMap: Map<string, CatalogueOuvrage>,
  qteExplicite: boolean
): LigneDevis {
  const ligne: LigneDevis = {
    catalogue_id: ouvrage.id,
    designation: ouvrage.designation,
    description,
    qte: qte ?? 0,
    unite: ouvrage.unite,
    pu_ht: ouvrage.pu_ht,
    pu_revient: ouvrage.pu_revient ?? 0,
    type_cout: (ouvrage.type_cout === "main_oeuvre" ? "main_oeuvre" : "matiere") as CoutType,
    a_chiffrer: false,
  };
  return appliquerQuantitesFactuelles(ligne, surface, catalogueMap, qteExplicite);
}

function finaliserQuantites(lignes: LigneDevis[]): LigneDevis[] {
  return lignes.map((l) => {
    if (l.a_chiffrer || l.catalogue_id == null) return l;
    if (l.qte == null || l.qte <= 0) {
      // Faille 3 corrigée : on transmet le zone_id existant
      return {
        ...creerLigneAChiffrer(l.designation, "Quantité indéterminée — à compléter."),
        zone_id: l.zone_id
      };
    }
    return l;
  });
}

type ConceptIntent = {
  prestation: string;
  qte: number | null;
  description: string;
};

// ── Chemin LLM legacy (sans payload metre-complet) ─────────────────────

async function cheminLegacy(
  prompt: string,
  surface: number | null,
  catalogueComplet: CatalogueOuvrage[],
  catalogueMap: Map<string, CatalogueOuvrage>,
): Promise<{ lignes: LigneDevis[]; surface_utilisee: number | null }> {
  const promptNorm = normaliserMatching(prompt);
  const needsOssature = ["bardage", "ite", "claire-voie", "hpl", "veture"].some((w) => promptNorm.includes(w));
  const contextuel: CatalogueOuvrage[] =
    catalogueComplet.length <= 60
      ? catalogueComplet
      : [...catalogueComplet]
          .sort(
            (a, b) =>
              scoreConceptVsItem(prompt, versItemCatalogue(b)).score -
              scoreConceptVsItem(prompt, versItemCatalogue(a)).score
          )
          .slice(0, 25);

  const catalogueString =
    contextuel.length > 0
      ? "\n\nCATALOGUE DE L'ENTREPRISE (références à ta disposition — pour t'aider à comprendre ce qui existe. Écris chaque intention avec TES PROPRES MOTS, sans recopier ces désignations) :\n" +
        JSON.stringify(
          contextuel.map((c) => ({
            id: c.id,
            designation: c.designation,
            famille: c.famille_label,
            unite: c.unite,
            type: c.type_cout === "main_oeuvre" ? "main-d'œuvre" : "matériau",
          }))
        )
      : "\n\nLe catalogue est vide : aucune référence disponible.";

  const surfaceLine =
    surface !== null
      ? `\nSURFACE NETTE FACTUELLE : ${surface} m² (donnée terrain réelle. Ne la devine JAMAIS autrement et ne l'arrondis pas de façon créative.)`
      : `\nAUCUNE surface factuelle n'est fournie : n'invente AUCUNE quantité en m² ni pour l'ossature. Utilise une quantité uniquement si elle est explicitement énoncée dans la demande.`;

  const consignesOssature = needsOssature
    ? "\nSi la demande concerne un bardage/ITE/claire-voie/HPL et qu'AUCUNE ligne d'ossature n'est déjà demandée, propose alors UNE intention d'ossature adaptée (chevrons/équerres/chevilles) avec TES PROPRES MOTS. N'ajoute RIEN si l'utilisateur a déjà énuméré ses prestations."
    : "";

  const systemPas1 =
    "Tu es un métreur en bâtiment spécialiste bardage/charpente métallique. Le client dicte une demande de chantier ; tu la décomposes en PRESTATIONS avec tes propres mots, sans recopier les désignations du catalogue. Tu NE rédiges AUCUN prix, AUCUN catalogue_id, AUCUNE désignation : le serveur fera le rapprochement avec le catalogue." +
    catalogueString +
    surfaceLine +
    consignesOssature +
    "\n\nRÉPONSE STRICTEMENT JSON — réponds UNIQUEMENT par un tableau, sans texte avant/après, sans markdown :" +
    '[{"prestation":"<la prestation demandée, formulation libre et naturelle, sans prix ni quantité>","qte":nombre|null,"description":"détail technique court"}...]' +
    "\nRÈGLES IMPÉRATIVES :" +
    "\n1. prestation : décris en QUELQUES MOTS ce que le client veut (matériau, finition, usage, pose…). Conserve ses synonymes et son vocabulaire (« habillage imitation bois », « montage des éléments »…). Ne recopie JAMAIS une désignation du catalogue." +
    "\n2. qte : uniquement un NOMBRE, sans unité, ou null si aucune quantité n'est donnée. « 24 m² » → 24 ; « 36 chevrons » → 36 ; « 20 heures » → 20. Ne l'arrondis pas." +
    "\n3. description : détail technique court (matériau, épaisseur, contexte chantier)." +
    "\n4. Ne déduis pas une quantité à partir de la surface : si la demande contient un chiffre explicite, utilise-le ; sinon qte null. Ne déduplique JAMAIS une prestation déjà demandée." +
    "\nMAXIMUM 12 prestations par réponse.";

  const { text: textePas1 } = await generateText({
    model: googleProvider("gemini-3.5-flash-lite"),
    system: systemPas1,
    prompt,
    temperature: 0.2,
  });

  let jsonStringPas1 = textePas1.trim();
  jsonStringPas1 = jsonStringPas1.replace(/```json/g, "").replace(/```/g, "").trim();

  let intentionsBrutes: unknown[];
  try {
    const parsed = JSON.parse(jsonStringPas1);
    intentionsBrutes = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.lignes) ? parsed.lignes : [];
  } catch (parseError) {
    console.error("Erreur de parsing JSON IA Devis (pas 1). Texte reçu :", jsonStringPas1);
    return { lignes: [creerLigneAChiffrer("À CHIFFRER", "L'IA n'a pas renvoyé de tableau JSON valide.")], surface_utilisee: surface };
  }

  const intentions: ConceptIntent[] = intentionsBrutes
    .slice(0, 12)
    .map((raw) => ({
      prestation: texte((raw as { prestation?: unknown })?.prestation),
      qte: estNombrePositif((raw as { qte?: unknown })?.qte) ? ((raw as { qte?: unknown }).qte as number) : null,
      description: texte((raw as { description?: unknown })?.description),
    }))
    .filter((i) => i.prestation.length > 0);

  if (intentions.length === 0) {
    return { lignes: [creerLigneAChiffrer("À CHIFFRER", "Demande non interprétable.")], surface_utilisee: surface };
  }

  type Slot = {
    concept: ConceptIntent;
    correspondance: Correspondance | null;
    ligne: LigneDevis | null;
    dedoublonnee: boolean;
  };

  const utilisateur = new Set<string>();
  const slots: Slot[] = intentions.map((concept) => {
    const correspondance = meilleureCorrespondance(concept.prestation, catalogueComplet.map(versItemCatalogue));
    if (!correspondance) {
      return { concept, correspondance: null, ligne: null, dedoublonnee: false };
    }
    const ouvrage = catalogueMap.get(correspondance.item.id)!;
    if (utilisateur.has(ouvrage.id)) {
      return { concept, correspondance, ligne: null, dedoublonnee: true };
    }
    utilisateur.add(ouvrage.id);
    return { concept, correspondance, ligne: null, dedoublonnee: false };
  });

  slots.forEach((slot) => {
    if (!slot.correspondance || slot.dedoublonnee) return;
    const item = slot.correspondance.item;
    const ouvrage = catalogueMap.get(item.id)!;
    const qteExplicite = slot.concept.qte !== null && quantiteExpliciteDansLaDemande(prompt);
    const ligne = construireLigne(
      ouvrage,
      slot.concept.description,
      slot.concept.qte,
      surface,
      catalogueMap,
      qteExplicite
    ) as LigneDevis & { justification?: string; confiance?: number };
    ligne.justification = slot.correspondance.justification;
    ligne.confiance = Math.round(slot.correspondance.score * 100) / 100;
    slot.ligne = ligne;
  });

  const intentionsNonResolues = slots.filter(
    (s) => !s.correspondance && !s.dedoublonnee
  );

  if (intentionsNonResolues.length > 0 && catalogueComplet.length > 0) {
    const catalogueArbitrage = JSON.stringify(
      catalogueComplet.map((c) => ({
        id: c.id,
        designation: c.designation,
        famille: c.famille_label,
        type: c.type_cout === "main_oeuvre" ? "main-d'œuvre" : "matériau",
      }))
    );
    const systemPas2 =
      "Tu es un métreur en bâtiment. Pour CHAQUE prestation demandée par le client, tu identifies la référence du catalogue de l'entreprise qui lui correspond le MIEUX, en raisonnant sur le SENS (synonymes, formulation différente, fautes, pluriels, ordre des mots, termes métier)." +
      "\n\nCATALOGUE COMPLET DE L'ENTREPRISE :\n" +
      catalogueArbitrage +
      "\n\nRÉPONSE STRICTEMENT JSON — réponds UNIQUEMENT par un tableau, sans texte, sans markdown :" +
      '[{"prestation":"<texte exact reçu>","catalogue_id":"<id exact d\'une référence du catalogue>|null"}]' +
      "\nRÈGLES IMPÉRATIVES :" +
      "\n1. Pour chaque prestation, renvoie le catalogue_id EXACT de la référence qui correspond le mieux." +
      "\n2. catalogue_id null UNIQUEMENT si AUCUNE référence du catalogue ne correspond réellement.";

    try {
      const { text: textePas2 } = await generateText({
        model: googleProvider("gemini-3.5-flash-lite"),
        system: systemPas2,
        prompt: intentionsNonResolues.map((s) => s.concept.prestation).join("\n"),
        temperature: 0.1,
      });

      let jsonStringPas2 = textePas2.trim();
      jsonStringPas2 = jsonStringPas2.replace(/```json/g, "").replace(/```/g, "").trim();
      let arbitrages: unknown[] = [];
      try {
        const parsed = JSON.parse(jsonStringPas2);
        arbitrages = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.lignes) ? parsed.lignes : [];
      } catch (parseError2) {
        console.error("Erreur de parsing JSON IA Devis (pas 2). Texte reçu :", jsonStringPas2);
      }

      const mapArbitrage = new Map<string, string>();
      arbitrages.forEach((a) => {
        const prestation = texte((a as { prestation?: unknown })?.prestation);
        const id = texte((a as { catalogue_id?: unknown })?.catalogue_id);
        if (prestation && id) mapArbitrage.set(normaliserMatching(prestation), id.trim());
      });

      intentionsNonResolues.forEach((slot) => {
        const id = mapArbitrage.get(normaliserMatching(slot.concept.prestation)) || "";
        if (!id) {
          slot.ligne = creerLigneAChiffrer(
            slot.concept.prestation,
            slot.concept.description || "Prestation absente du catalogue."
          );
          return;
        }
        const ouvrage = catalogueMap.get(id);
        if (!ouvrage) {
          slot.ligne = creerLigneAChiffrer(
            slot.concept.prestation,
            slot.concept.description || "Référence inconnue pour cette prestation."
          );
          return;
        }
        if (utilisateur.has(ouvrage.id)) {
          slot.dedoublonnee = true;
          slot.ligne = null;
          return;
        }
        utilisateur.add(ouvrage.id);
        const qteExplicite = slot.concept.qte !== null && quantiteExpliciteDansLaDemande(prompt);
        const ligne = construireLigne(
          ouvrage,
          slot.concept.description,
          slot.concept.qte,
          surface,
          catalogueMap,
          qteExplicite
        ) as LigneDevis & { justification?: string; confiance?: number };
        ligne.justification = "Rapprochement sémantique (arbitrage spécialisé).";
        ligne.confiance = 0.6;
        slot.ligne = ligne;
      });
    } catch (errPas2) {
      console.error("Erreur arbitrage IA Devis (pas 2) :", errPas2 instanceof Error ? errPas2.message : String(errPas2));
      intentionsNonResolues.forEach((slot) => {
        slot.ligne = creerLigneAChiffrer(
          slot.concept.prestation,
          slot.concept.description || "Prestation absente du catalogue."
        );
      });
    }

    intentionsNonResolues.forEach((slot) => {
      if (!slot.ligne) {
        slot.ligne = creerLigneAChiffrer(
          slot.concept.prestation,
          slot.concept.description || "Prestation absente du catalogue."
        );
      }
    });
  } else if (intentionsNonResolues.length > 0) {
    intentionsNonResolues.forEach((slot) => {
      slot.ligne = creerLigneAChiffrer(
        slot.concept.prestation,
        slot.concept.description || "Prestation absente du catalogue."
      );
    });
  }

  const lignes: LigneDevis[] = finaliserQuantites(
    slots.filter((s) => s.ligne).map((s) => s.ligne as LigneDevis)
  );
  return { lignes, surface_utilisee: surface };
}

// ── POST ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json({ error: "Clé API Google AI manquante dans la configuration." }, { status: 503 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const prompt = texte(body.prompt);
    if (!prompt) {
      return NextResponse.json({ error: "Prompt manquant" }, { status: 400 });
    }
    if (prompt.length > PROMPT_MAX_CHARS) {
      return NextResponse.json({ error: "Demande trop longue." }, { status: 400 });
    }

    // ── Catalogue (source de vérité serveur, jamais prix côté client). ──
    const { data: catalogueData } = await supabaseAdmin
      .from("catalogue_ouvrages")
      .select("id, designation, description, famille_label, unite, pu_ht, pu_revient, type_cout");

    const catalogueComplet: CatalogueOuvrage[] = (catalogueData ?? []).map(
      (o) => o as unknown as CatalogueOuvrage
    );
    const catalogueMap = new Map<string, CatalogueOuvrage>(
      catalogueComplet.map((o) => [o.id, o])
    );

    // ── Choisir le chemin : metre-complet (chantier_id) OU legacy. ──────
    const chantierId = texte(body.chantier_id) || null;

    if (chantierId) {
      // ─── CHEMIN METRE-COMPLET (source de vérité unique) ────────────────
      // Les règles 1,5 / 2 / 6 ne sont JAMAIS appliquées sur ce chemin :
      // toutes les quantités proviennent du JSONB persisté.
      try {
        const payload = await servirPayloadMetreComplet(chantierId);

        if (!cheminMetreDisponible(payload)) {
          // Aucune zone calculée → tout est « À CHIFFRER », aucune quantité inventée.
          const lignes: LigneDevis[] = [creerLigneAChiffrer(
            "Chantier non métré",
            "Aucun résultat technique n'a encore été calculé pour ce chantier.",
          )];
          const { nb_a_chiffrer } = calculerDevis(lignes);
          return NextResponse.json({
            lignes,
            surface_utilisee: payload.totaux.surface_m2,
            nb_a_chiffrer,
            meta: payload.meta,
          });
        }

        const { postes, meta } = mapperQuantitesPersistees(payload);

        // ── Mapping pure transformation → LigneDevis (aucun recalcul). ──
        const lignesPostes: LigneDevis[] = construireLignesDepuisPostes(postes, catalogueComplet);

        // ── Lignes « À CHIFFRER » pour les zones avec données manquantes. ─
        const lignesManquantes: LigneDevis[] = construireLignesAChiffrerManquantes(payload);

        const lignes = finaliserQuantites([...lignesPostes, ...lignesManquantes]);
        const { nb_a_chiffrer } = calculerDevis(lignes);

        return NextResponse.json({
          lignes,
          surface_utilisee: payload.totaux.surface_m2,
          nb_a_chiffrer,
          meta,
        });
      } catch (errMetre) {
        if (errMetre instanceof ChantierIntrouvableError) {
          // Chantier_id fourni mais introuvable → on documente l'échec sans inventer.
          const lignes: LigneDevis[] = [creerLigneAChiffrer(
            "Chantier introuvable",
            `Le chantier « ${chantierId} » n'existe pas ou n'est pas accessible.`,
          )];
          const { nb_a_chiffrer } = calculerDevis(lignes);
          return NextResponse.json({
            lignes,
            surface_utilisee: null,
            nb_a_chiffrer,
          });
        }
        throw errMetre;
      }
    }

    // ─── CHEMIN LEGACY (sans chantier_id : prompt + surface_m2) ─────────
    // Règles 1,5 / 2 / 6 s'appliquent SEULEMENT ici (pour compatibilité
    // avec les appels historiques sans contexte chantier).
    const surfacePonctuelle = estNombrePositif(body.surface_m2) ? (body.surface_m2 as number) : null;

    const { lignes, surface_utilisee } = await cheminLegacy(
      prompt,
      surfacePonctuelle,
      catalogueComplet,
      catalogueMap,
    );

    const { nb_a_chiffrer } = calculerDevis(lignes);
    return NextResponse.json({
      lignes,
      surface_utilisee,
      nb_a_chiffrer,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Erreur IA Devis:", message);
    return NextResponse.json({ error: "L'IA a échoué: " + message }, { status: 500 });
  }
}