// lib/terrasse/compatAccessoires.ts
//
// Règle de compatibilité accessoire ↔ lame, PARTAGÉE par le serveur
// (`app/api/catalogue-terrasse/route.ts`, filtre `compatibleWith`) et le client
// (`components/terrasse/TerrasseConfigForm.tsx`). Module PUR : aucune
// dépendance serveur (`next/headers`) ni client, donc importable des deux côtés
// sans franchir la frontière Server/Client.
//
// `materiel_compatibles` est un JSONB polymorphe : tableau de chaînes
// (identifiant de lame OU `type_material`) ou tableau d'objets
// (`{ lame_id | id, type_material | type }`). La règle reproduit EXACTEMENT le
// filtrage qui vivait auparavant dans le composant.

export interface AccessoireCompatibilite {
  id: string;
  materiel_compatibles: unknown;
}

/** Une entrée de `materiel_compatibles` désigne-t-elle cette lame ? */
function entreeCompatible(
  entree: unknown,
  lameId: string,
  typeMaterial: string
): boolean {
  if (typeof entree === "string") {
    const valeur = entree.toLowerCase();
    if (valeur === lameId) return true;
    if (typeMaterial && valeur === typeMaterial) return true;
    if (
      valeur === "bois_naturel" &&
      (typeMaterial === "bois_naturel" ||
        typeMaterial === "bois" ||
        typeMaterial === "exotique")
    ) {
      return true;
    }
    if (valeur === "composite" && typeMaterial === "composite") return true;
    if (valeur === "pvc" && typeMaterial === "pvc") return true;
    return false;
  }

  if (entree && typeof entree === "object") {
    const objet = entree as Record<string, unknown>;
    if (objet.lame_id === lameId || objet.id === lameId) return true;
    const type = String(objet.type_material ?? objet.type ?? "").toLowerCase();
    if (typeMaterial && type === typeMaterial) return true;
  }

  return false;
}

/** L'accessoire est-il compatible avec la lame (identifiant + type matière) ? */
export function accessoireCompatibleAvecLame(
  materielCompatibles: unknown,
  lameId: string,
  typeMaterial?: string | null
): boolean {
  if (!Array.isArray(materielCompatibles)) return false;
  const typeMat = (typeMaterial || "").toLowerCase();
  return materielCompatibles.some((entree) =>
    entreeCompatible(entree, lameId, typeMat)
  );
}

/** Sous-ensemble des accessoires compatibles avec la lame sélectionnée. */
export function filtrerAccessoiresCompatibles<T extends AccessoireCompatibilite>(
  accessoires: T[],
  lameId: string,
  typeMaterial?: string | null
): T[] {
  return accessoires.filter((accessoire) =>
    accessoireCompatibleAvecLame(
      accessoire.materiel_compatibles,
      lameId,
      typeMaterial
    )
  );
}
