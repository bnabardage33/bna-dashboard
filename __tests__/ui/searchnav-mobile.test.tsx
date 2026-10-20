// SearchNav — UNE SEULE recherche, cohérente sur ordinateur et mobile
// ============================================================================
//
// POURQUOI CE TEST
//
// Trois défauts ont été observés sur captures réelles :
//
//   1. Sur ORDINATEUR, deux recherches apparaissaient en même temps. Cause :
//      breakpoints incohérents — champ inline `hidden md:block` (≥ 768 px)
//      quand le bouton loupe était `lg:hidden` (< 1024 px). Entre 768 et
//      1024 px, les DEUX étaient visibles.
//   2. Sur MOBILE, le volet était écrasé sur ~90 px. Cause : il était
//      `absolute left-0 right-0` dans la rangée des boutons, dont la largeur
//      ne vaut que la somme loupe + cloche.
//   3. « Aucun résultat » s'affichait avant toute requête, et masquait
//      aussi les erreurs réseau.
//
// Correction : un SEUL seuil (`lg`) pour les deux présentations, un volet
// `fixed` ancré au viewport et borné par `max-w-[calc(100vw-2rem)]`, et un
// état de recherche explicite (`idle` / `loading` / `erreur` / `ok`).
//
// Ce test verrouille :
//   · desktop : champ visible, bouton ET panneau mobiles absents ;
//   · mobile  : champ inline absent, bouton loupe visible, 44 px ;
//   · volet assez large et INDÉPENDANT de la largeur de son bouton ;
//   · recherche avec résultats / sans résultat / erreur réseau ;
//   · ouverture-fermeture (loupe, Échap, clic extérieur, choix d'un résultat) ;
//   · l'absence de doublon (une seule présentation active) ;
//   · la non-régression des destinations, de la route et du seuil de 2 car. ;
//   · la même logique pour les deux champs (valeur la plus récente).
//
// NOTE : pas de `@testing-library/react` ici — la version installée (9.5.0)
// utilise `ReactDOM.render`, supprimé en React 19. On passe par `createRoot`
// (react-dom/client) + `act` (react 19), comme `searchnav-hooks.test.tsx`.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

// --- Mocks ------------------------------------------------------------------

let cheminCourant = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => cheminCourant,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: {
    href: string;
    children: ReactNode;
    onClick?: () => void;
  }) =>
    // Un `<a>` brut déclencherait la navigation (non implémentée) dans jsdom :
    // on l'annule pour ne garder que le comportement utile du composant, son
    // `onClick` (fermeture du volet), tout en conservant le `href` réel.
    createElement(
      "a",
      {
        href,
        ...rest,
        onClick: (e: { preventDefault: () => void }) => {
          e.preventDefault();
          onClick?.();
        },
      },
      children,
    ),
}));

/** Toutes les URL frappées par `fetch`, dans l'ordre. */
const appels: string[] = [];

/** Scénario de réponse imposé au prochain `fetch` (voir `scenario`). */
let scenario: "resultats" | "vide" | "erreur" = "resultats";

const RECHERCHE_VIDE = {
  results: { clients: [], chantiers: [], devis: [], fournisseurs: [] },
  total: 0,
};

const RECHERCHE_PLEINE = {
  results: {
    clients: [{ id: "c1", nom: "Dupont", societe: "SARL Dupont", email: null, tel: null }],
    chantiers: [],
    devis: [],
    fournisseurs: [],
  },
  total: 1,
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from() {
      const b = {
        _limit: null as number | null,
        select: () => b,
        order: () => b,
        limit(n: number) { b._limit = n; return b; },
        in: () => b,
        update: () => Promise.resolve({ data: null, error: null }),
        then(resolve: (v: unknown) => unknown) { return resolve({ data: [], error: null }); },
      };
      return b;
    },
  },
}));

import SearchNav from "@/components/SearchNav";

