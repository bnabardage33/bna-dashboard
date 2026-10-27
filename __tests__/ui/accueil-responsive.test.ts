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
  it("la racine publique et l'Accueil Chantier ont chacun leur conteneur", () => {
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

describe("Accueil — les grilles sont celles de la refonte", () => {
  /** Les trois rangees de cartes, avec la grille de reference de chacune. */
  const RANGEES = [
    {
      nom: "dernieres notes",
      source: DASHBOARD,
      grille: 'className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"',
    },
    {
      nom: "cartes meteo",
      source: METEO,
      grille: '<div className="grid gap-3 sm:grid-cols-2">',
    },
    {
      nom: "chantiers a preparer",
      source: DASHBOARD,
      grille: '<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">',
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

  it("aucune rangee de cartes n'est centree, seul l'en-tete a le droit de l'etre", () => {
    // La grande boite d'enregistrement vocal et les trois tuiles de raccourcis
    // qui portaient `justify-center` ont ete supprimees. Il ne reste qu'UN
    // centrage : la rangee des trois acces rapides de l'en-tete, qui sont des
    // liens de navigation alignes a l'axe de leur colonne — jamais des cartes.
    const centres = [...DASHBOARD.matchAll(/className="([^"]*justify-center[^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(centres.length).toBeGreaterThan(0);
    for (const classes of centres) {
      expect(classes, `centrage hors acces rapides : "${classes}"`).toMatch(/\bmin-h-10\b/);
    }
  });

  it("aucune carte ne porte de largeur propre", () => {
    // Une carte a largeur propre sort de la grille : c'est le meme glissement.
    // La largeur d'une carte est celle de sa colonne, rien d'autre.
    const cartes = [
      ...DASHBOARD.matchAll(/<Link\s+href="\/terrain\/notes"\s+className="([^"]*)"/g),
      // `key={n.id` : la carte d'alerte est rendue avec `n`, pas `c`. Avec
      // `c`, cette branche ne matchait AUCUNE occurrence et la garde « aucune
      // carte a largeur propre » ne verifiait donc pas les alertes.
      ...DASHBOARD.matchAll(/<Surface as="li" key=\{n\.id\}(?: className="([^"]*)")?>/g),
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

  it("l'etat vide des notes reprend la portee de la grille", () => {
    // La portee de l'etat vide suit la grille : 2 colonnes a `sm`, 3 a `xl`.
    expect(DASHBOARD).toContain('sm:col-span-2 xl:col-span-3');
  });

  it("la carte meteo garde son habillage et son impact chantier", () => {
    // Le correctif porte sur la presentation, pas sur le calcul d'impact.
    expect(METEO).toMatch(/className=\{`rounded-xl border p-3/);
    // Depuis la refonte, la carte n'applique plus l'alerte sur la JOURNEE
    // entiere : elle applique `evaluerPoseChantier`, qui restreint les mêmes
    // seuils aux HORAIRES DE POSE du chantier (le cumul journalier de pluie ne
    // déclenche plus « pose interdite » à lui seul). Voir lib/meteoAlerte.ts.
    expect(METEO).toContain("evaluerPoseChantier");
    expect(METEO).toContain("COULEURS[ch.niveau]");
  });
});

describe("Accueil — hierarchie visuelle et comportement mobile", () => {
  it("la page s'ouvre sur un en-tete compact avec `h1` et sous-titre", () => {
    // L'accueil professionnel porte le H1 ; le cockpit conserve son H2.
    // La marque est déjà affichée par le layout global.
    expect(ACCUEIL_PROFESSIONNEL).toMatch(/<h1[^>]*>[\s\S]*?\{titre\}[\s\S]*?<\/h1>/);
    expect(DASHBOARD).toMatch(/<h2[^>]*>[\s\S]*?Votre activité[\s\S]*?<\/h2>/);
    expect(DASHBOARD).toMatch(/<header className="[^"]*"/);
    expect(ACCUEIL_PROFESSIONNEL).not.toContain("BNA Bardage");
  });

  it("les quatre en-tetes de section gardent l'alignement d'origine", () => {
    // `justify-between` : le libelle a gauche, le lien a droite, sur le meme
    // axe. Quatre sections porteuses d'un lien : meteo, impact, chantiers,
    // notes & alertes. L'en-tete compact ouvre la page avec son propre motif,
    // hors de ce compte.
    const enTetes = [
      ...DASHBOARD.matchAll(/className="(mb-3 flex flex-wrap items-center justify-between[^"]*)"/g),
    ].map((m) => m[1]);
    expect(enTetes).toHaveLength(4);
    for (const classes of enTetes) {
      expect(classes).toMatch(/gap-x-3/);
    }
  });

  it("les trois acces rapides de l'en-tete tiennent sur une seule rangee", () => {
    // Trois acces, pas un de plus : Intempéries, Boite a outils, Notes.
    // Tous pointent vers un ecran qui existe (aucune fonction promise en vain).
    const acces = DASHBOARD.slice(
      DASHBOARD.indexOf('aria-label="Accès rapides"'),
      DASHBOARD.indexOf("</nav>", DASHBOARD.indexOf('aria-label="Accès rapides"')),
    );
    expect((acces.match(/<Link/g) ?? []).length).toBe(3);
    for (const route of ["/bureau/meteo", "/boite-a-outils", "/terrain/notes"]) {
      expect(acces, `acces manquant : ${route}`).toContain(route);
    }
    // Sur UNE seule rangee des le mobile : grille a trois colonnes egales,
    // aucun `flex-wrap` (qui aurait rejete un acces sur une seconde ligne).
    expect(acces).toContain("grid grid-cols-3");
    expect(acces).not.toContain("flex-wrap");
    // Le libelle « Veille » (trop long pour trois colonnes) a ete retire :
    // l'acces garde sa destination et son pictogramme.
    expect(acces).toContain("Intempéries");
    expect(acces).not.toContain("Veille intempéries");
    // Les anciens raccourcis redondants de la carte vocale ont disparu.
    expect(acces).not.toContain("/terrain/chantier");
    expect(acces).not.toContain("/terrain/meteo");
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

  it("la grille principale couvre mobile, tablette et desktop", () => {
    // 1 colonne sur mobile, 2 a partir de `md` (768 px), 12 colonnes a partir
    // de `xl` (1280 px) : la page se raccourcit au lieu de s'allonger.
    expect(DASHBOARD).toContain(
      'grid grid-cols-1 items-start gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-12',
    );
    // Meteo 5/12 + impact 7/12 a partir de `xl` ; chantiers et notes en pleine
    // largeur (leurs cartes internes passent a trois colonnes).
    expect(DASHBOARD).toContain('className="xl:col-span-5"');
    expect(DASHBOARD).toContain('className="xl:col-span-7"');
    expect(DASHBOARD).toContain('className="md:col-span-2 xl:col-span-12"');
    // La meteo est le PREMIER bloc du DOM : on lit l'essentiel avant tout.
    expect(DASHBOARD.indexOf("Météo générale")).toBeLessThan(
      DASHBOARD.indexOf("Impact météo sur les chantiers"),
    );
    expect(DASHBOARD.indexOf("Impact météo sur les chantiers")).toBeLessThan(
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
    // `min-h-10` = 2.5rem = 40 px pour les acces rapides : legerement plus bas
    // que les 44 px historiques, mais toujours largement au-dessus du minimum
    // utilisable au doigt sur chantier.
    // On verifie les trois acces rapides de l'en-tete…
    const acces = DASHBOARD.slice(
      DASHBOARD.indexOf('aria-label="Accès rapides"'),
      DASHBOARD.indexOf("</nav>", DASHBOARD.indexOf('aria-label="Accès rapides"')),
    );
    expect((acces.match(/min-h-10/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // Aucun acces ne retombe sous ce seuil : tout `min-h-*` de la rangee vaut 10.
    const hauteurs = acces.match(/min-h-[0-9.]+/g) ?? [];
    expect(hauteurs.length).toBeGreaterThanOrEqual(3);
    for (const hauteur of hauteurs) {
      expect(hauteur).toBe("min-h-10");
    }

    // …et le bouton « Dicter une note », dont la cible de 44 px reste definie
    // dans le composant vocal lui-meme.
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
  // `className` facultatif : si quelqu'un retire la classe, la carte doit
  // rester identifiee SANS padding, pour que l'echec soit nucle sur le
  // padding et non sur la forme du JSX.
  const carteAlertes =
    DASHBOARD.match(/<Surface as="li" key=\{n\.id\}(?: className="([^"]*)")?>/);

  it("les deux cartes existent bien dans la source", () => {
    // Sans ce controle, les assertions suivantes passeraient par absence
    // d'objet si le JSX changeait de forme.
    expect(carteNotes, "carte de note introuvable").not.toBeNull();
    expect(carteAlertes, "carte d'alerte introuvable").not.toBeNull();
  });

  it("les deux cartes portent le MEME padding", () => {
    expect(tokensPadding(carteAlertes![1] ?? "")).toEqual(tokensPadding(carteNotes![1]));
  });

  it("le padding couvre les DEUX axes, pas seulement l'horizontal", () => {
    // Un `px-4` seul laisserait le titre plaqué en haut de la carte.
    const padding = tokensPadding(carteAlertes![1] ?? "");
    expect(padding.length).toBeGreaterThan(0);
    for (const token of padding) {
      expect(token, `padding ${token} : ne pose qu'un seul axe`).toMatch(/^p-/);
    }
  });

  it("la carte d'alerte ne redéfinit ni fond, ni bordure, ni arrondi", () => {
    // L'habillage reste celui de `Surface` : la correction porte sur le
    // padding, pas sur la charte. Un `bg-…`, `border-…` ou `rounded-…`
    // supplémentaire ici viendrait concurrencer `HABILLAGE`.
    expect((carteAlertes![1] ?? "").match(/\b(?:bg|border|rounded)-/g) ?? []).toEqual([]);
  });

  it("la carte d'alerte ne prend toujours pas de largeur propre", () => {
    // Repris de la garde générale « aucune carte ne porte de largeur propre »,
    // qui couvre desormais reellement cette carte (cf. regex reparee plus haut).
    expect(carteAlertes![1] ?? "").not.toMatch(/\bw-full\b|w-\[calc|max-w-/);
  });
});
