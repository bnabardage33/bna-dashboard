// @vitest-environment node
//
// COHÉRENCE DU SNAPSHOT « ROUTES API » AVEC L'ARBORESCENCE RÉELLE
// =============================================================
//
// POURQUOI CE TEST EXISTE
// -----------------------
//
// Le compteur de routes API de `audit_bna_dashboard.md` est resté à 36 après la
// suppression de trois routes, et le tableau « Routes API » ne listait pas les
// deux routes qui les ont remplacées. C'est la dérive classique d'un document de
// référence : rien ne signale qu'il a falsehood, et le document est justement
// censé servir à savoir ce qui existe.
//
// Un compteur écrit à la main n'est pas une donnée : c'est une affirmation. Ce
// fichier la remplace par une VÉRIFICATION — le nombre est déduit de l'arbre, le
// document est comparé à l'arbre, et les deux sens sont contrôlés.
//
// CE QUE LE TEST REFUSE, ET POURQUOI CHAQUE SENS COMPTE
// -----------------------------------------------------
//
//   * `documentée mais inexistante` : une ligne du tableau qui ne correspond à
//     aucun `route.ts`. Le document promet une route que le routeur ne sert pas.
//   * `existante mais non documentée` : un `route.ts` absent du tableau. La
//     faute la plus grave pour un audit : la route EST servie, et le document
//     affirme le contraire.
//
// Le premier sens seul donnerait un faux sentiment de sûreté, et le second seul
// manquerait l'abandon de documentation. Les deux sont vérifiés.
//
// LES TROIS LIGNES BARRÉES NE SONT PAS UN COMPTAGE
// ------------------------------------------------
//
// Le tableau conserve trois lignes `~~…~~` + **RETIRÉE**, qui documentent des
// routes supprimées. Elles sont volontairement conservées : un audit qui oublie
// une suppression laisse croire que la route a toujours existé. Elles sont
// donc comptées comme RETIRÉES, jamais comme actives — sinon le compteur ment
// dans l'autre sens.
//
// ─────────────────────────────────────────────────────────────────────────────
// LE PIÈGE QUE CE FORMAT IMPLIQUE : UN PARSEUR QUI REND « AUCUN ÉCART »
// ─────────────────────────────────────────────────────────────────────────────
//
// Un test de cohérence se retourne contre lui-même plus facilement qu'un autre :
// si le parseur du document cesse de trouver les lignes (titre modifié, tableau
// reformaté), il rapporte « zéro ligne, zéro écart » et le test passe au VERT
// alors qu'il ne vérifie plus rien. C'est le défaut qui a permis au compteur
// faux de survivre.
//
// D'où S7 : le parseur est alimenté par un document de SYNTHÈSE, dont on connaît
// la réponse, et il doit détecter l'écart. Un parseur rendu muet échoue là.
// Les mutants S6 font l'autre moitié du travail : ils demonstrates que chaque
// contrôle reacts bien à la mutation qu'il prétend couvrir.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = process.cwd();
const CHEMIN_AUDIT = join(RACINE, "audit_bna_dashboard.md");

/**
 * Les trois routes retirées, et leur motif. Le test les exige : une ligne
 * retirée du tableau ne serait plus signalée par ce fichier.
 */
const RETIREES_ATTENDUES = [
  "/api/espace-client/[code_acces]/signer",
  "/api/devis/[id]/send-otp",
  "/api/devis/[id]/verify-otp",
];

