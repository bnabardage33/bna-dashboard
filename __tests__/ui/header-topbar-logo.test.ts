// En-tête global — flexbox sur une seule ligne (menu · logo · cloche)
// ============================================================================
//
// Correction de l'en-tête de `app/layout.tsx` :
//
//   1. UN SEUL CONTENEUR FLEX. Le bouton menu (hamburger), le logo BNA et la
//      cloche de notification vivent dans le même `<header>`, sur UNE seule
//      ligne : menu à gauche, cloche à droite, logo au centre. Conteneur :
//      `flex` + `justify-between` + `items-center` + `w-full` + `py-1.5 px-4`
//      (= padding 6px 16px).
//
//   2. LOGO 180 px, CADRE 130 px. Le logo occupe 180 px de largeur
//      (`w-[180px]`) avec `h-auto` : ses proportions d'origine sont conservées
//      et il n'est pas déformé. Un CADRE de 130 px de haut (`overflow-hidden`)
//      masque uniquement le vide transparent du PNG : le header perd 50 px
//      sans qu'un seul pixel du dessin ne disparaisse. `max-w-full` le laisse
//      rétrécir sur un écran très étroit pour qu'il ne recouvre jamais le menu
//      ni la cloche.
//
//   3. REFLET CONTINU. Le reflet rouge n'est plus porté par le `<main>` (où il
//      laissait une bande noire autour du logo) mais par le `<body>` : il monte
//      jusqu'en haut de la page et passe derrière le logo, sans barre ni
//      conteneur supplémentaire.
//
//   4. TITRE RAPPROCHÉ. Le padding vertical du header passe de `py-2.5` (10 px)
//      à `py-1.5` (6 px) et le bloc « Accueil » de `DashboardAccueil` passe de
//      `mt-6` à `mt-1` (4 px), par paliers : le titre descend de 50 px à 26 px
//      sous le logo, sans toucher au `<main>` ni au reflet.
//
//   5. BOUTONS DISCRETS. Le hamburger (`components/Drawer.tsx`) et la cloche
//      (`components/SearchNav.tsx`) gardent la MÊME destination et le MÊME
//      comportement, mais leur carré visuel est plus petit (40 px et 36 px),
//      leur icône réduite (17 px et 14 px) et leur fond allégé. Une zone
//      tactile de 44 px (`min-h-11 min-w-11`) est maintenue autour de chacun.
//
//   6. Le sur-titre rouge « BNA Bardage » reste supprimé (doublon de marque).
//
// On lit les SOURCES (les classes CSS ne se mesurent pas dans jsdom) ; les
// commentaires sont retirés pour ne pas tester la documentation du fichier.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const CODE = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const LAYOUT = CODE(lire("app/layout.tsx"));
const DASHBOARD = CODE(lire("components/DashboardAccueil.tsx"));

/** Le `<header>` du layout racine, de la balise ouvrante à la fermante. */
const HEADER = LAYOUT.slice(LAYOUT.indexOf("<header"), LAYOUT.indexOf("</header>"));

