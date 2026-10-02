// Accueil : composition et responsive —.calque de l'ancien cockpit
// ============================================================================
//
// Ces tests verrouillent le RENDU de l'accueil. Ils ne touchent ni l'ordre des
// blocs (accueil-ordre-et-blocs.test.tsx), ni la source meteo, ni les seuils.
//
// LA REGLE : la composition n'est pas réinventée, elle est RECOPIEE depuis la
// version déployée, mesurée à HEAD. Concrètement :
//
//   1. CONTENEUR BORNÉ ET CENTRÉ. `app/page.tsx` ne portait aucun plafond, et
//      c'était le seul écran de l'application dans ce cas. Reprise de
//      `mx-auto max-w-7xl`, celle du cockpit Bureau d'origine.
//
//   2. GRILLES D'ORIGINE. Chaque bloc reprend la grille EXACTE d'un écran
//      déployé :
//        - notes     -> `grid grid-cols-1 md:grid-cols-3 gap-4`   (accueil HEAD)
//        - meteo     -> `grid gap-3 sm:grid-cols-2`               (/terrain/meteo HEAD)
//        - chantiers -> `grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3`
//                                                               (cockpit Bureau HEAD)
//
//   3. AUCUN CENTRAGE ARTIFICIEL. Une carte seule reste dans la colonne de la
//      grille, à gauche, avec la largeur de cette colonne. Une tentative avait
//      été faite de passer les rangees en `flex flex-wrap justify-center` pour
//      « remplir » l'espace : c'est un changement de comportement, pas une mise
//      en page — la carte quittait sa colonne pour aller au centre de l'écran.
//      Ces tests interdisent explicitement ce glissement, parce qu'il est
//      tentant : il « corrige » vraiment le vide a droite, mais il produit
//      exactement l'ecart visuel que la reprise de reference exclut.
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
const DASHBOARD = CODE(lire("components/DashboardAccueil.tsx"));
const METEO = CODE(lire("components/ChantiersMeteoCards.tsx"));

/** Les deux `<main>` de `app/page.tsx` (visiteur anonyme puis cockpit). */
const MAINS = [...PAGE.matchAll(/<main className="([^"]*)"/g)].map((m) => m[1]);

