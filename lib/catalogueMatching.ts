// Moteur de correspondance catalogue — IA Devis.
// Bibliothèque PURE (aucune dépendance) : normalisation, appariement lexical
// robuste (accents, casse, pluriels, typos), et base des scores d'arbitrage.
//
// Charte :
//  - AUCUNE correspondance ni synonyme spécifique à un cas de test ou à une
//    désignation connue. Uniquement du traitement linguistique générique.
//  - Le catalogue reste la SOURCE DE VÉRITÉ : ce moteur ne fait que désigner
//    la référence la plus plausible ; les prix/unités/revient sont pris au
//    catalogue, jamais inventés.
//  - « À CHIFFRER » ne relève PAS de ce moteur : il est décidé en amont/aval
//    (arbitrage sémantique puis vérification des quantités).

export type ItemCatalogue = {
  id: string;
  designation: string;
  description: string | null;
  famille_label: string;
  unite: string;
  type_cout: string;
};

export type MotApparie = {
  mot: string;
  trouve: string;
  type: "exact" | "pluriel" | "typo";
};

export type ScoreCatalogue = {
  score: number;
  appariements: MotApparie[];
};

export type Correspondance = {
  item: ItemCatalogue;
  score: number;
  justification: string;
};

const MOTS_VIDES = new Set([
  "de", "du", "des", "le", "la", "les", "un", "une", "sur", "pour", "avec",
  "en", "et", "ou", "au", "aux", "d", "a", "ce", "ces", "se", "sa", "son",
  "que", "qui", "dans", "par",
]);

/** Normalisation centrale : minuscules, accents supprimés, exposants unifiés, ponctuation → espaces. */
export function normaliser(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[²]/g, "2")
    .replace(/[³]/g, "3")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

/** Racine morphologique minimale (pluriels / marques) — suffisant et prévisible. */
export function racine(mot: string): string {
  if (mot.endsWith("aux") && mot.length > 4) return mot.slice(0, -3) + "au";
  if (mot.endsWith("s") && mot.length > 3) return mot.slice(0, -1);
  return mot;
}

export function tokensConcept(concept: string): string[] {
  return normaliser(concept)
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !MOTS_VIDES.has(w));
}

export function tokensItem(item: ItemCatalogue): string[] {
  const source = [
    item.designation,
    item.description || "",
    item.famille_label || "",
    item.type_cout === "main_oeuvre" ? "pose" : "",
  ].join(" ");
  return normaliser(source)
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !MOTS_VIDES.has(w));
}

function distanceLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cout);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Distance de Levenshtein par acclimatation min/max — bridge vers la version publique. */
export function distance(a: string, b: string): number {
  return distanceLevenshtein(a, b);
}

/** Score lexical : proportion des mots du concept retrouvés (exact / pluriel / typo). */
export function scoreConceptVsItem(concept: string, item: ItemCatalogue): ScoreCatalogue {
  const mots = tokensConcept(concept);
  if (mots.length === 0) return { score: 0, appariements: [] };

  const elems = tokensItem(item);
  const utilises = new Set<string>();
  const appariements: MotApparie[] = [];

  for (const mot of mots) {
    const exact = elems.find((t) => !utilises.has(t) && t === mot);
    if (exact) {
      utilises.add(exact);
      appariements.push({ mot, trouve: exact, type: "exact" });
      continue;
    }
    const r = racine(mot);
    const pluriel = elems.find((t) => !utilises.has(t) && racine(t) === r);
    if (pluriel) {
      utilises.add(pluriel);
      appariements.push({ mot, trouve: pluriel, type: "pluriel" });
      continue;
    }
    const typo = elems.find(
      (t) =>
        !utilises.has(t) &&
        Math.min(t.length, mot.length) >= 4 &&
        distanceLevenshtein(t, mot) <= 1
    );
    if (typo) {
      utilises.add(typo);
      appariements.push({ mot, trouve: typo, type: "typo" });
      continue;
    }
  }

  // Bonus famille : un mot du concept recouvre la catégorie du catalogue.
  const famTokens = normaliser(item.famille_label || "")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const famHit = mots.some((m) => famTokens.some((f) => f === m || racine(f) === racine(m)));

  const score = Math.min(1, appariements.length / Math.max(1, mots.length) + (famHit ? 0.1 : 0));
  return { score, appariements };
}

/** Seuil : exige une majorité nette des mots du concept ; en deçà → arbitrage sémantique. */
export const SEUIL_CORRESPONDANCE = 0.55;

/** Retourne la meilleure référence catalogue pour un concept, ou null pour arbitrage. */
export function meilleureCorrespondance(
  concept: string,
  items: ItemCatalogue[]
): Correspondance | null {
  let meilleure: Correspondance | null = null;
  let meilleurNbAppariements = -1;
  let ambiguite = false;

  for (const item of items) {
    const { score, appariements } = scoreConceptVsItem(concept, item);
    if (score < SEUIL_CORRESPONDANCE) continue;

    // Détection d'un vrai ex aequo sur les critères de classement
    if (
      meilleure !== null &&
      score === meilleure.score &&
      appariements.length === meilleurNbAppariements
    ) {
      ambiguite = true;
      continue;
    }

    const mieuxScore =
      meilleure === null ||
      score > meilleure.score ||
      (score === meilleure.score && appariements.length > meilleurNbAppariements);
      
    if (mieuxScore) {
      meilleure = {
        item,
        score,
        justification: appariements
          .map((a) => `« ${a.mot} » ↔ « ${a.trouve} » (${a.type})`)
          .join(" · "),
      };
      meilleurNbAppariements = appariements.length;
      ambiguite = false; // On a trouvé un meilleur score incontestable
    }
  }

  // Faille 2 corrigée : S'il reste une ambiguïté stricte, on rejette (forçage "À CHIFFRER")
  if (ambiguite) return null;
  return meilleure;
}