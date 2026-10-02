// __tests__/ui/drawer-accordion.test.tsx
// O3-B9 — Drawer : les sous-onglets des catégories se referment
// ============================================================================
//
// POURQUOI CE TEST
//
// Le defaut constate sur mobile, avec « Études / Commercial » :
//
//     1er clic sur la flèche  -> les sous-onglets s'ouvrent  ✅
//     2e  clic sur la flèche  -> ils restent ouverts         ❌
//
// LA CAUSE, dans `components/Drawer.tsx`. L'affichage d'un groupe etait :
//
//     const ouvert = … && (groupesOuverts.has(item.label) || groupeActif);
//
// ou `groupeEstActif` est VRAI des que l'une des entrees du groupe correspond
// au chemin courant. Donc, sur la categorie courante — c'est-a-dire apres
// avoir clique un de ses sous-onglets, ou en arrivant par deep-link — le `||`
// imposait l'ouverture : le clic ne pouvait plus la lever. Le second clic
// modifiait bien l'etat, mais l'affichage ne changeait pas.
//
// Le correctif ne peut donc pas etre « un cas particulier » : il est dans la
// ligne commune qui sert les SIX groupes a sous-onglets. Ce test les parcourt
// tous, pour qu'un correctif propre a « Études / Commercial » soit detecte.
//
// Ce qui est VERROUILLE, et rien de plus :
//   - cycle complet : fermé -> clic -> ouvert -> clic -> fermé -> clic -> ouvert ;
//   - pour chaque categorie, pas seulement Études / Commercial ;
//   - l'ouverture automatique sur deep-link, qui marchait et doit rester.
//
// PAS de `@testing-library/react` : la version installée (9.5.0) utilise
// `ReactDOM.render`, supprime en React 19. Meme harnais que
// `__tests__/ui/searchnav-hooks.test.tsx` : `createRoot` + `act`.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

// --- Mocks ------------------------------------------------------------------

let cheminCourant = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => cheminCourant,
}));

// `next/link` exige le contexte App Router : on le remplace par une ancre.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

// Le Drawer n'utilise `supabase` que pour la deconnexion.
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signOut: () => Promise.resolve({ error: null }) } },
}));

import Drawer from "@/components/Drawer";

// --- Harnais ----------------------------------------------------------------

let naviguer: ((chemin: string) => void) | null = null;

/** Permet de changer de chemin sans remonter le composant. */
function Harnais({ initial }: { initial: string }) {
  const [chemin, setChemin] = useState(initial);
  naviguer = setChemin;
  cheminCourant = chemin;
  return <Drawer />;
}

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  cheminCourant = "/";
  naviguer = null;
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  conteneur.remove();
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

async function monter(chemin = "/") {
  await act(async () => {
    root.render(<Harnais initial={chemin} />);
  });
  // Ouvrir le menu hamburger : c'est le contexte réel du défaut.
  await cliquer(boutonHamburger());
}

async function allerVers(chemin: string) {
  await act(async () => {
    naviguer!(chemin);
  });
}

async function cliquer(el: Element | null) {
  if (!el) throw new Error("element absent : rien a cliquer");
  await act(async () => {
    (el as HTMLElement).click();
  });
}

// --- Selecteurs -------------------------------------------------------------

const boutonHamburger = () =>
  conteneur.querySelector('button[aria-label="Ouvrir le menu"]');

const boutonGroupe = (label: string) =>
  [...conteneur.querySelectorAll("nav button")].find(
    (b) => b.textContent?.trim() === label,
  ) ?? null;

/** L'etat affiche du groupe, tel que l'utilisateur peut le lire. */
function estOuvert(label: string): boolean {
  return boutonGroupe(label)?.getAttribute("aria-expanded") === "true";
}

/** La liste de second niveau est-elle reellement rendue ? */
function sousOngletsPresents(enfant: string): boolean {
  return [...conteneur.querySelectorAll("nav ul a")].some(
    (a) => a.textContent?.trim() === enfant,
  );
}

/** `aria-controls` doit viser un element present exactement quand c'est ouvert. */
function ariaControlsCohérent(label: string): boolean {
  const b = boutonGroupe(label);
  const id = b?.getAttribute("aria-controls");
  if (!id) return false;
  // `getElementById` plutot qu'un selecteur : l'identifiant est construit a
  // partir du libelle (accents remplaces), et `CSS.escape` n'existe pas dans
  // l'environnement de test.
  return (document.getElementById(id) !== null) === estOuvert(label);
}

// --- Donnees ----------------------------------------------------------------

/** Les SIX categories a sous-onglets, avec un chemin ou chacune est active. */
const GROUPES = [
  { label: "Études / Commercial", enfant: "Clients", chemin: "/bureau/clients" },
  { label: "Chantiers", enfant: "Liste des chantiers", chemin: "/terrain/chantier" },
  { label: "Finance & Pilotage", enfant: "Tableau financier", chemin: "/finance" },
  { label: "Fournisseurs", enfant: "Fournisseurs & commandes", chemin: "/bureau/fournisseurs" },
  { label: "Boîte à outils", enfant: "Métré IA", chemin: "/terrain/metre-ia" },
  { label: "Espace client", enfant: "Portails clients", chemin: "/bureau/portails-clients" },
];

// ============================================================================

