// Météo générale restaurée : accueil + page /terrain/meteo
// ============================================================================
//
// Verrouille la restauration de l'expérience météo historique (recherche de
// ville, matin/après-midi, détail heure par heure, prévisions J+1 à J+4,
// icônes dynamiques) SUR LES DEUX supports où elle vit :
//
//   1. `components/MeteoGeneraleAccueil.tsx` — le bloc de l'accueil ;
//   2. `app/terrain/meteo/page.tsx` — la page complète restaurée (f6366a5).
//
// Deux niveaux de vérification, comme ailleurs dans le dépôt :
//
//   - des tests de RENDU (fetch mocké, même motif que FraisDeplacementTab) pour
//     la recherche, le détail horaire, le band matin/après-midi, les
//     prévisions multi-jours et le message d'erreur propagé par la route
//     (durcissement géographique 600fb18 : « localisation non validée ») ;
//   - des tests de SOURCE pour les invariants structurels : monté par
//     l'accueil, passerelle `fetchMeteo` (jamais d'URL de source directe),
//     fenêtre de prévision NON élargie à sept jours, aucun secret dans le
//     code ajouté.
//
// `ChantiersMeteoCards` (impact opérationnel par chantier) n'est PAS touché :
// ses garanties sont déjà verrouillées par accueil-ordre-et-blocs.test.tsx.
// ============================================================================

import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import MeteoGeneraleAccueil from "../../components/MeteoGeneraleAccueil";
import type { JourMeteo } from "../../lib/meteo";

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ── Rendu avec fetch mocké ──────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

let conteneur: HTMLDivElement;
let root: Root;

/** Réponse `GET /api/meteo` conforme au type `JourMeteo` de `lib/meteo.ts`. */
const METEO_VALIDE: JourMeteo = {
  matin: { temp: 12, vent: 10, rafales: 18 },
  apresMidi: { temp: 18, vent: 14, rafales: 26 },
  heures: [
    // Hors plage de travail : ne doit PAS être affiché (06 h → 18 h).
    { heure: "05:00", temp: 9, vent: 8, rafales: 12, pluie: 0 },
    { heure: "08:00", temp: 11, vent: 9, rafales: 15, pluie: 0 },
    { heure: "12:00", temp: 16, vent: 12, rafales: 20, pluie: 0.2 },
    { heure: "18:00", temp: 17, vent: 13, rafales: 22, pluie: 0 },
    { heure: "19:00", temp: 16, vent: 14, rafales: 24, pluie: 0 },
    { heure: "22:00", temp: 13, vent: 11, rafales: 18, pluie: 0 },
  ],
  alerte: { niveau: "vert", motif: "Aucune vigilance particulière" },
  icon: "partly-cloudy-day",
  conditions: "Partiellement nuageux",
  source: "open-meteo",
  tempActuelle: 15,
  tempMaxJour: 19,
  tempMinJour: 9,
  cumulPluie: 0.2,
  prochainsJours: [
    { date: "2026-10-20", tempMax: 17, tempMin: 8, icon: "rain", conditions: "Pluie", cumulPluie: 3.4 },
    { date: "2026-10-21", tempMax: 14, tempMin: 7, icon: "cloudy", conditions: "Nuageux", cumulPluie: 0 },
    { date: "2026-10-22", tempMax: 16, tempMin: 6, icon: "clear-day", conditions: "Ensoleillé", cumulPluie: 12.6 },
  ],
};

const reponseOk = (corps: unknown) => ({
  ok: true,
  json: async () => corps,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(reponseOk(METEO_VALIDE));
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  conteneur.remove();
});

async function rendre() {
  await act(async () => {
    root.render(createElement(MeteoGeneraleAccueil));
  });
  await act(async () => {
    await sleep(10);
  });
}

async function chercherVille(valeur: string): Promise<void> {
  const input = conteneur.querySelector(
    'input[placeholder*="Rechercher une ville"]',
  ) as HTMLInputElement | null;
  expect(input, "champ de recherche de ville introuvable").toBeTruthy();
  const proto = Object.getPrototypeOf(input as HTMLInputElement);
  const descripteur = Object.getOwnPropertyDescriptor(proto, "value");
  descripteur?.set?.call(input, valeur);
  await act(async () => {
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(0);
  });
  const formulaire = conteneur.querySelector("form");
  expect(formulaire, "formulaire de recherche introuvable").toBeTruthy();
  await act(async () => {
    formulaire!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await sleep(10);
  });
}

