// Non-régression de l'AFFICHAGE DES CARTES du Catalogue Terrasse — nature du
// conditionnement affiché (`app/bureau/catalogue-terrasse/page.tsx`,
// fonction `carteAccessoire`) :
// une prestation de main-d'œuvre (`type_cout === "main_oeuvre"`) N'EST PAS un
// accessoire matériel : sa carte ne doit afficher AUCUN conditionnement
// matériel (« boîte de 100 », « lot de 10 »…), même si des valeurs
// HISTORIQUES subsistent dans l'objet — cas typique d'une ligne basculée de
// "matiere" en "main_oeuvre" avant la migration 20261020, où les colonnes
// `conditionnement` / `prix_conditionnement` gardent leur ancienne valeur.
//
// Le prix au conditionnement est déjà écarté (branche `prestation` du pied de
// carte) : ce test verrouille aussi qu'il ne revient jamais par effraction.
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

// Catalogue stubbé : on neutralise le fetch du hook.
//   * `presta-historique` : prestation de main-d'œuvre porteur ENCORE des
//     valeurs matérielles historiques (conditionnement + prix) ;
//   * `clip-1` : accessoire matériel témoin, dont le conditionnement DOIT
//     rester affiché (contrairement à la prestation).
vi.mock("@/hooks/useCatalogueTerrasse", () => ({
  useCatalogueTerrasse: () => ({
    lames: [],
    accessoires: [
      {
        id: "presta-historique",
        entreprise_id: "ent-1",
        type_cout: "main_oeuvre",
        categorie: "LAMBOURDE",
        // Vestiges d'une ligne jadis matérielle : à ne JAMAIS afficher.
        conditionnement: "barre de 4m",
        prix_conditionnement: 40,
        materiel_compatibles: ["COMPOSITE"],
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

describe("Catalogue Terrasse — carte d'une prestation sans conditionnement matériel", () => {
  it("n'affiche pas le conditionnement matériel historique de la prestation", async () => {
    await rendre();
    const carte = carteDe("Pose de lambourdes");
    // La ligne porte encore `conditionnement: "barre de 4m"` (vestige)…
    expect(carte.textContent).not.toContain("barre de 4m");
  });

  it("n'affiche pas le prix au conditionnement historique de la prestation", async () => {
    await rendre();
    const carte = carteDe("Pose de lambourdes");
    // …et `prix_conditionnement: 40` : ni le montant, ni une mention « / barre ».
    expect(carte.textContent).not.toContain(fmtEuro(40));
  });

  it("affiche bien les tarifs propres à la prestation (revient + prix unitaire)", async () => {
    await rendre();
    const carte = carteDe("Pose de lambourdes");
    expect(carte.textContent).toContain(`Revient : ${fmtEuro(20)} HT`);
    expect(carte.textContent).toContain(`${fmtEuro(45)} HT`);
  });

  it("conserve l'affichage du conditionnement d'un accessoire matériel (témoin)", async () => {
    await rendre();
    const carte = carteDe("Clip inox");
    expect(carte.textContent).toContain("boîte de 100");
    expect(carte.textContent).toContain(fmtEuro(12.5));
  });
});
