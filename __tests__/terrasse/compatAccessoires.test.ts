import { describe, it, expect } from "vitest";
import {
  accessoireCompatibleAvecLame,
  estPrestationMainOeuvre,
  filtrerAccessoiresCompatibles,
  type AccessoireCompatibilite,
} from "@/lib/terrasse/compatAccessoires";

type Acc = AccessoireCompatibilite & {
  categorie?: string | null;
  prix_conditionnement?: number | null;
};

describe("accessoireCompatibleAvecLame — non-régression du moteur", () => {
  it("retient une entrée littérale correspondant au type de matière", () => {
    expect(accessoireCompatibleAvecLame(["COMPOSITE"], "lame-x", "composite")).toBe(true);
  });

  it("retient une entrée correspondant à l'identifiant de la lame", () => {
    expect(accessoireCompatibleAvecLame(["lame-1"], "lame-1", "pvc")).toBe(true);
  });

  it("retient une entrée objet { type_material }", () => {
    expect(
      accessoireCompatibleAvecLame([{ type_material: "BOIS_NATUREL" }], "lame-y", "bois_naturel")
    ).toBe(true);
  });

  it("rejette une entrée sans rapport", () => {
    expect(accessoireCompatibleAvecLame(["PVC"], "lame-z", "composite")).toBe(false);
  });

  it("rejette un tableau non conforme", () => {
    expect(accessoireCompatibleAvecLame(null, "lame-z", "composite")).toBe(false);
    expect(accessoireCompatibleAvecLame("COMPOSITE", "lame-z", "composite")).toBe(false);
  });
});

describe("estPrestationMainOeuvre — nature du coût", () => {
  it("détecte une prestation de main-d'œuvre", () => {
    expect(estPrestationMainOeuvre({ type_cout: "main_oeuvre" })).toBe(true);
  });

  it("ne détecte pas une ligne matérielle", () => {
    expect(estPrestationMainOeuvre({ type_cout: "matiere" })).toBe(false);
  });

  it("traite `null` / `undefined` comme matérielle (lignes pré-migration 20261020)", () => {
    expect(estPrestationMainOeuvre({ type_cout: null })).toBe(false);
    expect(estPrestationMainOeuvre({})).toBe(false);
  });
});

describe("filtrerAccessoiresCompatibles — exclusion des prestations main-d'œuvre", () => {
  const accessoires: Acc[] = [
    {
      id: "clip-mat",
      type_cout: "matiere",
      categorie: "CLIP",
      prix_conditionnement: 12.5,
      materiel_compatibles: ["COMPOSITE"],
    },
    {
      // Même compatibilité et même catégorie que le clip matérielle : seule la
      // nature du coût la distingue.
      id: "clip-presta",
      type_cout: "main_oeuvre",
      categorie: "CLIP",
      prix_conditionnement: 999,
      materiel_compatibles: ["COMPOSITE"],
    },
    {
      id: "sans-type-cout",
      type_cout: null,
      categorie: "CLIP",
      prix_conditionnement: 3,
      materiel_compatibles: ["COMPOSITE"],
    },
    {
      id: "clip-autre-matiere",
      type_cout: "matiere",
      categorie: "CLIP",
      prix_conditionnement: 5,
      materiel_compatibles: ["PVC"],
    },
  ];

  it("exclut la prestation de main-d'œuvre malgré une compatibilité identique", () => {
    const res = filtrerAccessoiresCompatibles(accessoires, "lame-x", "composite");
    expect(res.map((a) => a.id)).toEqual(["clip-mat", "sans-type-cout"]);
  });

  it("conserve les accessoires matériels (non-régression du catalogue existant)", () => {
    const res = filtrerAccessoiresCompatibles(accessoires, "lame-x", "composite");
    expect(res.some((a) => a.id === "clip-mat")).toBe(true);
    expect(res.some((a) => a.id === "sans-type-cout")).toBe(true);
  });

  it("conserve le typage générique passé par l'appelant", () => {
    const res = filtrerAccessoiresCompatibles(accessoires, "lame-x", "composite");
    expect(res[0].prix_conditionnement).toBe(12.5);
  });

  it("ne retourne rien lorsque la lame n'a aucun accessoire matériel", () => {
    const res = filtrerAccessoiresCompatibles(
      accessoires.filter((a) => a.type_cout === "main_oeuvre"),
      "lame-x",
      "composite"
    );
    expect(res).toEqual([]);
  });

  it("reste pure (aucune mutation du tableau d'entrée)", () => {
    const copie = accessoires.slice();
    filtrerAccessoiresCompatibles(accessoires, "lame-x", "composite");
    expect(accessoires).toEqual(copie);
  });
});
