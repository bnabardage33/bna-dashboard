// __tests__/ui/rapport-intemperies-niveaux.test.tsx
//
// Non-régression de l'AFFICHAGE : la vigilance officielle Météo-France et le
// risque technique du chantier restent DEUX informations distinctes, y compris
// dans le document imprimé et dans la liste.
//
// Cas piège : vigilance officielle « indisponible » + risque technique orange.
// L'ancien code fondait les deux niveaux et affichait une couleur inventée.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";

// `next/image` n'a pas d'implémentation utile sous jsdom : on rend un <img>.
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src?: unknown;
    alt?: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === "string" ? src : ""}
      alt={alt ?? ""}
      className={className}
    />
  ),
}));

// La liste charge ses rapports via le client Supabase au montage.
const supabaseHoiste = vi.hoisted(() => {
  const etat = { rapports: [] as Record<string, unknown>[] };
  function chaine() {
    const c: Record<string, unknown> = {};
    const retour = () => c;
    for (const m of ["select", "eq", "order"]) c[m] = retour;
    c.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: etat.rapports, error: null });
    return c;
  }
  return { etat, chaine };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => supabaseHoiste.chaine() },
}));

import RapportIntemperiesPDF, {
  type RapportIntemperiesData,
  type Chantier,
} from "@/components/RapportIntemperiesPDF";
import RapportsIntemperiesListe from "@/components/RapportsIntemperiesListe";
import type { Entreprise } from "@/types/entreprise";

// ─── Harnais de rendu (React 19 : createRoot + act, sans RTL) ────────────────

const racines: Root[] = [];
const conteneurs: HTMLElement[] = [];
const ENV = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };

async function rendre(element: ReactElement): Promise<HTMLElement> {
  const conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  let racine!: Root;
  act(() => {
    racine = createRoot(conteneur);
  });
  await act(async () => {
    racine.render(element);
  });
  // Laisse le `useEffect` de chargement résoudre sa promesse.
  await act(async () => {
    await Promise.resolve();
  });
  racines.push(racine);
  conteneurs.push(conteneur);
  return conteneur;
}

beforeAll(() => {
  ENV.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete ENV.IS_REACT_ACT_ENVIRONMENT;
});
afterEach(() => {
  while (racines.length) {
    const r = racines.pop() as Root;
    act(() => r.unmount());
  }
  while (conteneurs.length) conteneurs.pop()?.remove();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ENTREPRISE: Entreprise = {
  raison_sociale: "BNA",
  siret: "12345678900011",
  telephone: "0556000000",
  email: "contact@bna.fr",
  adresse: "1 rue du Test",
  code_postal: "33000",
  ville: "Bordeaux",
  assurance: "AXA",
  iban: "FR7612345678901234567890123",
  bic: "AGRIFRPP",
  mentions_legales: null,
  logo_url: null,
};

const CHANTIER: Chantier = {
  nom: "Chantier Test",
  adresse: "1 rue du Test",
  code_postal: "33000",
  ville: "Bordeaux",
};

function rapport(
  vigilance_officielle: RapportIntemperiesData["vigilance_officielle"],
  risque_technique_niveau: string,
): RapportIntemperiesData {
  return {
    numero: "RI-2026-0001",
    cree_le: "2026-01-02T10:00:00Z",
    cree_par: "auto",
    vigilance_officielle,
    jour_arrete: false,
    a_valider: true,
    pluie_continue: false,
    motif: "Motif de test.",
    risque_technique_niveau,
    risque_technique_motif: "Température limite (36 °C ≥ seuil 35 °C)",
    temp_max: 36,
    rafales_max: 20,
    pluie_cumul: 0,
    materiau: "metal",
    acces: "echafaudage",
    departement: "33",
    mesures_prises: null,
    heures: [{ heure: "12:00", temp: 36, vent: 10, rafales: 20, pluie: 0 }],
  };
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

describe("RapportIntemperiesPDF — deux niveaux distincts", () => {
  it("affiche l'indisponibilité officielle ET le risque technique orange séparément", async () => {
    const conteneur = await rendre(
      <RapportIntemperiesPDF
        rapport={rapport("indisponible", "orange")}
        entreprise={ENTREPRISE}
        chantier={CHANTIER}
      />,
    );
    const texte = conteneur.textContent ?? "";

    expect(texte).toContain("Vigilance officielle indisponible");
    expect(texte).toContain("Risque technique chantier");
    expect(texte).toContain("Dépassement important mesuré");
  });

  it("une vigilance VERTE ne devient PAS orange à cause du risque technique", async () => {
    const conteneur = await rendre(
      <RapportIntemperiesPDF
        rapport={rapport("vert", "orange")}
        entreprise={ENTREPRISE}
        chantier={CHANTIER}
      />,
    );
    const texte = conteneur.textContent ?? "";

    expect(texte).toContain("Pas de vigilance"); // libellé de l'officielle verte
    expect(texte).toContain("Dépassement important mesuré"); // risque technique
    // Le libellé de la vigilance officielle ORANGE ne doit pas apparaître.
    expect(texte).not.toContain("Vigilance orange");
  });
});

// ─── Liste ───────────────────────────────────────────────────────────────────

describe("RapportsIntemperiesListe — deux niveaux distincts", () => {
  it("affiche la vigilance officielle et le risque technique côte à côte", async () => {
    supabaseHoiste.etat.rapports = [
      {
        id: "rap-1",
        numero: "RI-2026-0001",
        vigilance_officielle: "vert",
        risque_technique_niveau: "orange",
        jour_arrete: false,
        a_valider: false,
        ampleur_impact: null,
        motif: "Vigilance verte + dépassement mesuré",
        cree_le: "2026-01-02T08:00:00Z",
        cree_par: "auto",
      },
    ];

    const conteneur = await rendre(<RapportsIntemperiesListe chantierId="chantier-1" />);
    const texte = conteneur.textContent ?? "";

    expect(texte).toContain("Pas de vigilance");
    expect(texte).toContain("Dépassement important mesuré");
    expect(texte).not.toContain("Vigilance orange");
  });

  it("affiche « indisponible » quand la vigilance officielle n'a pas pu être lue", async () => {
    supabaseHoiste.etat.rapports = [
      {
        id: "rap-2",
        numero: "RI-2026-0002",
        vigilance_officielle: "indisponible",
        risque_technique_niveau: "orange",
        jour_arrete: false,
        a_valider: false,
        ampleur_impact: null,
        motif: "Vigilance officielle indisponible",
        cree_le: "2026-01-02T08:00:00Z",
        cree_par: "auto",
      },
    ];

    const conteneur = await rendre(<RapportsIntemperiesListe chantierId="chantier-1" />);
    const texte = conteneur.textContent ?? "";

    expect(texte).toContain("Vigilance officielle indisponible");
    expect(texte).toContain("Dépassement important mesuré");
  });
});
