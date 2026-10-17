// Non-régression de la couche mappers du Catalogue (Bardage + Terrasse).
// Point d'attention : la fonctionnalité « Prestations / Main-d'œuvre » ajoute
// `type_cout` / `pu_ht` / `pu_revient` aux accessoires Terrasse.
import { describe, it, expect } from "vitest";
import {
  fromTerrasseAccessoireRow,
  fromBardageRow,
  toInsertPayload,
  type TerrasseAccessoireInsertPayload,
} from "@/components/catalogue/mappers";
import type { BardageValues, TerrasseAccessoireValues } from "@/components/catalogue/types";
import type { Database, TablesInsert } from "@/types/supabase";

type RowAccessoire = Database["public"]["Tables"]["catalogue_terrasse_accessoires"]["Row"];
type RowBardage = Database["public"]["Tables"]["catalogue_ouvrages"]["Row"];

function accessoireValues(
  partiel: Partial<TerrasseAccessoireValues> = {}
): TerrasseAccessoireValues {
  return {
    kind: "TERRASSE_ACCESSOIRE",
    designation: "",
    description: "",
    fournisseur: "",
    categorie: "",
    materiel_compatibles: [],
    conditionnement: "",
    prix_conditionnement: "",
    unite_mesure: "",
    specifications_dt: null,
    type_cout: "matiere",
    pu_ht: "",
    pu_revient: "",
    ...partiel,
  };
}

function accessoireRow(partiel: Record<string, unknown> = {}): RowAccessoire {
  return {
    id: "acc-1",
    entreprise_id: "ent-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    designation: null,
    description: null,
    fournisseur: null,
    categorie: null,
    type_cout: "matiere",
    materiel_compatibles: null,
    conditionnement: null,
    prix_conditionnement: null,
    unite_mesure: null,
    specifications_dt: null,
    pu_ht: null,
    pu_revient: null,
    ...partiel,
  } as unknown as RowAccessoire;
}

function bardageValues(partiel: Partial<BardageValues> = {}): BardageValues {
  return {
    kind: "BARDAGE",
    designation: "Panneau bois",
    description: "",
    designation_devis: "",
    categorie: "",
    famille_label: "",
    fabricant: "",
    gamme: "",
    code_decor: "",
    couleur: "",
    code_ral: "",
    finition: "",
    dimensions_disponibles: [],
    fournisseur: "",
    unite: "m²",
    pu_ht: "",
    pu_revient: "",
    prix_ttc: "",
    type_cout: "matiere",
    ...partiel,
  };
}

function bardageRow(partiel: Record<string, unknown> = {}): RowBardage {
  return {
    id: "bardage-1",
    entreprise_id: "ent-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    designation: "Panneau bois",
    description: null,
    designation_devis: null,
    categorie: "Parements & Bardages",
    famille_label: "Bois",
    fabricant: null,
    gamme: null,
    code_decor: null,
    couleur: null,
    code_ral: null,
    finition: null,
    fournisseur: "ACME",
    unite: "m²",
    type_cout: "matiere",
    pu_ht: 45,
    pu_revient: null,
    prix_ttc: null,
    dimensions_disponibles: null,
    longueur_mm: null,
    largeur_mm: null,
    epaisseur_mm: null,
    ...partiel,
  } as unknown as RowBardage;
}