describe("Accueil — le contenu est borne et centre", () => {
  it("`app/page.tsx` a bien deux conteneurs de page", () => {
    // Sans ce controle, `MAINS` vide ferait passer les suivants par absence
    // d'objet — le defaut classique d'un test de source.
    expect(MAINS).toHaveLength(2);
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

  it("la carte de connexion du visiteur anonyme est bornee elle aussi", () => {
    // Elle etait en pleine largeur du cockpit : sur un grand ecran, un cadre
    // de connexion de 1280 px. Meme defaut que les cartes, meme correctif.
    expect(PAGE).toMatch(/<Surface as="section" className="[^"]*max-w-[^"]*"/);
  });

  it("aucun ecran de l'accueil ne reste en pleine largeur", () => {
    // L'absence du conteneur nu d'origine, qui est le defaut exact.
    expect(PAGE).not.toMatch(/<main className="relative z-10 px-4/);
  });
});

describe("Accueil — les grilles sont celles de l'ancien cockpit", () => {
  /** Les trois rangees de cartes, avec la grille de reference de chacune. */
  const RANGEES = [
    {
      nom: "dernieres notes",
      source: DASHBOARD,
      grille: 'className="grid grid-cols-1 md:grid-cols-3 gap-4"',
    },
    {
      nom: "cartes meteo",
      source: METEO,
      grille: '<div className="grid gap-3 sm:grid-cols-2">',
    },
    {
      nom: "chantiers a preparer",
      source: DASHBOARD,
      grille: '<ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">',
    },
  ];

  it("trois rangees, chacune avec sa grille de reference", () => {
    for (const { nom, source, grille } of RANGEES) {
      expect(source, `${nom} : grille absente`).toContain(grille);
    }
  });

  it("aucune rangee de cartes n'est centree automatiquement", () => {
    // LE garde-fou central. `justify-center` sur une rangee de cartes fait
    // sortir une carte isolee de sa colonne pour la poser au centre de
    // l'ecran : ce n'est pas le rendu d'origine. On l'interdit explicitement.
    for (const { nom, source } of RANGEES) {
      // Le motif exact qui a ete rejete.
      expect(source, `${nom} : rangee centree automatiquement`).not.toContain(
        "flex flex-wrap justify-center",
      );
      // Et plus generalement : aucun conteneur `flex-wrap` n'est centre.
      // Attention, `justify-center` N'EST PAS interdit dans le fichier : la
      // boite d'enregistrement vocal en porte un, comme a HEAD. Ce qui est
      // interdit, c'est une rangée de CARTES centree.
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

  it("le seul `justify-center` de l'accueil est celui de la boite vocal", () => {
    // Pour que l'interdiction ci-dessus ne devienne pas une interdiction
    // generale laterale : on nomme l'exception legitime, mesuree a HEAD.
    const centres = [...DASHBOARD.matchAll(/className="([^"]*justify-center[^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(centres).toHaveLength(1);
    // La classe exacte de la boite d'enregistrement, telle qu'a HEAD.
    expect(centres[0]).toBe(
      "flex flex-col items-center justify-center p-6 bg-black/20 rounded-xl border border-white/5 relative z-10",
    );
  });

  it("aucune carte ne porte de largeur propre", () => {
    // Une carte a largeur propre sort de la grille : c'est le meme glissement.
    // La largeur d'une carte est celle de sa colonne, rien d'autre.
    const cartes = [
      ...DASHBOARD.matchAll(/<Link\s+href="\/terrain\/notes"\s+className="([^"]*)"/g),
      ...DASHBOARD.matchAll(/<Surface as="li" key=\{c\.id\}(?: className="([^"]*)")?>/g),
    ].map((m) => m[1] ?? "");
    expect(cartes.length).toBeGreaterThanOrEqual(2);
    for (const classes of cartes) {
      expect(classes, `carte a largeur propre : "${classes}"`).not.toMatch(
        /\bw-full\b|w-\[calc|max-w-/,
      );
    }
    // Et la carte meteo, dont la classe est un template.
    const carteMeteo = METEO.match(/<Link\s+key=\{ch\.id\}[\s\S]*?className=\{`([^`]*)`\}/);
    expect(carteMeteo).not.toBeNull();
    expect(carteMeteo![1]).not.toMatch(/\bw-full\b|w-\[calc|max-w-/);
  });

  it("l'etat vide des notes reprend la portee de la grille d'origine", () => {
    // `col-span-3` est la grille d'origine. Hors grille, il n'aurait aucun
    // sens — et c'est sa presence qui prouve que la grille est bien revenue.
    expect(DASHBOARD).toContain('className="col-span-3 border-dashed');
  });

  it("la carte meteo garde ses proportions d'origine", () => {
    // Le correctif porte sur le conteneur, pas sur la carte : contenu, releves
    // et impact chantier ne bougent pas.
    expect(METEO).toMatch(/className=\{`rounded-xl border p-4/);
    expect(METEO).toContain("evaluerAlerteChantier");
    expect(METEO).toContain("COULEURS[ch.niveau]");
  });
});

describe("Accueil — hierarchie visuelle et comportement mobile", () => {
  it("la page s'ouvre sur un `h1` et un sous-titre", () => {
    // Point de repere manquant : sans lui, l'oeil entrait directement dans une
    // carte de pleine largeur et n'avait aucune echelle de comparaison.
    expect(DASHBOARD).toMatch(/<h1[^>]*>[^<]+<\/h1>/);
    expect(DASHBOARD).toMatch(/<header>/);
  });

  it("les quatre en-tetes de section gardent l'alignement d'origine", () => {
    // `justify-between` : le libelle a gauche, le lien a droite, tous deux sur
    // la meme ligne et le meme axe que les sections voisines.
    const enTetes = [...DASHBOARD.matchAll(/className="(mb-4[^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(enTetes).toHaveLength(4);
    for (const classes of enTetes) {
      expect(classes).toMatch(/justify-between/);
    }
  });

  it("les liens et pictogrammes d'en-tete ne se font pas ecraser", () => {
    // `shrink-0` sur ce qui doit rester lisible quand l'espace manque.
    expect(DASHBOARD).toMatch(/className="flex shrink-0 items-center/);
    expect(DASHBOARD).toMatch(/h-5 w-5 shrink-0/);
  });

  it("aucune carte n'est forcee en une largeur fixe en pixels", () => {
    // Une largeur en px casse le responsive : elle ne s'adapterait ni au mobile
    // ni au cockpit centre.
    for (const { nom, source } of [
      { nom: "accueil", source: DASHBOARD },
      { nom: "meteo", source: METEO },
    ]) {
      expect(source, `${nom} : largeur fixe en px`).not.toMatch(/\bw-\[\d+px\]/);
    }
  });
});

describe("Accueil — le correctif de rendu ne touche pas au fond", () => {
  it("la meteo reste montee par le serveur, dans le bloc 3", () => {
    expect(PAGE).toContain("blocMeteo={<ChantiersMeteoCards />}");
    const meteo = DASHBOARD.slice(DASHBOARD.indexOf("blocMeteo"));
    expect(meteo).toContain("Impact");
  });

  it("les trois chargeurs de donnees restent en place", () => {
    expect(PAGE).toContain("chargerNotes");
    expect(PAGE).toContain("chargerChantiersAPreparer");
    expect(PAGE).toContain("chargerNotifications");
  });

  it("l'assistance vocale garde son handler et son composant", () => {
    expect(DASHBOARD).toContain("BoutonMicroNote");
    expect(DASHBOARD).toContain("handleTexteReformule");
  });
});