function bouton(texte: string): HTMLButtonElement | null {
  return (
    Array.from(conteneur.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(texte),
    ) ?? null
  );
}

function cliquer(element: HTMLElement): Promise<void> {
  return act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await sleep(10);
  });
}

const derniereUrlRequisee = (): string => {
  const appel = mockFetch.mock.calls.at(-1)?.[0];
  expect(typeof appel, "aucun appel fetch enregistré").toBe("string");
  return appel as string;
};

// ── 1. Recherche de ville et localisation ───────────────────────────────────

describe("Météo générale (accueil) — recherche de ville", () => {
  it("charge la ville par défaut au montage via `fetchMeteo`", async () => {
    await rendre();
    expect(derniereUrlRequisee()).toContain("/api/meteo?location=Bordeaux");
    // La ville est bien affichée comme en-tête de la carte.
    expect(conteneur.textContent).toContain("Bordeaux");
  });

  it("relance la prévision sur la ville saisie", async () => {
    await rendre();
    await chercherVille("Arcachon");
    expect(derniereUrlRequisee()).toContain(
      `/api/meteo?location=${encodeURIComponent("Arcachon")}`,
    );
    expect(conteneur.textContent).toContain("Arcachon");
  });

  it("encode la ville saisie (pas d'URL brisée)", async () => {
    await rendre();
    await chercherVille("Aix-en-Provence");
    expect(derniereUrlRequisee()).toContain(
      `/api/meteo?location=${encodeURIComponent("Aix-en-Provence")}`,
    );
  });

  it("un champ vide ne relance pas la recherche", async () => {
    await rendre();
    const nbAppels = mockFetch.mock.calls.length;
    await chercherVille("   ");
    expect(mockFetch.mock.calls.length).toBe(nbAppels);
  });

  it("la recherche est déclenchée par une loupe blanche sur fond rouge BNA", async () => {
    await rendre();
    const loupe = conteneur.querySelector(
      'button[aria-label="Rechercher la ville"]',
    ) as HTMLButtonElement | null;
    expect(loupe, "bouton loupe introuvable").toBeTruthy();
    // Même comportement : c'est le bouton de soumission du formulaire, donc la
    // touche Entrée et le toucher empruntent le même `onSubmit`.
    expect(loupe!.getAttribute("type")).toBe("submit");
    // Pictogramme (loupe) au lieu du libellé « OK ».
    expect(loupe!.querySelector("svg")).toBeTruthy();
    expect(loupe!.textContent?.trim()).toBe("");
    // Habillage : loupe blanche sur fond rouge BNA, cible tactile de 44 px.
    expect(loupe!.className).toContain("bg-[#E53935]");
    expect(loupe!.className).toContain("text-white");
    expect(loupe!.className).toContain("h-11");
    expect(loupe!.className).toContain("w-11");
  });

  it("toucher la loupe relance exactement la recherche de la ville", async () => {
    await rendre();
    const input = conteneur.querySelector(
      'input[placeholder*="Rechercher une ville"]',
    ) as HTMLInputElement;
    const proto = Object.getPrototypeOf(input);
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, "Arcachon");
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(0);
    });
    const loupe = conteneur.querySelector(
      'button[aria-label="Rechercher la ville"]',
    ) as HTMLButtonElement;
    await cliquer(loupe);
    expect(derniereUrlRequisee()).toContain(
      `/api/meteo?location=${encodeURIComponent("Arcachon")}`,
    );
  });
});

// ── 2. Rendu des prévisions ─────────────────────────────────────────────────

