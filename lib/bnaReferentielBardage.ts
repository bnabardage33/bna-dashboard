/**
 * Référentiel normatif exhaustif Bardage multi-familles :
 * - Bois massif (NF DTU 41.2 Juillet 2015)
 * - Panneaux HPL (NF DTU 45.4 Octobre 2020 + Cahier CSTB 3799_V2 + DTA Trespa / Fundermax)
 * - Fibrociment (NF EN 12467 — Cedral Lap / Click, Equitone Tectiva / Natura / Pictura)
 * - Composite WPC (Exclu DTU 41.2 -> DTA / Fabricants Silvadec, Fiberdeck WEO 35/60, NewTechWood, Neowood)
 */

export type FamilleBardageRefKey = "bois" | "hpl" | "fibrociment" | "composite";

export interface FamilleBardageRegles {
  key: FamilleBardageRefKey;
  nom: string;
  normesReference: string;
  reglesObligatoires: string[];
  interdits: string[];
}

export const BARDAGE_BOIS_DTU_41_2: FamilleBardageRegles = {
  key: "bois",
  nom: "Bardage Bois Massif",
  normesReference: "NF DTU 41.2 (Juillet 2015)",
  reglesObligatoires: [
    "Garde au sol minimale : >= 150 mm sur sol dur (béton/terrasse) et >= 200 mm sur terrain naturel.",
    "Lame d'air ventilée continue >= 20 mm avec grille anti-rongeurs >= 50 cm²/ml en pied et en tête.",
    "Pose verticale : double tasseautage croisé obligatoire avec liteaux horizontaux délardés >= 15° pour évacuation d'eau.",
    "Claire-voie : pare-pluie anti-UV 5000h noir obligatoire + bande EPDM sur liteaux.",
    "Fixations : Inox A4 obligatoire à <= 3 km du littoral (Bassin d'Arcachon / côte girondine) et sur bois tanniques (Red Cedar, Chêne, Châtaignier) ; 2 fixations par appui si largeur utile > 125 mm.",
  ],
  interdits: [
    "INTERDIT : poser du bardage bois à moins de 150 mm d'un sol dur ou 200 mm d'un terrain naturel.",
    "INTERDIT : poser en vertical sur simple tasseau vertical sans double tasseautage croisé ventilé.",
  ],
};

export const BARDAGE_HPL_DTU_45_4: FamilleBardageRegles = {
  key: "hpl",
  nom: "Panneaux HPL Compact (Trespa Meteon / Fundermax Max Exterior)",
  normesReference: "NF DTU 45.4 (Octobre 2020) + Cahier CSTB 3799_V2 + DTA",
  reglesObligatoires: [
    "Formats commerciaux Trespa Meteon : 3050×1530, 2550×1860, 3650×1860, 4270×2130 mm.",
    "Formats commerciaux Fundermax Max Exterior : 2800×1300, 4100×1300, 2800×1854, 4100×1854 mm.",
    "Joints ouverts périphériques : 8 à 10 mm ; règle anti-micro-rives : éviter les bandes < 250 mm.",
    "Perçage obligatoire : 1 Point Fixe (PF) Ø 5,0 mm au centre du panneau + Points Coulissants (PC) Ø 8,0 mm sur tous les autres appuis.",
    "Bande EPDM : largeur 70 mm sur chevron courant, 100 mm sur chevron de jonction (>= 75-90 mm ou double chevron 2×45 mm).",
  ],
  interdits: [
    "INTERDIT : utiliser des vis bois standard sans jeu de dilatation.",
    "INTERDIT : collage silicone PU direct sans système agréé CSTB / DTA.",
  ],
};

export const BARDAGE_FIBROCIMENT_EN_12467: FamilleBardageRegles = {
  key: "fibrociment",
  nom: "Bardage Fibrociment (Cedral & Equitone)",
  normesReference: "NF EN 12467 & DTA Fabricants",
  reglesObligatoires: [
    "Clins Cedral Lap : 190×3600×10 mm, recouvrement minimal >= 30 mm, pureau utile 160 mm.",
    "Clins Cedral Click : pose bord à bord par clips inox dédiés.",
    "Plaques Equitone (Tectiva / Natura / Pictura) : épaisseur 8 ou 12 mm, formats 1220/1250 × 2500/3050 mm.",
    "Perçage Equitone : Point Fixe (PF) Ø 5,5 mm + Points Coulissants (PC) Ø 11,0 mm avec manchon de centrage.",
    "Distances Equitone : bord haut/bas >= 70-80 mm ; chevron de jonction >= 95-100 mm.",
  ],
  interdits: [
    "INTERDIT : percer les plaques Equitone sans manchon sur les points coulissants Ø 11,0 mm.",
    "INTERDIT : recouvrement < 30 mm sur Cedral Lap.",
  ],
};

export const BARDAGE_COMPOSITE_WPC: FamilleBardageRegles = {
  key: "composite",
  nom: "Bardage Composite WPC (Silvadec, Fiberdeck WEO 35/60, NewTechWood, Neowood)",
  normesReference: "Exclu NF DTU 41.2 -> DTA / Prescriptions Fabricants",
  reglesObligatoires: [
    "Entraxe ossature : 400 à 600 mm selon profil et zone de vent.",
    "Dilatation thermique longitudinale : jeu en bout obligatoire de 5 à 8 mm.",
    "Double liteau obligatoire aux aboutages de lames.",
    "1 vis de Point Fixe obligatoire au milieu de chaque lame (trous oblongs sur tous les autres appuis).",
  ],
  interdits: [
    "INTERDIT : bloquer les lames aux extrémités sans point fixe central ni trous oblongs.",
    "INTERDIT : abouter deux lames sur un seul liteau sans double liteautage.",
  ],
};

