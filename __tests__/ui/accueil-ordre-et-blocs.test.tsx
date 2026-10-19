// Accueil : ordre des blocs et disparition de « Chiffres clés »
// ============================================================================
//
// Deux décisions explicites, verrouillées ici parce qu'elles sont invisibles
// dans un test de rendu isolé :
//
//   1. L'ordre des blocs de l'accueil est
//        Assistant vocal -> Chantiers à préparer -> Météo générale ->
//        Impact météo sur les chantiers -> Notes -> Alertes.
//      Un test qui vérifie l'ordre est plus robuste qu'un test qui vérifie des
//      numéros de section : l'ordre est l'intention, pas une implémentation.
//
//   2. Le bloc « Chiffres clés » (chantiers actifs, devis, factures en retard,
//      fournisseurs, notes patron) a été SUPPRIMÉ. Il ne doit plus apparaître,
//      ni comme titre, ni comme libellé de tuile — même si les compteurs
//     -existent encore dans les écrans métier, qui ne sont pas concernés.
//
// Ces tests lisent les fichiers SOURCES des trois pièces de l'accueil. C'est
// délibéré : `DashboardAccueil` est un composant client dont le rendu dépend
// d'un contexte Supabase, et l'ordre des blocs est une propriété structurelle
// bien plus fiable à lire dans la source qu'à déduire d'un arbre rendu.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

/**
 * Code de `DashboardAccueil` **sans les commentaires**.
 *
 * Indispensable : la suppression du bloc est expliquée dans l'en-tête du
 * fichier, donc le texte source contient forcément la chaîne « Chiffres clés »
 * et les noms des anciennes tuiles. Chercher ces chaînes dans les commentaires
 * testerait la documentation, pas le comportement. C'est le même artefact que le
 * helper `code()` de `routes-legacy-redirections.test.ts` : une recherche de code
 * mort ne doit pas voir ses propres comments.
 */
const CODE = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const DASHBOARD = lire("components/DashboardAccueil.tsx");
const DASHBOARD_CODE = CODE(DASHBOARD);
const PAGE = lire("app/page.tsx");
const PAGE_CODE = CODE(PAGE);

/** Bloc de `DashboardAccueil` délimité par son bandeau de commentaire `── N.` */
function blocs(source: string): Array<{ numero: string; titre: string; corps: string }> {
  // Les séparateurs sont des `── 1. …` ; on prend tout ce qui suit jusqu'au
  // bandeau suivant, en gardant le numéro et le libellé d'origine.
  const brut = source.split(/\/\* ── /).slice(1);
  return brut.map((chunk) => {
    const entete = chunk.slice(0, chunk.indexOf(" */"));
    const corps = chunk.slice(chunk.indexOf(" */") + 3);
    const m = entete.match(/(\d+)\.\s*([^─]*?)\s*─/);
    return {
      numero: m ? m[1] : "?",
      titre: (m ? m[2] : entete).trim(),
      corps,
    };
  });
}

const BLOCS = blocs(DASHBOARD);