describe("Météo générale (accueil) — prévisions affichées", () => {
  it("affiche température, conditions et min/max du jour", async () => {
    await rendre();
    expect(conteneur.textContent).toContain("15°"); // température actuelle
    expect(conteneur.textContent).toContain("19°"); // max du jour
    expect(conteneur.textContent).toContain("9°"); // min du jour
    expect(conteneur.textContent).toContain("Partiellement nuageux");
  });

  it("affiche le band matin / après-midi avec les rafales", async () => {
    await rendre();
    expect(conteneur.textContent).toContain("Matin");
    expect(conteneur.textContent).toContain("Après-midi");
    expect(conteneur.textContent).toContain("Rafales 18 km/h");
    expect(conteneur.textContent).toContain("Rafales 26 km/h");
  });

  it("masque le détail heure par heure par défaut, l'affiche au clic", async () => {
    await rendre();
    // Masqué au montage.
    expect(conteneur.textContent).not.toContain("08:00");
    const afficher = bouton("Afficher le détail heure par heure");
    expect(afficher, "bouton de détail horaire introuvable").toBeTruthy();
    await cliquer(afficher!);
    expect(conteneur.textContent).toContain("08:00");
    expect(conteneur.textContent).toContain("12:00");
    // Le bouton bascule en « Masquer ».
    expect(bouton("Masquer le détail heure par heure")).toBeTruthy();
    await cliquer(bouton("Masquer le détail heure par heure")!);
    expect(conteneur.textContent).not.toContain("08:00");
  });

  it("ne montre que les heures de 06 h à 18 h incluses", async () => {
    // La grille est limitée aux heures de travail : les relevés nocturnes
    // servent au calcul mais n'encombrent pas la carte.
    await rendre();
    await cliquer(bouton("Afficher le détail heure par heure")!);
    for (const heure of ["08:00", "12:00", "18:00"]) {
      expect(conteneur.textContent, `heure manquante : ${heure}`).toContain(heure);
    }
    for (const heure of ["05:00", "19:00", "22:00"]) {
      expect(conteneur.textContent, `heure nocturne affichée : ${heure}`).not.toContain(heure);
    }
  });

  it("affiche les cumuls de pluie prévus (aujourd'hui, demain, après-demain)", async () => {
    await rendre();
    expect(conteneur.textContent).toContain("Aujourd'hui");
    expect(conteneur.textContent).toContain("Demain");
    expect(conteneur.textContent).toContain("Après-demain");
    // Valeurs JOURNALIÈRES telles que fournies : jamais additionnées.
    expect(conteneur.textContent).toContain("0.2 mm");
    expect(conteneur.textContent).toContain("3.4 mm");
    expect(conteneur.textContent).toContain("0 mm");
  });

  it("affiche les prévisions des jours suivants (fenêtre J+1 à J+4)", async () => {
    await rendre();
    // Le band multi-jours rend une cellule par jour : libellé court + icône +
    // max/min. On vérifie les trois jours du jeu de test.
    expect(conteneur.textContent).toContain("17°");
    expect(conteneur.textContent).toContain("8°");
    expect(conteneur.textContent).toContain("14°");
    expect(conteneur.textContent).toContain("7°");
    expect(conteneur.textContent).toContain("16°");
    expect(conteneur.textContent).toContain("6°");
  });

  it("affiche l'alerte de vigilance avec son niveau", async () => {
    await rendre();
    expect(conteneur.textContent).toContain("Aucune vigilance particulière");
    expect(conteneur.textContent).toContain("🟢");
  });
});

// ── 3. Erreurs propagées par la route (600fb18) ─────────────────────────────

describe("Météo générale (accueil) — erreurs de localisation", () => {
  it("affiche le message exact de la route sur un 422 (localisation non validée)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: "Localisation non validée : commune introuvable ou ambiguë.",
        localisation: false,
      }),
    });
    await rendre();
    // Le message propagé remplace le message générique : c'est la garantie
    // que le durcissement géographique reste explicable pour l'utilisateur.
    expect(conteneur.textContent).toContain(
      "Localisation non validée : commune introuvable ou ambiguë.",
    );
    expect(conteneur.textContent).not.toContain("Météo indisponible");
  });

  it("bascule sur le message générique si le corps n'explique rien", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    await rendre();
    expect(conteneur.textContent).toContain("Erreur météo");
  });

  it("réessaie après une nouvelle recherche", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "Localisation non validée." }),
    });
    await rendre();
    expect(conteneur.textContent).toContain("Localisation non validée.");
    // On relance une AUTRE ville : re-soumettre la même valeur ne change pas
    // l'état `ville` et ne relance donc pas l'effet (comportement historique
    // de `setVille`, conservé à l'identique).
    mockFetch.mockResolvedValue(reponseOk(METEO_VALIDE));
    await chercherVille("Arcachon");
    expect(conteneur.textContent).not.toContain("Localisation non validée.");
    expect(conteneur.textContent).toContain("Partiellement nuageux");
    expect(conteneur.textContent).toContain("Arcachon");
  });
});

