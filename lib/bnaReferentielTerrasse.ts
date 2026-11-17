/**
 * Référentiel normatif exhaustif Terrasse Bois (NF DTU 51.4 Décembre 2018 & NF B 54-040)
 * et Terrasse Composite (Silvadec, Fiberdeck, Neowood, Océwood).
 */

export type FabricantCompositeKey = "silvadec" | "fiberdeck" | "neowood" | "ocewood";

export interface FabricantCompositeRegles {
  key: FabricantCompositeKey;
  nom: string;
  entraxeResidentielMm: number;
  entraxePublicOuDiagonaleMm: number;
  entraxeDiagonale45Mm: number;
  jeuLateralMm: string;
  jeuAboutageMm: string;
  jeuMurMm: string;
  lambourdeCompositeAutoriseeSurPlots: boolean;
  temperaturePoseMinC: number | null;
  reglesSpecifiques: string[];
}

export const DTU_51_4_FRONTIERES = {
  code: "NF DTU 51.4 (Décembre 2018) & NF B 54-040",
  hauteurMaxFiniM: 1.0,
  porteeLambourdeMax3AppuisMm: 700,
  porteeLambourdeMax2AppuisMm: 600,
  basculeStructureLourde: "NF DTU 31.1",
  hauteurMaxPlotsPolymeresMm: 300,
  resistancePlotsFrkKn: {
    sollicitation1Residentiel: 5.0,
    sollicitation2Collectif: 7.5,
    sollicitation3PublicIntensif: 12.5,
  },
  penteMaxSupportPct: 5,
  separationBoisVsComposite:
    "Le composite (WPC), les bois modifiés thermiquement (TMT) et les clips invisibles sur bois massif sont EXCLUS du NF DTU 51.4 et relèvent exclusivement des prescriptions fabricants.",
} as const;

export const DTU_51_4_BOIS_MASSIF = {
  elancementMaxLambda: {
    standardResineux: 6,
    feuilluOuExotiqueDense: 7,
    essencesNerveuses: 4.5,
  },
  abattementEntraxe2AppuisPct: 15,
  doubleLambourdageConceptionElaboree: {
    jeuEntreLambourdesMm: "4 à 6 mm",
    retraitBoutLameMm: "20 à 30 mm",
  },
  calesDePoseTableau8: [
    { humiditeBois: "12 à 17 % (sec séchoir)", jeuMm: 7 },
    { humiditeBois: "18 à 22 % (ressuyé)", jeuMm: 5 },
    { humiditeBois: "> PSF (Point de Saturation des Fibres)", jeuMm: 3 },
  ],
  visserieTableau9: {
    inoxStandard: "Inox A2",
    inoxMilieuAgressif: "Inox A4 obligatoire (bord de mer / littoral < 5 km, piscine chlore/sel)",
    diametre5Mm: "Ø5 mm pour épaisseur e = 21 à 23 mm (feuillu) ou jusqu'à 27 mm (résineux)",
    diametre6Mm: "Ø6 mm pour épaisseur e ≥ 24 mm (feuillu/exotique dense) ou ≥ 28 mm (résineux)",
    ancrageMinimal: "S ≥ 1,5 × e (ou S ≥ 2,2 × e pour lame feuillu/exotique sur lambourde résineux)",
  },
  franchiseTriEsthetiquePct: 3,
} as const;

export const REFERENTIEL_FABRICANTS_COMPOSITE: Record<
  FabricantCompositeKey,
  FabricantCompositeRegles
