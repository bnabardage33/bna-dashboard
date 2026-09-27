// lib/tauxTva.ts
//
// Règle MÉTIER unique du taux de TVA, partagée par l'UI et l'API.
//
// Origine du défaut (F3, audit final série B) : le serveur faisait
//   parseFloat(valeur) || 20
// `||` teste la VÉRACITÉ, pas l'EXISTENCE : `parseFloat("0")` vaut 0, qui est
// falsy, donc `0 || 20` renvoyait 20. Un document saisi à 0 % était donc
// AFFICHÉ à 0 % par l'UI (qui utilisait `|| 0`) puis ENREGISTRÉ à 20 %.
//
// La règle est ici écrite sans `||` sur la valeur métier :
//   - absent / vide / non numérique  -> TAUX_TVA_DEFAUT (20)
//   - 0                              -> 0      (0 est une valeur VALIDE)
//   - toute autre valeur finie       -> conservée telle quelle
//   - négatif / hors bornes          -> TAUX_TVA_DEFAUT (fail-closed)
//
// Module pur, sans dépendance serveur : importable depuis un composant
// « use client » comme depuis une route API. C'est la seule façon d'empêcher
// l'UI et le backend de diverger à nouveau sur ce taux.

/** Taux appliqué quand la valeur est absente ou inexploitable. */
export const TAUX_TVA_DEFAUT = 20;

/** Bornes de plausibilité d'un taux de TVA exprimé en pourcentage. */
export const TAUX_TVA_MIN = 0;
export const TAUX_TVA_MAX = 100;

/**
 * Convertit une valeur de taux de TVA (chaîne du formulaire, nombre de l'OCR,
 * `null`, `undefined`) en pourcentage exploitable.
 *
 * Le défaut est 20. `0` est préservé. Une valeur finie hors de [0, 100] est
 * refusée et remplacée par le défaut plutôt que propagée : un taux aberrant ne
 * doit pas produire un montant TTC absurde.
 */
export function normaliserTauxTva(valeur: unknown): number {
  // `parseFloat` tolère "12,5" et les espaces : cette tolérance de saisie est
  // conservée, et seule la première suite numérique de la chaîne est retenue
  // ("20abc" -> 20, comme le formulaire le faisait déjà).
  const n =
    typeof valeur === "number" ? valeur : parseFloat(toNombrebrut(valeur));

  if (!Number.isFinite(n)) return TAUX_TVA_DEFAUT;
  if (n < TAUX_TVA_MIN || n > TAUX_TVA_MAX) return TAUX_TVA_DEFAUT;
  return n;
}

function toNombrebrut(valeur: unknown): string {
  if (typeof valeur === "string") return valeur.trim().replace(/\s/g, "").replace(",", ".");
  return "";
}

/** Vrai si la valeur est un nombre fini — y compris 0 (test d'EXISTENCE). */
export function estNombreTauxTva(valeur: unknown): boolean {
  return typeof valeur === "number" && Number.isFinite(valeur);
}

/**
 * Sérialise le taux pour le `FormData` : une chaîne non vide, donc jamais
 * ambiguë pour `normaliserTauxTva` côté API. Remplace le `tauxTva || '20'`
 * historique, qui laissait passer une chaîne vide.
 */
export function serialiserTauxTva(valeur: unknown): string {
  return String(normaliserTauxTva(valeur));
}