/** Motif d'une ligne de tableau du document : | `route` | rôle | */
const MOTIF_LIGNE = /^\|\s*(~~\s*)?`([^`]+)`(\s*~~)?\s*\|(.*)$/;

/** Le compteur du bloc « Snapshot » : « … · **35** routes API (`app/api` + route.ts) ». */
const MOTIF_COMPTEUR = /\*\*(\d+)\*\*\s+routes API/;

type LigneRoute = {
  /** Le chemin d'API, sans les balises markdown. */
  route: string;
  /** `true` pour une ligne barrée ou marquée RETIRÉE. */
  retiree: boolean;
};

type Ecart = {
  /** Identifiant court, stable : c'est lui que les tests S6 comparent. */
  code: string;
  detail: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// L'ARBORESCENCE — SOURCE VÉRITABLE DU COMPTEUR
// ─────────────────────────────────────────────────────────────────────────────

function fichiersSous(dossier: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) sortie.push(...fichiersSous(chemin));
    else sortie.push(chemin);
  }
  return sortie;
}

/**
 * Les routes API RÉELLEMENT servies par l'App Router.
 *
 * Dans l'App Router, une route EST un fichier `route.ts` : il n'y a pas de
 * registre à maintenir, et rien d'autre ne crée un point d'entrée. Le compte
 * vient donc de l'arborescence `app/api` (fichiers `route.ts`), ce qui exclut par
 * construction tout fichier qui ne produit aucune route.
 */
function routesApiReelles(): string[] {
  return fichiersSous(join(RACINE, "app/api"))
    .filter((chemin) => chemin.replace(/\\/g, "/").endsWith("/route.ts"))
    .map((chemin) => {
      // `app/api/meteo/route.ts` -> `/api/meteo`. Le `app` de tête tombe, le
      // `/route.ts` de queue tombe : ce qui reste est déjà le chemin d'API, et
      // lui ajouter un `/` produirait `//api/meteo`, qui ne comparerait à rien.
      const relatif = relative(RACINE, chemin).replace(/\\/g, "/");
      return relatif.replace(/^app/, "").replace(/\/route\.ts$/, "");
    })
    .sort();
}

