// Non-régression de la BASCULE de nature de coût dans le configurateur Terrasse
// (`components/terrasse/TerrasseConfigForm.tsx`) :
// une ligne d'accessoire DÉJÀ EXISTANTE dont `type_cout` passe de "matiere" à
// "main_oeuvre" doit être immédiatement exclue — sans rechargement, sans
// migration, sans toucher aux autres lignes — des sélecteurs d'accessoires
// matériels ET du calcul `prixEstimeHT`. Le sens inverse ("main_oeuvre" →
// "matiere") doit la réintégrer tout aussi tôt.
//
// Contrairement à `terrasse-config-prestations.test.tsx` (catalogue figé), ce
// fichier stubbe le hook avec un état MUTABLE : le test bascule `type_cout`
// entre deux rendus du même arbre, ce qui reproduit exactement le cas d'une
// ligne éditée dans le catalogue puis rechargée par `refetch()`.
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

/**
 * État mutable partagé entre le mock (hoisté) et les tests. Chaque test écrit
 * un NOUVEAU tableau dans `etat.accessoires` : l'identité du tableau doit
 * changer, sinon les `useMemo` du composant conserveraient l'ancien résultat.
 */
const etat = vi.hoisted(() => ({
  lames: [] as unknown[],
  accessoires: [] as unknown[],
}));

// Catalogue stubbé : on neutralise le fetch du hook, en servant l'état mutable.
vi.mock("@/hooks/useCatalogueTerrasse", () => ({
  useCatalogueTerrasse: () => ({
    lames: etat.lames,
    accessoires: etat.accessoires,
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

/** Lame à prix nul : le prix estimé n'est composé que de la part accessoires. */
const lameTest = {
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
  prix_unitaire_lame: 0,
  image_url: null,
  fiche_technique_pdf: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} satisfies CatalogueTerrasseLame;

/** Accessoire CLIP — la ligne « sujet » de la bascule (12,50 € HT). */
function clipDe(typeCout: string): CatalogueTerrasseAccessoire {
  return {
    id: "clip-bascule",
    entreprise_id: "ent-1",
    type_cout: typeCout,
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
  };
}

/** Ligne témoin LAMBOURDE matérielle (40 € HT) : ne doit jamais être affectée. */
const lamboTemoin: CatalogueTerrasseAccessoire = {
  id: "lambo-temoin",
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
};

const configTest = {
  chantier_id: "chantier-1",
  nom: "Terrasse bascule",
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

/** Montre les valeurs d'un select d'accessoires par son libellé (proche voisin). */
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

/** Texte affiché par le bloc « Prix estimé HT » (et lui seul). */
function prixEstimeTexte(): string {
  const bloc = Array.from(conteneur.querySelectorAll("div")).find(
    (d) => d.textContent?.startsWith("Prix estimé HT")
  );
  expect(bloc, "bloc « Prix estimé HT » introuvable").toBeTruthy();
  return bloc!.textContent ?? "";
}

async function rendre(): Promise<void> {
  await act(async () => {
    root.render(createElement(TerrasseConfigForm, { config: configTest, onChange: () => {} }));
  });
}

/** Charge un catalogue neuf (nouvelle identité de tableau) puis rend. */
async function chargerEtRendre(accessoires: CatalogueTerrasseAccessoire[]): Promise<void> {
  etat.lames = [lameTest];
  etat.accessoires = accessoires;
  await rendre();
}

describe("TerrasseConfigForm — bascule type_cout « matiere » → « main_oeuvre »", () => {
  it("exclut immédiatement la ligne basculée des sélecteurs et du prix estimé", async () => {
    // État initial : le clip est un accessoire matériel.
    await chargerEtRendre([clipDe("matiere"), lamboTemoin]);
    expect(optionsDe("Clips compatibles")).toEqual(["clip-bascule"]);
    // 12,50 (clip) + 40,00 (lambourde témoin) = 52,50 €.
    expect(prixEstimeTexte()).toContain(fmtEuro(52.5));

    // Bascule : la même ligne, avec `type_cout` passé à « main_oeuvre ».
    await chargerEtRendre([clipDe("main_oeuvre"), lamboTemoin]);

    // 1. Plus aucun clip proposé…
    expect(optionsDe("Clips compatibles")).toEqual([]);
    // 2. …et son prix ne compte plus : seule la lambourde témoin reste.
    expect(prixEstimeTexte()).toContain(fmtEuro(40));
    expect(prixEstimeTexte()).not.toContain(fmtEuro(52.5));
  });

  it("n'affecte ni les autres sélecteurs ni la ligne témoin lors de la bascule", async () => {
    await chargerEtRendre([clipDe("matiere"), lamboTemoin]);
    await chargerEtRendre([clipDe("main_oeuvre"), lamboTemoin]);
    // La lambourde témoin reste sélectionnable et affichée, inchangée.
    expect(optionsDe("Lambourdes compatibles")).toEqual(["lambo-temoin"]);
    const label = Array.from(conteneur.querySelectorAll("label")).find(
      (l) => l.textContent?.trim() === "Lambourdes compatibles"
    );
    const select = label!.parentElement!.querySelector("select")!;
    expect(select.textContent).toContain("barre de 4m");
  });
});

describe("TerrasseConfigForm — bascule inverse « main_oeuvre » → « matiere »", () => {
  it("réintègre immédiatement la ligne dans le sélecteur et le prix estimé", async () => {
    // État initial : la ligne est une prestation — déjà exclue.
    await chargerEtRendre([clipDe("main_oeuvre"), lamboTemoin]);
    expect(optionsDe("Clips compatibles")).toEqual([]);
    expect(prixEstimeTexte()).toContain(fmtEuro(40));
    expect(prixEstimeTexte()).not.toContain(fmtEuro(52.5));

    // Bascule inverse : la ligne redevient matérielle.
    await chargerEtRendre([clipDe("matiere"), lamboTemoin]);
    expect(optionsDe("Clips compatibles")).toEqual(["clip-bascule"]);
    expect(prixEstimeTexte()).toContain(fmtEuro(52.5));
    expect(prixEstimeTexte()).not.toContain(fmtEuro(40));
  });

  it("affiche le libellé complet de la ligne réintégrée (prix au conditionnement)", async () => {
    await chargerEtRendre([clipDe("main_oeuvre"), lamboTemoin]);
    await chargerEtRendre([clipDe("matiere"), lamboTemoin]);
    const label = Array.from(conteneur.querySelectorAll("label")).find(
      (l) => l.textContent?.trim() === "Clips compatibles"
    );
    const select = label!.parentElement!.querySelector("select")!;
    expect(select.textContent).toContain("boîte de 100");
    expect(select.textContent).toContain(fmtEuro(12.5));
  });
});
