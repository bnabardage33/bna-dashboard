import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import TerrasseConfigForm from "@/components/terrasse/TerrasseConfigForm";
import TerrasseQuantitatifTable from "@/components/terrasse/TerrasseQuantitatifTable";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import { fmtEuro } from "@/lib/financeCalculs";
import type {
  CatalogueTerrasseAccessoire,
  CatalogueTerrasseLame,
} from "@/hooks/useCatalogueTerrasse";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const etatCatalogue = vi.hoisted(() => ({
  lames: [] as CatalogueTerrasseLame[],
  accessoires: [] as CatalogueTerrasseAccessoire[],
}));

vi.mock("@/hooks/useCatalogueTerrasse", () => ({
  useCatalogueTerrasse: () => ({
    lames: etatCatalogue.lames,
    accessoires: etatCatalogue.accessoires,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));

const configBase: ChantierTerrasseConfig = {
  chantier_id: "chantier-99",
  nom: "Terrasse Sélection",
  longueur_m: 5,
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
  type_fixation: "clips_invisibles",
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
};

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  conteneur.remove();
});

function prixEstimeTexte(): string {
  const bloc = Array.from(conteneur.querySelectorAll("div")).find((d) =>
    d.textContent?.startsWith("Prix estimé HT")
  );
  expect(bloc, "bloc « Prix estimé HT » introuvable").toBeTruthy();
  return bloc!.textContent ?? "";
}

describe("TerrasseConfigForm — prixEstimeHT et sélection unitaire d'accessoires", () => {
  it("n'additionne PAS tous les accessoires compatibles lorsqu'un seul accessoire est sélectionné", async () => {
    etatCatalogue.lames = [
      {
        id: "lame-1",
        entreprise_id: "ent-1",
        designation: "Lame Composite",
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
      },
    ];
    etatCatalogue.accessoires = [
      {
        id: "clip-1",
        entreprise_id: "ent-1",
        type_cout: "matiere",
        categorie: "CLIP",
        conditionnement: "boîte 100 std",
        prix_conditionnement: 15,
        materiel_compatibles: ["COMPOSITE"],
        designation: "Clip 1",
        description: null,
        fournisseur: null,
        unite_mesure: null,
        specifications_dt: null,
        pu_ht: null,
        pu_revient: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "clip-2",
        entreprise_id: "ent-1",
        type_cout: "matiere",
        categorie: "CLIP",
        conditionnement: "boîte 100 pro",
        prix_conditionnement: 25,
        materiel_compatibles: ["COMPOSITE"],
        designation: "Clip 2",
        description: null,
        fournisseur: null,
        unite_mesure: null,
        specifications_dt: null,
        pu_ht: null,
        pu_revient: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    await act(async () => {
      root.render(
        createElement(TerrasseConfigForm, {
          config: {
            ...configBase,
            lame_id: "lame-1",
            clip_id: "clip-2",
            quantite_accessoires: { clip: 3 },
          },
          onChange: () => {},
        })
      );
    });

    // Seul clip-2 (25 €) * quantité 3 = 75 € doit être compté (et non (15 + 25) = 40 €)
    expect(prixEstimeTexte()).toContain(fmtEuro(75));
    expect(prixEstimeTexte()).not.toContain(fmtEuro(40));
  });

  it("utilise prix_m2_ht lorsque prix_unitaire_lame n'est pas renseigné", async () => {
    etatCatalogue.lames = [
      {
        id: "lame-m2",
        entreprise_id: "ent-1",
        designation: "Lame vendue au m2",
        description: null,
        fournisseur: "ACME",
        reference_fournisseur: null,
        essence: "pin_cl4",
        type_material: "BOIS_NATUREL",
        longueur_mm: 4000,
        largeur_utile_mm: 145,
        epaisseur_mm: 21,
        prix_m2_ht: 40,
        prix_unitaire_lame: null,
        image_url: null,
        fiche_technique_pdf: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    etatCatalogue.accessoires = [];

    await act(async () => {
      root.render(
        createElement(TerrasseConfigForm, {
          // 5m x 4m = 20 m² * coef_perte_lames 1.1 = 22 m² * 40 €/m² = 880 €
          config: {
            ...configBase,
            lame_id: "lame-m2",
          },
          onChange: () => {},
        })
      );
    });

    expect(prixEstimeTexte()).toContain(fmtEuro(880));
  });
});

describe("TerrasseQuantitatifTable — contrat bna_prefill_commande compatible Fournisseurs", () => {
  it("écrit à la fois les clés camelCase (chantierId, chantierNom, zoneNom) et snake_case", async () => {
    const resultat = calculerTerrasse(configBase);

    await act(async () => {
      root.render(
        createElement(TerrasseQuantitatifTable, {
          resultat,
          chantierId: "ch-123",
          chantierNom: "Villa Océan",
        })
      );
    });

    const bouton = Array.from(conteneur.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Créer le Bon de Commande Fournisseur")
    );
    expect(bouton).toBeTruthy();

    await act(async () => {
      bouton!.click();
    });

    const raw = localStorage.getItem("bna_prefill_commande");
    expect(raw).toBeTruthy();
    const payload = JSON.parse(raw!);

    // Clés lues par app/bureau/fournisseurs/page.tsx
    expect(payload.chantierId).toBe("ch-123");
    expect(payload.chantierNom).toBe("Villa Océan");
    expect(payload.zoneNom).toContain("Fournitures Terrasse Bois DTU 51.4");

    // Clés historiques préservées
    expect(payload.chantier_id).toBe("ch-123");
    expect(payload.chantier_nom).toBe("Villa Océan");
    expect(Array.isArray(payload.lignes)).toBe(true);
    expect(payload.lignes.length).toBeGreaterThan(0);
    expect(pushMock).toHaveBeenCalledWith("/bureau/fournisseurs");
  });
});
