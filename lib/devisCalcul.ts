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
  tva_pct?: number | null;
  a_chiffrer?: boolean;
  // Traçabilité par zone (source : metre-complet) — champ JSON additif, facultatif.
  // Chaque ligne issue d'une zone conserve l'identifiant zone.id ; les lignes
  // issues de zones différentes ne sont jamais fusionnées silencieusement.
  zone_id?: string | null;
  type_ligne?: "standard" | "frais_deplacement" | null;
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

export interface FactureAnterieurePourSolde {
  numero: string;
  type_facture: string | null;
  statut?: string | null;
  tva_pct?: number | null;
  lignes: unknown;
}

/**
 * Construit les lignes de déduction pour une facture de solde/totale à partir
 * des factures d'acompte ET de situation non annulées déjà émises sur le devis,
 * en conservant la ventilation par taux de TVA d'origine.
 */
export function construireLignesDeductionFacturesAnterieures(
  factures: FactureAnterieurePourSolde[],
  tvaDefautDevis: number = 10,
): LigneDevis[] {
  const deductions: LigneDevis[] = [];
  const tvaFallback = Number.isFinite(Number(tvaDefautDevis)) ? Number(tvaDefautDevis) : 10;

  for (const f of factures || []) {
    if (f.statut === "annulee") continue;
    if (f.type_facture !== "acompte" && f.type_facture !== "situation") continue;

    const lignesFacture = Array.isArray(f.lignes) ? (f.lignes as Array<Partial<LigneDevis>>) : [];
    const tvaFacture =
      typeof f.tva_pct === "number" && Number.isFinite(f.tva_pct)
        ? f.tva_pct
        : tvaFallback;

    const parTva = new Map<number, number>();
    for (const l of lignesFacture) {
      if (l?.a_chiffrer) continue;
      const qte = Number(l?.qte);
      const pu = Number(l?.pu_ht);
      if (!Number.isFinite(qte) || !Number.isFinite(pu)) continue;
      const tauxLigne =
        typeof l?.tva_pct === "number" && Number.isFinite(l.tva_pct)
          ? l.tva_pct
          : tvaFacture;
      parTva.set(tauxLigne, (parTva.get(tauxLigne) ?? 0) + qte * pu);
    }

    const tauxTries = Array.from(parTva.keys()).sort((a, b) => a - b);
    const plusieursTranches = tauxTries.length > 1;
    const prefixe =
      f.type_facture === "situation"
        ? `Déduction de la situation n°${f.numero}`
        : `Déduction de la facture d'acompte n°${f.numero}`;

    for (const taux of tauxTries) {
      const baseHt = arrondir(parTva.get(taux) ?? 0);
      if (baseHt <= 0) continue;
      deductions.push({
        catalogue_id: null,
        designation: plusieursTranches ? `${prefixe} (TVA ${taux} %)` : prefixe,
        description: "",
        qte: -1,
        unite: "forfait",
        pu_ht: baseHt,
        pu_revient: null,
        type_cout: null,
        tva_pct: taux,
        a_chiffrer: false,
      });
    }
  }

  return deductions;
}