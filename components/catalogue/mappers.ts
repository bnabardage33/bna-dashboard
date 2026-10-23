// components/catalogue/mappers.ts
//
// Couche d'ADAPTATION entre le formulaire (`ProductDraft`) et la base.
// Le composant UI ne connaît QUE ces fonctions — jamais le nom des tables ni
// la conversion des types SQL.

import type { Database, Json, TablesInsert } from "@/types/supabase";
import type {
  BardageValues,
  CatAccessoireTerrasse,
  CatalogueType,
  DimensionItem,
  ProductDraft,
  TerrasseAccessoireValues,
  TerrasseLameValues,
  TypeMaterialTerrasse,
} from "./types";
import { ENUMS_CAT_ACCESSOIRE } from "./types";

type RowBardage = Database["public"]["Tables"]["catalogue_ouvrages"]["Row"];
type RowLame = Database["public"]["Tables"]["catalogue_terrasse_lames"]["Row"];
type RowAccessoire = Database["public"]["Tables"]["catalogue_terrasse_accessoires"]["Row"];

/** `entreprise_id` est injecté au moment de l'écriture (résolu côté client), pas ici. */
export type TerrasseLameInsertPayload = Omit<TablesInsert<"catalogue_terrasse_lames">, "entreprise_id">;
export type TerrasseAccessoireInsertPayload = Omit<TablesInsert<"catalogue_terrasse_accessoires">, "entreprise_id">;

export type CatalogueInsertPayload =
  | TablesInsert<"catalogue_ouvrages">
  | TerrasseLameInsertPayload
  | TerrasseAccessoireInsertPayload;

const TVA = 1.2;

// --- Conversions élémentaires ---------------------------------------------

function versNombre(v: string): number | null {
  const s = (v ?? "").trim();
  if (s === "") return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function versNombreRequis(v: string): number {
  return versNombre(v) ?? 0;
}
function nombreOuNull(v: number | null): number | null {
  return v == null || Number.isNaN(v) ? null : v;
}
function texteOuNull(v: string): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}
function nombreVersTexte(n: number | null): string {
  return n == null ? "" : String(n).replace(".", ",");
}

// --- Parsing des JSONB -----------------------------------------------------

function parserDimensions(json: Json | null): DimensionItem[] {
  if (!Array.isArray(json)) return [];
  const sortie: DimensionItem[] = [];
  for (const brut of json) {
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) continue;
    const d = brut as Record<string, unknown>;
    sortie.push({
      longueur_mm: typeof d.longueur_mm === "number" ? d.longueur_mm : null,
      largeur_mm: typeof d.largeur_mm === "number" ? d.largeur_mm : null,
      epaisseur_mm: typeof d.epaisseur_mm === "number" ? d.epaisseur_mm : null,
    });
  }
  return sortie;
}

function parserMaterielCompatibles(json: Json | null): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((x): x is string => typeof x === "string");
}

/** Bardage : lit `dimensions_disponibles`, avec migration à la volée des
 *  colonnes legacy top-level (`longueur_mm`/`largeur_mm`/`epaisseur_mm`),
 *  comme le faisait historiquement `handleOpenModal`. */
function parserDimensionsBardage(row: RowBardage): DimensionItem[] {
  const dims = parserDimensions(row.dimensions_disponibles);
  if (dims.length > 0) return dims;
  if (row.longueur_mm != null || row.largeur_mm != null || row.epaisseur_mm != null) {
    return [{
      longueur_mm: row.longueur_mm,
      largeur_mm: row.largeur_mm,
      epaisseur_mm: row.epaisseur_mm,
    }];
  }
  return [];
}

function parserSpecifications(json: Json | null): Record<string, unknown> | null {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  return null;
}

function versTypeMaterial(v: string | null): TypeMaterialTerrasse | "" {
  return v === "BOIS_NATUREL" || v === "COMPOSITE" || v === "PVC" ? v : "";
}
/** Valide une catégorie via `ENUMS_CAT_ACCESSOIRE` (source de vérité unique). */
function versCatAccessoire(v: string | null): CatAccessoireTerrasse | "" {
  return v !== null && (ENUMS_CAT_ACCESSOIRE as readonly string[]).includes(v)
    ? (v as CatAccessoireTerrasse)
    : "";
}

