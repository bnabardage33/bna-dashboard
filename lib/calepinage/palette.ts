// Palette des groupes de modules, PARTAGÉE entre le canvas, le bordereau et les
// exports serveur : une seule source pour que « G-001 » ait partout la même
// couleur. Module pur (aucune dépendance DOM / serveur).

export const PALETTE_GROUPES = [
  "#3b82f6", // G-001 bleu
  "#ef4444", // G-002 rouge
  "#22c55e", // G-003 vert
  "#f59e0b", // G-004 orange
  "#8b5cf6", // G-005 violet
  "#06b6d4", // G-006 cyan
  "#ec4899", // G-007 rose
  "#84cc16", // G-008 lime
] as const;

/**
 * Couleur d'un groupe. « G-001 » → indice 0, « G-009 » → 0 (palette cyclique).
 * Numéro sans partie numérique : rang du groupe dans `numeros` (repli : 0).
 */
export function couleurGroupe(numero: string, numeros: readonly string[] = []): string {
  const n = Number.parseInt(numero.replace(/\D+/g, ""), 10);
  if (Number.isFinite(n) && n >= 1) return PALETTE_GROUPES[(n - 1) % PALETTE_GROUPES.length];
  const rang = numeros.indexOf(numero);
  return PALETTE_GROUPES[(rang >= 0 ? rang : 0) % PALETTE_GROUPES.length];
}
