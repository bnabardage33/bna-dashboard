// lib/catalogue/resoudrePrix.ts
//
// Résolution atomique des prix du catalogue et calcul de complétude des coûts.
// Ce module formalise la matrice d'arbitrage entre catalogue commun et surcharges entreprise.

export type StatutPrixVente =
  | 'personnalise'
  | 'indicatif_non_personnalise'
  | 'a_chiffrer';

export type StatutCoutRevient =
  | 'renseigne'
  | 'a_completer';

export interface EntreeTarif {
  pu_ht?: unknown;
  pu_revient?: unknown;
}

export interface LignePrixResolue {
  pu_ht: number | null;
  pu_revient: number | null;
  statut_vente: StatutPrixVente;
  statut_cout: StatutCoutRevient;
  source_bloc: 'entreprise' | 'commun' | 'manquant';
}

/**
 * Filtre strict pour valider un montant monétaire.
 * Rejette NaN, Infinity, -Infinity, négatifs, null, undefined, chaînes non convertibles.
 * Accepte 0 (ex: prestation offerte).
 */
export function validerMontant(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined) {
    return null;
  }
  if (typeof valeur === 'string' && valeur.trim() === '') {
    return null;
  }
  const n = typeof valeur === 'number' ? valeur : typeof valeur === 'string' ? Number(valeur.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

/**
 * Résout les tarifs d'un ouvrage pour une entreprise donnée.
 * Règle de résolution :
 * 1. pu_ht : priorité à la surcharge entreprise valide (>= 0 et fini), sinon commun (>= 0 et fini), sinon null ('a_chiffrer').
 * 2. pu_revient : priorité au coût entreprise s'il existe.
 *    Si coût entreprise absent :
 *      - si pu_ht est indicatif commun -> pu_revient commun accepté (cohérence du bloc de référence).
 *      - si pu_ht est personnalisé entreprise -> le coût commun N'EST PAS injecté (évite les marges faussées), statut 'a_completer'.
 */
export function resoudrePrixOuvrage(
  ouvrageCommun: EntreeTarif,
  surchargeEntreprise?: EntreeTarif | null
): LignePrixResolue {
  const communHt = validerMontant(ouvrageCommun.pu_ht);
  const communRevient = validerMontant(ouvrageCommun.pu_revient);

  const entHt = surchargeEntreprise ? validerMontant(surchargeEntreprise.pu_ht) : null;
  const entRevient = surchargeEntreprise ? validerMontant(surchargeEntreprise.pu_revient) : null;

  // Détermination du prix de vente
  let pu_ht: number | null = null;
  let statut_vente: StatutPrixVente = 'a_chiffrer';
  let source_bloc: 'entreprise' | 'commun' | 'manquant' = 'manquant';

  if (entHt !== null) {
    pu_ht = entHt;
    statut_vente = 'personnalise';
    source_bloc = 'entreprise';
  } else if (communHt !== null) {
    pu_ht = communHt;
    statut_vente = 'indicatif_non_personnalise';
    source_bloc = 'commun';
  }

  // Détermination du coût de revient
  let pu_revient: number | null = null;
  let statut_cout: StatutCoutRevient = 'a_completer';

  if (entRevient !== null) {
    pu_revient = entRevient;
    statut_cout = 'renseigne';
  } else if (statut_vente === 'indicatif_non_personnalise' && communRevient !== null) {
    pu_revient = communRevient;
    statut_cout = 'renseigne';
  } else {
    pu_revient = null;
    statut_cout = 'a_completer';
  }

  return {
    pu_ht,
    pu_revient,
    statut_vente,
    statut_cout,
    source_bloc,
  };
}

export interface IndicateurMargeDevis {
  marge_fiable: boolean;
  nb_lignes_cout_inconnu: number;
}

/**
 * Vérifie si la marge globale d'un ensemble de lignes est rigoureusement fiable.
 * Si une seule ligne chiffrable n'a pas de coût de revient renseigné, la marge est signalée non fiable.
 */
export function evaluerFiabiliteMarge(
  lignes: Array<{ pu_ht: number | null; pu_revient?: number | null; a_chiffrer?: boolean; qte?: number | null }>
): IndicateurMargeDevis {
  let nb_lignes_cout_inconnu = 0;

  for (const ligne of lignes) {
    if (ligne.a_chiffrer) continue;
    if (typeof ligne.qte !== 'number' || ligne.qte <= 0) continue;
    const ht = validerMontant(ligne.pu_ht);
    if (ht === null) continue; // Ligne non chiffrée

    const revient = validerMontant(ligne.pu_revient);
    if (revient === null) {
      nb_lignes_cout_inconnu++;
    }
  }

  return {
    marge_fiable: nb_lignes_cout_inconnu === 0,
    nb_lignes_cout_inconnu,
  };
}
