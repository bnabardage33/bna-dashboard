// Module devis_ia — historique append-only (ÉTAPE 1).
// Bibliothèque PUR : ne dépend que des entrées (l'ancienne analyse, la nouvelle)
// et expose la préparation du snapshot à archiver AVANT remplacement + la
// nouvelle version à écrire.

export type AnalysePersistee = {
  version: number;
  analyse_resultats: unknown;
  lignes_proposees: unknown;
  alertes: unknown;
  recommandations: unknown;
  total_estime: unknown;
  marge_estimee: unknown;
  marge_pct: unknown;
};

export type SnapshotHistorique = {
  /** Version de l'analyse archivée (celle remplacée). */
  version: number;
  /** Copie sérialisable complète de l'analyse remplacée. */
  contenu: {
    analyse_resultats: unknown;
    lignes_proposees: unknown;
    alertes: unknown;
    recommandations: unknown;
    total_estime: unknown;
    marge_estimee: unknown;
    marge_pct: unknown;
  };
};

/** Snapshot légalement sérialisable d'une analyse (append-only).
 *  Copie PROFONDE (structuredClone) : aucune référence partagée avec la
 *  ligne en base — une mutation ultérieure ne peut pas corrompre l'archive. */
export function snapshotAnalyse(analyse: AnalysePersistee): SnapshotHistorique {
  return structuredClone({
    version: analyse.version,
    contenu: {
      analyse_resultats: analyse.analyse_resultats,
      lignes_proposees: analyse.lignes_proposees,
      alertes: analyse.alertes,
      recommandations: analyse.recommandations,
      total_estime: analyse.total_estime,
      marge_estimee: analyse.marge_estimee,
      marge_pct: analyse.marge_pct,
    },
  });
}

export type RemplacementPrevu = {
  /** Snapshot à archiver AVANT remplacement (null si première analyse). */
  snapshot: SnapshotHistorique | null;
  /** Version de la nouvelle analyse (ancienne + 1, sinon 1). */
  version: number;
};

/**
 * Prépare un remplacement : l'ancienne analyse (si elle existe) est mise en
 * snapshot pour archivage append-only, et la version est incrémentée.
 * Appelée par la route AVANT l'écriture finale de la nouvelle analyse.
 */
export function preparerRemplacement(ancienne: AnalysePersistee | null): RemplacementPrevu {
  if (!ancienne) {
    return { snapshot: null, version: 1 };
  }
  return { snapshot: snapshotAnalyse(ancienne), version: ancienne.version + 1 };
}