import { mapperLignesPersistees } from "@/lib/devisAnalyse";
import type { Tables } from "@/types/supabase";

export type AnalytiqueFournisseur = {
  fournisseur_id: string;
  nom: string;
  total_achats_reels_ht: number; // Commandes réelles passées
  cout_achat_theorique_vendu: number; // Qte * pu_revient_catalogue des devis signés
  total_ventes_ht: number; // Qte * pu_ht des devis signés
  marge_theorique: number; // Ventes - Achat Théorique
  rentabilite_pct: number;
  ecart_achat: number; // Achat Théorique - Achats Réels
};

export function analyserPerformancesFournisseurs(
  fournisseurs: Tables<"fournisseurs">[],
  commandes: Tables<"commandes">[],
  devis: Tables<"devis">[],
  catalogue: Tables<"catalogue_ouvrages">[]
): AnalytiqueFournisseur[] {
  // Map catalogue -> fournisseur nom & pu_revient
  const catalogueFournisseurMap = new Map<string, { fournisseur: string; pu_revient: number }>();
  for (const c of catalogue) {
    if (c.fournisseur) {
      catalogueFournisseurMap.set(c.id, {
        fournisseur: c.fournisseur,
        pu_revient: c.pu_revient || 0,
      });
    }
  }

  const statutsAchat = ["commandee", "partiellement_livree", "livree", "valide", "recu"];
  const achatsValides = commandes.filter((c) => statutsAchat.includes(c.statut));

  const statutsVente = ["signe", "accepte"];
  const devisValides = devis.filter((d) => statutsVente.includes(d.statut));

  return fournisseurs.map((f) => {
    // Achats réels (bons de commande)
    const achatsFournisseur = achatsValides.filter((c) => c.fournisseur_id === f.id);
    const totalAchatsReels = achatsFournisseur.reduce((acc, c) => acc + (c.montant_ht || 0), 0);

    let totalVentes = 0;
    let coutAchatTheorique = 0;

    for (const d of devisValides) {
      // `devis.lignes` est un `Json` en base. `mapperLignesPersistees` est le
      // mappeur SÛR déjà utilisé par le reste du projet vers `LigneDevis` : il
      // écarte les entrées non-objet et coerce les montants en `number | null`.
      // On l'utilise plutôt qu'un `as` : sans lui, une ligne `null` dans le JSON
      // faisait lever `ligne.catalogue_id` sur `null`.
      for (const ligne of mapperLignesPersistees(d.lignes)) {
        if (ligne.catalogue_id) {
          const articleData = catalogueFournisseurMap.get(ligne.catalogue_id);
          if (
            articleData &&
            articleData.fournisseur.toLowerCase() === f.nom.toLowerCase()
          ) {
            const qte = ligne.qte || 0;
            const prixVente = ligne.pu_ht || 0;
            // Si la ligne a mémorisé son pu_revient, on l'utilise, sinon on prend celui du catalogue
            const prixAchat = typeof ligne.pu_revient === "number" ? ligne.pu_revient : articleData.pu_revient;

            totalVentes += qte * prixVente;
            coutAchatTheorique += qte * prixAchat;
          }
        }
      }
    }

    const margeTheorique = totalVentes - coutAchatTheorique;
    const rentabilitePct = totalVentes > 0 ? (margeTheorique / totalVentes) * 100 : 0;
    const ecartAchat = coutAchatTheorique - totalAchatsReels;

    return {
      fournisseur_id: f.id,
      nom: f.nom,
      total_achats_reels_ht: totalAchatsReels,
      cout_achat_theorique_vendu: coutAchatTheorique,
      total_ventes_ht: totalVentes,
      marge_theorique: margeTheorique,
      rentabilite_pct: rentabilitePct,
      ecart_achat: ecartAchat,
    };
  }).sort((a, b) => b.total_achats_reels_ht - a.total_achats_reels_ht);
}
