// Non-régression de l'AFFICHAGE DES CARTES du Catalogue Terrasse
// (`app/bureau/catalogue-terrasse/page.tsx`, fonction `carteAccessoire`) :
//   * une prestation de main-d'œuvre (`type_cout === "main_oeuvre"`) n'affiche
//     plus « Fournisseur non défini » : le bloc fournisseur est masqué ;
//   * matières et accessoires conservent l'affichage actuel du fournisseur
//     (valeur saisie, ou « Fournisseur non défini » si laissé vide) ;
//   * les tarifs des prestations (coût de revient + prix unitaire) restent
//     affichés — aucun calcul n'est touché.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import CatalogueTerrassePage from "@/app/bureau/catalogue-terrasse/page";
import { fmtEuro } from "@/lib/financeCalculs";

// `next/link` exige le contexte App Router : on le remplace par une ancre.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

// Le client Supabase n'est PAS sollicité au rendu (il ne l'est que dans les
// handlers CRUD) : on le neutralise pour rester indépendant de l'environnement.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

// Catalogue stubbé : on neutralise le fetch du hook. Deux lignes matérielles
// (une avec fournisseur, une sans) et une prestation de main-d'œuvre.
vi.mock("@/hooks/useCatalogueTerrasse", () => ({
  useCatalogueTerrasse: () => ({
    lames: [],
    accessoires: [
      {
        id: "presta-1",
        entreprise_id: "ent-1",
        type_cout: "main_oeuvre",
        categorie: "LAMBOURDE",
        conditionnement: null,
        prix_conditionnement: null,
        materiel_compatibles: [],
        designation: "Pose de lambourdes",
        description: null,
        fournisseur: null,
        unite_mesure: "ml",
        specifications_dt: null,
        pu_ht: 45,
        pu_revient: 20,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "clip-1",
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
      {
        id: "plot-1",
        entreprise_id: "ent-1",
        type_cout: "matiere",
        categorie: "PLOT",
        conditionnement: "lot de 10",
        prix_conditionnement: 30,
        materiel_compatibles: ["COMPOSITE"],
        designation: "Plot réglable",
        description: null,
        fournisseur: null,
        unite_mesure: null,
        specifications_dt: null,
        pu_ht: null,
        pu_revient: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
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
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
});

/** Retrouve la carte (le conteneur de la carte) par le titre qu'elle affiche. */
function carteDe(titre: string): HTMLElement {
  const h3 = Array.from(conteneur.querySelectorAll("h3")).find(
    (n) => n.textContent?.trim() === titre
  );
  expect(h3, `carte « ${titre} » introuvable`).toBeTruthy();
  return h3!.parentElement as HTMLElement;
}

async function rendre(): Promise<void> {
  await act(async () => {
    root.render(createElement(CatalogueTerrassePage));
  });
}

describe("Catalogue Terrasse — carte d'une prestation de main-d'œuvre", () => {
  it("n'affiche ni « Fournisseur non défini » ni bloc fournisseur", async () => {
    await rendre();
    const carte = carteDe("Pose de lambourdes");
    expect(carte.textContent).not.toContain("Fournisseur");
  });

  it("n'ajoute aucune mention de repli fournisseur à la page (seule la matière sans fournisseur en porte une)", async () => {
    await rendre();
    const occurrences = (conteneur.textContent ?? "").split("Fournisseur non défini").length - 1;
    expect(occurrences).toBe(1);
  });

  it("conserve l'affichage des tarifs (revient + prix unitaire)", async () => {
    await rendre();
    const carte = carteDe("Pose de lambourdes");
    expect(carte.textContent).toContain(`Revient : ${fmtEuro(20)} HT`);
    expect(carte.textContent).toContain(`${fmtEuro(45)} HT`);
  });
});

describe("Catalogue Terrasse — cartes matières / accessoires (comportement inchangé)", () => {
  it("affiche le fournisseur renseigné d'un accessoire matériel", async () => {
    await rendre();
    const carte = carteDe("Clip inox");
    expect(carte.textContent).toContain("ACME");
    expect(carte.textContent).not.toContain("Fournisseur non défini");
  });

  it("conserve « Fournisseur non défini » pour une matière sans fournisseur", async () => {
    await rendre();
    const carte = carteDe("Plot réglable");
    expect(carte.textContent).toContain("Fournisseur non défini");
  });

  it("affiche toujours le prix au conditionnement d'un accessoire matériel", async () => {
    await rendre();
    const carte = carteDe("Clip inox");
    expect(carte.textContent).toContain(fmtEuro(12.5));
  });
});