> = {
  silvadec: {
    key: "silvadec",
    nom: "Silvadec",
    entraxeResidentielMm: 400,
    entraxePublicOuDiagonaleMm: 300,
    entraxeDiagonale45Mm: 200,
    jeuLateralMm: ">= 5 mm",
    jeuAboutageMm: "5 mm",
    jeuMurMm: ">= 15 mm",
    lambourdeCompositeAutoriseeSurPlots: false,
    temperaturePoseMinC: null,
    reglesSpecifiques: [
      "Entraxe lambourdes : 400 mm (réduit à 200 mm en pose à 45°).",
      "Jeu latéral >= 5 mm, jeu d'aboutage 5 mm, jeu périphérique mur >= 15 mm.",
      "Toute coupe de lame < 80 cm doit reposer sur au moins 3 appuis (>= 3 lambourdes).",
      "Lambourde composite INTERDITE sur plots (utiliser lambourde alu ou bois CL4).",
    ],
  },
  fiberdeck: {
    key: "fiberdeck",
    nom: "Fiberdeck",
    entraxeResidentielMm: 400,
    entraxePublicOuDiagonaleMm: 300,
    entraxeDiagonale45Mm: 300,
    jeuLateralMm: "clips Cobra Hybrid",
    jeuAboutageMm: "3 à 6 mm (barème thermique selon T°C de pose)",
    jeuMurMm: ">= 15 mm",
    lambourdeCompositeAutoriseeSurPlots: false,
    temperaturePoseMinC: null,
    reglesSpecifiques: [
      "Entraxe lambourdes : 400 mm en résidentiel / 300 mm en usage public ou pose en diagonale.",
      "Barème thermique d'aboutage : 3 à 6 mm selon la température ambiante.",
      "Fixation par clips Cobra Hybrid.",
      "Lambourde composite PROSCRITE.",
    ],
  },
  neowood: {
    key: "neowood",
    nom: "Neowood",
    entraxeResidentielMm: 400,
    entraxePublicOuDiagonaleMm: 300,
    entraxeDiagonale45Mm: 300,
    jeuLateralMm: "clips fabricant",
    jeuAboutageMm: "3 à 6 mm selon T°C",
    jeuMurMm: ">= 15 mm",
    lambourdeCompositeAutoriseeSurPlots: false,
    temperaturePoseMinC: 5,
    reglesSpecifiques: [
      "Entraxe lambourdes : Expression 350 mm / Excellence & Extrême 400 mm (-100 mm en usage public ou pose en diagonale).",
      "Lambourde Trocosto autorisée uniquement sur sol dur avec plots <= 500 mm.",
      "Pose déconseillée si température < 5°C.",
    ],
  },
  ocewood: {
    key: "ocewood",
    nom: "Océwood",
    entraxeResidentielMm: 350,
    entraxePublicOuDiagonaleMm: 300,
    entraxeDiagonale45Mm: 300,
    jeuLateralMm: "clips fabricant",
    jeuAboutageMm: "6 mm",
    jeuMurMm: ">= 15 mm",
    lambourdeCompositeAutoriseeSurPlots: false,
    temperaturePoseMinC: 5,
    reglesSpecifiques: [
      "Entraxe lambourdes : 350 à 400 mm.",
      "Jeu d'aboutage obligatoire : 6 mm.",
      "Pose INTERDITE si température < 5°C.",
    ],
  },
};

export interface ParametresTerrasseNormatifs {
  concerneTerrasse: boolean;
  estComposite: boolean;
  estMobile: boolean;
  fabricant: FabricantCompositeRegles | null;
  gammeNeowoodExpression: boolean;
  estDiagonale: boolean;
  estPublic: boolean;
  estBordDeMerOuPiscine: boolean;
  estBoisExotiqueDense: boolean;
  hauteurPlotsMm: number | null;
  alertePlotsDepassement: string | null;
  entraxeLambourdesMm: number;
  entraxeLambourdesCm: number;
  visserieInox: "A4" | "A2" | "clips";
  reglesApplicablesPrompt: string;
}

export function detecterFabricantsComposites(
  texte: string
): FabricantCompositeKey[] {
  const lower = texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const found: FabricantCompositeKey[] = [];
  if (lower.includes("silvadec")) found.push("silvadec");
  if (lower.includes("fiberdeck") || lower.includes("fiber deck")) found.push("fiberdeck");
  if (lower.includes("neowood") || lower.includes("neo wood")) found.push("neowood");
  if (lower.includes("ocewood") || lower.includes("oce wood")) found.push("ocewood");
  return found;
}

export function detecterFabricantComposite(
  texte: string
): FabricantCompositeKey | null {
  return detecterFabricantsComposites(texte)[0] ?? null;
}