// --- Harnais ----------------------------------------------------------------

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  appels.length = 0;
  scenario = "resultats";
  cheminCourant = "/";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      appels.push(String(url));
      if (scenario === "erreur") throw new TypeError("Failed to fetch");
      return {
        json: async () => (scenario === "vide" ? RECHERCHE_VIDE : RECHERCHE_PLEINE),
      } as unknown as Response;
    }),
  );
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  conteneur.remove();
  vi.unstubAllGlobals();
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function monter(chemin = "/") {
  cheminCourant = chemin;
  await act(async () => { root.render(createElement(SearchNav)); });
}

/** Le bouton loupe mobile, repéré par son `aria-controls`. */
const boutonLoupe = () =>
  conteneur.querySelector<HTMLButtonElement>('button[aria-controls="recherche-mobile"]');

/** Le volet mobile. */
const volet = () => conteneur.querySelector("#recherche-mobile");

/** Le conteneur du champ inline desktop (`hidden lg:block`). */
const champDesktop = () => conteneur.querySelector<HTMLDivElement>(".lg\\:block") ?? null;

/** Le champ de recherche DU VOLET MOBILE (le champ desktop peut coexister). */
const champ = () => volet()?.querySelector<HTMLInputElement>('input[placeholder="Rechercher..."]') ?? null;

const lienResultat = () => volet()?.querySelector<HTMLAnchorElement>('a[href="/bureau/clients"]') ?? null;

