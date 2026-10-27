// Accueil : ordre des blocs et disparition de « Chiffres clés »
// ============================================================================
//
// Deux décisions explicites, verrouillées ici parce qu'elles sont invisibles
// dans un test de rendu isolé :
//
//   1. L'ordre des blocs de l'accueil est
//        En-tête compact (marque, titre, dictée vocale, accès rapides) ->
//        Météo générale -> Impact météo sur les chantiers ->
//        Chantiers à préparer -> Dernières notes et alertes.
//      Un test qui vérifie l'ordre est plus robuste qu'un test qui vérifie des
//      numéros de section : l'ordre est l'intention, pas une implémentation.
//      La météo est la PREMIÈRE grande section informative, juste après
//      l'en-tête : on lit l'essentiel sans défiler un grand bloc vocal.
//
//      Le grand conteneur « Assistant vocal (IA) » et ses trois raccourcis
//      redondants ont été SUPPRIMÉS ; la fonction vocale reste, portée par le
//      bouton « Dicter une note » de l'en-tête (même composant, même handler).
//      Les deux anciennes sections « Dernières Notes » et « Alertes » restent
//      FUSIONNÉES en une seule (deux sous-listes).
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
const PAGE_CHANTIER = lire("app/terrain/accueil/page.tsx");
const PAGE_CHANTIER_CODE = CODE(PAGE_CHANTIER);
const CHARGEURS = lire("lib/accueil/chargerDonnees.ts");

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
  it("l’accueil professionnel précède le cockpit sur l’Accueil Chantier", () => {
    const indexAccueil = PAGE_CHANTIER_CODE.indexOf('<AccueilProfessionnel titre="Accueil Chantier"');
    const indexCockpit = PAGE_CHANTIER_CODE.indexOf("<DashboardAccueil");

    expect(indexAccueil).toBeGreaterThanOrEqual(0);
    expect(indexCockpit).toBeGreaterThan(indexAccueil);
  });

  it("cinq blocs, numérotés 1 à 5, sans trou ni doublon", () => {
    // Le bloc 1 est l'en-tête compact (dictée vocale + accès rapides). La météo
    // générale a été remontée en bloc 2, l'impact météo en bloc 3, les
    // chantiers en bloc 4, et le bloc 5 réunit les notes et les alertes.
    expect(BLOCS.map((b) => b.numero)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("1. En-tête compact : dictée vocale et accès rapides", () => {
    // Le fonctionnement de l'IA n'est pas touché : on vérifie que le handler et
    // le composant de micro sont toujours câblés, pas leur implémentation.
    expect(BLOCS[0].titre).toMatch(/En-tête compact/i);
    expect(BLOCS[0].corps).toContain("BoutonMicroNote");
    expect(BLOCS[0].corps).toContain("handleTexteReformule");
    // Les TROIS accès rapides, et eux seuls : tous mènent à un écran existant.
    expect(BLOCS[0].corps).toContain("/bureau/meteo");
    expect(BLOCS[0].corps).toContain("/boite-a-outils");
    expect(BLOCS[0].corps).toContain("/terrain/notes");
    // Les anciens raccourcis redondants (Chantiers, Météo) ont disparu de
    // l'en-tête. Ils ne réapparaissent pas non plus sous forme de tuiles.
    expect(BLOCS[0].corps).not.toContain("/terrain/chantier");
    expect(BLOCS[0].corps).not.toContain("/terrain/meteo");
    // Et la grande carte « Assistant vocal (IA) » n'existe plus dans le code.
    expect(DASHBOARD_CODE).not.toContain("Assistant vocal");
  });

  it("2. Météo générale (première section informative)", () => {
    expect(BLOCS[1].titre).toMatch(/Météo générale/i);
    // Le composant restauré est monté ici, et son lien « Prévisions
    // complètes » mène à la page historique /terrain/meteo.
    expect(BLOCS[1].corps).toContain("MeteoGeneraleAccueil");
    expect(BLOCS[1].corps).toContain('"/terrain/meteo"');
  });

  it("3. Impact météo sur les chantiers", () => {
    expect(BLOCS[2].titre).toMatch(/Impact météo/i);
    // Le bloc est un nœud rendu par `app/page.tsx` : c'est ce qui sort la
    // logique météo des chantiers du périmètre de ce composant.
    expect(BLOCS[2].corps).toContain("blocMeteo");
    // La veille des intempéries reste sur /bureau/meteo.
    expect(BLOCS[2].corps).toContain('"/bureau/meteo"');
  });

  it("4. Chantiers à préparer", () => {
    expect(BLOCS[3].titre).toMatch(/Chantiers à préparer/i);
    expect(BLOCS[3].corps).toContain("chantiersAPreparer");
    expect(BLOCS[3].corps).toContain('"/terrain/chantier"');
  });

  it("5. Dernières notes et alertes", () => {
    expect(BLOCS[4].titre).toMatch(/notes et alertes/i);
    // Les deux listes vivent dans la même section : ni l'une ni l'autre n'a
    // été supprimée par la fusion.
    expect(BLOCS[4].corps).toContain("dernieresNotes");
    expect(BLOCS[4].corps).toContain("notifications");
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

  it("la racine ne charge aucune donnée privée avant de rediriger les sessions", () => {
    expect(PAGE_CODE).toContain("if (user) redirect('/terrain/meteo')");
    expect(PAGE_CODE).not.toContain("chargerDonneesAccueil");
    expect(PAGE_CODE).not.toContain("DashboardAccueil");
  });

  it("le chargeur partagé ne charge aucun compteur", () => {
    expect(CHARGEURS).not.toContain("chargerStats");
    expect(CHARGEURS).not.toContain("statsInitiales");
    expect(CHARGEURS).toContain("chargerNotes");
    expect(CHARGEURS).toContain("chargerChantiersAPreparer");
    expect(CHARGEURS).toContain("chargerNotifications");
  });

  it("l’Accueil Chantier appelle les trois chargeurs côté serveur", () => {
    expect(PAGE_CHANTIER_CODE).toContain("chargerDonneesAccueil(supabase)");
    expect(CHARGEURS).toContain("from('notes_patron')");
    expect(CHARGEURS).toContain("from('chantiers')");
    expect(CHARGEURS).toContain("from('notifications')");
  });

  it("les chargeurs ne chargent aucun compteur", () => {
    expect(PAGE_CODE).not.toContain("chargerStats");
    expect(CHARGEURS).not.toContain("statsInitiales");
  });

  it("les écrans métier qui portent ces chiffres sont intacts", () => {
    // Le retrait est local au cockpit : les comptages livedans les écrans
    // concernés ne doivent pas avoir étémerce à leur tour.
    const factures = lire("app/bureau/factures/page.tsx");
    expect(factures).toMatch(/count|length/);
  });
});

describe("Accueil — la météo reste montée par le serveur", () => {
  it("l’Accueil Chantier passe `ChantiersMeteoCards` au cockpit", () => {
    expect(PAGE_CHANTIER_CODE).toContain("ChantiersMeteoCards");
    expect(PAGE_CHANTIER_CODE).toContain("blocMeteo={<ChantiersMeteoCards />}");
    expect(PAGE_CHANTIER_CODE).toContain("<DashboardAccueil");
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
