export type PilierMetierBna = "bardage" | "terrasse" | "cloture";

export interface EntreeDictionnaireMetier {
  id: string;
  pilier: PilierMetierBna;
  termePrincipal: string;
  normeReference: string;
  synonymes: string[];
  phonetiquesWhisper: string[];
  reglesObligatoires: string[];
  interditsDtu: string[];
}

export const DICTIONNAIRE_METIER_BNA: EntreeDictionnaireMetier[] = [
  {
    id: "hpl_compact",
    pilier: "bardage",
    termePrincipal: "Bardage HPL Compact (Trespa / Fundermax / Polyrey)",
    normeReference: "Cahier CSTB 3194 / 3316 & NF DTU 45.4",
    synonymes: ["hpl", "trespa", "fundermax", "polyrey", "compact", "stratifie"],
    phonetiquesWhisper: ["très pas", "tres pas", "trépa", "funder max", "fondermax", "h p l"],
    reglesObligatoires: [
      "Plaques mères HPL standard 3,05 × 1,30 m (3,965 m²).",
      "Fixation obligatoire par 1 point fixe central (Ø5,1 mm) + points glissants/coulissants (Ø8 mm) pour absorber la dilatation.",
      "Entraxe ossature ≤ 600 mm avec lame d'air ventilée ≥ 20 mm.",
    ],
    interditsDtu: [
      "INTERDIT : utiliser des vis bois standard sans jeu de dilatation.",
      "INTERDIT : collage silicone PU direct sans système agréé CSTB.",
    ],
  },
  {
    id: "ite_couches",
    pilier: "bardage",
    termePrincipal: "ITE 1 / ITE 2 (Isolation Thermique par l'Extérieur)",
    normeReference: "NF DTU 41.2 & Cahier CSTB 3194",
    synonymes: ["ite", "ite 1", "ite 2", "isolant", "isolation", "laine de roche", "laine de verre", "double couche"],
    phonetiquesWhisper: ["i t e", "ite deux", "ite un", "isole co", "isolko", "epdm"],
    reglesObligatoires: [
      "ITE 1 (simple couche) ou ITE 2 (double couche croisée, pertes +8 % sur chaque couche).",
      "Équerres Isolco (1 porteuse point fixe en tête + guides coulissants), entraxe chevrons 60×40 ≤ 600 mm.",
      "Chevilles rosaces isolant (5 à 6/m²), bande EPDM sur 100 % des chevrons, lame d'air ventilée ≥ 20 mm.",
    ],
    interditsDtu: [
      "INTERDIT : poser les chevrons sans bande EPDM de protection.",
      "INTERDIT : obstruer la lame d'air ventilée en pied ou en tête de bardage.",
    ],
  },
  {
    id: "habillage_ouvertures",
    pilier: "bardage",
    termePrincipal: "Habillage des ouvertures & profilés alu",
    normeReference: "NF DTU 41.2 / CSTB 3194 (débit barres 3,00 m)",
    synonymes: ["ouverture", "fenetre", "fenêtre", "baie", "porte", "bavette", "tableau", "linteau", "profile", "profilé"],
    phonetiquesWhisper: ["bavete", "lin taux", "linto", "tablo"],
    reglesObligatoires: [
      "Bavette d'appui alu laquée : longueur = L + 60 mm (relevés latéraux étanches, pente ≥ 5°).",
      "Tableaux latéraux : 2 × H (un à gauche, un à droite).",
      "Linteau goutte d'eau : longueur = L + 40 mm.",
      "Débit optimisé 1D sur barres de 3,00 m.",
    ],
    interditsDtu: [
      "INTERDIT : poser une bavette sans débord (+60 mm) ni rejingot/relevé latéral.",
    ],
  },
  {
    id: "claire_voie",
    pilier: "bardage",
    termePrincipal: "Bardage Claire-voie",
    normeReference: "NF DTU 41.2",
    synonymes: ["claire-voie", "claire voie", "ajoure", "ajouré"],
    phonetiquesWhisper: ["clair voie", "claire voi"],
    reglesObligatoires: [
      "Pare-pluie résistant aux UV (noir anti-UV) obligatoire derrière les lames ajourées.",
      "Espacement régulier entre lames (10 à 15 mm), visserie inox A2/A4 (noire recommandée).",
      "Tasseaux traités classe 3/4 avec bande de protection UV.",
    ],
    interditsDtu: [
      "INTERDIT : utiliser un pare-pluie standard non certifié anti-UV en pose claire-voie.",
    ],
  },
  {
    id: "clin_bois_composite",
    pilier: "bardage",
    termePrincipal: "Clin bois naturel / Composite",
    normeReference: "NF DTU 41.2",
    synonymes: ["clin", "bois", "douglas", "meleze", "mélèze", "red cedar", "composite"],
    phonetiquesWhisper: ["clain", "dou glass", "mélaise"],
    reglesObligatoires: [
      "Lame d'air ventilée ≥ 20 mm avec grille anti-rongeurs en pied de façade (garde au sol ≥ 20 cm).",
      "Fixation par pointes crantées ou vis inox A2/A4 ; respect du jeu de dilatation en bout de lame.",
    ],
    interditsDtu: [
      "INTERDIT : poser du bardage bois à moins de 20 cm du sol fini sans protection adaptée.",
    ],
  },
  {
    id: "terrasse_dtu_51_4",
    pilier: "terrasse",
    termePrincipal: "Terrasse bois / composite sur plots ou lambourdes",
    normeReference: "NF DTU 51.4",
    synonymes: ["terrasse", "platelage", "plot", "plots", "lambourde", "lambourdes", "lame", "exotique", "pin"],
    phonetiquesWhisper: ["dtu 51 4", "51 4", "lam bourde", "a boutage", "abouttage"],
    reglesObligatoires: [
      "Plots réglables avec entraxe conforme (≤ 50-60 cm selon portée), calage stable.",
      "Double lambourdage obligatoire aux aboutages de lames (jamais deux bouts de lames sur une seule lambourde).",
      "Jeu de dilatation périphérique et entre lames de 5 mm ; bande bitumineuse/EPDM sur lambourdes bois.",
      "Visserie inox A2 (ou A4 en milieu salin/piscine) ou clips invisibles homologués.",
    ],
    interditsDtu: [
      "INTERDIT : abouter deux lames sur une seule lambourde sans double lambourdage.",
      "INTERDIT : utiliser de la visserie acier zingué en extérieur.",
    ],
  },
  {
    id: "terrasse_mobile_p90_308",
    pilier: "terrasse",
    termePrincipal: "Terrasse Mobile / Coulissante de Piscine",
    normeReference: "NF P90-308 & NF DTU 51.4",
    synonymes: ["terrasse mobile", "coulissante", "piscine", "motorisee", "motorisée", "rail", "galet", "chassis", "châssis"],
    phonetiquesWhisper: ["p 90 308", "p90308", "nf p 90 308", "rail inox", "m o t"],
    reglesObligatoires: [
      "Châssis porteur aluminium 80×40 (ou 100×50 selon portée) calculé pour 2,5 kN/m² (NF P90-308).",
      "Rails extra-plats inox 316L, galets doubles, jupe périphérique anti-coincement et verrouillage de sécurité.",
      "Motorisation solaire 24V TBTS ou filaire gamme MOT-01 à MOT-05.",
    ],
    interditsDtu: [
      "INTERDIT : livrer une terrasse mobile de piscine sans dispositif de verrouillage conforme NF P90-308.",
      "INTERDIT : utiliser de l'inox A2 pour les rails en bord de bassin traité chlore/sel (inox 316L / A4 requis).",
    ],
  },
  {
    id: "cloture_poteaux",
    pilier: "cloture",
    termePrincipal: "Clôture Poteaux Alu / Bois",
    normeReference: "Règles pro Clôtures & NF EN 12600 / vents",
    synonymes: ["cloture", "clôture", "palissade", "poteau", "poteaux", "travee", "travée"],
    phonetiquesWhisper: ["clotur", "potaux", "poto"],
    reglesObligatoires: [
      "Scellement béton 35 kg/poteau (profondeur hors-gel ≈ 500 mm) ou platines goujonnées sur muret sain.",
      "Entraxe poteaux calepiné sur la longueur utile des lames/panneaux (standard 1,80 m).",
    ],
    interditsDtu: [
      "INTERDIT : poser sur platine des clôtures pleines > 1,50 m en zone exposée au vent sans validation structurelle.",
    ],
  },
  {
    id: "cloture_soubassement",
    pilier: "cloture",
    termePrincipal: "Soubassement béton",
    normeReference: "Règles pro Clôtures",
    synonymes: ["soubassement", "plaque beton", "plaque béton", "muret"],
    phonetiquesWhisper: ["sou base ment", "soubasment"],
    reglesObligatoires: [
      "Plaques de soubassement béton de 250 mm ou 500 mm insérées dans les feuillures de poteaux.",
      "Protège les lames bois/composite du contact direct avec la terre et l'humidité.",
    ],
    interditsDtu: [
      "INTERDIT : enterrer des lames bois ou composite directement au contact de la terre végétale.",
    ],
  },
  {
    id: "cloture_redans_pente",
    pilier: "cloture",
    termePrincipal: "Redans / terrain en pente",
    normeReference: "Règles pro Clôtures",
    synonymes: ["redan", "redans", "pente", "escalier", "denivele", "dénivelé"],
    phonetiquesWhisper: ["re dans", "redant"],
    reglesObligatoires: [
      "Pose en escalier (redans) avec poteaux adaptés à la hauteur cumulée au droit du décroché.",
    ],
    interditsDtu: [
      "INTERDIT : forcer des lames rigides alu/composite en biais sans découpe ou jeu de feuillure.",
    ],
  },
  {
    id: "cloture_portillon",
    pilier: "cloture",
    termePrincipal: "Portillon intégré",
    normeReference: "Règles pro Clôtures",
    synonymes: ["portillon", "gache", "gâche", "serrure", "acces", "accès"],
    phonetiquesWhisper: ["portillion", "portiyon"],
    reglesObligatoires: [
      "Poteaux renforcés côté gonds et côté gâche, seuil libre et jeu fonctionnel de 10-15 mm.",
    ],
    interditsDtu: [
      "INTERDIT : fixer un portillon sur un poteau intermédiaire standard non renforcé.",
    ],
  },
];