// --- Draft -> INSERT -------------------------------------------------------

function bardageVersInsert(v: BardageValues): TablesInsert<"catalogue_ouvrages"> {
  const pu_ht = versNombreRequis(v.pu_ht);
  const prix_ttc = versNombre(v.prix_ttc) ?? Math.round(pu_ht * TVA * 100) / 100;
  return {
    designation: v.designation.trim(),
    categorie: v.categorie.trim() || "Parements & Bardages",
    famille_label: v.famille_label.trim() || v.categorie.trim() || "Parements & Bardages",
    type_cout: v.type_cout,
    unite: v.unite.trim() || "m²",
    pu_ht,
    prix_ttc,
    // `pu_revient` est `number` (non nullable) côté Insert : `undefined` l'omet.
    pu_revient: versNombre(v.pu_revient) ?? undefined,
    description: texteOuNull(v.description),
    designation_devis: texteOuNull(v.designation_devis),
    fabricant: texteOuNull(v.fabricant),
    gamme: texteOuNull(v.gamme),
    code_decor: texteOuNull(v.code_decor),
    couleur: texteOuNull(v.couleur),
    code_ral: texteOuNull(v.code_ral),
    finition: texteOuNull(v.finition),
    fournisseur: texteOuNull(v.fournisseur),
    dimensions_disponibles: v.dimensions_disponibles.map((d) => ({
      longueur_mm: nombreOuNull(d.longueur_mm),
      largeur_mm: nombreOuNull(d.largeur_mm),
      epaisseur_mm: nombreOuNull(d.epaisseur_mm),
    })) as unknown as Json,
  };
}

function terrasseLameVersInsert(v: TerrasseLameValues): TerrasseLameInsertPayload {
  return {
    designation: texteOuNull(v.designation),
    description: texteOuNull(v.description),
    fournisseur: texteOuNull(v.fournisseur),
    reference_fournisseur: texteOuNull(v.reference_fournisseur),
    essence: texteOuNull(v.essence),
    type_material: v.type_material === "" ? null : v.type_material,
    longueur_mm: nombreOuNull(v.longueur_mm),
    largeur_utile_mm: nombreOuNull(v.largeur_utile_mm),
    epaisseur_mm: nombreOuNull(v.epaisseur_mm),
    prix_m2_ht: versNombre(v.prix_m2_ht),
    prix_unitaire_lame: versNombre(v.prix_unitaire_lame),
    image_url: texteOuNull(v.image_url),
    fiche_technique_pdf: texteOuNull(v.fiche_technique_pdf),
  };
}

// NOTE (audit Prestations / Main-d'œuvre) : le payload est écrit tel quel pour
// `type_cout`, `pu_ht`, `pu_revient` ET les champs matériels (categorie,
// conditionnement, materiel_compatibles, prix_conditionnement). Stratégie
// retenue = FILTRAGE SEUL (non destructif) : on ne purge PAS les champs
// matériels d'une prestation, on exclut les lignes `type_cout === "main_oeuvre"`
// au moment des sélections/calculs (cf. `lib/terrasse/compatAccessoires.ts` et
// `components/terrasse/TerrasseConfigForm.tsx`). Un retour `matiere` restitue
// donc l'intégralité des données.
function terrasseAccessoireVersInsert(v: TerrasseAccessoireValues): TerrasseAccessoireInsertPayload {
  return {
    designation: texteOuNull(v.designation),
    description: texteOuNull(v.description),
    fournisseur: texteOuNull(v.fournisseur),
    categorie: v.categorie === "" ? null : v.categorie,
    type_cout: v.type_cout,
    materiel_compatibles: v.materiel_compatibles as unknown as Json,
    conditionnement: texteOuNull(v.conditionnement),
    prix_conditionnement: versNombre(v.prix_conditionnement),
    pu_ht: versNombre(v.pu_ht),
    pu_revient: versNombre(v.pu_revient),
    unite_mesure: texteOuNull(v.unite_mesure),
    specifications_dt: (v.specifications_dt ?? null) as unknown as Json,
  };
}