function audit(): string {
  return readFileSync(CHEMIN_AUDIT, "utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// LE DOCUMENT — SECTION « ROUTES API »
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Isole la section « ## … Routes API », du titre jusqu'au titre `##` suivant.
 *
 * La borne haute n'est pas un détail : `audit_bna_dashboard.md` contient
 * PLUSIEURS tableaux de routes (l'historique des décisions en mentionne
 * d'autres). Sans arrêt au titre suivant, une ligne d'une autre section
 * entrerait dans le compte et le document serait jugé cohérent à tort.
 */
function sectionRoutesApi(markdown: string): string {
  const lignes = markdown.split("\n");
  const debut = lignes.findIndex((ligne) => /^##\s+.*Routes API\s*$/.test(ligne));
  if (debut === -1) return "";
  let fin = lignes.length;
  for (let i = debut + 1; i < lignes.length; i++) {
    if (/^##\s/.test(lignes[i])) {
      fin = i;
      break;
    }
  }
  return lignes.slice(debut, fin).join("\n");
}

function lignesRoutes(section: string): LigneRoute[] {
  const sortie: LigneRoute[] = [];
  for (const ligne of section.split("\n")) {
    const trouve = MOTIF_LIGNE.exec(ligne);
    if (!trouve) continue;
    const [, avant, route, apres, role] = trouve;
    sortie.push({
      route,
      // Barré par `~~…~~`, OU explicitement marqué RETIRÉE dans la colonne de
      // rôle. Les deux marqueurs sont acceptés séparément : une ligne dont on
      // aurait retiré les tildes en oubliant le mot RETIRÉE resterait comptée
      // comme retirée, et l'invariant de S4 la signalera.
      retiree: avant !== undefined || apres !== undefined || role.includes("RETIRÉE"),
    });
  }
  return sortie;
}

/**
 * Les lignes de tableau qui MENTIONNENT une route, c'est-à-dire qui portent un
 * chemin entre chevrons inverses.
 *
 * La ligne d'en-tête (`| Route | Rôle |`) et le séparateur (`|---|---|`) ne
 * mentionnent aucune route : les exiger comme lignes de données ferait échouer le
 * contrôle de format sur le document réel lui-même. En revanche, une ligne qui
 * cite un chemin sans être analysable est une vraie dérive, et c'est
 * précisément ce que ce filtre attrape.
 */
function lignesDeDonnees(section: string): string[] {
  return section.split("\n").filter((ligne) => /^\s*\|/.test(ligne) && ligne.includes("`"));
}

function compteurAnnonce(markdown: string): number | null {
  const trouve = MOTIF_COMPTEUR.exec(markdown);
  return trouve ? Number(trouve[1]) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// L'INVARIANT — UN SEUL POINT DE VÉRIFICATION, RÉUTILISÉ PAR LES MUTANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare le document à l'arbre et retourne la liste des écarts. Vide = cohérent.
 *
 * Toute la logique de S1 passe par ici, et S6 la rejoue sur des documents
 * mutés. Un test quidupliquerait les règles dans ses assertions laisserait la
 * duplication sans garde : les mutants ne tomberaient que sur une copie.
 */
function ecartsSnapshot(markdown: string, reelles: string[]): Ecart[] {
  const ecarts: Ecart[] = [];

  const section = sectionRoutesApi(markdown);
  if (section === "") {
    return [{ code: "section-absente", detail: "aucune section « ## … Routes API » dans le document" }];
  }

  const lignes = lignesRoutes(section);
  const actives = lignes.filter((ligne) => !ligne.retiree).map((ligne) => ligne.route);
  const retirees = lignes.filter((ligne) => ligne.retiree).map((ligne) => ligne.route);

  // Une ligne de tableau qui cite une route mais que le parseur ne reconnaît pas
  // est un SILENCE, pas un accord : sans ce contrôle, une route reformatée
  // disparaît des deux côtés.
  const totalTableau = lignesDeDonnees(section).length;
  if (totalTableau !== lignes.length) {
    ecarts.push({
      code: "format-inconnu",
      detail: `${totalTableau} lignes citant une route, ${lignes.length} reconnues`,
    });
  }

  for (const route of lignes.map((ligne) => ligne.route)) {
    if (!route.startsWith("/api/")) {
      ecarts.push({ code: "prefixe-inattendu", detail: route });
    }
  }

  for (const route of actives) {
    const occurrences = actives.filter((autre) => autre === route).length;
    if (occurrences > 1) {
      ecarts.push({ code: "doublon", detail: `${route} listée ${occurrences} fois` });
    }
  }

  const annonce = compteurAnnonce(markdown);
  if (annonce === null) {
    ecarts.push({ code: "compteur-absent", detail: "aucun « **N** routes API » dans le document" });
  } else {
    // Deux contrôles distincts, volontairement : le premier est la cohérence
    // INTERNE du document, le second le confront à l'arbre. Les confondre
    // laisserait passer un document juste… sauf par construction, ce qui est
    // précisément la situation qu'on veut voir signalée.
    if (annonce !== actives.length) {
      ecarts.push({
        code: "compteur-incoherent",
        detail: `le document annonce ${annonce} routes, son tableau en liste ${actives.length}`,
      });
    }
    if (annonce !== reelles.length) {
      ecarts.push({
        code: "compteur-faux",
        detail: `le document annonce ${annonce} routes, l'arbre en contient ${reelles.length}`,
      });
    }
  }

  const setReelles = new Set(reelles);
  for (const route of actives) {
    if (!setReelles.has(route)) {
      ecarts.push({ code: "route-fantome", detail: `${route} est documentée mais absente de l'arbre` });
    }
  }

  const setActives = new Set(actives);
  for (const route of reelles) {
    if (!setActives.has(route)) {
      ecarts.push({ code: "route-non-documentee", detail: `${route} est servie mais absente du document` });
    }
  }

  for (const route of RETIREES_ATTENDUES) {
    if (!retirees.includes(route)) {
      ecarts.push({ code: "retiree-absente", detail: `${route} n'est plus marquée RETIRÉE` });
    }
    if (setReelles.has(route)) {
      ecarts.push({ code: "retiree-presente", detail: `${route} est de retour sur le disque` });
    }
  }
  for (const route of retirees) {
    if (!RETIREES_ATTENDUES.includes(route)) {
      ecarts.push({ code: "retiree-inattendue", detail: `${route} est marquée RETIRÉE sans être une route retirée connue` });
    }
  }

  return ecarts;
}

function codes(markdown: string, reelles: string[] = routesApiReelles()): string[] {
  return ecartsSnapshot(markdown, reelles).map((ecart) => ecart.code).sort();
}

const ARBRE = routesApiReelles();

describe("audit — snapshot des routes API", () => {
  it("S1 le document et l'arborescence ne présentent AUCUN écart", () => {
    const ecarts = ecartsSnapshot(audit(), ARBRE);
    expect(
      ecarts,
      `écarts entre audit_bna_dashboard.md et l'arbre :\n${ecarts.map((e) => `  • ${e.code} — ${e.detail}`).join("\n")}`
    ).toEqual([]);
  });

  it("S2 la correspondance est une BIJECTION entre le tableau et l'arbre", () => {
    const documentes = lignesRoutes(sectionRoutesApi(audit()))
      .filter((ligne) => !ligne.retiree)
      .map((ligne) => ligne.route)
      .sort();
    // Comparaison par listes triées entières : un diff lisible, plutôt qu'un
    // `toEqual` de deux ensembles dont l'échec ne dit pas ce qui manque.
    expect({ documentees: documentes.length, reelles: ARBRE.length }).toEqual({
      documentees: ARBRE.length,
      reelles: ARBRE.length,
    });
    expect(documentes).toEqual(ARBRE);
  });

  it("S3 le compteur du snapshot vaut bien 42", () => {
    // Valeur FIGÉE, alors que S1 ne la figerait pas. Raison : ajouter une route
    // légitime fait passer S1 au vert dès que le document est mis à jour — ce qui
    // est le comportement voulu. Cette assertion, elle, oblige à toucher aussi
    // le test : le compteur documenté devient une décision, pas une conséquence.
    expect(compteurAnnonce(audit())).toBe(42);
    expect(ARBRE.length).toBe(42);
  });

  it("S4 les trois routes retirées sont documentées comme telles, et absentes du disque", () => {
    const retirees = lignesRoutes(sectionRoutesApi(audit()))
      .filter((ligne) => ligne.retiree)
      .map((ligne) => ligne.route)
      .sort();
    expect(retirees).toEqual([...RETIREES_ATTENDUES].sort());
    for (const route of RETIREES_ATTENDUES) {
      expect(ARBRE, `${route} ne doit pas être servie`).not.toContain(route);
    }
  });

  it("S5 le document renvoie explicitement vers ce test", () => {
    // Exigence de TRAÇABILITÉ, pas de style : la correction du compteur doit
    // rester rattachée à ce qui la vérifie. Sans ce renvoi, la correction est un
    // simple chiffre modifié et rien n'indique qu'un contrôle existe.
    expect(audit()).toContain("__tests__/system/audit-snapshot-routes.test.ts");
  });

  it("S6 le parseur REFUSE un document incohérent (mutants réels sur le document)", () => {
    const reference = audit();
    const situations: Array<{ nom: string; mutant: string; codeAttendu: string }> = [
      {
        nom: "compteur remis à 43",
        mutant: reference.replace("**42** routes API", "**43** routes API"),
        codeAttendu: "compteur-faux",
      },
      {
        nom: "une route active retirée du tableau",
        mutant: reference.replace(/^\| `\/api\/finance-pin`.*\n/m, ""),
        codeAttendu: "route-non-documentee",
      },
      {
        nom: "une route fantôme ajoutée au tableau",
        mutant: reference.replace("| `/api/finance-pin`", "| `/api/route-inventee` | inventée |\n| `/api/finance-pin`"),
        codeAttendu: "route-fantome",
      },
      {
        // Les tildes SEULS ne font pas changer le compte : le mot RETIRÉE, lui,
        // marque déjà la ligne. Le mutant retire donc les DEUX marqueurs, sinon
        // il ne muterait rien et l'assertion d'échec passerait pour une preuve
        // de détection alors qu'elle n'a rien détecté.
        nom: "une ligne RETIRÉE redevenue active (tildes et motif retirés)",
        mutant: reference.replace(
          /^\| ~~(`\/api\/devis\/\[id\]\/send-otp`)~~ \| \*\*RETIRÉE\*\*.*\n/m,
          "| $1 | rétablie à tort |\n"
        ),
        codeAttendu: "compteur-incoherent",
      },
      {
        nom: "une route dupliquée",
        mutant: reference.replace("| `/api/finance-pin`", "| `/api/finance-pin` | doublon |\n| `/api/finance-pin`"),
        codeAttendu: "doublon",
      },
      {
        nom: "titre de la section renommé",
        mutant: reference.replace("## 🔌 Routes API", "## 🔌 Routes HTTP"),
        codeAttendu: "section-absente",
      },
      {
        nom: "tableau vidé de toutes ses lignes",
        mutant: reference.replace(/^\| .*`\/api\/.*\n/gm, ""),
        codeAttendu: "route-non-documentee",
      },
    ];

    // Garde-fou : chaque mutant doit être un VRAI changement. Sans cela, un
    // motif qui ne correspondrait plus au document produirait un mutant
    // identique à la référence, et l'assertion d'échec échouerait — ou pire,
    // passerait pour une preuve de détection alors qu'elle n'a rien détecté.
    for (const situation of situations) {
      expect(situation.mutant, `le mutant « ${situation.nom} » n'a rien modifié`).not.toBe(reference);
      expect(
        codes(situation.mutant),
        `le mutant « ${situation.nom} » aurait dû être détecté par « ${situation.codeAttendu} »`
      ).toContain(situation.codeAttendu);
    }

    // Et la référence, elle, ne doit produire aucun écart : c'est ce qui
    // distingue « le mutant est détecté » de « tout est détecté ».
    expect(codes(reference)).toEqual([]);
  });

  it("S7 le parseur détecte l'incohérence d'un document de SYNTHÈSE", () => {
    // Le test qui empêche ce fichier de tourner à vide. Un parseur devenu muet
    // (titre modifié, tableau reformaté) rapporte « zéro ligne, zéro écart » sur
    // le document réel : S1, S2, S3 et S5 resteraient verts. Ici, la réponse est
    // connue à l'avance, donc un parseur qui ne la retrouve pas échoue.
    //
    // Le document de synthèse reprend la STRUCTURE réelle — ligne d'en-tête,
    // séparateur, lignes barrées, seconde section piège — pour que le test
    // mesure la détection d'écart et non un écart de format.
    const synthese = [
      "## 📸 Routes API",
      "",
      "| Route | Rôle |",
      "|---|---|",
      "| `/api/une-route` | rôle |",
      "Le compteur du snapshot annonce **1** routes API.",
      "| ~~`/api/espace-client/[code_acces]/signer`~~ | **RETIRÉE** — a |",
      "| ~~`/api/devis/[id]/send-otp`~~ | **RETIRÉE** — b |",
      "| ~~`/api/devis/[id]/verify-otp`~~ | **RETIRÉE** — c |",
      "",
      "## 📸 Autre section",
      "",
      "| Route | Rôle |",
      "|---|---|",
      "| `/api/dans-autre-section` | ne doit pas compter |",
    ].join("\n");

    // Le seul écart annoncé — un compteur de 2 pour une seule route active —
    // est détecté, et rien d'autre ne se dérobe.
    expect(codes(synthese.replace("**1** routes", "**2** routes"), ["/api/une-route"])).toEqual([
      "compteur-faux",
      "compteur-incoherent",
    ]);

    // Corrigé, le même document ne produit AUCUN écart : c'est ce qui distingue
    // « le mutant est détecté » de « tout est signalé ».
    expect(codes(synthese, ["/api/une-route"])).toEqual([]);

    // Une route réelle absente du document est détectée, elle aussi. Les DEUX
    // contrôles partent ensemble : l'arbre déclare 2 routes là où le compteur
    // en annonce 1, et `/api/invisible` n'est pas documentée. Aucun des deux
    // n'est un effet de bord de l'autre.
    expect(codes(synthese, ["/api/une-route", "/api/invisible"])).toEqual([
      "compteur-faux",
      "route-non-documentee",
    ]);

    // La borne haute de la section fonctionne : la ligne de la section suivante
    // n'entre ni dans le compte ni dans la liste des lignes reconnues.
    expect(lignesRoutes(sectionRoutesApi(synthese)).map((ligne) => [ligne.route, ligne.retiree])).toEqual([
      ["/api/une-route", false],
      ["/api/espace-client/[code_acces]/signer", true],
      ["/api/devis/[id]/send-otp", true],
      ["/api/devis/[id]/verify-otp", true],
    ]);

    // Une ligne dont on a retiré les tildes mais gardé le mot RETIRÉE reste
    // comptée comme retirée : les deux marqueurs sont redondants par choix.
    const sansTildes = synthese.replace(
      "| ~~`/api/devis/[id]/send-otp`~~ | **RETIRÉE** — b |",
      "| `/api/devis/[id]/send-otp` | **RETIRÉE** — b |"
    );
    expect(lignesRoutes(sectionRoutesApi(sansTildes)).map((ligne) => [ligne.route, ligne.retiree])).toContainEqual([
      "/api/devis/[id]/send-otp",
      true,
    ]);

    // Un document sans la section du tout est signalé comme tel, jamais comme
    // « cohérent parce qu'aucune ligne n'a été trouvée ».
    expect(codes("# Audit\n\n## Autre section\n\n| `/api/x` | rôle |\n", ["/api/x"])).toEqual([
      "section-absente",
    ]);
  });
});