function extraireHauteurPlotsMm(texte: string): number | null {
  const mMm = texte.match(/plots?\s*(?:de|à|a|=|hauteur)?\s*(\d+(?:[.,]\d+)?)\s*mm\b/i);
  if (mMm) return Number(mMm[1].replace(",", "."));
  const mCm = texte.match(/plots?\s*(?:de|à|a|=|hauteur)?\s*(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (mCm) return Number(mCm[1].replace(",", ".")) * 10;
  return null;
}

export function calculerParametresTerrasseNormatifs(
  texte: string
): ParametresTerrasseNormatifs {
  const lower = texte.toLowerCase();
  const norm = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const fabricantKeys = detecterFabricantsComposites(texte);
  const fabricantKey = fabricantKeys[0] ?? null;
  const fabricant = fabricantKey
    ? REFERENTIEL_FABRICANTS_COMPOSITE[fabricantKey]
    : null;
  const fabricants = fabricantKeys.map((k) => REFERENTIEL_FABRICANTS_COMPOSITE[k]);

  const estMobile = /terrasse\s+mobile|plateau\s+mobile|coulissante/i.test(lower);
  const estComposite =
    Boolean(fabricant) || /composite|wpc|co-?extrud/i.test(lower);
  const estDiagonale = /diagonale|45\s*[°º]|45\s*deg/i.test(lower);
  const estPublic = /\bpublic\b|\berp\b|collectif|commercial|restaurant|hotel|hôtel/i.test(
    lower
  );
  const estBordDeMerOuPiscine =
    /bord\s*de\s*mer|littoral|salin|ocean|océan|mer\b|piscine|chlore/i.test(lower);
  const estBoisExotiqueDense = /ip[ée]|cumaru|itauba|padouk|exotique|massaranduba/i.test(
    lower
  );
  const gammeNeowoodExpression =
    fabricantKey === "neowood" && /expression/i.test(norm);

  const estExplicitementBardage =
    /\bbardage\b|\bweo\b|newtechwood/i.test(lower) &&
    !/terrasse|platelage|lambourde|plot|51\.4|54-040|p90-308/i.test(lower);

  const concerneTerrasse =
    !estExplicitementBardage &&
    (estComposite ||
      estMobile ||
      estBoisExotiqueDense ||
      /terrasse|platelage|lambourde|plot|51\.4|54-040|p90-308|sollicitation|aboutage|cale de pose|elancement|élancement/i.test(
        lower
      ));

  const hauteurPlotsMm = extraireHauteurPlotsMm(texte);
  const alertePlotsDepassement =
    hauteurPlotsMm !== null && hauteurPlotsMm > DTU_51_4_FRONTIERES.hauteurMaxPlotsPolymeresMm
      ? `⚠️ ALERTE NORMATIVE (NF DTU 51.4) : hauteur de plots ${hauteurPlotsMm} mm > 300 mm max autorisés pour les plots polymères. Bascule obligatoire vers une structure porteuse NF DTU 31.1 (plots béton / longrines / poteaux).`
      : null;

  let entraxeLambourdesMm = 400;
  if (fabricant) {
    if (fabricant.key === "silvadec") {
      entraxeLambourdesMm = estDiagonale
        ? 200
        : estPublic
          ? 300
          : 400;
    } else if (fabricant.key === "fiberdeck") {
      entraxeLambourdesMm = estDiagonale || estPublic ? 300 : 400;
    } else if (fabricant.key === "neowood") {
      const base = gammeNeowoodExpression ? 350 : 400;
      entraxeLambourdesMm = estDiagonale || estPublic ? base - 100 : base;
    } else if (fabricant.key === "ocewood") {
      entraxeLambourdesMm = estDiagonale || estPublic ? 300 : 350;
    }
  } else if (estComposite) {
    entraxeLambourdesMm = estDiagonale || estPublic ? 300 : 400;
  } else {
    entraxeLambourdesMm = estDiagonale ? 350 : 400;
  }

  const visserieInox: "A4" | "A2" | "clips" = estComposite
    ? "clips"
    : estBordDeMerOuPiscine
      ? "A4"
      : "A2";

  const lignesPrompt: string[] = [];
  if (concerneTerrasse) {
    lignesPrompt.push(
      `RÉFÉRENTIEL NORMATIF TERRASSE (${DTU_51_4_FRONTIERES.code}) :`
    );
    lignesPrompt.push(
      `- Frontières DTU 51.4 : H ≤ ${DTU_51_4_FRONTIERES.hauteurMaxFiniM.toFixed(2)} m, portée lambourdes ≤ ${DTU_51_4_FRONTIERES.porteeLambourdeMax3AppuisMm} mm (3 appuis) / ≤ ${DTU_51_4_FRONTIERES.porteeLambourdeMax2AppuisMm} mm (2 appuis, sinon ${DTU_51_4_FRONTIERES.basculeStructureLourde}), plots polymères ≤ ${DTU_51_4_FRONTIERES.hauteurMaxPlotsPolymeresMm} mm (Frk ≥ 5,0 / 7,5 / 12,5 kN selon Sollicitations 1, 2, 3), pente ≤ ${DTU_51_4_FRONTIERES.penteMaxSupportPct} %.`
    );
    lignesPrompt.push(`- ${DTU_51_4_FRONTIERES.separationBoisVsComposite}`);
    if (fabricants.length > 0) {
      for (const fab of fabricants) {
        lignesPrompt.push(
          `- Fabricant ${fab.nom} (entraxe calculé : ${entraxeLambourdesMm} mm) : ${fab.reglesSpecifiques.join(" ")}`
        );
      }
    } else if (!estComposite) {
      lignesPrompt.push(
        `- Bois massif DTU 51.4 : élancement max λ = 6 (résineux), 7 (feuillu/exotique) ou 4,5 ; abattement -15 % d'entraxe sur 2 appuis ; double lambourdage (z = 4–6 mm, retrait w = 20–30 mm) ; cales Tableau 8 (7 mm si 12–17 %, 5 mm si 18–22 %, 3 mm si > PSF) ; vis Tableau 9 (${visserieInox === "A4" ? "Inox A4 obligatoire" : "Inox A2/A4"}, Ø5 mm pour e=21..23/27 mm, Ø6 mm pour e≥24/28 mm, ancrage S ≥ 1,5×e ou 2,2×e feuillu sur résineux) ; franchise tri +3 %.`
      );
    }
    if (alertePlotsDepassement) {
      lignesPrompt.push(`- ${alertePlotsDepassement}`);
    }
  }

  return {
    concerneTerrasse,
    estComposite,
    estMobile,
    fabricant,
    gammeNeowoodExpression,
    estDiagonale,
    estPublic,
    estBordDeMerOuPiscine,
    estBoisExotiqueDense,
    hauteurPlotsMm,
    alertePlotsDepassement,
    entraxeLambourdesMm,
    entraxeLambourdesCm: Math.round((entraxeLambourdesMm / 10) * 10) / 10,
    visserieInox,
    reglesApplicablesPrompt: lignesPrompt.join("\n"),
  };
}

/**
 * Génère une réponse locale experte à 0 ms pour les questions normatives Terrasse
 * (DTU 51.4, plots > 300 mm, Ipé bord de mer Inox A4, Silvadec, Fiberdeck, Neowood, Océwood).
 */
export function genererReponseNormativeTerrasseLocale(
  texte: string
): { content: string; tags: string[] } | null {
  const params = calculerParametresTerrasseNormatifs(texte);
  if (!params.concerneTerrasse) return null;

  const tags: string[] = [];
  const sections: string[] = [];

  if (params.alertePlotsDepassement) {
    tags.push("Plots > 300 mm", "NF DTU 31.1");
    sections.push(
      `### ⚠️ Limite réglementaire Plots Polymères (NF DTU 51.4)\n` +
        `${params.alertePlotsDepassement}\n` +
        `- **Hauteur maximale plots polymères :** ${DTU_51_4_FRONTIERES.hauteurMaxPlotsPolymeresMm} mm sous lame.\n` +
        `- **Résistances minimales Frk :** 5,0 kN (Sollicitation 1 résidentiel), 7,5 kN (Sollicitation 2 collectif), 12,5 kN (Sollicitation 3 public intensif).\n` +
        `- **Portée lambourdes max :** ≤ 700 mm (3 appuis) / ≤ 600 mm (2 appuis, abattement -15 %) ; au-delà, bascule obligatoire en **NF DTU 31.1**.`
    );
  }

  if (params.fabricant) {
    const f = params.fabricant;
    tags.push("Composite", f.nom);
    sections.push(
      `### 🪵 Prescriptions Fabricant ${f.nom} (Hors NF DTU 51.4)\n` +
        `- **Séparation normative :** ${DTU_51_4_FRONTIERES.separationBoisVsComposite}\n` +
        `- **Entraxe retenu pour votre configuration :** **${params.entraxeLambourdesMm} mm**` +
        (params.estDiagonale ? " (pose en diagonale / 45°)" : params.estPublic ? " (usage public)" : " (résidentiel)") +
        `\n` +
        `- **Jeux :** latéral ${f.jeuLateralMm} · aboutage ${f.jeuAboutageMm} · mur ${f.jeuMurMm}\n` +
        f.reglesSpecifiques.map((r) => `- ${r}`).join("\n")
    );
  } else if (!params.estComposite && !params.alertePlotsDepassement) {
    tags.push("NF DTU 51.4", "NF B 54-040");
    sections.push(
      `### 📐 Référentiel Terrasse Bois Massif (${DTU_51_4_FRONTIERES.code})\n` +
        `- **Domaine d'application :** H ≤ 1,00 m · portée lambourdes ≤ 700 mm (3 appuis) / ≤ 600 mm (2 appuis, abattement -15 %) · plots polymères ≤ 300 mm · pente ≤ 5 %.\n` +
        `- **Visserie (Tableau 9) :** **${params.visserieInox === "A4" ? "Inox A4 OBLIGATOIRE (bord de mer / milieu salin ou piscine)" : "Inox A2 (ou A4 en milieu humide/salin)"}** · Ø5 mm (e=21..23/27 mm) ou Ø6 mm (e≥24/28 mm) · ancrage S ≥ 1,5×e (ou 2,2×e feuillu/exotique sur résineux).\n` +
        `- **Double lambourdage (conception élaborée) :** jeu entre lambourdes z = 4 à 6 mm, retrait w = 20 à 30 mm.\n` +
        `- **Cales de pose (Tableau 8) :** 7 mm (12–17 % humidité), 5 mm (18–22 %), 3 mm (> PSF).\n` +
        `- **Élancement max λ :** 6 (résineux), 7 (feuillu/exotique) ou 4,5 ; franchise de tri +3 %.`
    );
  }

  if (sections.length === 0) return null;
  return { content: sections.join("\n\n"), tags };
}