/** Point d'entrée unique : transforme l'état du formulaire en payload d'écriture. */
export function toInsertPayload(draft: ProductDraft): CatalogueInsertPayload {
  switch (draft.kind) {
    case "BARDAGE": return bardageVersInsert(draft);
    case "TERRASSE_LAME": return terrasseLameVersInsert(draft);
    case "TERRASSE_ACCESSOIRE": return terrasseAccessoireVersInsert(draft);
  }
}

// --- Row -> Draft (édition) ------------------------------------------------

export function fromBardageRow(row: RowBardage): BardageValues {
  return {
    kind: "BARDAGE",
    designation: row.designation ?? "",
    description: row.description ?? "",
    designation_devis: row.designation_devis ?? "",
    categorie: row.categorie ?? "",
    famille_label: row.famille_label ?? "",
    fabricant: row.fabricant ?? "",
    gamme: row.gamme ?? "",
    code_decor: row.code_decor ?? "",
    couleur: row.couleur ?? "",
    code_ral: row.code_ral ?? "",
    finition: row.finition ?? "",
    dimensions_disponibles: parserDimensionsBardage(row),
    fournisseur: row.fournisseur ?? "",
    unite: row.unite ?? "m²",
    pu_ht: nombreVersTexte(row.pu_ht),
    pu_revient: row.pu_revient == null ? "" : nombreVersTexte(row.pu_revient),
    prix_ttc: row.prix_ttc == null ? "" : nombreVersTexte(row.prix_ttc),
    type_cout: row.type_cout === "main_oeuvre" ? "main_oeuvre" : "matiere",
  };
}

export function fromTerrasseLameRow(row: RowLame): TerrasseLameValues {
  return {
    kind: "TERRASSE_LAME",
    designation: row.designation ?? "",
    description: row.description ?? "",
    fournisseur: row.fournisseur ?? "",
    reference_fournisseur: row.reference_fournisseur ?? "",
    essence: row.essence ?? "",
    type_material: versTypeMaterial(row.type_material),
    longueur_mm: row.longueur_mm,
    largeur_utile_mm: row.largeur_utile_mm,
    epaisseur_mm: row.epaisseur_mm,
    prix_m2_ht: row.prix_m2_ht == null ? "" : nombreVersTexte(row.prix_m2_ht),
    prix_unitaire_lame: row.prix_unitaire_lame == null ? "" : nombreVersTexte(row.prix_unitaire_lame),
    image_url: row.image_url ?? "",
    fiche_technique_pdf: row.fiche_technique_pdf ?? "",
  };
}

export function fromTerrasseAccessoireRow(row: RowAccessoire): TerrasseAccessoireValues {
  return {
    kind: "TERRASSE_ACCESSOIRE",
    designation: row.designation ?? "",
    description: row.description ?? "",
    fournisseur: row.fournisseur ?? "",
    categorie: versCatAccessoire(row.categorie),
    type_cout: row.type_cout === "main_oeuvre" ? "main_oeuvre" : "matiere",
    materiel_compatibles: parserMaterielCompatibles(row.materiel_compatibles),
    conditionnement: row.conditionnement ?? "",
    prix_conditionnement: row.prix_conditionnement == null ? "" : nombreVersTexte(row.prix_conditionnement),
    pu_ht: row.pu_ht == null ? "" : nombreVersTexte(row.pu_ht),
    pu_revient: row.pu_revient == null ? "" : nombreVersTexte(row.pu_revient),
    unite_mesure: row.unite_mesure ?? "",
    specifications_dt: parserSpecifications(row.specifications_dt),
  };
}

/** Dispatcher : reconstruit le formulaire depuis une ligne (sans `any`). */
export function fromRow(kind: CatalogueType, row: unknown): ProductDraft {
  switch (kind) {
    case "BARDAGE": return fromBardageRow(row as RowBardage);
    case "TERRASSE_LAME": return fromTerrasseLameRow(row as RowLame);
    case "TERRASSE_ACCESSOIRE": return fromTerrasseAccessoireRow(row as RowAccessoire);
  }
}
