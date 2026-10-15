// components/catalogue/types.ts
//
// Modèle de FORMULAIRE (≠ modèle de base de données). Partagé par le modal
// générique (`ProductFormModal`), les mappers (`mappers.ts`) et le scraping
// (`useScraping`). Les valeurs numériques saisies restent des CHAÎNES (l'utilisateur
// tape « 12,50 ») ; seuls les mappers les convertissent vers les types SQL.

/** Discriminant du modal : pilote le rendu conditionnel des onglets. */
export type CatalogueType = "BARDAGE" | "TERRASSE_LAME" | "TERRASSE_ACCESSOIRE";

/** Une variante de dimensions (bardage) — JSONB `dimensions_disponibles`. */
export interface DimensionItem {
  longueur_mm: number | null;
  largeur_mm: number | null;
  epaisseur_mm: number | null;
}

/** ENUM Postgres `type_material_terrasse`. */
export type TypeMaterialTerrasse = "BOIS_NATUREL" | "COMPOSITE" | "PVC";

/** ENUM Postgres `cat_accessoire_terrasse`. */
export type CatAccessoireTerrasse = "CLIP" | "LAMBOURDE" | "PLOT" | "VIS" | "BANDEROLE";

export type NatureCout = "matiere" | "main_oeuvre";

/** Catalogue Bardage (`catalogue_ouvrages`). */
export interface BardageValues {
  kind: "BARDAGE";
  designation: string;
  description: string;
  designation_devis: string;
  categorie: string;
  famille_label: string;
  fabricant: string;
  gamme: string;
  code_decor: string;
  couleur: string;
  code_ral: string;
  finition: string;
  dimensions_disponibles: DimensionItem[];
  fournisseur: string;
  unite: string;
  pu_ht: string;
  pu_revient: string;
  prix_ttc: string;
  type_cout: NatureCout;
}

/** Catalogue Terrasse – lames (`catalogue_terrasse_lames`). */
export interface TerrasseLameValues {
  kind: "TERRASSE_LAME";
  designation: string;
  description: string;
  fournisseur: string;
  reference_fournisseur: string;
  essence: string;
  type_material: TypeMaterialTerrasse | "";
  longueur_mm: number | null;
  largeur_utile_mm: number | null;
  epaisseur_mm: number | null;
  prix_m2_ht: string;
  prix_unitaire_lame: string;
  image_url: string;
  fiche_technique_pdf: string;
}

/** Catalogue Terrasse – accessoires (`catalogue_terrasse_accessoires`). */
export interface TerrasseAccessoireValues {
  kind: "TERRASSE_ACCESSOIRE";
  designation: string;
  description: string;
  fournisseur: string;
  categorie: CatAccessoireTerrasse | "";
  /** JSONB polymorphe : ids de lames et/ou `type_material` (cf. compatAccessoires). */
  materiel_compatibles: string[];
  conditionnement: string;
  prix_conditionnement: string;
  unite_mesure: string;
  /** JSONB libre. */
  specifications_dt: Record<string, unknown> | null;
}

export type ProductDraft = BardageValues | TerrasseLameValues | TerrasseAccessoireValues;

/**
 * « Partial<ProductDraft> » correctement typé : un `Partial<A|B|C>` scalaire ne
 * distribue pas sur l'union (il ne garde que les clés communes), d'où ce patch
 * DISTRIBUTIF qui préserve `kind`.
 */
export type ProductDraftPatch =
  | ({ kind: "BARDAGE" } & Partial<Omit<BardageValues, "kind">>)
  | ({ kind: "TERRASSE_LAME" } & Partial<Omit<TerrasseLameValues, "kind">>)
  | ({ kind: "TERRASSE_ACCESSOIRE" } & Partial<Omit<TerrasseAccessoireValues, "kind">>);

export const ENUMS_TYPE_MATERIAL: TypeMaterialTerrasse[] = ["BOIS_NATUREL", "COMPOSITE", "PVC"];
export const ENUMS_CAT_ACCESSOIRE: CatAccessoireTerrasse[] = ["CLIP", "LAMBOURDE", "PLOT", "VIS", "BANDEROLE"];
export const UNITES_VENTE = ["m²", "ml", "unité", "U", "heure", "forfait"] as const;

export const LIBELLES_TYPE_MATERIAL: Record<TypeMaterialTerrasse, string> = {
  BOIS_NATUREL: "Bois naturel",
  COMPOSITE: "Composite",
  PVC: "PVC",
};

export const LIBELLES_ACCESSOIRE: Record<CatAccessoireTerrasse, string> = {
  CLIP: "Clip / fixation",
  LAMBOURDE: "Lambourde",
  PLOT: "Plot",
  VIS: "Vis",
  BANDEROLE: "Banderole",
};

/** Fabriques d'état vide, indexées par type. */
export function emptyBardage(): BardageValues {
  return {
    kind: "BARDAGE",
    designation: "", description: "", designation_devis: "",
    categorie: "Parements & Bardages", famille_label: "Parements & Bardages",
    fabricant: "", gamme: "", code_decor: "", couleur: "", code_ral: "", finition: "",
    dimensions_disponibles: [], fournisseur: "", unite: "m²",
    pu_ht: "", pu_revient: "", prix_ttc: "", type_cout: "matiere",
  };
}

export function emptyTerrasseLame(): TerrasseLameValues {
  return {
    kind: "TERRASSE_LAME",
    designation: "", description: "", fournisseur: "",
    reference_fournisseur: "", essence: "", type_material: "",
    longueur_mm: null, largeur_utile_mm: null, epaisseur_mm: null,
    prix_m2_ht: "", prix_unitaire_lame: "", image_url: "", fiche_technique_pdf: "",
  };
}

export function emptyTerrasseAccessoire(): TerrasseAccessoireValues {
  return {
    kind: "TERRASSE_ACCESSOIRE",
    designation: "", description: "", fournisseur: "",
    categorie: "", materiel_compatibles: [], conditionnement: "",
    prix_conditionnement: "", unite_mesure: "", specifications_dt: null,
  };
}

export function emptyForType(type: CatalogueType): ProductDraft {
  switch (type) {
    case "BARDAGE": return emptyBardage();
    case "TERRASSE_LAME": return emptyTerrasseLame();
    case "TERRASSE_ACCESSOIRE": return emptyTerrasseAccessoire();
  }
}
