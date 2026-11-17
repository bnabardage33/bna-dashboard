// Accueil : composition et responsive (refonte mobile d'abord)
// ============================================================================
//
// Ces tests verrouillent le RENDU de l'accueil. Ils ne touchent ni l'ordre des
// blocs (accueil-ordre-et-blocs.test.tsx), ni la source meteo, ni les seuils.
//
// LA REGLE : la composition est mobile d'abord et n'invente aucune donnee.
// Concretement :
//
//   1. CONTENEURS BORNE ET CENTRE. La racine publique et l'Accueil Chantier
//      reprennent `mx-auto max-w-7xl` et `px-4`.
//
//   2. GRILLES. Une seule colonne sur mobile, deux a partir de `md`, et une
//      grille de 12 colonnes a partir de `xl` :
//        - notes     -> `grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3`
//        - meteo     -> `grid gap-3 sm:grid-cols-2`               (/terrain/meteo)
//        - chantiers -> `grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3`
//
//   3. AUCUN CENTRAGE ARTIFICIEL. Une carte seule reste dans la colonne de la
//      grille, a gauche. Une rangee de cartes en `flex flex-wrap justify-center`
//      ferait sortir la carte de sa colonne : on l'interdit explicitement.
//      Depuis la refonte finale, le SEUL endroit qui centre est la rangee des
//      trois acces rapides de l'en-tete (des liens de navigation, pas des
//      cartes) ; aucune rangee de cartes n'est centree.
//
//   4. ZONES TACTILES. Les acces rapides portent `min-h-10` (40 px) et le
//      bouton vocal `min-h-11` (44 px) : utilisables au doigt sur chantier, sans
//      dependre du survol.
//
// Comme les autres tests de composition du depot, ils lisent les SOURCES :
// ces proprietes sont des classes CSS, et aucune assertion de rendu ne les
// verrait dans un arbre rendu sous Vitest. Aucun appel reseau, aucune base.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

/**
 * Code SANS les commentaires.
 *
 * Indispensable : ce fichier parle des grilles d'origine ET de la rangee
 * centree qui a ete rejetee, donc les deux chaines sont(forcement) presentes
 * dans la documentation des sources. Chercher une de ces chaines dans les
 * commentaires testerait sa propre documentation — meme artefact que le helper
 * `CODE()` de accueil-ordre-et-blocs.test.tsx.
 */
const CODE = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const PAGE = CODE(lire("app/page.tsx"));
const PAGE_CHANTIER = CODE(lire("app/terrain/accueil/page.tsx"));
const CHARGEURS = CODE(lire("lib/accueil/chargerDonnees.ts"));
const ACCUEIL_PROFESSIONNEL = CODE(lire("components/AccueilProfessionnel.tsx"));
const DASHBOARD = CODE(lire("components/DashboardAccueil.tsx"));
const METEO = CODE(lire("components/ChantiersMeteoCards.tsx"));

/** Un `<main>` public à la racine et un dans l'Accueil Chantier authentifié. */
const MAINS = [PAGE, PAGE_CHANTIER].flatMap((source) =>
  [...source.matchAll(/<main className="([^"]*)"/g)].map((m) => m[1]),
);