// ── 4. Invariants structurels (sources) ─────────────────────────────────────

describe("Météo générale — invariants de structure", () => {
  const ACCUEIL = code(lire("components/DashboardAccueil.tsx"));
  const BLOC = code(lire("components/MeteoGeneraleAccueil.tsx"));
  const PAGE = code(lire("app/terrain/meteo/page.tsx"));

  it("l'accueil monte le bloc météo générale ET les cartes chantier", () => {
    // Le bloc restauré n'a pas remplacé l'impact opérationnel : les deux
    // coexistent (contrainte de la restauration).
    expect(ACCUEIL).toContain("MeteoGeneraleAccueil");
    expect(ACCUEIL).toContain("blocMeteo");
  });

  it("les deux écrans passent par `fetchMeteo` — jamais par une source directe", () => {
    // `fetchMeteo` est la passerelle unique : c'est elle qui propage les
    // erreurs de la route et qui garantit le repli de source.
    for (const [nom, source] of [
      ["le bloc accueil", BLOC],
      ["la page /terrain/meteo", PAGE],
    ] as const) {
      expect(source, `${nom} n'utilise plus fetchMeteo`).toContain("fetchMeteo(");
      expect(source, `${nom} interroge une source météo en dur`).not.toMatch(
        /api\.open-meteo\.com|visualcrossing\.com/i,
      );
    }
  });

  it("la fenêtre de prévision n'est pas élargie à sept jours", () => {
    // Contrainte explicite : on conserve la fenêtre API actuelle (J+1 à J+4),
    // aucun `forecast_days: 7` ni libellé « sept jours » ne doit apparaître.
    for (const [nom, source] of [
      ["le bloc accueil", BLOC],
      ["la page /terrain/meteo", PAGE],
    ] as const) {
      expect(source, `${nom} élargit la prévision à 7 jours`).not.toMatch(
        /sept jours|7 jours|forecast_days.{0,4}7/i,
      );
    }
  });

  it("les icônes restent dynamiques (nom VC ou code WMO selon la source)", () => {
    // `IconeMeteo` reçoit `icon` ET `conditions` : c'est ce double signal qui
    // permet d'afficher le bon pictogramme quelle que soit la source.
    for (const [nom, source] of [
      ["le bloc accueil", BLOC],
      ["la page /terrain/meteo", PAGE],
    ] as const) {
      expect(source, `${nom} a perdu le mapping d'icônes`).toContain("IconeMeteo");
      expect(source, `${nom} n'utilise plus les conditions`).toContain("conditions=");
    }
  });

  it("aucun secret ni identifiant sensible dans le code restauré", () => {
    // Ni clé d'API, ni URL de base privée, ni jeton : la passerelle
    // `/api/meteo` est le seul point de sortie.
    for (const [nom, source] of [
      ["le bloc accueil", BLOC],
      ["la page /terrain/meteo", PAGE],
    ] as const) {
      expect(source, `${nom} contient une clé ou un jeton`).not.toMatch(
        /API_KEY|supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
      );
    }
  });

  it("la page /terrain/meteo n'est plus une redirection", () => {
    expect(PAGE).not.toContain("redirect(");
  });

  it("la grille horaire est bornée à 06 h–18 h dans le code du bloc", () => {
    // L'invariant doit tenir même si le rendu change : les bornes sont
    // nommées et le filtre inclut les deux extrêmes.
    expect(BLOC).toContain("HEURE_DEBUT = 6");
    expect(BLOC).toContain("HEURE_FIN = 18");
    expect(BLOC).toMatch(/hh >= HEURE_DEBUT && hh <= HEURE_FIN/);
  });

  it("les cumuls de pluie journaliers viennent de la donnée, jamais d'une somme locale", () => {
    // `cumulPluie` (aujourd'hui) et `prochainsJours[].cumulPluie` (J+1, J+2)
    // sont affichés tels quels : aucune addition de valeurs déjà cumulées.
    expect(BLOC).toContain("meteo.cumulPluie");
    expect(BLOC).toContain("prochainsJours[0]?.cumulPluie");
    expect(BLOC).toContain("prochainsJours[1]?.cumulPluie");
    expect(BLOC).not.toMatch(/reduce\(\s*\([^)]*\)\s*=>[^)]*pluie/);
  });
});
