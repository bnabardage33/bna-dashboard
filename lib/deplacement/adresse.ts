// lib/deplacement/adresse.ts
//
// Adresse de départ par DÉFAUT du calcul de trajet, lue dans les Paramètres.
//
// Fonction PURE et sans dépendance : elle ne touche ni à Supabase ni au
// géocodage, ce qui la rend vérifiable seule (elle est importable dans un test
// sans React, sans navigateur et sans variables d'environnement).
//
// Le calcul de trajet n'est pas modifié. Cette fonction ne fait QUE mettre en
// forme la ligne `entreprise_settings` déjà stockée, pour préremplir un champ
// de formulaire qui reste libre : aucune valeur n'est écrite en base, et le
//_geocodeur_ est toujours appelé sur la chaîne affichée dans le champ.

/**
 * Les trois colonnes d'adresse de l'entreprise, telles que renvoyées par
 * `entreprise_settings`. Volontairement `optional` : la lecture côté client
 * peut ne selectionner qu'un sous-ensemble de colonnes, et `undefined` doit
 * alors se comporter comme `null` — un champ vide, jamais « undefined ».
 */
export type LigneAdresseEntreprise = {
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
};

/**
 * Compose l'adresse postale complète : « 12 rue de la Paix, 75002 Paris ».
 *
 * Le code postal est deliberately inclus dans la chaîne parce que
 * `extraireCodePostal()` (`lib/deplacement/geocodage.ts`) en extrait un motif à
 * cinq chiffres POUR REPERER LES COMMUNES HOMONYMES : sans code postal dans la
 * chaîne, cette détection perd ce qui la rend utile et un trajet peut être
 * chiffré depuis le mauvais lieu sans aucun signal pour l'utilisateur.
 *
 * Les parties vides sont écartées, ce qui évite les séparateurs orphelins :
 * `code_postal` vide ne doit pas produire « 12 rue X,  Bordeaux ».
 */
export function composerAdresseDepart(
  ligne: LigneAdresseEntreprise | null | undefined,
): string {
  if (!ligne) return "";

  const voie = (ligne.adresse ?? "").trim();
  const codePostal = (ligne.code_postal ?? "").trim();
  const ville = (ligne.ville ?? "").trim();

  // « 75002 Paris » — l'espace reste interne, la virgule n'apparaît qu'entre la
  // voie et la localité.
  const localite = [codePostal, ville].filter(Boolean).join(" ");

  return [voie, localite].filter(Boolean).join(", ");
}