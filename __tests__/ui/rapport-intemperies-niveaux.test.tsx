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
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// ─── Mise en page compacte : tenir sur UNE page A4 portrait ──────────────────
//
// Le rapport est un document HTML imprimé par le navigateur (`window.print`),
// pas un PDF fabriqué côté serveur : le format et la pagination se pilotent
// donc en CSS. La garantie A4 provient de la PAGE CSS NOMMÉE
// `@page rapport-intemperies` (app/globals.css), appliquée uniquement à ce
// document via la classe `rapport-intemperies`. Ces tests verrouillent :
//   1. l'absence de perte de contenu, même sous textes longs ;
//   2. le crochet d'impression porté par le document ;
//   3. la déclaration CSS A4 et sa liaison à ce seul document ;
//   4. le retour aux valeurs compactes (anti-régression « deux pages »).
//
// NB : jsdom ne calcule pas de mise en page (pas d'`offsetHeight`), le nombre
// de pages ne peut donc pas être mesuré ici — il se vérifie à l'impression
// (voir la procédure manuelle). Ces tests garantissent en revanche que rien
// n'est supprimé et que le format A4 reste déclaré.

const CSS_GLOBAL = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");
const SOURCE_PDF = readFileSync(
  join(process.cwd(), "components/RapportIntemperiesPDF.tsx"),
  "utf-8",
);

const RAPPORT_LONG: RapportIntemperiesData = {
  ...rapport("orange", "orange"),
  jour_arrete: true,
  motif:
    "Rafales supérieures à 60 km/h relevées en continu sur le pignon exposé ouest, " +
    "empêchant toute pose de bardage en sécurité ; la nacelle ne peut être stabilisée " +
    "et les plaques restent soumises à une prise au vent excessive.",
  risque_technique_motif:
    "Vent mesuré (72 km/h) supérieur au seuil de pose du DTU 41.2 pour le bac acier ; " +
    "risque de déformation et de dévissage des fixations.",
  mesures_prises:
    "Arrêt immédiat de la zone pignon ouest. Mise en sécurité de la nacelle et des " +
    "plaques. Bâchage provisoire des zones ouvertes. Information du client. Report de " +
    "la livraison. Réouverture conditionnée à un vent inférieur à 40 km/h.",
  heures: Array.from({ length: 8 }, (_, i) => ({
    heure: `${String(8 + i).padStart(2, "0")}:00`,
    temp: 12 + i,
    vent: 30 + i,
    rafales: 55 + i,
    pluie: i * 0.5,
  })),
};

describe("RapportIntemperiesPDF — mise en page compacte (une page A4)", () => {
  it("conserve TOUT le contenu métier, même sous textes longs (aucune troncature)", async () => {
    const conteneur = await rendre(
      <RapportIntemperiesPDF
        rapport={RAPPORT_LONG}
        entreprise={ENTREPRISE}
        chantier={CHANTIER}
      />,
    );
    const texte = conteneur.textContent ?? "";

    // Les cinq sections numérotées restent présentes.
    for (const titre of [
      "1. Identification du chantier",
      "2. Description de l'impact sur les travaux",
      "3. Mesures conservatoires prises immédiatement",
      "4. Conséquences sur le planning",
      "5. Pièces jointes",
    ]) {
      expect(texte).toContain(titre);
    }

    // Les deux niveaux (vigilance officielle / risque technique) restent distincts.
    expect(texte).toContain("Vigilance orange");
    expect(texte).toContain("Dépassement important mesuré");

    // Textes longs : intégralement restitués (aucune troncature).
    expect(texte).toContain(RAPPORT_LONG.motif);
    expect(texte).toContain(RAPPORT_LONG.risque_technique_motif);
    expect(texte).toContain(RAPPORT_LONG.mesures_prises);

    // Données météo de contrôle et champs de planning conservés.
    expect(texte).toContain("Vent maximum (rafales)");
    expect(texte).toContain("Précipitations cumulées");
    expect(texte).toContain("Heures perdues");
    expect(texte).toContain("Report de livraison estimé");

    // Les DEUX zones de signature restent présentes.
    expect(texte).toContain("L'entreprise");
    expect(texte).toContain("Chef de chantier");

    // La pièce jointe (relevé horaire) reste accessible dans le document.
    expect(texte).toContain("Annexe — Relevé horaire complet (pièce jointe)");
  });

  it("le document porte le crochet d'impression A4 `rapport-intemperies`", async () => {
    const conteneur = await rendre(
      <RapportIntemperiesPDF
        rapport={RAPPORT_LONG}
        entreprise={ENTREPRISE}
        chantier={CHANTIER}
      />,
    );
    const racine = conteneur.querySelector("#document-pdf-content");
    expect(racine).not.toBeNull();
    expect(racine?.classList.contains("rapport-intemperies")).toBe(true);
  });

  it("la feuille de style déclare la page A4 nommée et la lie à ce document", () => {
    expect(CSS_GLOBAL).toMatch(/@page\s+rapport-intemperies\s*\{[^}]*size:\s*A4 portrait/);
    expect(CSS_GLOBAL).toMatch(
      /#document-pdf-content\.rapport-intemperies\s*\{[^}]*page:\s*rapport-intemperies/,
    );
    // Filet de sécurité : le format A4 est aussi forcé globalement à l'impression.
    expect(CSS_GLOBAL).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait/);
  });

  it("conserve les valeurs compactes (anti-régression « deux pages »)", () => {
    for (const obsolete of [
      "min-h-[50px]",
      "h-20 sm:h-24 max-h-24",
      "text-sm leading-relaxed",
    ]) {
      expect(SOURCE_PDF).not.toContain(obsolete);
    }
    expect(SOURCE_PDF).toContain("min-h-[32px]");
    expect(SOURCE_PDF).toContain("text-[13px] leading-snug");
  });
});