describe("Drawer — cycle d'ouverture/fermeture d'une catégorie", () => {
  for (const { label, enfant } of GROUPES) {
    it(`« ${label} » : fermé → ouvert → fermé → ouvert`, async () => {
      await monter("/");

      // 0. Fermée au départ.
      expect(estOuvert(label), `${label} : devrait être fermée au départ`).toBe(false);
      expect(sousOngletsPresents(enfant)).toBe(false);

      // 1. Clic → ouverte.
      await cliquer(boutonGroupe(label));
      expect(estOuvert(label), `${label} : 1er clic n'a pas ouvert`).toBe(true);
      expect(sousOngletsPresents(enfant), `${label} : sous-onglets absents`).toBe(true);

      // 2. Clic → refermée. C'est LE pas qui échouait.
      await cliquer(boutonGroupe(label));
      expect(estOuvert(label), `${label} : 2e clic n'a pas refermé`).toBe(false);
      expect(sousOngletsPresents(enfant), `${label} : sous-onglets encore là`).toBe(false);

      // 3. Clic → rouverte.
      await cliquer(boutonGroupe(label));
      expect(estOuvert(label), `${label} : 3e clic n'a pas rouvert`).toBe(true);
      expect(sousOngletsPresents(enfant), `${label} : sous-onglets absents`).toBe(true);
    });
  }
});

describe("Drawer — la catégorie courante se referme aussi", () => {
  for (const { label, enfant, chemin } of GROUPES) {
    it(`« ${label} », sur sa propre page : auto-ouverte puis refermable`, async () => {
      // Le cas EXACT du défaut : on est dans la catégorie, donc `groupeActif`
      // est vrai, donc l'ancien `||` interdisait la fermeture.
      await monter(chemin);

      // L'ouverture automatique est conservée : c'est le comportement qui
      // marche et qui était demandé.
      expect(estOuvert(label), `${label} : auto-ouverture perdue`).toBe(true);
      expect(sousOngletsPresents(enfant)).toBe(true);

      await cliquer(boutonGroupe(label));
      expect(estOuvert(label), `${label} : impossible à refermer`).toBe(false);
      expect(sousOngletsPresents(enfant), `${label} : sous-onglets encore là`).toBe(false);

      await cliquer(boutonGroupe(label));
      expect(estOuvert(label), `${label} : pas de réouverture`).toBe(true);
    });
  }
});

describe("Drawer — contrat d'accordéon", () => {
  it("toutes les catégories sont d'abord fermées", async () => {
    await monter("/");
    for (const { label } of GROUPES) {
      expect(estOuvert(label), `${label} : ouverte au départ`).toBe(false);
    }
  });

  it("`aria-controls` pointe sur la liste exactement quand le groupe est ouvert", async () => {
    // C'est ce qui rend l'accordéon lisible par un lecteur d'écran ; un
    // `aria-expanded` qui ment sur la présence de la liste est un défaut
    // d'accessibilité, pas seulement de rendu.
    await monter("/bureau/clients");
    for (const { label } of GROUPES) {
      await cliquer(boutonGroupe(label));
      expect(ariaControlsCohérent(label), `${label} : aria-controls incohérent`).toBe(true);
      await cliquer(boutonGroupe(label));
      expect(ariaControlsCohérent(label), `${label} : aria-controls incohérent`).toBe(true);
    }
  });

  it("ouvrir une catégorie n'emporte pas la précédente", async () => {
    // Le Drawer n'a jamais été un accordéon exclusif : chaque groupe garde son
    // propre état. On verrouille ce point pour qu'un correctif du toggle ne le
    // change pas par inadvertance.
    await monter("/");
    await cliquer(boutonGroupe("Études / Commercial"));
    await cliquer(boutonGroupe("Chantiers"));
    expect(estOuvert("Études / Commercial")).toBe(true);
    expect(estOuvert("Chantiers")).toBe(true);
    await cliquer(boutonGroupe("Études / Commercial"));
    expect(estOuvert("Études / Commercial")).toBe(false);
    expect(estOuvert("Chantiers")).toBe(true);
  });

  it("le choix de fermeture survit à une navigation", async () => {
    // Une fermeture demandée ne doit pas être annulée par un changement de
    // chemin rendu : c'est ce qui rendait le Drawer illisible sur mobile.
    await monter("/");
    await cliquer(boutonGroupe("Chantiers"));
    expect(estOuvert("Chantiers")).toBe(true);
    await cliquer(boutonGroupe("Chantiers"));
    expect(estOuvert("Chantiers")).toBe(false);
    await allerVers("/terrain/notes");
    expect(estOuvert("Boîte à outils")).toBe(true);
    await cliquer(boutonGroupe("Chantiers"));
    expect(estOuvert("Chantiers")).toBe(true);
  });

  it("le bouton hamburger principal et le design n'ont pas bougé", async () => {
    // Garde-fou : le correctif porte sur le toggle des sous-onglets, rien
    // d'autre. Le hamburger ouvre toujours, et ferme toujours.
    await act(async () => {
      root.render(<Harnais initial="/" />);
    });
    expect(estOuvert("Chantiers")).toBe(false);
    await cliquer(boutonHamburger());
    expect(conteneur.querySelector("aside")).not.toBeNull();
    const fermeture = conteneur.querySelector('button[aria-label="Fermer le menu"]');
    expect(fermeture).not.toBeNull();
    await cliquer(fermeture);
    expect(boutonHamburger()).not.toBeNull();
  });
});