describe("En-tête global — flexbox sur une seule ligne", () => {
  it("le <header> est un flexbox unique, en flux normal (`relative`)", () => {
    const header = LAYOUT.match(/<header className="([^"]*)"/);
    expect(header, "header introuvable dans app/layout.tsx").not.toBeNull();
    const classes = header![1];
    expect(classes).toMatch(/\bflex\b/);
    expect(classes).not.toMatch(/\bflex-col\b/);
    expect(classes).toMatch(/\bitems-center\b/);
    expect(classes).toMatch(/\bjustify-between\b/);
    expect(classes).toMatch(/\bw-full\b/);
    // padding 6px 16px → `py-1.5 px-4` (padding vertical réduit de 10 à 6 px).
    expect(classes).toMatch(/\bpx-4\b/);
    expect(classes).toMatch(/\bpy-1\.5\b/);
    expect(classes).not.toMatch(/\bpy-2\.5\b/);
    // Flux normal : jamais `fixed`, sinon le contenu serait recouvert.
    expect(classes).toMatch(/\brelative\b/);
    expect(classes).not.toMatch(/\bfixed\b/);
  });

  it("le fond gris arrondi a disparu : le header est transparent", () => {
    const header = LAYOUT.match(/<header className="([^"]*)"/)![1];
    expect(header).not.toMatch(/bg-\[#1E1E1E\]/);
    expect(header).not.toMatch(/\brounded-/);
    expect(header).not.toMatch(/\bshadow-/);
    expect(header).not.toMatch(/\bborder-/);
    expect(header).not.toMatch(/\boverflow-hidden\b/);
  });

  it("les trois éléments sont dans le même conteneur, menu → logo → cloche", () => {
    const iMenu = HEADER.indexOf("<Drawer />");
    const iLogo = HEADER.indexOf("<Image");
    const iCloche = HEADER.indexOf("<SearchNav />");
    expect(iMenu, "menu introuvable").toBeGreaterThan(-1);
    expect(iLogo, "logo introuvable").toBeGreaterThan(-1);
    expect(iCloche, "cloche introuvable").toBeGreaterThan(-1);
    // Ordre du DOM = ordre visuel sur la ligne.
    expect(iMenu).toBeLessThan(iLogo);
    expect(iLogo).toBeLessThan(iCloche);
    // Une seule ligne : aucun retour à la ligne ni empilement vertical.
    expect(HEADER).not.toMatch(/\bflex-col\b/);
    expect(HEADER).not.toMatch(/\bflex-wrap\b/);
  });

  it("le logo est centré entre le menu et la cloche", () => {
    // Le conteneur du logo prend l'espace libre et le recentre, sur la même
    // ligne que le menu et la cloche. (Un commentaire JSX sépare les deux
    // `div` : le motif autorise n'importe quel contenu intermédiaire.)
    const conteneur = HEADER.match(/<div className="([^"]*flex-1[^"]*)">\s*[\s\S]*?<div className="flex h-\[130px\]/);
    expect(conteneur, "conteneur du logo introuvable").not.toBeNull();
    expect(conteneur![1]).toMatch(/\bflex-1\b/);
    expect(conteneur![1]).toMatch(/\bjustify-center\b/);
    expect(conteneur![1]).toMatch(/\bitems-center\b/);
  });

  it("le cadre réserve 130 px de HAUT sans brider la largeur du logo", () => {
    // La hauteur du header est dictée par le cadre du logo. L'image, elle,
    // n'est PAS contrainte en hauteur : elle est rendue à 180 px de large et
    // dépasse le cadre, qui masque le vide transparent (`overflow-hidden`).
    const cadre = HEADER.match(/<div className="(flex h-\[130px\][^"]*)"/);
    expect(cadre, "cadre du logo introuvable").not.toBeNull();
    expect(cadre![1]).toContain("h-[130px]");
    expect(cadre![1]).toContain("overflow-hidden");
    expect(cadre![1]).toContain("items-center");
    expect(cadre![1]).toContain("justify-center");
  });

  it("la hauteur du header reste 6 + 130 + 6 = 142 px (ancrage du volet mobile)", () => {
    // Le volet de recherche mobile (`SearchNav`) est `fixed top-[142px]` : il se
    // pose juste sous le header. Cette valeur DOIT rester égale à
    // `py-1.5` (6 px haut) + cadre (130 px) + `py-1.5` (6 px bas). Toute
    // modification du padding ou du cadre sans le volet créerait un
    // chevauchement du logo ou un trou entre les deux.
    const header = HEADER.match(/<header className="([^"]*)"/);
    expect(header, "header introuvable").not.toBeNull();
    expect(header![1], "le padding vertical du header doit rester `py-1.5`").toContain("py-1.5");
    expect(HEADER).toContain('h-[130px]');

    const search = CODE(lire("components/SearchNav.tsx"));
    expect(search, "le volet mobile doit être ancré à 142 px").toContain("top-[142px]");
  });

  it("le logo fait 180 px de large, hauteur auto (proportions d'origine)", () => {
    const image = HEADER.match(/<Image[\s\S]*?className="([^"]*)"/);
    expect(image, "logo introuvable").not.toBeNull();
    expect(image![1]).toContain("w-[180px]");
    // `h-auto` + `object-contain` : le ratio du fichier est conservé.
    expect(image![1]).toContain("h-auto");
    expect(image![1]).toContain("object-contain");
    expect(image![1]).toContain("max-w-full");
    expect(image![1]).not.toContain("size-48");
    // Interdits : une hauteur sur l'IMAGE déformerait le logo, et
    // `object-fill` l'écraserait explicitement.
    expect(image![1]).not.toContain("max-h-[");
    expect(image![1]).not.toContain("h-[130px]");
    expect(image![1]).not.toContain("object-fill");
    expect(HEADER).not.toContain("object-fill");
    expect(HEADER).toContain('alt="BNA Bardage"');
  });

  it("le cadre ne peut pas rogner le dessin (marge calculée sur l'alpha du PNG)", () => {
    // Mesure faite sur le fichier source : encre sur y=121..361 d'un carré 500.
    // À 180 px de large (échelle 0,36) l'encre fait 86,76 px de haut et occupe
    // y=18,6..105,0 dans un cadre de 130 px. Il faut au minimum ~87 px de cadre
    // (plus la réserve d'anti-aliasing) : on verrouille donc une borne basse.
    const ENCRE_PX = 241 * (180 / 500); // = 86,76 px
    const SEUIL = 112; // en dessous, le dessin commencerait à être rogné
    const cadre = HEADER.match(/<div className="(flex h-\[(\d+)px\][^"]*)"/);
    expect(cadre, "cadre du logo introuvable").not.toBeNull();
    const hauteur = Number(cadre![2]);
    expect(hauteur).toBeGreaterThanOrEqual(ENCRE_PX);
    expect(hauteur).toBeGreaterThanOrEqual(SEUIL);
    // Et on ne dépasse pas inutilement la hauteur naturelle de l'image.
    expect(hauteur).toBeLessThanOrEqual(180);
  });

  it("l'image n'est jamais bridée à la fois en largeur et en hauteur", () => {
    // Règle explicite : appliquer 180 px de large ET 130 px de haut à l'image
    // même déformerait le dessin. La hauteur est portée par le CADRE, jamais
    // par l'image.
    const image = HEADER.match(/<Image[\s\S]*?className="([^"]*)"/);
    expect(image![1]).toContain("w-[180px]");
    expect(image![1]).not.toMatch(/\bh-\[\d+px\]/);
  });

  it("le logo est déclaré aux dimensions réelles du fichier (500x500)", () => {
    // Le PNG source est un carré 500 x 500 : des attributs 400x200 mentiraient
    // sur le ratio et introduiraient un décalage de mise en page (CLS). Le
    // fichier image lui-même n'est jamais touché.
    const attrs = HEADER.match(/<Image[\s\S]*?\/>/);
    expect(attrs, "logo introuvable").not.toBeNull();
    expect(attrs![0]).toContain("width={500}");
    expect(attrs![0]).toContain("height={500}");
    expect(attrs![0]).toContain('src="/logo-bna.png"');
  });

  it("le logo ne peut pas recouvrir le menu ni la cloche", () => {
    // `min-w-0` sur le conteneur + `max-w-full` sur l'image : sur un écran très
    // étroit le logo rétrécit au lieu de déborder sur les boutons.
    const attrs = HEADER.match(/<Image[\s\S]*?\/>/);
    expect(attrs![0]).toContain("max-w-full");
    const conteneur = HEADER.match(/<div className="([^"]*flex-1[^"]*)">/);
    expect(conteneur![1]).toContain("min-w-0");
  });

  it("le titre « Accueil » est décollé de la barre par `mt-1` (4 px)", () => {
    const header = DASHBOARD.match(/<header className="([^"]*)"/);
    expect(header, "header d'accueil introuvable").not.toBeNull();
    expect(header![1]).toMatch(/\bmt-1\b/);
    // Réduction progressive : les paliers précédents ne doivent pas revenir.
    expect(header![1]).not.toMatch(/\bmt-6\b/);
    expect(header![1]).not.toMatch(/\bmt-2\b/);
  });

  it("le hamburger de Drawer reste discret, avec une cible de 44 px", () => {
    const drawer = CODE(lire("components/Drawer.tsx"));
    const bouton = drawer.match(/<button\s+onClick=\{\(\) => setOpen\(true\)\}[\s\S]*?>/);
    expect(bouton, "hamburger introuvable").not.toBeNull();
    // Carré visuel réduit, mais zone tactile conservée.
    expect(bouton![0]).toContain("w-10 h-10");
    expect(bouton![0]).toContain("min-h-11");
    expect(bouton![0]).toContain("min-w-11");
    // Remplissage visuel plus discret qu'avant (bg-white/15).
    expect(bouton![0]).toContain("bg-white/10");
    expect(bouton![0]).not.toContain("bg-white/15");
    // Icône légèrement plus petite.
    expect(drawer).toMatch(/<Menu size=\{17\}/);
    expect(drawer).not.toMatch(/<Menu size=\{20\}/);
    // La destination et le comportement sont intacts.
    expect(bouton![0]).toContain('aria-label="Ouvrir le menu"');
    expect(bouton![0]).toContain("setOpen(true)");
  });

  it("la cloche de SearchNav reste discrète, avec une cible de 44 px", () => {
    const search = CODE(lire("components/SearchNav.tsx"));
    const bouton = search.match(/<button\s+onClick=\{\(\) => \{ setNotifOpen\(!notifOpen\)[\s\S]*?>/);
    expect(bouton, "cloche introuvable").not.toBeNull();
    expect(bouton![0]).toContain("w-9 h-9");
    expect(bouton![0]).toContain("min-h-11");
    expect(bouton![0]).toContain("min-w-11");
    expect(bouton![0]).toContain("bg-white/[0.07]");
    expect(bouton![0]).not.toContain("bg-white/10");
    expect(search).toMatch(/<Bell size=\{14\}/);
    expect(search).not.toMatch(/<Bell size=\{16\}/);
    // La destination et le comportement sont intacts.
    expect(bouton![0]).toContain('aria-label="Notifications"');
    expect(search).toContain("marquerLu([n.id])");
    expect(search).toContain("href={n.lien || \"/\"}");
  });

  it("« Dicter une note » est aligné à droite du titre « Votre activité »", () => {
    // Titre et bouton partagent la MÊME ligne (`items-center`) : le bouton est
    // ainsi à la hauteur du titre, à sa droite. Le sous-titre vient après.
    const ligneTitre = DASHBOARD.match(
      /<div className="([^"]*justify-between[^"]*)">\s*<h2[\s\S]*?<BoutonMicroNote/,
    );
    expect(ligneTitre, "ligne titre + bouton introuvable").not.toBeNull();
    expect(ligneTitre![1]).toMatch(/\bitems-center\b/);
    expect(ligneTitre![1]).toMatch(/\bjustify-between\b/);
    // Le bouton reste câblé au handler réel : rien n'est factice.
    expect(DASHBOARD).toContain("onTexteReformule={handleTexteReformule}");
  });

  it("le reflet rouge passe derrière le logo (aucune bande noire)", () => {
    // Le reflet a migré du `<main>` vers le `<body>` : le `<body>` englobe le
    // header, donc le halo monte jusqu'au logo. Un reflet resté sur le `<main>`
    // laisserait la bande noire tout en haut.
    const body = LAYOUT.match(/<body className="([^"]*)"/);
    expect(body, "body introuvable").not.toBeNull();
    expect(body![1]).toContain("radial-gradient");
    expect(body![1]).toContain("bg-size-[100%_380px]");
    // Le `<main>` n'a plus le reflet : il a été déplacé, pas dupliqué.
    const main = LAYOUT.match(/<main\b[\s\S]*?>/);
    expect(main![0]).not.toContain("radial-gradient");
  });

  it("le doublon rouge « BNA Bardage » a disparu de l'accueil", () => {
    expect(DASHBOARD).not.toContain("BNA Bardage");
    expect(DASHBOARD).toMatch(/<h2[^>]*>[^<]*Votre activité[^<]*<\/h2>/);
  });
});