async function cliquer(el: Element) {
  await act(async () => {
    // `cancelable: true` : les `<a>` des résultats doivent pouvoir annuler leur
    // navigation par défaut (non implémentée par jsdom).
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function taper(texte: string) {
  const input = champ()!;
  await act(async () => {
    // React 19 écoute `input` sur le nœud RACINE (délégation) : il faut un
    // événement qui bulle ET le setter natif pour que React voie le change.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, texte);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    // La recherche part dans `fetch` : on vide la file de micro-tâches dans le
    // même `act` pour que les résultats soient rendus au retour de `taper`.
    await Promise.resolve();
  });
}

// ============================================================================

describe("SearchNav — recherche unique et cohérente", () => {
  // ── Un seul point de bascule : `lg` ───────────────────────────────────────

  it("prépare les deux présentations sur LE MÊME seuil (`lg`)", async () => {
    // C'est la correction de fond du doublon : les deux présentations doivent
    // basculer à la même largeur. Un champ `md:block` face à un bouton
    // `lg:hidden` laissait 768–1024 px où les deux étaient visibles.
    await monter();

    const inline = champDesktop();
    expect(inline, "conteneur du champ inline introuvable").not.toBeNull();
    expect(inline!.className, "le champ inline doit basculer à `lg`").toContain("lg:block");
    expect(inline!.className, "le champ inline ne doit plus utiliser `md`").not.toContain("md:block");
    expect(inline!.className).toContain("hidden");

    const loupe = boutonLoupe()!;
    expect(loupe.className, "le bouton loupe doit disparaître à `lg`").toContain("lg:hidden");
    expect(loupe.className, "le bouton loupe ne doit plus utiliser `md`").not.toContain("md:block");
  });

  it("desktop : le champ inline est présent, jamais doublé par le mobile", async () => {
    await monter();

    // Le champ desktop existe dans le DOM (masqué par `hidden` sous `lg`).
    expect(champDesktop(), "champ desktop absent").not.toBeNull();

    // Le panneau mobile n'est pas monté tant qu'on n'a pas cliqué la loupe.
    expect(volet(), "le volet mobile ne doit pas être monté au repos").toBeNull();
  });

  it("le bouton loupe et son volet partagent la classe `lg:hidden` (aucun doublon)", async () => {
    await monter();
    await cliquer(boutonLoupe()!);

    // Les deux disparaissent à la même largeur → jamais visibles en même temps
    // que le champ inline, y compris juste au-dessus de 1024 px.
    expect(boutonLoupe()!.className).toContain("lg:hidden");
    expect(volet()!.className).toContain("lg:hidden");
  });

  // ── Le volet est large et indépendant de son bouton ───────────────────────

  it("le volet est ancré au VIEWPORT, pas à la rangée étroite des boutons", async () => {
    await monter();
    await cliquer(boutonLoupe()!);

    const classes = volet()!.className;
    // `fixed` + `left-4 right-4` : la largeur vient du viewport. En `absolute`
    // dans la rangée des boutons (~90 px), il héritait de cette largeur.
    expect(classes, "le volet doit être `fixed`").toContain("fixed");
    expect(classes).toContain("left-4");
    expect(classes).toContain("right-4");
    expect(classes, "le volet ne doit plus hériter de la largeur du bouton").not.toContain("absolute");
  });

  it("le volet est borné au viewport : aucun débordement horizontal possible", async () => {
    await monter();
    await cliquer(boutonLoupe()!);

    // `max-w-[calc(100vw-2rem)]` garantit qu'il ne dépasse jamais la fenêtre,
    // quelle que soit la largeur de l'écran ou de ses ancêtres.
    expect(volet()!.className).toContain("max-w-[calc(100vw-2rem)]");
    expect(volet()!.className).toContain("mx-auto");
  });

  it("le volet se pose JUSTE sous le header (pas de chevauchement, pas de trou)", async () => {
    // `top-[142px]` = `py-1.5` (12 px) + cadre logo `h-[130px]`. Une dérive de
    // l'un sans l'autre ferait chevaucher le logo ou laisserait un trou.
    await monter();
    await cliquer(boutonLoupe()!);
    expect(volet()!.className).toContain("top-[142px]");
  });

  it("le panneau de résultats desktop est lui aussi borné au viewport", async () => {
    await monter();
    // Le panneau n'existe que lorsque la recherche desktop est ouverte : on
    // simule une saisie dans le champ inline (`hidden lg:block`, donc présent
    // dans le DOM même à petite largeur).
    const champInline = champDesktop()!.querySelector("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(champInline, "Dupont");
      champInline.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });

    const panneau = champDesktop()!.querySelector("div.absolute");
    expect(panneau, "panneau desktop introuvable").not.toBeNull();
    expect(panneau!.className).toContain("max-w-[calc(100vw-2rem)]");
  });

  // ── Accessibilité et cible tactile du bouton ──────────────────────────────

  it("expose un bouton loupe accessible, avec une cible de 44 px", async () => {
    await monter();
    const loupe = boutonLoupe();
    expect(loupe, "bouton loupe introuvable").not.toBeNull();
    expect(loupe!.getAttribute("aria-label")).toBe("Rechercher");
    expect(loupe!.className).toContain("min-h-11");
    expect(loupe!.className).toContain("min-w-11");
    expect(loupe!.getAttribute("aria-controls")).toBe("recherche-mobile");
    expect(loupe!.getAttribute("aria-expanded")).toBe("false");
  });

  it("ouvre le volet au clic et le signale aux lecteurs d'écran", async () => {
    await monter();
    expect(volet(), "volet déjà ouvert").toBeNull();

    await cliquer(boutonLoupe()!);

    expect(volet(), "le volet ne s'est pas ouvert").not.toBeNull();
    expect(boutonLoupe()!.getAttribute("aria-expanded")).toBe("true");
    expect(champ()!.placeholder).toBe("Rechercher...");
  });

  // ── La recherche frappe la bonne route, avec la valeur la plus récente ────

  it("la recherche mobile frappe la MÊME route que le desktop", async () => {
    await monter();
    await cliquer(boutonLoupe()!);
    await taper("Dupont");

    expect(appels.length).toBeGreaterThan(0);
    expect(appels[0]).toContain("/api/search?q=Dupont");
    expect(appels[0]).toContain("limit=8");
  });

  it("utilise la valeur FRAÎCHE dès la première frappe (pas de requête périmée)", async () => {
    // `setQuery` est asynchrone : lire `query` au moment de l'appel enverrait
    // l'ancienne valeur, voire une requête vide. La valeur est passée en
    // paramètre, donc la toute première frappe interroge déjà le bon texte.
    await monter();
    await cliquer(boutonLoupe()!);
    await taper("Dupont");

    expect(appels[0]).toContain("q=Dupont");
    expect(appels[0], "aucune requête ne doit partir avec une valeur vide").not.toContain("q=&");
  });

  it("n'interroge PAS le serveur sous 2 caractères (seuil inchangé)", async () => {
    await monter();
    await cliquer(boutonLoupe()!);
    await taper("D");

    expect(appels.length).toBe(0);
  });

  // ── Les trois états de réponse ────────────────────────────────────────────

  it("n'affiche AUCUN message tant qu'aucune recherche n'a abouti", async () => {
    await monter();
    await cliquer(boutonLoupe()!);

    // Volet ouvert, aucune saisie : ni « Recherche... », ni « Aucun résultat ».
    expect(volet()!.textContent).not.toContain("Aucun résultat");
    expect(volet()!.textContent).not.toContain("Recherche...");
  });

  it("affiche les résultats quand la recherche en renvoie", async () => {
    await monter();
    await cliquer(boutonLoupe()!);
    await taper("Dupont");

    const lien = lienResultat();
    expect(lien, "résultat client introuvable").not.toBeNull();
    expect(volet()!.textContent).toContain("Dupont");
    expect(volet()!.textContent).not.toContain("Aucun résultat");
  });

  it("affiche « Aucun résultat » seulement quand la recherche a RÉPONDU vide", async () => {
    scenario = "vide";
    await monter();
    await cliquer(boutonLoupe()!);
    await taper("zzzz");

    // Une requête a bien été envoyée, et elle a répondu sans résultat.
    expect(appels.length).toBeGreaterThan(0);
    expect(volet()!.textContent).toContain("Aucun résultat");
  });

  it("ne masque JAMAIS une erreur réseau derrière « Aucun résultat »", async () => {
    scenario = "erreur";
    await monter();
    await cliquer(boutonLoupe()!);
    await taper("Dupont");

    const texte = volet()!.textContent ?? "";
    expect(texte, "l'erreur réseau doit être annoncée").toContain("Recherche indisponible");
    expect(texte, "une panne ne doit pas être présentée comme une absence de résultat").not.toContain("Aucun résultat");
  });

  // ── Fermetures ────────────────────────────────────────────────────────────

  it("se referme au choix d'un résultat", async () => {
    await monter();
    await cliquer(boutonLoupe()!);
    await taper("Dupont");

    await cliquer(lienResultat()!);
    expect(volet(), "le volet devrait se refermer après un choix").toBeNull();
  });

  it("se referme avec la touche Échap", async () => {
    await monter();
    await cliquer(boutonLoupe()!);
    expect(volet()).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(volet(), "Échap devrait refermer le volet").toBeNull();
  });

  it("se referme au clic en dehors du volet", async () => {
    await monter();
    await cliquer(boutonLoupe()!);
    expect(volet()).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(volet(), "un clic extérieur devrait refermer le volet").toBeNull();
  });

  it("la loupe referme le volet qu'elle a ouvert", async () => {
    await monter();
    await cliquer(boutonLoupe()!);
    expect(volet()).not.toBeNull();

    await cliquer(boutonLoupe()!);
    expect(volet(), "un second clic sur la loupe devrait refermer le volet").toBeNull();
  });

  // ── Destinations et pages client ──────────────────────────────────────────

  it("conserve la destination existante des résultats", async () => {
    await monter();
    await cliquer(boutonLoupe()!);
    await taper("Dupont");

    // Aucune destination inventée : le client pointe toujours `/bureau/clients`.
    expect(lienResultat()!.getAttribute("href")).toBe("/bureau/clients");
  });

  it("ne rend NI loupe NI volet sur les pages client", async () => {
    await monter("/espace-client/CODE-ACCES");
    expect(boutonLoupe()).toBeNull();
    expect(volet()).toBeNull();
    expect(conteneur.innerHTML).toBe("");
  });
});
