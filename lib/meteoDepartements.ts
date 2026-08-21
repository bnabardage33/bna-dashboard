// lib/meteoDepartements.ts
// Résolution robuste d'adresse et de ville vers le numéro de département français (01-95, 2A, 2B, 971-976).

const VILLES_CORRESPONDANCE: Record<string, string> = {
  // Corse du Sud (2A)
  ajaccio: "2A",
  "porto-vecchio": "2A",
  portovecchio: "2A",
  propriano: "2A",
  sartene: "2A",
  bonifacio: "2A",
  alata: "2A",
  afa: "2A",
  bastelicaccia: "2A",
  grossetoprugna: "2A",
  "grosseto-prugna": "2A",
  porticcio: "2A",
  zonza: "2A",
  cargese: "2A",
  pianottoli: "2A",
  "corse-du-sud": "2A",
  "corse du sud": "2A",

  // Haute Corse (2B)
  bastia: "2B",
  calvi: "2B",
  corte: "2B",
  "ile-rousse": "2B",
  ilerousse: "2B",
  "l'ile-rousse": "2B",
  borgo: "2B",
  lucciana: "2B",
  biguglia: "2B",
  furiani: "2B",
  ghisonaccia: "2B",
  "saint-florent": "2B",
  saintflorent: "2B",
  moriani: "2B",
  "haute-corse": "2B",
  "haute corse": "2B",

  // Nouvelle-Aquitaine & Régions principales
  bordeaux: "33",
  merignac: "33",
  pessac: "33",
  talence: "33",
  villenave: "33",
  begles: "33",
  libourne: "33",
  arcachon: "33",
  "la-teste": "33",
  cenon: "33",
  gironde: "33",
  pau: "64",
  bayonne: "64",
  anglet: "64",
  biarritz: "64",
  montdemarsan: "40",
  "mont-de-marsan": "40",
  dax: "40",
  perigueux: "24",
  bergerac: "24",
  agen: "47",
  villeneuve: "47",
  larochelle: "17",
  "la rochelle": "17",
  saintes: "17",
  rochefort: "17",
  angouleme: "16",
  cognac: "16",
  poitiers: "86",
  chatellerault: "86",
  niort: "79",
  bressuire: "79",
  limoges: "87",
  brive: "19",
  tulle: "19",
  gueret: "23",

  // Grandes métropoles nationales
  paris: "75",
  marseille: "13",
  lyon: "69",
  toulouse: "31",
  nice: "06",
  nantes: "44",
  strasbourg: "67",
  montpellier: "34",
  lille: "59",
  rennes: "35",
  reims: "51",
  saintetienne: "42",
  "saint-etienne": "42",
  toulon: "83",
  lehavre: "76",
  "le havre": "76",
  grenoble: "38",
  dijon: "21",
  angers: "49",
  nimes: "30",
  villeurbanne: "69",
  clermontferrand: "63",
  "clermont-ferrand": "63",
  lemans: "72",
  "le mans": "72",
  aixenprovence: "13",
  "aix-en-provence": "13",
  brest: "29",
  tours: "37",
  amiens: "80",
  annecy: "74",
  perpignan: "66",
  boulogne: "92",
  metz: "57",
  besancon: "25",
  orleans: "45",
  mulhouse: "68",
  rouen: "76",
  caen: "14",
  nancy: "54",
  avignon: "84",
  beziers: "34",
  bourges: "18",
  cannes: "06",
  antibes: "06",
  calais: "62",
  dunkerque: "59",
};

/**
 * Nettoie une chaîne de texte pour comparaison insensible aux accents et caractères spéciaux.
 */
function normaliser(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’\-_]/g, " ")
    .trim();
}

/**
 * Détermine le département français (2A, 2B, 01-95, 971-976) à partir d'une adresse ou d'un nom de ville.
 */
export function adresseVersDepartement(adresse: string | null | undefined): string | null {
  if (!adresse || typeof adresse !== "string") return null;

  const raw = adresse.trim();
  if (!raw) return null;

  // 1. Recherche d'un code postal français à 5 chiffres (ex: 20000, 33000, 75001)
  const matchCP = raw.match(/\b(\d{5})\b/);
  if (matchCP) {
    const cp = matchCP[1];
    if (cp.startsWith("97")) return cp.slice(0, 3); // DOM-TOM
    if (cp.startsWith("20")) {
      // Corse : 20000 - 20190 -> 2A (Corse du Sud), 20200 - 20620 -> 2B (Haute Corse)
      const valNum = parseInt(cp, 10);
      return valNum <= 20190 ? "2A" : "2B";
    }
    return cp.slice(0, 2);
  }

  // 2. Recherche d'un code département explicite (ex: "2A", "2B", "33", "75")
  const matchDept = raw.match(/\b(2A|2B|2a|2b|\d{2})\b/i);
  if (matchDept) {
    return matchDept[1].toUpperCase();
  }

  // 3. Recherche dans le dictionnaire des villes et localités françaises
  const normalizedAdresse = normaliser(raw);
  const mots = normalizedAdresse.split(/[\s,;.-]+/).filter((m) => m.length >= 3);

  // Recherche par mot exact
  for (const mot of mots) {
    if (VILLES_CORRESPONDANCE[mot]) {
      return VILLES_CORRESPONDANCE[mot];
    }
  }

  // Recherche par sous-chaîne
  for (const [ville, dept] of Object.entries(VILLES_CORRESPONDANCE)) {
    if (normalizedAdresse.includes(ville)) {
      return dept;
    }
  }

  return null;
}
