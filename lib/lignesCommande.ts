// Construction pure des lignes_commande à insérer.
//
// Chaque ligne est rattachée à sa commande (commande_id) et, si disponible, à
// la zone (chantier_zones.id) d'où provient le chiffrage. zoneId peut être
// null pour les flux qui n'identifient pas de zone : les commandes existantes
// restent ainsi valides avec NULL, sans aucune ré-écriture.

export type LigneCommandeBrut = {
  article_id: string;
  fournisseur_id: string;
  quantite: number;
  prix_unitaire: number;
  total_ligne: number;
};

export type LigneCommandeInsert = LigneCommandeBrut & {
  commande_id: string;
  zone_id: string | null;
};

export function construireLignesCommande(
  commandeId: string,
  zoneId: string | null,
  lignes: LigneCommandeBrut[],
): LigneCommandeInsert[] {
  return lignes.map((l) => ({
    ...l,
    commande_id: commandeId,
    zone_id: zoneId,
  }));
}