describe("Accueil — le contenu est borne et centre", () => {
  it("la racine publique redirige et l'Accueil Chantier porte son contenu", () => {
    expect(PAGE).toMatch(/redirect\(['"]\/login['"]\)/);
    expect(PAGE_CHANTIER).toMatch(/<AccueilProfessionnel/);
  });

  it("les deux conteneurs portent un plafond de largeur ET un centrage", () => {
    // `max-w-` sans `mx-auto` donnerait un bloc large colle a gauche, et
    // `mx-auto` sans plafond ne bornerait rien : les deux sont necessaires.
    for (const classes of MAINS) {
      expect(classes, `conteneur non borne : "${classes}"`).toMatch(/max-w-/);
      expect(classes, `conteneur non centre : "${classes}"`).toMatch(/\bmx-auto\b/);
    }
  });

  it("le plafond reprend celui de l'ancien cockpit de reference", () => {
    // `max-w-7xl` : la valeur exacte du cockpit Bureau d'origine, mesuree a
    // HEAD. Un `max-w-3xl` passerait le test precedent mais rapetisserait
    // l'ecran par rapport a la version de reference.
    for (const classes of MAINS) {
      expect(classes).toMatch(/\bmax-w-7xl\b/);
    }
  });

  it("le remplissage lateral d'origine est conserve", () => {
    // Borner ne doit pas resserrer le texte : `px-4` reste, comme sur tous les
    // autres ecrans.
    for (const classes of MAINS) {
      expect(classes).toContain("px-4");
    }
  });

  it("la racine publique redirige directement vers la météo ou le login", () => {
    expect(PAGE).toMatch(/redirect\(['"]\/terrain\/meteo['"]\)/);
    expect(PAGE).toMatch(/redirect\(['"]\/login['"]\)/);
  });

  it("aucun ecran de l'accueil ne reste en pleine largeur", () => {
    // L'absence du conteneur nu d'origine, qui est le defaut exact.
    expect(PAGE).not.toMatch(/<main className="relative z-10 px-4/);
  });
});

describe("Accueil — les grilles sont celles de la refonte", () => {
  /** Les rangees de cartes, avec la grille de reference de chacune. */
  const RANGEES = [
    {
      nom: "cartes meteo",
      source: METEO,
      grille: '<div className="grid gap-3 sm:grid-cols-2">',
    },
    {
      nom: "cockpit quotidien",
      source: DASHBOARD,
      grille: 'className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2"',
    },
  ];

  it("les rangees utilisent leurs grilles de reference", () => {
    for (const { nom, source, grille } of RANGEES) {
      expect(source, `${nom} : grille absente`).toContain(grille);
    }
  });

  it("aucune rangee de cartes n'est centree automatiquement", () => {
    for (const { nom, source } of RANGEES) {
      expect(source, `${nom} : rangee centree automatiquement`).not.toContain(
        "flex flex-wrap justify-center",
      );
      const flexibles = [...source.matchAll(/className="([^"]*flex-wrap[^"]*)"/g)].map(
        (m) => m[1],
      );
      for (const classes of flexibles) {
        expect(classes, `${nom} : rangee centree automatiquement`).not.toMatch(
          /justify-center/,
        );
      }
    }
  });

  it("aucune carte ne porte de largeur propre", () => {
    const cartes = [
      ...DASHBOARD.matchAll(/<Link\s+href="\/terrain\/notes"\s+className="([^"]*)"/g),
    ].map((m) => m[1] ?? "");
    expect(cartes.length).toBeGreaterThanOrEqual(1);
    for (const classes of cartes) {
      expect(classes, `carte a largeur propre : "${classes}"`).not.toMatch(
        /\bw-full\b|w-\[calc|max-w-/,
      );
    }
    const carteMeteo = METEO.match(/<Link\s+key=\{ch\.id\}[\s\S]*?className=\{`([^`]*)`\}/);
    expect(carteMeteo).not.toBeNull();
    expect(carteMeteo![1]).not.toMatch(/\bw-full\b|w-\[calc|max-w-/);
  });

  it("la carte meteo garde son habillage et son impact chantier", () => {
    expect(METEO).toMatch(/className=\{`rounded-xl border p-3/);
    expect(METEO).toContain("evaluerPoseChantier");
    expect(METEO).toContain("COULEURS[ch.niveau]");
  });
});

describe("Accueil — hierarchie visuelle et comportement mobile", () => {
  it("la page s'ouvre sur un en-tete blanc avec `h1` et sous-titre", () => {
    expect(ACCUEIL_PROFESSIONNEL).toMatch(/<h1[^>]*>[\s\S]*?\{titre\}[\s\S]*?<\/h1>/);
    expect(DASHBOARD).toMatch(/<h2[^>]*>[\s\S]*?Actions rapides du jour[\s\S]*?<\/h2>/);
    expect(DASHBOARD).toMatch(/<header className="[^"]*"/);
    expect(ACCUEIL_PROFESSIONNEL).not.toContain("BNA Bardage");
  });

  it("les acces rapides de l'en-tete pointent vers /terrain et /terrain/meteo", () => {
    const header = DASHBOARD.slice(
      DASHBOARD.indexOf("<header"),
      DASHBOARD.indexOf("</header>"),
    );
    expect(header).toContain('href="/terrain"');
    expect(header).toContain('href="/terrain/meteo"');
    expect(header).toContain("min-h-10");
  });

  it("les liens et pictogrammes d'en-tete ne se font pas ecraser", () => {
    expect(DASHBOARD).toMatch(/className="flex shrink-0 items-center/);
    expect(DASHBOARD).toMatch(/h-5 w-5 shrink-0/);
  });

  it("aucune carte n'est forcee en une largeur fixe en pixels", () => {
    for (const { nom, source } of [
      { nom: "accueil", source: DASHBOARD },
      { nom: "meteo", source: METEO },
    ]) {
      expect(source, `${nom} : largeur fixe en px`).not.toMatch(/\bw-\[\d+px\]/);
    }
  });

  it("l'impact meteo precede le cockpit quotidien dans le DOM", () => {
    expect(DASHBOARD.indexOf("Impact météo sur les chantiers actifs")).toBeLessThan(
      DASHBOARD.indexOf("Chantiers à préparer"),
    );
  });

  it("la dictee vocale reste dans l'en-tete, avec sa bulle dans le flux", () => {
    // Le bouton vit dans l'en-tete (a droite du titre), pas dans un grand bloc.
    const entete = DASHBOARD.slice(
      DASHBOARD.indexOf("<header"),
      DASHBOARD.indexOf("</header>"),
    );
    expect(entete).toContain("BoutonMicroNote");
    expect(entete).toContain("handleTexteReformule");
    // La bulle est un `role="status"` : region annoncee, dans le flux.
    expect(entete).toContain('role="status"');
    // Elle ne doit ni recouvrir la meteo (positionnement absolu/fixe) ni
    // dependre du survol.
    const bulle = DASHBOARD.slice(
      DASHBOARD.indexOf('role="status"'),
      DASHBOARD.indexOf("</div>", DASHBOARD.indexOf('role="status"')),
    );
    expect(bulle).not.toMatch(/\b(?:absolute|fixed|sticky)\b/);
  });

  it("les acces et le bouton vocal offrent une cible tactile suffisante", () => {
    const header = DASHBOARD.slice(
      DASHBOARD.indexOf("<header"),
      DASHBOARD.indexOf("</header>"),
    );
    expect((header.match(/min-h-10/g) ?? []).length).toBeGreaterThanOrEqual(2);

    const bouton = lire("components/BoutonMicroNote.tsx");
    expect(bouton).toContain("min-h-11");
    expect(bouton).toContain("Dicter une note");
  });
});

describe("Accueil — le correctif de rendu ne touche pas au fond", () => {
  it("la meteo reste montee par le serveur sur l'Accueil Chantier", () => {
    expect(PAGE_CHANTIER).toContain("blocMeteo={<ChantiersMeteoCards />}");
    const meteo = DASHBOARD.slice(DASHBOARD.indexOf("blocMeteo"));
    expect(meteo).toContain("Impact");
  });

  it("les trois chargeurs de donnees restent en place", () => {
    expect(PAGE_CHANTIER).toContain("chargerDonneesAccueil");
    expect(CHARGEURS).toContain("chargerNotes");
    expect(CHARGEURS).toContain("chargerChantiersAPreparer");
    expect(CHARGEURS).toContain("chargerNotifications");
  });

  it("l'assistance vocale garde son handler et son composant", () => {
    expect(DASHBOARD).toContain("BoutonMicroNote");
    expect(DASHBOARD).toContain("handleTexteReformule");
  });
});

/**
 * Confort interne des cartes de contenu — sections « Dernières Notes » et
 * « Alertes ».
 *
 * Les deux sections alignent titre, texte et date sur une carte. Or `Surface`
 * ne DEFINIT que l'habillage (bordure + fond + arrondi) : aucun padding. La
 * carte de note, écrite en classes littérales, en porte un (`p-4`) ; la carte
 * d'alerte, elle, s'en dispensait — d'où un titre, un message et une date
 * collés au bord gauche de la carte. Le défaut est visible sur mobile, où la
 * carte occupe toute la largeur et que le vide se lit d'un coup.
 *
 * Le test compare les DEUX padding entre eux plutôt que d'écrire `p-4` en
 * dur : l'exigence n'est pas « quatre pixels de moins », c'est « le même
 * confort que les Notes ». Une future retouche des Notes se répercutera donc
 * ici, au lieu de laisser les deux sections diverger en silence.
 */
describe("Accueil — confort interne des cartes Notes et Alertes", () => {
  /** Les classes de padding d'une carte : `p-*`, `px-*`, `py-*`. */
  const tokensPadding = (classes: string) =>
    classes.match(/\b(?:p|px|py)-[0-9.]+/g) ?? [];

  const carteNotes =
    DASHBOARD.match(/key=\{n\.id\}\s+href="\/terrain\/notes"\s+className="([^"]*)"/);
  const carteAlertes =
    DASHBOARD.match(/<li\s+key=\{n\.id\}\s+className="([^"]*)"/);

  it("les deux cartes existent bien dans la source", () => {
    expect(carteNotes, "carte de note introuvable").not.toBeNull();
    expect(carteAlertes, "carte d'alerte introuvable").not.toBeNull();
  });

  it("les deux cartes portent le MEME padding", () => {
    expect(tokensPadding(carteAlertes![1] ?? "")).toEqual(tokensPadding(carteNotes![1]));
  });

  it("le padding couvre les DEUX axes, pas seulement l'horizontal", () => {
    const padding = tokensPadding(carteAlertes![1] ?? "");
    expect(padding.length).toBeGreaterThan(0);
    for (const token of padding) {
      expect(token, `padding ${token} : ne pose qu'un seul axe`).toMatch(/^p-/);
    }
  });

  it("la carte d'alerte garde un arrondi cohérent avec la carte de note", () => {
    expect((carteAlertes![1] ?? "").match(/\brounded-/g) ?? []).toEqual(
      (carteNotes![1] ?? "").match(/\brounded-/g) ?? [],
    );
  });

  it("la carte d'alerte ne prend toujours pas de largeur propre", () => {
    // Repris de la garde générale « aucune carte ne porte de largeur propre »,
    // qui couvre desormais reellement cette carte (cf. regex reparee plus haut).
    expect(carteAlertes![1] ?? "").not.toMatch(/\bw-full\b|w-\[calc|max-w-/);
  });
});
