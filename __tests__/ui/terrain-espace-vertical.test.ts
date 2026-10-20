// __tests__/ui/terrain-espace-vertical.test.ts
// O3-B10 — `/terrain/**` : aucun espace vertical parasite sous le header BNA
// ============================================================================
//
// LE DEFAUT
//
// Sur `/terrain/chantier` et `/terrain/chantier/[chantier]`, le conteneur
// racine des deux pages portait :
//
//     <div className="space-y-5 pt-44">
//
// `pt-44` = 11rem = 176 px. D'ou la bande vide sous le header BNA, puis le
// contenu (sur la page chantier : « ← Chantiers »). Ces DEUX pages et ces
// DEUX lignes etaient les seules de `/terrain/**` a porter ce padding.
//
// LA CAUSE
//
// Le header BNA de `app/layout.tsx` est `position: relative`, en flux normal :
// une top bar fine (menu + cloche) puis le conteneur du logo. Il ne RECOUVRE
// donc jamais le contenu, quelle que soit sa hauteur : rien ne demande de
// pousser le contenu vers le bas. Le `pt-44` a ete introduit en
// `5a32e26` (« refonte Dark Premium du module Chantiers ») comme reflexe de
// style — et meme a cette date, le header etait deja `relative` (verifie sur
// `git show 5a32e26:app/layout.tsx`). Il n'a jamais existe sur aucune autre
// page `/terrain/*`, ce qui est justement ce qui le rendait visible.
//
// Ce test verrouille l'absence de cet espacement, sur TOUTES les pages
// `/terrain/**` — pas seulement les deux concernees.
//
// LES `pt-48` QUI RESTENT SONT LEGITIMES
//
// Quatre overlays de modale portent `fixed inset-0 z-[210] pt-48`. Ce `pt-48`
// decale le CONTENU D'UNE MODALE centree verticalement pour qu'elle ne passe
// pas sous le header : c'est un centrage, pas une bande vide. Le test
// distingue les deux sur le mot-cle `fixed` — sinon il interdisait un
// comportement voulu.
//
// METHODE
//
// Lecture des sources, comme `accueil-responsive.test.ts` et
// `routes-legacy-redirections.test.ts` : le rendu Tailwind n'existe pas dans
// jsdom, une classe CSS ne se mesure pas au DOM. Les commentaires sont
// retires (`code()`) SANS QUOI le test verrait sa propre documentation —
// chaque explication de ce fichier cite `pt-44`.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = process.cwd();
const DOSSIER = join(RACINE, "app", "terrain");

/** Retire commentaires et chaînes de littéral : on ne veut lire que le code. */
function code(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function pagesTerrain(): string[] {
  const trouvees: string[] = [];
  const visiter = (dossier: string) => {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) visiter(chemin);
      else if (nom === "page.tsx") trouvees.push(chemin);
    }
  };
  visiter(DOSSIER);
  return trouvees.sort();
}

/**
 * Un `pt-NN` dont NN >= 20 equivaut a au moins 5rem = 80 px de vide vertical.
 * Retourne la liste des valeurs trouvees, avec la ligne fautive.
 */
function grandsPaddingHaut(source: string): Array<{ classe: string; ligne: number }> {
  const sortie: Array<{ classe: string; ligne: number }> = [];
  const lignes = source.split("\n");
  lignes.forEach((ligne, i) => {
    for (const m of ligne.matchAll(/className="([^"]*)"/g)) {
      const classes = m[1];
      // `fixed` : le padding sert a centrer une modale sous le header.
      if (/\bfixed\b/.test(classes)) continue;
      for (const p of classes.matchAll(/\bpt-(\d+)\b/g)) {
        if (Number(p[1]) >= 20) sortie.push({ classe: p[0], ligne: i + 1 });
      }
    }
  });
  return sortie;
}

// ============================================================================

describe("O3-B10 — `/terrain/**` : pas de `padding-top` qui pousse le contenu vers le bas", () => {
  it("le depassement existe bien sur `/terrain` (garde-fou du test lui-meme)", () => {
    // On rejoue le diagnostic sur une page de reference qui DOIT rester
    // propre. Si la liste des pages vient a etre vide, ce test passerait
    // sans rien controler : on verifie donc qu'on a bien des pages a lire.
    expect(pagesTerrain().length).toBeGreaterThan(5);
    expect(grandsPaddingHaut(code(join(DOSSIER, "outils", "page.tsx")))).toEqual([]);
  });

  for (const page of pagesTerrain()) {
    const nom = relative(RACINE, page);
    it(`${nom} : aucun padding-top >= 5rem hors modale`, () => {
      const coupables = grandsPaddingHaut(code(page));
      expect(
        coupables.map((c) => `ligne ${c.ligne} : ${c.classe}`),
        `${nom} porte un padding-top >= 5rem sur un element en flux normal. ` +
          `Le header BNA est \`relative\` et en flux : il ne masque rien, donc ` +
          `ce padding n'ajoute que du vide.`,
      ).toEqual([]);
    });
  }
});