describe("Mapper accessoires Terrasse — création (INSERT)", () => {
  it("sérialise une prestation main-d'œuvre (type_cout / pu_ht / pu_revient)", () => {
    const payload = toInsertPayload(
      accessoireValues({
        designation: "Pose de clips",
        type_cout: "main_oeuvre",
        pu_ht: "12,5",
        pu_revient: "8",
        prix_conditionnement: "",
        categorie: "",
        materiel_compatibles: [],
      })
    ) as TerrasseAccessoireInsertPayload;

    expect(payload.type_cout).toBe("main_oeuvre");
    expect(payload.pu_ht).toBe(12.5);
    expect(payload.pu_revient).toBe(8);
    expect(payload.prix_conditionnement).toBeNull();
    expect(payload.categorie).toBeNull();
    expect(payload.materiel_compatibles).toEqual([]);
  });

  it("convertit les virgules décimales et les valeurs nulles", () => {
    // NOTE : `versNombre` ne gère PAS les séparateurs de milliers (une entrée
    // « 1 234,50 » donnerait 1) — comportement préexistant, inchangé ici.
    const payload = toInsertPayload(
      accessoireValues({ type_cout: "main_oeuvre", pu_ht: "12,50", pu_revient: "" })
    ) as TerrasseAccessoireInsertPayload;

    expect(payload.pu_ht).toBe(12.5);
    expect(payload.pu_revient).toBeNull();
  });

  it("ne change rien à un accessoire matériel existant (non-régression)", () => {
    const payload = toInsertPayload(
      accessoireValues({
        designation: "Clip inox",
        categorie: "CLIP",
        materiel_compatibles: ["COMPOSITE"],
        conditionnement: "boîte de 100",
        prix_conditionnement: "10",
        type_cout: "matiere",
      })
    ) as TerrasseAccessoireInsertPayload;

    expect(payload.type_cout).toBe("matiere");
    expect(payload.categorie).toBe("CLIP");
    expect(payload.materiel_compatibles).toEqual(["COMPOSITE"]);
    expect(payload.conditionnement).toBe("boîte de 100");
    expect(payload.prix_conditionnement).toBe(10);
    expect(payload.pu_ht).toBeNull();
    expect(payload.pu_revient).toBeNull();
  });

  it("bascule une ligne matière vers prestation SANS purger ses champs matériels", () => {
    // Décision : « filtrage seul » (non destructif) — le polluant est écarté par
    // le moteur de sélection, pas par effacement de la donnée. Un retour
    // `matiere` restitue donc l'intégralité des champs.
    const payload = toInsertPayload(
      accessoireValues({
        designation: "Clip inox",
        categorie: "CLIP",
        materiel_compatibles: ["COMPOSITE"],
        prix_conditionnement: "10",
        type_cout: "main_oeuvre",
        pu_ht: "12,5",
        pu_revient: "8",
      })
    ) as TerrasseAccessoireInsertPayload;

    expect(payload.type_cout).toBe("main_oeuvre");
    expect(payload.pu_ht).toBe(12.5);
    expect(payload.pu_revient).toBe(8);
    // Aucune purge : les champs matériels sont conservés tels quels.
    expect(payload.categorie).toBe("CLIP");
    expect(payload.materiel_compatibles).toEqual(["COMPOSITE"]);
    expect(payload.prix_conditionnement).toBe(10);
  });
});

describe("Mapper accessoires Terrasse — lecture / modification (Row -> draft)", () => {
  it("normalise un type_cout NULL en 'matiere' (pré-migration 20261020)", () => {
    expect(fromTerrasseAccessoireRow(accessoireRow({ type_cout: null })).type_cout).toBe("matiere");
  });

  it("préserve 'main_oeuvre' à l'édition", () => {
    expect(
      fromTerrasseAccessoireRow(accessoireRow({ type_cout: "main_oeuvre" })).type_cout
    ).toBe("main_oeuvre");
  });

  it("convertit les nombres en chaînes de saisie (virgule décimale)", () => {
    const draft = fromTerrasseAccessoireRow(
      accessoireRow({ pu_ht: 12.5, pu_revient: 8, prix_conditionnement: 10 })
    );
    expect(draft.pu_ht).toBe("12,5");
    expect(draft.pu_revient).toBe("8");
    expect(draft.prix_conditionnement).toBe("10");
  });

  it("convertit les null en chaîne vide", () => {
    const draft = fromTerrasseAccessoireRow(accessoireRow());
    expect(draft.pu_ht).toBe("");
    expect(draft.pu_revient).toBe("");
    expect(draft.categorie).toBe("");
    expect(draft.materiel_compatibles).toEqual([]);
  });

  it("fait un aller-retour INSERT -> Row sans perte (création puis édition)", () => {
    const payload = toInsertPayload(
      accessoireValues({ type_cout: "main_oeuvre", pu_ht: "12,5", pu_revient: "8" })
    ) as TerrasseAccessoireInsertPayload;

    const draft = fromTerrasseAccessoireRow(
      accessoireRow({
        type_cout: payload.type_cout,
        pu_ht: payload.pu_ht,
        pu_revient: payload.pu_revient,
      })
    );

    expect(draft.type_cout).toBe("main_oeuvre");
    expect(draft.pu_ht).toBe("12,5");
    expect(draft.pu_revient).toBe("8");
  });
});

describe("Mapper Bardage — non-régression du catalogue existant", () => {
  it("transmet type_cout en main-d'œuvre avec pu_ht et dérive le TTC", () => {
    const payload = toInsertPayload(
      bardageValues({ type_cout: "main_oeuvre", pu_ht: "45", pu_revient: "", prix_ttc: "" })
    ) as TablesInsert<"catalogue_ouvrages">;

    expect(payload.type_cout).toBe("main_oeuvre");
    expect(payload.pu_ht).toBe(45);
    expect(payload.prix_ttc).toBe(54); // 45 * 1,2
    expect(payload.pu_revient).toBeUndefined(); // omis => valeur par défaut
  });

  it("conserve type_cout 'matiere' par défaut", () => {
    const payload = toInsertPayload(
      bardageValues({ pu_ht: "45" })
    ) as TablesInsert<"catalogue_ouvrages">;

    expect(payload.type_cout).toBe("matiere");
  });

  it("relit type_cout depuis une ligne Bardage (y compris NULL)", () => {
    expect(fromBardageRow(bardageRow({ type_cout: null })).type_cout).toBe("matiere");
    expect(fromBardageRow(bardageRow({ type_cout: "main_oeuvre" })).type_cout).toBe("main_oeuvre");
  });
});