export const REFERENTIEL_BARDAGE_PAR_FAMILLE: Record<
  FamilleBardageRefKey,
  FamilleBardageRegles
> = {
  bois: BARDAGE_BOIS_DTU_41_2,
  hpl: BARDAGE_HPL_DTU_45_4,
  fibrociment: BARDAGE_FIBROCIMENT_EN_12467,
  composite: BARDAGE_COMPOSITE_WPC,
};

export interface ParametresBardageNormatifs {
  concerneBardage: boolean;
  familles: FamilleBardageRegles[];
  estLittoralOuTannique: boolean;
  estPoseVerticale: boolean;
  estClaireVoie: boolean;
  visserieInox: "A4" | "A2";
  reglesApplicablesPrompt: string;
}

export function detecterFamillesBardage(texte: string): FamilleBardageRefKey[] {
  const lower = texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const found: FamilleBardageRefKey[] = [];

  if (/\bhpl\b|trespa|fundermax|polyrey|meteon|45\.4|3799/i.test(lower)) {
    found.push("hpl");
  }
  if (/fibrociment|fibro-ciment|cedral|equitone|tectiva|natura|pictura|12467/i.test(lower)) {
    found.push("fibrociment");
  }
  if (
    /composite|wpc|silvadec|fiberdeck|\bweo\b|newtechwood|neowood/i.test(lower) &&
    !/terrasse|platelage|lambourde/i.test(lower)
  ) {
    found.push("composite");
  }
  if (
    /bois|clin|claire[-\s]?voie|douglas|meleze|red\s*cedar|chene|chataignier|tasseautage|garde au sol|41\.2/i.test(
      lower
    ) &&
    !/terrasse|platelage/i.test(lower)
  ) {
    found.push("bois");
  }

  return found;
}

export function calculerParametresBardageNormatifs(
  texte: string
): ParametresBardageNormatifs {
  const lower = texte.toLowerCase();
  const norm = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  let familleKeys = detecterFamillesBardage(texte);

  const estLittoralOuTannique =
    /littoral|arcachon|bord\s*de\s*mer|c[ôo]te|girondine|3\s*km|salin|red\s*cedar|ch[êe]ne|ch[âa]taignier|tannique/i.test(
      lower
    );
  const estPoseVerticale = /vertical|tasseautage|d[ée]lard/i.test(lower);
  const estClaireVoie = /claire[-\s]?voie/i.test(lower);

  const concerneBardage =
    familleKeys.length > 0 ||
    (/bardage|\bite\b|point\s*fixe|point\s*coulissant|micro[-\s]?rive|anti[-\s]?rongeur/i.test(
      norm
    ) &&
      !/terrasse|platelage/i.test(norm));

  if (concerneBardage && familleKeys.length === 0) {
    familleKeys = ["bois", "hpl"];
  }

  const familles = familleKeys.map((k) => REFERENTIEL_BARDAGE_PAR_FAMILLE[k]);
  const visserieInox: "A4" | "A2" = estLittoralOuTannique ? "A4" : "A2";

  const lignesPrompt: string[] = [];
  if (concerneBardage) {
    lignesPrompt.push("RÉFÉRENTIEL NORMATIF BARDAGE MULTI-FAMILLES :");
    for (const fam of familles) {
      lignesPrompt.push(
        `- [${fam.nom} — ${fam.normesReference}] ${fam.reglesObligatoires.join(" ")} ${fam.interdits.join(" ")}`
      );
    }
    if (estLittoralOuTannique) {
      lignesPrompt.push(
        "- VIGILANCE CORROSION : Inox A4 OBLIGATOIRE (littoral <= 3 km ou essence tannique Red Cedar / Chêne / Châtaignier)."
      );
    }
  }

  return {
    concerneBardage,
    familles,
    estLittoralOuTannique,
    estPoseVerticale,
    estClaireVoie,
    visserieInox,
    reglesApplicablesPrompt: lignesPrompt.join("\n"),
  };
}

export function genererReponseNormativeBardageLocale(
  texte: string
): { content: string; tags: string[] } | null {
  const params = calculerParametresBardageNormatifs(texte);
  if (!params.concerneBardage || params.familles.length === 0) return null;

  const tags: string[] = ["Bardage"];
  const sections: string[] = [];

  for (const fam of params.familles) {
    if (fam.key === "hpl") tags.push("NF DTU 45.4", "CSTB 3799_V2");
    else if (fam.key === "bois") tags.push("NF DTU 41.2");
    else if (fam.key === "fibrociment") tags.push("NF EN 12467");
    else if (fam.key === "composite") tags.push("Composite WPC");

    sections.push(
      `### 🧱 ${fam.nom} (${fam.normesReference})\n` +
        fam.reglesObligatoires.map((r) => `- ${r}`).join("\n") +
        "\n" +
        fam.interdits.map((i) => `- ⚠️ ${i}`).join("\n")
    );
  }

  if (params.estLittoralOuTannique) {
    tags.push("Inox A4");
  }

  return {
    content: sections.join("\n\n"),
    tags: Array.from(new Set(tags)),
  };
}
