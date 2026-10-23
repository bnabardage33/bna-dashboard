// __tests__/ui/tableau-precipitations.test.tsx
//
// TABLEAU HORAIRE DÉPLOYANT — navigation mobile et ouverture.
//
// Scénario n° 9 de la commande initiale : « navigation mobile et ouverture du
// tableau horaire ». Ce test verrouille, sur le composant partagé utilisé par
// les CARTES météo chantier et la FICHE chantier :
//
//   1. le dépliant est FERMÉ par défaut, et s'ouvre puis se referme au clic ;
//   2. le clic sur le bouton ne DÉCLENCHE PAS la navigation de la carte `<Link>`
//      (preventDefault + stopPropagation — le point délicat de la commande) ;
//   3. une donnée manquante s'affiche en tiret, JAMAIS en 0 ;
//   4. la nature (observée / prévue) n'est affirmée QUE si la source le permet ;
//   5. la période couverte et les heures sans donnée sont clairement
//      identifiées ;
//   6. le classement passé / à venir se fait à l'AFFICHAGE (cache de 30 min),
//      et non à la génération de la réponse.
//
// PAS de `@testing-library/react` (incompatible React 19 dans cette version du
// dépôt) : harnais `createRoot` + `act`, comme les autres tests UI.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

// `next/link` exige le contexte App Router : on le remplace par une ancre,
// comme dans drawer-accordion.test.tsx.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

import TableauPrecipitations from "@/components/TableauPrecipitations";
import type { HeureMeteo } from "@/lib/meteo";

// --- Harnais ----------------------------------------------------------------

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  conteneur.remove();
  vi.useRealTimers();
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

async function monter(element: ReactNode) {
  await act(async () => {
    root.render(element);
  });
}

function bouton(libelle: string): HTMLButtonElement {
  const b = [...conteneur.querySelectorAll("button")].find(
    (x) => x.textContent === libelle,
  );
  if (!b) throw new Error(`Bouton « ${libelle} » introuvable`);
  return b;
}

function clic(ele: Element, opts: { bulle?: boolean } = {}) {
  const evenement = new MouseEvent("click", {
    bubbles: opts.bulle ?? true,
    cancelable: true,
  });
  ele.dispatchEvent(evenement);
  return evenement;
}

// --- Fixtures ---------------------------------------------------------------

function serie(): HeureMeteo[] {
  return [
    // Écoulée à l'affichage (voir setSystemTime ci-dessous), observée par la
    // source : les deux informations sont INDÉPENDANTES et doivent l'être.
    { heure: "13:00", temp: 15, vent: 10, rafales: 22, pluie: 0.4, statut: "avenir", nature: "observee" },
    // À venir, prévue.
    { heure: "15:00", temp: 17, vent: 12, rafales: 28, pluie: null, statut: "avenir", nature: "prevision" },
    // À venir, mais nature inconnue : la source n'a pas fourni sa référence.
    { heure: "18:00", temp: null, vent: null, rafales: null, pluie: null, statut: "avenir", nature: "inconnue" },
  ];
}

// 12:00 UTC = 14:00 heure de Paris (UTC+2, fin octobre). L'heure 13:00 est
// donc ÉCOULÉE à l'affichage, même si la route l'a classée « à venir » dans
// son cache de 30 minutes.
const MAINTENANT = "2026-10-20T12:00:00.000Z";

// --- 1. Cycle ouvrir / fermer ----------------------------------------------

describe("cycle du dépliant", () => {
  it("est fermé par défaut, s'ouvre puis se referme", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MAINTENANT));
    await monter(<TableauPrecipitations heures={serie()} />);

    expect(conteneur.querySelector("table")).toBeNull();
    expect(bouton("▼ Voir les précipitations")).toBeTruthy();

    await act(async () => {
      clic(bouton("▼ Voir les précipitations"));
    });
    expect(conteneur.querySelector("table")).toBeTruthy();

    await act(async () => {
      clic(bouton("▲ Masquer les précipitations"));
    });
    expect(conteneur.querySelector("table")).toBeNull();
  });

  it("n'affiche rien si la série est vide — pas de tableau vide trompeur", async () => {
    await monter(<TableauPrecipitations heures={[]} />);
    expect(conteneur.textContent).toBe("");
  });
});

// --- 2. Le clic ne déclenche PAS la navigation de la carte ------------------

describe("cohabitation avec la carte <Link> cliquable", () => {
  /**
   * Carte-ancre avec un `onClick` React, exactement comme `next/link` : c'est
   * ce handler qui déclenche la navigation. Le dépliant vit à l'intérieur.
   */
  let navigations = 0;
  function Carte() {
    return createElement(
      "a",
      {
        href: "/terrain/chantier/1",
        onClick: () => {
          navigations += 1;
        },
      },
      createElement(TableauPrecipitations, { heures: serie() }),
    );
  }

  beforeEach(() => {
    navigations = 0;
  });

  it("le clic sur le bouton n'atteint JAMAIS le handler de navigation de la carte", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MAINTENANT));
    await monter(createElement(Carte));

    let evenement!: MouseEvent;
    await act(async () => {
      evenement = clic(bouton("▼ Voir les précipitations"));
    });

    // La propagation synthétique de React est stoppée : le handler onClick de
    // la carte (celui de `next/link`) n'est JAMAIS appelé.
    expect(navigations).toBe(0);
    // Et la navigation par défaut de l'ancre est annulée.
    expect(evenement.defaultPrevented).toBe(true);
    // Le clic a bien fait son travail : le tableau est OUVERT.
    expect(conteneur.querySelector("table")).toBeTruthy();

    // Un second clic (refermer) est tout aussi inoffensif pour la carte.
    await act(async () => {
      clic(bouton("▲ Masquer les précipitations"));
    });
    expect(navigations).toBe(0);
    expect(conteneur.querySelector("table")).toBeNull();
  });

  it("le tableau ouvert absorbe aussi les clics qui lui sont destinés", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MAINTENANT));
    await monter(createElement(Carte));
    await act(async () => {
      clic(bouton("▼ Voir les précipitations"));
    });

    // Le clic sur le tableau ouvert est absorbé par le dépliant lui-même.
    await act(async () => {
      clic(conteneur.querySelector("table") as Element);
    });
    expect(navigations).toBe(0);
    expect(conteneur.querySelector("table")).toBeTruthy();
  });
});

