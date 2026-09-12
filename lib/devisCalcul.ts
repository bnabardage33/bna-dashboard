// Moteur de calcul des devis — IA Devis phase 1.
// Bibliothèque PUR (aucune dépendance Supabase/React) : utilisable côté serveur
// (route /api/devis — calcul officiel figé à la création) et côté client (aperçu
// exploratoire uniquement, le chiffre de référence est celui stocké serveur).
//
// Contrats :
//  - Le catalogue_ouvrages est la SOURCE DE VÉRITÉ des désignations et prix.
//  - Une ligne « À CHIFFRER » (a_chiffrer = true) n'entre JAMAIS dans les totaux
//    : son montant est inconnu par construction.
//  - pu_revient est un snapshot du coût d'achat/pose au moment de la création du
//    devis. type_cout sépare matière (/ouvrages) et main-d'œuvre (/pose).

export type CoutType = "matiere" | "main_oeuvre";

export type LigneDevis = {
  catalogue_id: string | null;
  designation: string;
  description?: string | null;
  qte: number | null;
  unite: string;
  pu_ht: number | null;
  pu_revient?: number | null;
  type_cout?: CoutType | null;
  a_chiffrer?: boolean;
};

export type CalculsDevis = {
  total_ht: number;
  cout_matiere_ht: number;
  cout_main_oeuvre_ht: number;
  marge_ht: number;
  marge_pct: number;
  nb_a_chiffrer: number;
};

export type CoutTypeValide = CoutType;

export function typeCoutValide(v: unknown): v is CoutType {
  return v === "matiere" || v === "main_oeuvre";
}

export function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Une ligne n'entre dans le total QUE si elle est complète et chiffrée.
 * Deux cas valides :
 *  - ligne catalogue : en provenance du catalogue (catalogue_id renseigné) ;
 *  - ligne manuelle : saisie directe par le patron, hors catalogue (catalogue_id null,
 *    a_chiffrer false) — fonctionnalité existante préservée, le patron reste la source.
 */
export function estLigneChiffrable(l: LigneDevis): boolean {
  return (
    !l.a_chiffrer &&
    typeof l.qte === "number" &&
    l.qte > 0 &&
    typeof l.pu_ht === "number" &&
    l.pu_ht > 0
  );
}

export function montantLigne(l: LigneDevis): number {
  return estLigneChiffrable(l) ? arrondir(l.qte! * l.pu_ht!) : 0;
}

export function coutLigne(l: LigneDevis): number {
  if (!estLigneChiffrable(l)) return 0;
  const revient = typeof l.pu_revient === "number" ? l.pu_revient : 0;
  return arrondir(l.qte! * revient);
}

/**
 * Calcul officiel des totaux d'un devis.
 * marge_ht           = total_ht - cout_matiere_ht - cout_main_oeuvre_ht
 * marge_pct          = marge_ht / total_ht * 100  (0 si total_ht = 0)
 *
 * Les lignes « À CHIFFRER » sont exclues du total : leur contribution est inconnue.
 */
export function calculerDevis(lignes: LigneDevis[]): CalculsDevis {
  let total_ht = 0;
  let cout_matiere_ht = 0;
  let cout_main_oeuvre_ht = 0;
  let nb_a_chiffrer = 0;

  for (const ligne of lignes) {
    if (ligne.a_chiffrer) {
      nb_a_chiffrer += 1;
      continue;
    }
    total_ht = arrondir(total_ht + montantLigne(ligne));
    if (typeCoutValide(ligne.type_cout) && ligne.type_cout === "main_oeuvre") {
      cout_main_oeuvre_ht = arrondir(cout_main_oeuvre_ht + coutLigne(ligne));
    } else {
      cout_matiere_ht = arrondir(cout_matiere_ht + coutLigne(ligne));
    }
  }

  const marge_ht = arrondir(total_ht - cout_matiere_ht - cout_main_oeuvre_ht);
  const marge_pct = total_ht > 0 ? arrondir((marge_ht / total_ht) * 100) : 0;

  return {
    total_ht,
    cout_matiere_ht,
    cout_main_oeuvre_ht,
    marge_ht,
    marge_pct,
    nb_a_chiffrer,
  };
}

/** Fabrique une ligne « À CHIFFRER » (aucun prix, quantité inconnue). */
export function creerLigneAChiffrer(designation: string, description?: string): LigneDevis {
  return {
    catalogue_id: null,
    designation: designation || "À CHIFFRER",
    description: description || "",
    qte: null,
    unite: "forfait",
    pu_ht: null,
    pu_revient: null,
    type_cout: null,
    a_chiffrer: true,
  };
}