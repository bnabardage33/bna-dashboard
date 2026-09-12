// Valeurs métier par défaut — CENTRALISÉES pour la transformation devis → chantier
// (`transformerEnChantier`). Colonnes NOT NULL de public.chantiers dont l'insertion
// depuis un devis ne connaît pas la valeur : on fournit ici UNE SEULE référence,
// alignée sur le vocabulaire déjà utilisé par les autres flux de l'application,
// et documentée. Aucune chaîne magique dispersée dans le code.
//
// Source du vocabulaire :
//  - materiau_structurel : options du formulaire "Nouveau chantier"
//    (app/terrain/chantier/page.tsx, lignes ~371-374).
//  - moyen_acces : clés de LABELS_ACCES (lib/meteoAlerte.ts, "echafaudage"|"nacelle").
//  - zone_vent : entier 1-4 (décret RNV / zones d'exposition au vent, RD 1999).

export const MATERIAU_STRUCTUREL_DEFAUT = "Bois / Mélèze";
export const MOYEN_ACCES_DEFAUT = "echafaudage";
export const ZONE_VENT_DEFAUT = 1;