const CORRECTIONS_PHONETIQUES_CHANTIER: Array<{
  pattern: RegExp;
  remplacement: string;
  label: string;
}> = [
  { pattern: /\b(?:tr[èe]s\s*pas|tr[ée]pa)\b/gi, remplacement: "HPL Trespa", label: "très pas -> HPL Trespa" },
  { pattern: /\b(?:funder\s*max|fondermax)\b/gi, remplacement: "HPL Fundermax", label: "fondermax -> HPL Fundermax" },
  { pattern: /\bh\s*p\s*l\b/gi, remplacement: "HPL", label: "h p l -> HPL" },
  { pattern: /\bi\s*t\s*e\s*(?:2|deux)\b/gi, remplacement: "ITE 2", label: "i t e 2 -> ITE 2" },
  { pattern: /\bi\s*t\s*e\s*(?:1|un)\b/gi, remplacement: "ITE 1", label: "i t e 1 -> ITE 1" },
  { pattern: /\bi\s*t\s*e\b/gi, remplacement: "ITE", label: "i t e -> ITE" },
  { pattern: /\b(?:isole\s*co|isol\s*co|isolko)\b/gi, remplacement: "Isolco", label: "isolko -> Isolco" },
  { pattern: /\be\s*p\s*d\s*m\b/gi, remplacement: "EPDM", label: "e p d m -> EPDM" },
  { pattern: /\bbavete\b/gi, remplacement: "bavette", label: "bavete -> bavette" },
  { pattern: /\b(?:lin\s*taux|linto)\b/gi, remplacement: "linteau", label: "linto -> linteau" },
  { pattern: /\b(?:clair\s*voie|claire\s*voi)\b/gi, remplacement: "claire-voie", label: "clair voie -> claire-voie" },
  { pattern: /\blam\s*bourde(s?)\b/gi, remplacement: "lambourde$1", label: "lam bourde -> lambourde" },
  { pattern: /\b(?:a\s*boutage|abouttage)\b/gi, remplacement: "aboutage", label: "abouttage -> aboutage" },
  { pattern: /\b(?:nf\s*)?p\s*90\s*308\b/gi, remplacement: "NF P90-308", label: "p 90 308 -> NF P90-308" },
  { pattern: /\b(?:nf\s*)?dtu\s*51\s*4\b/gi, remplacement: "NF DTU 51.4", label: "dtu 51 4 -> NF DTU 51.4" },
  { pattern: /\b(?:nf\s*)?dtu\s*41\s*2\b/gi, remplacement: "NF DTU 41.2", label: "dtu 41 2 -> NF DTU 41.2" },
  { pattern: /\b(?:sou\s*base\s*ment|soubasment)\b/gi, remplacement: "soubassement", label: "soubasment -> soubassement" },
  { pattern: /\b(?:re\s*dans|redant)\b/gi, remplacement: "redans", label: "redant -> redans" },
  { pattern: /\b(?:portillion|portiyon)\b/gi, remplacement: "portillon", label: "portillion -> portillon" },
  { pattern: /(\d+(?:[.,]\d+)?)\s+par\s+(\d+(?:[.,]\d+)?)/gi, remplacement: "$1x$2", label: "N par M -> NxM" },
];

