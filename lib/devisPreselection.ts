// lib/devisPreselection.ts
// Réduit la fonctionnalité « Générer un devis » depuis le chantier à des
// fonctions pures (testables) + un contrat de présélection. Aucun moteur de
// calcul n'est importé : cette couche ne fait que de la NAVIGATION et de la
// lecture de l'identifiant du chantier.
//
// Le chantier_id transmis est TOUJOURS l'ID source, sans transformation.

/**
 * URL cible Devis & Factures pour un chantier. L'ID est encodé sans être
 * transformé (aucune déduction, aucune recherche par nom).
 */
export function hrefDevisChantier(chantierId: string): string {
  return `/bureau/devis-factures?chantier_id=${encodeURIComponent(chantierId)}`;
}

/**
 * Lit `chantier_id` depuis le query string App Router.
 * Retourne `null` si absent, vide ou non-texte → comportement actuel inchangé.
 */
export function chantierIdDepuisRecherche(params: {
  get(name: string): string | null;
}): string | null {
  const brut = params.get("chantier_id");
  if (typeof brut !== "string") return null;
  const id = brut.trim();
  return id.length > 0 ? id : null;
}

/** Décision de présélection : le chantier lu vaut-il l'ID demandé et a-t-il un client ? */
export type PreselectionDevis = {
  chantierId: string;
  clientId: string;
};

export function preselectSiValide(
  chantierIdDemande: string | null,
  chantier: { id: string; client_id: string | null } | null,
): PreselectionDevis | null {
  if (!chantierIdDemande || !chantier) return null;
  // L'ID transmis doit être EXACTEMENT celui de la source : on ne présélectionne
  // jamais un autre chantier, même si l'ID fourni est valide ailleurs.
  if (chantier.id !== chantierIdDemande) return null;
  // Chantier sans client → rien à pré-sélectionner (aucune sélection forcée).
  if (!chantier.client_id) return null;
  return { chantierId: chantier.id, clientId: chantier.client_id };
}

/** Plan d'action complet décidé à l'arrivée avec ?chantier_id=… */
export type PlanPreselection = {
  chantierId: string;
  clientId: string;
  ouvrirModale: boolean;
};

export function planPreselectionDevis(
  chantierIdDemande: string | null,
  choisiEnDeja: boolean,
  chantier: { id: string; client_id: string | null } | null,
): PlanPreselection | null {
  if (choisiEnDeja) return null;
  const choix = preselectSiValide(chantierIdDemande, chantier);
  if (!choix) return null;
  return { ...choix, ouvrirModale: true };
}