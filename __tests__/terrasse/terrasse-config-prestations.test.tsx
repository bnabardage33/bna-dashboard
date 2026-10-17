// Non-régression des sélections et du prix estimé du configurateur Terrasse :
// une prestation de main-d'œuvre (`type_cout === "main_oeuvre"`) ne doit jamais
// apparaître parmi les clips/lambourdes/plots compatibles ni influer sur le
// prix estimé HT — même si elle partage catégorie et compatibilité avec un
// accessoire matériel (cas d'une ligne basculée de "matiere" en "main_oeuvre").
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import TerrasseConfigForm from "@/components/terrasse/TerrasseConfigForm";
import { fmtEuro } from "@/lib/financeCalculs";
import type {
  CatalogueTerrasseAccessoire,
  CatalogueTerrasseLame,
} from "@/hooks/useCatalogueTerrasse";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";

// `next/link` exige le contexte App Router : on le remplace par une ancre.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

// Catalogue stubbé : on neutralise le fetch du hook.
vi.mock("@/hooks/useCatalogueTerrasse", () => ({
  useCatalogueTerrasse: () => ({
    lames: [
      {
        id: "lame-1",
        entreprise_id: "ent-1",
        designation: "Composite 22x145",
        description: null,
        fournisseur: "ACME",
        reference_fournisseur: null,
        essence: "composite",
        type_material: "COMPOSITE",
        longueur_mm: 4000,
        largeur_utile_mm: 145,
        epaisseur_mm: 21,
        prix_m2_ht: null,
        // Prix lame nul : isole le prix estimé sur la part accessoires.
        prix_unitaire_lame: 0,
        image_url: null,
        fiche_technique_pdf: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ] satisfies CatalogueTerrasseLame[],
    accessoires: [
      {
        id: "clip-mat",
        entreprise_id: "ent-1",
        type_cout: "matiere",
        categorie: "CLIP",
        conditionnement: "boîte de 100",
        prix_conditionnement: 12.5,
        materiel_compatibles: ["COMPOSITE"],
        designation: "Clip inox",
        description: null,
        fournisseur: "ACME",
        unite_mesure: null,
        specifications_dt: null,
        pu_ht: null,
        pu_revient: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      // Prestation : même catégorie ET même compatibilité que le clip matériel.
      {
        id: "clip-presta",
        entreprise_id: "ent-1",
        type_cout: "main_oeuvre",
        categorie: "CLIP",
        conditionnement: "forfait pose",
        prix_conditionnement: 999,
        materiel_compatibles: ["COMPOSITE"],
        designation: "Pose de clips",
        description: null,
        fournisseur: null,
        unite_mesure: null,
        specifications_dt: null,
        pu_ht: 999,
        pu_revient: 450,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "lambo-mat",
        entreprise_id: "ent-1",
        type_cout: "matiere",
        categorie: "LAMBOURDE",
        conditionnement: "barre de 4m",
        prix_conditionnement: 40,
        materiel_compatibles: ["COMPOSITE"],
        designation: "Lambourde alu",
        description: null,
        fournisseur: "ACME",
        unite_mesure: null,
        specifications_dt: null,
        pu_ht: null,
        pu_revient: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "lambo-presta",
        entreprise_id: "ent-1",
        type_cout: "main_oeuvre",
        categorie: "LAMBOURDE",
        conditionnement: "forfait pose",
        prix_conditionnement: 999,
        materiel_compatibles: ["COMPOSITE"],
        designation: "Pose de lambourdes",
        description: null,
        fournisseur: null,
        unite_mesure: null,
        specifications_dt: null,
        pu_ht: 999,
        pu_revient: 450,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "plot-mat",
        entreprise_id: "ent-1",
        type_cout: "matiere",
        categorie: "PLOT",
        conditionnement: "lot de 10",
        prix_conditionnement: 30,
        materiel_compatibles: ["COMPOSITE"],
        designation: "Plot réglable",
        description: null,
        fournisseur: "ACME",
        unite_mesure: null,
        specifications_dt: null,
        pu_ht: null,
        pu_revient: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "plot-presta",
        entreprise_id: "ent-1",
        type_cout: "main_oeuvre",
        categorie: "PLOT",
        conditionnement: "forfait pose",
        prix_conditionnement: 999,
        materiel_compatibles: ["COMPOSITE"],
        designation: "Pose de plots",
        description: null,
        fournisseur: null,
        unite_mesure: null,
        specifications_dt: null,
        pu_ht: 999,
        pu_revient: 450,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ] satisfies CatalogueTerrasseAccessoire[],
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  conteneur.remove();
});

const configTest = {
  chantier_id: "chantier-1",
  nom: "Terrasse prestation",
  longueur_m: 6,
  largeur_m: 4,
  hauteur_sol_cm: 15,
  type_sol: "dalle_beton",
  pente_pct: 1.5,
  essence_bois: "composite",
  type_pose: "parallele",
  largeur_lame_mm: 145,
  epaisseur_lame_mm: 21,
  longueur_lame_m: 4,
  espacement_lames_mm: 5,
  type_fixation: "vis_inox",
  type_lambourde: "bois_cl4",
  section_largeur_mm: 45,
  section_hauteur_mm: 70,
  longueur_lambourde_m: 4,
  entraxe_lambourdes_cm: 40,
  double_lambourdage_aboutage: true,
  bande_etancheite_epdm: true,
  cales_isolation: true,
  type_plots: "reglables",
  entraxe_plots_cm: 60,
  hauteur_reglage_plots: "40_60",
  geotextile: false,
  presence_escalier: false,
  escalier_nb_marches: 2,
  escalier_largeur_m: 2,
  escalier_giron_cm: 28,
  escalier_hauteur_marche_cm: 16,
  presence_garde_corps: false,
  garde_corps_longueur_ml: 0,
  garde_corps_type: "bois_cables",
  garde_corps_hauteur_cm: 100,
  coef_perte_lames: 1.1,
  coef_perte_lambourdes: 1.08,
  // La sélection de la lame est portée par ces deux champs « hors type ».
  lame_id: "lame-1",
  quantite_accessoires: { clip: 1, lambourde: 1, plot: 1 },
} as unknown as ChantierTerrasseConfig;

/** Montre un select d'accessoires par son libellé (proche voisin du <label>). */
function optionsDe(libelle: string): string[] {
  const label = Array.from(conteneur.querySelectorAll("label")).find(
    (l) => l.textContent?.trim() === libelle
  );
  expect(label, `libellé « ${libelle} » introuvable`).toBeTruthy();
  const select = label!.parentElement!.querySelector("select") as HTMLSelectElement | null;
  expect(select, `select pour « ${libelle} » introuvable`).toBeTruthy();
  // On ignore le premier <option>, servant de placeholder.
  return Array.from(select!.options)
    .slice(1)
    .map((o) => o.value);
}

async function rendre(): Promise<void> {
  await act(async () => {
    root.render(createElement(TerrasseConfigForm, { config: configTest, onChange: () => {} }));
  });
}

describe("TerrasseConfigForm — prestations main-d'œuvre vs accessoires matériels", () => {
  it("ne propose que les clips matériels (non-régression du catalogue existant)", async () => {
    await rendre();
    expect(optionsDe("Clips compatibles")).toEqual(["clip-mat"]);
  });

  it("ne propose que les lambourdes matérielles", async () => {
    await rendre();
    expect(optionsDe("Lambourdes compatibles")).toEqual(["lambo-mat"]);
  });

  it("ne propose que les plots matériels", async () => {
    await rendre();
    expect(optionsDe("Plots compatibles")).toEqual(["plot-mat"]);
  });

  it("affiche bien le libellé du clip matériel (comportement inchangé)", async () => {
    await rendre();
    const label = Array.from(conteneur.querySelectorAll("label")).find(
      (l) => l.textContent?.trim() === "Clips compatibles"
    );
    const select = label!.parentElement!.querySelector("select")!;
    expect(select.textContent).toContain("boîte de 100");
  });

  it("exclut le prix des prestations du prix estimé HT", async () => {
    await rendre();
    const texte = conteneur.textContent ?? "";
    // 12,50 + 40,00 + 30,00 = 82,50 € (prix de la lame nul).
    expect(texte).toContain(fmtEuro(82.5));
    // Si les prestations (999 € chacune) étaient comptées : 2 997,50 €.
    expect(texte).not.toContain(fmtEuro(82.5 + 999 * 3));
  });
});