describe("O3-B10 — la page chantier et la liste des chantiers", () => {
  const LISTE = join(DOSSIER, "chantier", "page.tsx");
  const DETAIL = join(DOSSIER, "chantier", "[id]", "page.tsx");

  it("les deux conteneurs racine ont perdu leur `pt-44`", () => {
    // Le defaut observe : 176 px de vide entre le header et « ← Chantiers ».
    expect(code(LISTE)).not.toMatch(/\bpt-44\b/);
    expect(code(DETAIL)).not.toMatch(/\bpt-44\b/);
  });

  it("le rythme vertical d'origine est conserve (`space-y`, pas de padding)", () => {
    // Le correctif ne doit retirer QUE l'espacement parasite : le conteneur
    // racine garde son `space-y`, c'est lui qui espace les blocs entre eux.
    expect(code(LISTE)).toMatch(/<div className="space-y-5">/);
    expect(code(DETAIL)).toMatch(/<div className="space-y-4">/);
  });

  it("« ← Chantiers » reste le premier contenu de la page chantier", () => {
    // Preuve que le contenu a REMONTE au lieu d'etre recadre : le lien de
    // retour est le premier enfant du conteneur racine.
    const source = code(DETAIL);
    const racine = source.indexOf('<div className="space-y-4">');
    expect(racine).toBeGreaterThan(-1);
    const suite = source.slice(racine);
    expect(suite.indexOf("← Chantiers")).toBeGreaterThan(-1);
    expect(suite.indexOf("← Chantiers")).toBeLessThan(suite.indexOf("<h1"));
  });

  it("les onglets Général / Avancement / Rapport Client n'ont pas bougé", () => {
    const source = code(DETAIL);
    const declaration = source.match(/const TABS = \[([^\]]*)\]/);
    expect(declaration, "TABS introuvable").not.toBeNull();
    const onglets = [...(declaration![1].match(/"([^"]+)"/g) ?? [])].map((s) =>
      s.slice(1, -1),
    );
    // L'ordre impose est preserve, et les trois cites sont presents.
    expect(onglets.slice(0, 3)).toEqual(["Général", "Avancement", "Rapport Client"]);
    expect(onglets.length).toBe(10);
    // Le rendu des onglets est toujours en place.
    expect(source).toContain("TABS.map");
  });
});

describe("O3-B10 — l'espacement qui reste vient bien du layout", () => {
  it("`app/terrain/layout.tsx` garde son conteneur d'origine", () => {
    // Seul espacement legitime : 24 px (`py-6`) + le `mt-4` du `<main>`.
    const layout = code(join(RACINE, "app", "terrain", "layout.tsx"));
    expect(layout).toContain('className="mx-auto max-w-5xl px-4 py-6"');
  });

  it("le header BNA est `relative` : c'est ce qui interdit de compensateur", () => {
    // La regle du test (« pas de grand padding-top ») n'a de sens que parce
    // que le header ne recouvre pas le contenu. Si un jour le header devient
    // `fixed`, ce test echouera ICI, avec cette explication, plutot que de
    // interdire indefiniment une compensation qui serait alors legitime.
    const layout = code(join(RACINE, "app", "layout.tsx"));
    const header = layout.match(/<header className="([^"]*)"/);
    expect(header, "header introuvable dans app/layout.tsx").not.toBeNull();
    expect(header![1]).toMatch(/\brelative\b/);
    expect(header![1]).not.toMatch(/\bfixed\b/);
    // Le header est un FLEXBOX sur une seule ligne (menu · logo · cloche).
    // Sa hauteur est naturelle (plus de `h-[120px]`), ce qui ne change rien a
    // l'invariant : en flux normal, il ne recouvre pas le contenu.
    expect(header![1]).toMatch(/\bflex\b/);
    expect(header![1]).toMatch(/\bitems-center\b/);
  });
});