// --- 3-5. Règles d'affichage ------------------------------------------------

describe("affichage : tirets, nature, période couverte", () => {
  it("une donnée manquante s'affiche en tiret, JAMAIS en 0", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MAINTENANT));
    await monter(<TableauPrecipitations heures={serie()} />);
    await act(async () => {
      clic(bouton("▼ Voir les précipitations"));
    });

    const lignes = [...conteneur.querySelectorAll("tbody tr")];
    const ligne15 = lignes.find((l) => l.textContent.includes("15:00"));
    expect(ligne15).toBeTruthy();
    // Pluie manquante à 15:00 : tiret, et surtout PAS « 0.0 mm ».
    expect(ligne15?.textContent).toContain("—");
    expect(ligne15?.textContent).not.toContain("0.0 mm");

    // L'heure 18:00 est TOTALEMENT sans donnée : quatre tirets.
    const ligne18 = lignes.find((l) => l.textContent.includes("18:00"));
    expect(ligne18?.textContent).not.toMatch(/0 km\/h|0°C/);
  });

  it("la nature n'est affirmée que si la source le permet", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MAINTENANT));
    await monter(<TableauPrecipitations heures={serie()} />);
    await act(async () => {
      clic(bouton("▼ Voir les précipitations"));
    });

    const texte = conteneur.querySelector("tbody")?.textContent ?? "";
    expect(texte).toContain("Observée");
    expect(texte).toContain("Prévue");
    // L'heure 18:00 (nature inconnue) porte un tiret, pas une supposition.
    const ligne18 = [...conteneur.querySelectorAll("tbody tr")].find((l) =>
      l.textContent.includes("18:00"),
    );
    expect(ligne18?.textContent).toContain("—");
    expect(ligne18?.textContent).not.toMatch(/Observée|Prévue/);
  });

  it("identifie la période couverte et les heures sans donnée", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MAINTENANT));
    await monter(<TableauPrecipitations heures={serie()} />);
    await act(async () => {
      clic(bouton("▼ Voir les précipitations"));
    });

    const texte = conteneur.textContent ?? "";
    expect(texte).toContain("Période couverte : 13:00 – 18:00 (3 h)");
    // Les heures 15:00 et 18:00 n'ont AUCUNE donnée de pluie : 2 sans donnée.
    expect(texte).toContain("2 heure(s) sans donnée de pluie");
  });
});

// --- 6. Reclassement à l'AFFICHAGE (cache de 30 minutes) --------------------

describe("classement passé / à venir recalculé à l'affichage", () => {
  it("une heure du cache devenue passée est affichée « écoulée »", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MAINTENANT)); // 14:00 heure de Paris
    await monter(<TableauPrecipitations heures={serie()} />);
    await act(async () => {
      clic(bouton("▼ Voir les précipitations"));
    });

    const ligne13 = [...conteneur.querySelectorAll("tbody tr")].find((l) =>
      l.textContent.includes("13:00"),
    );
    const ligne15 = [...conteneur.querySelectorAll("tbody tr")].find((l) =>
      l.textContent.includes("15:00"),
    );
    // 13:00 est passée à 14:00 ; 15:00 ne l'est pas.
    expect(ligne13?.textContent).toMatch(/13:00\s*·/);
    expect(ligne15?.textContent).not.toMatch(/15:00\s*·/);
  });
});

// --- Accessibilité / mobile -------------------------------------------------

describe("mobile", () => {
  it("le tableau est défilable horizontalement avec première colonne collante", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MAINTENANT));
    await monter(<TableauPrecipitations heures={serie()} />);
    await act(async () => {
      clic(bouton("▼ Voir les précipitations"));
    });

    const cadre = conteneur.querySelector("table")?.parentElement;
    expect(cadre?.className).toContain("overflow-x-auto");
    const entetes = [...conteneur.querySelectorAll("th")];
    expect(entetes[0].className).toContain("sticky");
  });

  it("les libellés du dépliant sont personnalisables (cartes vs fiche)", async () => {
    await monter(
      <TableauPrecipitations
        heures={serie()}
        libelleFerme="▼ Déplier"
        libelleOuvert="▲ Replier"
      />,
    );
    expect(bouton("▼ Déplier")).toBeTruthy();
    await act(async () => {
      clic(bouton("▼ Déplier"));
    });
    expect(bouton("▲ Replier")).toBeTruthy();
  });
});