describe("Accueil — l'ordre des blocs est celui validé", () => {
  it("six blocs, numérotés 1 à 6, sans trou ni doublon", () => {
    // Le bloc 3 « Météo générale » a été restauré (recherche de ville,
    // matin/après-midi, heure par heure, J+1 à J+4) sans supprimer le bloc 4
    // « Impact météo sur les chantiers » : ce sont deux fonctions distinctes.
    expect(BLOCS.map((b) => b.numero)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("1. Assistance vocale (IA)", () => {
    // Le fonctionnement de l'IA ne doit pas être touché : on vérifie que le
    // handler et le composant de micro sont toujours câblés, pas leur
    // implémentation interne.
    expect(BLOCS[0].titre).toMatch(/Assistance vocale/i);
    expect(BLOCS[0].corps).toContain("BoutonMicroNote");
    expect(BLOCS[0].corps).toContain("handleTexteReformule");
  });

  it("2. Chantiers à préparer", () => {
    expect(BLOCS[1].titre).toMatch(/Chantiers à préparer/i);
    expect(BLOCS[1].corps).toContain("chantiersAPreparer");
  });

  it("3. Météo générale (restaurée)", () => {
    expect(BLOCS[2].titre).toMatch(/Météo générale/i);
    // Le composant restauré est monté ici, et son lien « Prévisions
    // complètes » mène à la page historique /terrain/meteo.
    expect(BLOCS[2].corps).toContain("MeteoGeneraleAccueil");
    expect(BLOCS[2].corps).toContain('"/terrain/meteo"');
  });

  it("4. Impact météo sur les chantiers", () => {
    expect(BLOCS[3].titre).toMatch(/Impact météo/i);
    // Le bloc est un nœud rendu par `app/page.tsx` : c'est ce qui sort la
    // logique météo des chantiers du périmètre de ce composant.
    expect(BLOCS[3].corps).toContain("blocMeteo");
    // La veille des intempéries reste sur /bureau/meteo.
    expect(BLOCS[3].corps).toContain('"/bureau/meteo"');
  });

  it("5. Dernières Notes", () => {
    expect(BLOCS[4].titre).toMatch(/Dernières Notes/i);
    expect(BLOCS[4].corps).toContain("dernieresNotes");
  });

  it("6. Alertes", () => {
    expect(BLOCS[5].titre).toMatch(/Alertes/i);
    expect(BLOCS[5].corps).toContain("notifications");
  });
});

describe("Accueil — « Chiffres clés » a été supprimé", () => {
  it("aucun bloc ne porte ce titre", () => {
    expect(DASHBOARD_CODE).not.toMatch(/Chiffres clés/);
  });

  it("aucune des cinq tuiles n'est rendue", () => {
    for (const libelle of [
      "Chantiers actifs",
      "Factures en retard",
      "Fournisseurs",
      "Notes Patron",
      "Devis",
    ]) {
      expect(DASHBOARD_CODE).not.toContain(libelle);
    }
    // Le marqueur de la tuile lui-même : c'était la seule façon de rendre un
    // compteur, donc son absence prouve la disparition du rendu, pas seulement
    // du libellé.
    expect(DASHBOARD_CODE).not.toMatch(/valeur=\{stats\./);
    expect(DASHBOARD_CODE).not.toMatch(/\bstats\./);
  });

  it("le composant `TuileKpi` a disparu avec son seul usage", () => {
    expect(DASHBOARD_CODE).not.toContain("TuileKpi");
  });

  it("le type `Stats` et la liste des statuts actifs ont disparu", () => {
    // Le code mort laissé en place est un piège : il laisse croire que les
    // compteurs alimentent encore quelque chose.
    expect(DASHBOARD_CODE).not.toMatch(/type Stats = \{/);
    expect(DASHBOARD_CODE).not.toContain("STATUTS_CHANTIERS_ACTIFS");
  });

  it("`raffraichirStats` n'est plus appelé (il ne choralait plus rien)", () => {
    expect(DASHBOARD_CODE).not.toContain("raffraichirStats");
  });

  it("`app/page.tsx` ne charge plus aucun compteur", () => {
    expect(PAGE_CODE).not.toContain("chargerStats");
    expect(PAGE_CODE).not.toContain("statsInitiales");
    // Les trois chargeurs de données qui restent doivent toujours être là : on
    // ne supprime pas l'information en supprimant sa tuile.
    expect(PAGE_CODE).toContain("chargerNotes");
    expect(PAGE_CODE).toContain("chargerChantiersAPreparer");
    expect(PAGE_CODE).toContain("chargerNotifications");
  });

  it("les écrans métier qui portent ces chiffres sont intacts", () => {
    // Le retrait est local au cockpit : les comptages livedans les écrans
    // concernés ne doivent pas avoir étémerce à leur tour.
    const factures = lire("app/bureau/factures/page.tsx");
    expect(factures).toMatch(/count|length/);
  });
});

describe("Accueil — la météo reste montée par le serveur", () => {
  it("`app/page.tsx` passe bien `ChantiersMeteoCards` au composant", () => {
    expect(PAGE).toContain("ChantiersMeteoCards");
    expect(PAGE).toContain("blocMeteo={<ChantiersMeteoCards />}");
  });

  it("le composant météo garde sa logique métier existante", () => {
    const meteo = lire("components/ChantiersMeteoCards.tsx");
    // `evaluerAlerteChantier` est ce qui décide d'un impact chantier : le
    // correctif porte sur la SOURCE des données, pas sur ce calcul.
    expect(meteo).toContain("evaluerAlerteChantier");
    expect(meteo).toContain("fetchMeteo");
    // Et il n'invente pas de source météo supplémentaire.
    expect(meteo).not.toMatch(/api\.open-meteo\.com/);
    expect(meteo).not.toMatch(/visualcrossing/);
  });
});
