export type MetierBna = "bardage" | "terrasse" | "cloture";

export type UniteQuantitatif = "m²" | "ml" | "u" | "h" | "forfait";

export type CategorieQuantitatif =
  | "materiaux"
  | "ossature"
  | "accessoires"
  | "main_oeuvre";

export interface LigneQuantitatifExportable {
  designation: string;
  reference?: string;
  unite: UniteQuantitatif;
  quantite: number;
  prix_unitaire_ht: number;
  tva_pct: 20 | 10 | 5.5 | 0;
  temps_pose_heures?: number;
  categorie: CategorieQuantitatif;
}

export interface QuantitatifExportable {
  metier: MetierBna;
  chantier_id?: string;
  chantier_nom?: string;
  client_id?: string;
  objet: string;
  surface_ou_lineaire?: number;
  lignes: LigneQuantitatifExportable[];
}

export const CLE_PREFILL_DEVIS_V2 = "bna_prefill_devis_v2";
export const CLE_PREFILL_COMMANDE = "bna_prefill_commande";

/**
 * Extrait uniquement les fournitures (exclusion formelle de la main-d'œuvre)
 * pour pré-remplir une commande fournisseur.
 */
export function extraireLignesCommandeFournisseur(q: QuantitatifExportable): Array<{
  designation: string;
  quantite: number;
  unite: string;
  pu_ht: number;
}> {
  return q.lignes
    .filter((l) => l.categorie !== "main_oeuvre" && l.unite !== "h" && l.quantite > 0)
    .map((l) => ({
      designation: l.designation,
      quantite: l.quantite,
      unite: l.unite,
      pu_ht: l.prix_unitaire_ht,
    }));
}

/**
 * Convertit un QuantitatifExportable en lignes de devis financier compatibles
 * avec l'éditeur `app/bureau/devis-factures/page.tsx`.
 */
export function convertirQuantitatifEnLignesDevis(q: QuantitatifExportable): Array<{
  id: string;
  designation: string;
  unite: string;
  qte: number;
  pu_ht: number;
  tva_pct: 20 | 10 | 5.5 | 0;
  remise_pct: number;
  catalogue_id: string | null;
  a_chiffrer: boolean;
}> {
  return q.lignes
    .filter((l) => l.quantite > 0)
    .map((l, idx) => ({
      id: `q-${q.metier}-${Date.now()}-${idx}`,
      designation: l.designation,
      unite: l.unite,
      qte: l.quantite,
      pu_ht: l.prix_unitaire_ht,
      tva_pct: l.tva_pct,
      remise_pct: 0,
      catalogue_id: null,
      a_chiffrer: false,
    }));
}
