export type AnalytiqueFournisseur = {
  fournisseur_id: string;
  nom: string;
  total_achats_ht: number; // Commandes passées chez lui
  total_ventes_ht: number; // Devis signés utilisant ses articles
  marge_reelle: number;
  rentabilite_pct: number;
};

export function analyserPerformancesFournisseurs(
  fournisseurs: any[],
  commandes: any[],
  devis: any[],
  catalogue: any[]
): AnalytiqueFournisseur[] {
  // Créer un dictionnaire de mapping Catalogue -> Fournisseur Nom
  const catalogueFournisseurMap = new Map<string, string>();
  for (const c of catalogue) {
    if (c.fournisseur) {
      catalogueFournisseurMap.set(c.id, c.fournisseur);
    }
  }

  // Filtrer les commandes validées
  const statutsAchat = ["commandee", "partiellement_livree", "livree", "valide", "recu"];
  const achatsValides = commandes.filter((c) => statutsAchat.includes(c.statut));

  // Filtrer les devis signés
  const statutsVente = ["signe", "accepte"];
  const devisValides = devis.filter((d) => statutsVente.includes(d.statut));

  return fournisseurs.map((f) => {
    // Calcul Achats
    const achatsFournisseur = achatsValides.filter((c) => c.fournisseur_id === f.id);
    const totalAchats = achatsFournisseur.reduce((acc, c) => acc + (c.montant_ht || 0), 0);

    // Calcul Ventes
    // On cherche toutes les lignes de devis signés qui utilisent un article de CE fournisseur
    let totalVentes = 0;
    for (const d of devisValides) {
      if (Array.isArray(d.lignes)) {
        for (const ligne of d.lignes) {
          if (ligne.catalogue_id) {
            const nomFournisseurArticle = catalogueFournisseurMap.get(ligne.catalogue_id);
            // On matche par nom (insensible à la casse)
            if (
              nomFournisseurArticle &&
              nomFournisseurArticle.toLowerCase() === f.nom.toLowerCase()
            ) {
              totalVentes += (ligne.qte || 0) * (ligne.pu_ht || 0);
            }
          }
        }
      }
    }

    const margeReelle = totalVentes - totalAchats;
    const rentabilitePct = totalVentes > 0 ? (margeReelle / totalVentes) * 100 : 0;

    return {
      fournisseur_id: f.id,
      nom: f.nom,
      total_achats_ht: totalAchats,
      total_ventes_ht: totalVentes,
      marge_reelle: margeReelle,
      rentabilite_pct: rentabilitePct,
    };
  }).sort((a, b) => b.total_achats_ht - a.total_achats_ht); // Trier par volume d'achat
}