export interface ResultatNormalisationMetier {
  texteOriginal: string;
  texteNormalise: string;
  correctionsAppliquees: string[];
  entreesPertinentes: EntreeDictionnaireMetier[];
  contexteDictionnairePrompt: string;
}

function normaliserPourRecherche(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Traduit les abréviations chantier / phonétiques Whisper en termes techniques précis
 * et extrait les fiches du Dictionnaire Métier BNA pertinentes pour le prompt LLM.
 */
export function normaliserRequeteMetier(texte: string): ResultatNormalisationMetier {
  let texteNormalise = texte;
  const correctionsAppliquees: string[] = [];

  for (const corr of CORRECTIONS_PHONETIQUES_CHANTIER) {
    if (corr.pattern.test(texteNormalise)) {
      texteNormalise = texteNormalise.replace(corr.pattern, corr.remplacement);
      correctionsAppliquees.push(corr.label);
    }
  }

  const normRecherche = normaliserPourRecherche(texteNormalise);
  const normOrigine = normaliserPourRecherche(texte);

  const entreesPertinentes = DICTIONNAIRE_METIER_BNA.filter((entree) => {
    const motsCles = [...entree.synonymes, ...entree.phonetiquesWhisper];
    return motsCles.some((kw) => {
      const kwNorm = normaliserPourRecherche(kw);
      return normRecherche.includes(kwNorm) || normOrigine.includes(kwNorm);
    });
  });

  const contexteDictionnairePrompt =
    entreesPertinentes.length === 0
      ? ""
      : `DICTIONNAIRE MÉTIER BNA (RÈGLES OBLIGATOIRES & INTERDITS DTU) :\n` +
        entreesPertinentes
          .map(
            (e) =>
              `• [${e.pilier.toUpperCase()}] ${e.termePrincipal} (${e.normeReference})\n` +
              `  Règles : ${e.reglesObligatoires.join(" ")}\n` +
              `  Interdits : ${e.interditsDtu.join(" ")}`
          )
          .join("\n");

  return {
    texteOriginal: texte,
    texteNormalise,
    correctionsAppliquees,
    entreesPertinentes,
    contexteDictionnairePrompt,
  };
}
