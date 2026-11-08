import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resoudreTenant } from "@/lib/tenant";
import {
  calculerDevis,
  creerLigneAChiffrer,
  typeCoutValide,
  type CoutType,
  type LigneDevis,
} from "@/lib/devisCalcul";
import { validerTauxRetenue } from "@/lib/retenueCalculs";
import { resoudrePrixOuvrage, type LignePrixResolue } from "@/lib/catalogue/resoudrePrix";

// Route protégée : NON listée dans PUBLIC_PATHS (lib/supabase/middleware.ts) →
// le middleware redirige les accès anonymes vers /login. Les données métier
// (clients, devis) ne transitent jamais par une route publique.
//
// But : le calcul officiel (total_ht, coûts, marge) est fait ICI par le serveur
// et figé dans les colonnes devis. Le navigateur n'a qu'une vue exploratoire.

type LigneBrute = Partial<LigneDevis> & Record<string, unknown>;

function estNombrePositif(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Normalise une ligne soumise :
 *  - catalogue_id inexistant → ligne « À CHIFFRER » (rejet de référence, pas d'invention).
 *  - catalogue_id valide   → designation / unite / pu_ht ÉCRASÉS par le catalogue
 *    (source de vérité). pu_revient et type_cout sont un snapshot du catalogue.
 *  - qte absente/≤0        → ligne incomplète « À CHIFFRER » (quantité inconnue).
 *  - unite façon pièce     → qte arrondie à l'unité supérieure (cohérent avec l'UI).
 */
function normaliserLigne(brute: LigneBrute, catalogue: Map<string, CatalogueRow>): LigneDevis {
  const id = typeof brute.catalogue_id === "string" ? brute.catalogue_id.trim() : "";
  // Traçabilité par zone (additif) : préservé si fourni par l'IA / le client.
  const zone_id = texte(brute.zone_id) || null;
  const type_ligne = brute.type_ligne === "frais_deplacement" ? "frais_deplacement" : null;

  if (!id) {
    // Ligne manuelle : saisie directe et complète par le patron (fonctionnalité
    // existante). Le patron reste la source de vérité de cette ligne. Sinon → À CHIFFRER.
    if (!brute.a_chiffrer) {
      const designation = texte(brute.designation);
      const qte = estNombrePositif(brute.qte) ? (brute.qte as number) : null;
      const pu = estNombrePositif(brute.pu_ht) ? (brute.pu_ht as number) : null;
      if (designation && qte !== null && pu !== null) {
        return {
          catalogue_id: null,
          designation,
          description: texte(brute.description) || "",
          qte,
          unite: texte(brute.unite) || "forfait",
          pu_ht: pu,
          pu_revient: null,
          type_cout: null,
          a_chiffrer: false,
          zone_id,
          type_ligne,
        };
      }
    }
    return {
      ...creerLigneAChiffrer(
        texte(brute.designation) || "À CHIFFRER",
        texte(brute.description)
      ),
      zone_id,
    };
  }

  const ouvrage = catalogue.get(id);
  if (!ouvrage) {
    return {
      ...creerLigneAChiffrer(
        texte(brute.designation) || "À CHIFFRER",
        texte(brute.description) || `Référence inconnue dans le catalogue : ${id}`
      ),
      zone_id,
    };
  }

  let qte = typeof brute.qte === "number" && Number.isFinite(brute.qte) ? brute.qte : null;
  if (qte !== null && qte <= 0) qte = null;

  if (qte === null) {
    return {
      ...creerLigneAChiffrer(
        ouvrage.designation,
        texte(brute.description) || "Quantité manquante — à compléter."
      ),
      zone_id,
    };
  }

  if (ouvrage.pu_ht === null || ouvrage.statut_vente === "a_chiffrer") {
    return {
      ...creerLigneAChiffrer(
        ouvrage.designation,
        texte(brute.description) || ouvrage.description || "Tarif non renseigné — à chiffrer."
      ),
      zone_id,
    };
  }

  const uniteBas = ouvrage.unite.toLowerCase();
  if (
    uniteBas.includes("unit") ||
    uniteBas.includes("pièce") ||
    uniteBas.includes("piece") ||
    uniteBas === "u"
  ) {
    qte = Math.ceil(qte);
  }

  const type_cout: CoutType = typeCoutValide(ouvrage.type_cout)
    ? (ouvrage.type_cout as CoutType)
    : "matiere";

  return {
    catalogue_id: ouvrage.id,
    designation: ouvrage.designation,
    description: texte(brute.description) || ouvrage.description || "",
    qte,
    unite: ouvrage.unite,
    pu_ht: ouvrage.pu_ht,
    pu_revient: ouvrage.pu_revient,
    type_cout,
    a_chiffrer: false,
    zone_id,
  };
}

type CatalogueRow = {
  id: string;
  designation: string;
  description: string | null;
  unite: string;
  pu_ht: number | null;
  pu_revient: number | null;
  type_cout: string | null;
  statut_vente?: string;
  statut_cout?: string;
};

export async function POST(req: NextRequest) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const numero = texte(body.numero);
    const clientId = texte(body.client_id);

    if (!numero) {
      return NextResponse.json({ error: "Numéro de devis manquant." }, { status: 400 });
    }
    if (!clientId) {
      return NextResponse.json({ error: "Client manquant." }, { status: 400 });
    }

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, entreprise_id")
      .eq("id", clientId)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();
    if (!client) {
      return NextResponse.json({ error: "Client introuvable ou non rattaché à votre entreprise." }, { status: 404 });
    }

    const lignesBrutes: LigneBrute[] = Array.isArray(body.lignes) ? body.lignes : [];

    const { data: catalogueData } = await supabaseAdmin
      .from("catalogue_ouvrages")
      .select("id, designation, description, unite, pu_ht, pu_revient, type_cout");

    const { data: surchargesData } = await supabaseAdmin
      .from("catalogue_ouvrages_prix")
      .select("ouvrage_id, pu_ht, pu_revient")
      .eq("entreprise_id", tenant.entrepriseId);

    const surchargesMap = new Map(
      (surchargesData ?? []).map((s) => [s.ouvrage_id, s])
    );

    const catalogue = new Map<string, CatalogueRow>(
      (catalogueData ?? []).map((o) => {
        const resolu = resoudrePrixOuvrage(
          { pu_ht: o.pu_ht, pu_revient: o.pu_revient },
          surchargesMap.get(o.id)
        );
        return [
          o.id,
          {
            id: o.id,
            designation: o.designation,
            description: o.description,
            unite: o.unite,
            pu_ht: resolu.pu_ht,
            pu_revient: resolu.pu_revient,
            type_cout: o.type_cout,
            statut_vente: resolu.statut_vente,
            statut_cout: resolu.statut_cout,
          },
        ];
      })
    );

    const lignes = lignesBrutes.map((l) => normaliserLigne(l, catalogue));

    // Surface factuelle : CHANTIER PRIME (source de vérité terrain), sinon métré
    // ponctuel fourni au devis. Jamais devinée.
    let surface_m2: number | null = null;
    const entreprise_id = tenant.entrepriseId;
    const chantierId = texte(body.chantier_id);
    if (chantierId) {
      const { data: chantier } = await supabaseAdmin
        .from("chantiers")
        .select("id, surface_m2, entreprise_id, client_id")
        .eq("id", chantierId)
        .eq("entreprise_id", tenant.entrepriseId)
        .maybeSingle();

      if (!chantier) {
        return NextResponse.json(
          { error: "Chantier introuvable ou non rattaché à votre entreprise." },
          { status: 404 }
        );
      }
      if (chantier.client_id && chantier.client_id !== clientId) {
        return NextResponse.json({ error: "Le client du devis ne correspond pas au client du chantier." }, { status: 400 });
      }
      if (chantier?.surface_m2 && chantier.surface_m2 > 0) {
        surface_m2 = chantier.surface_m2;
      }
    }
    if (surface_m2 === null && estNombrePositif(body.surface_m2)) {
      surface_m2 = body.surface_m2;
    }

    let tauxRetenue = 0;
    try {
      tauxRetenue = validerTauxRetenue(body.retenue_garantie_pct ?? 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Taux de retenue invalide.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const calculs = calculerDevis(lignes);

    const insertDevis = {
      numero,
      client_id: clientId,
      chantier_id: chantierId || null,
      entreprise_id,
      objet: texte(body.objet) || null,
      adresse_chantier: texte(body.adresse_chantier) || null,
      type_travaux: texte(body.type_travaux) || null,
      validite_jours:
        typeof body.validite_jours === "number" && Number.isFinite(body.validite_jours)
          ? body.validite_jours
          : null,
      delai_jours:
        typeof body.delai_jours === "number" && Number.isFinite(body.delai_jours)
          ? body.delai_jours
          : null,
      acompte_pct:
        typeof body.acompte_pct === "number" && Number.isFinite(body.acompte_pct)
          ? body.acompte_pct
          : null,
      tva_pct:
        typeof body.tva_pct === "number" && Number.isFinite(body.tva_pct)
          ? body.tva_pct
          : 10,
      statut: "brouillon",
      lignes,
      total_ht: calculs.total_ht,
      cout_matiere_ht: calculs.cout_matiere_ht,
      cout_main_oeuvre_ht: calculs.cout_main_oeuvre_ht,
      marge_ht: calculs.marge_ht,
      marge_pct: calculs.marge_pct,
      surface_m2,
      retenue_garantie_pct: tauxRetenue,
    };

    // `entreprise_id` est TOUJOURS renseigné ici (vérifié non-null plus haut) :
    // le cast `as never` devient inutile depuis la régénération des types
    // (devis.entreprise_id désormais typé requis dans types/supabase.ts).
    const { data, error } = await supabaseAdmin
      .from("devis")
      .insert(insertDevis)
      .select("id");

    let idCree: string | null = null;
    if (data && data[0]) idCree = data[0].id;

    if (error) {
      console.error("Erreur création devis:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: idCree, ...calculs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Erreur /api/devis:", message);
    return NextResponse.json({ error: "Erreur serveur lors de la création du devis." }, { status: 500 });
  }
}
