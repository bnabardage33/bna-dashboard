// lib/terrasse/catalogueMobileDefaut.ts
//
// Références de fournitures par défaut pour le module Terrasse Mobile & Motorisation
// (Conformité DTU 51.4 et NF P90-308).

export interface ReferenceFournitureMobileDefaut {
  code: string;
  designation: string;
  description: string;
  categorie: "TERRASSE_MOBILE";
  unite_mesure: string;
  conditionnement: string;
  pu_ht: number;
  pu_revient: number;
  type_cout: "matiere";
}

/**
 * 9 Références de base pré-remplies du catalogue Terrasse Mobile & Motorisation :
 * 1. Profilé aluminium structurel (au ml)
 * 2. Rail de guidage inox 316L extra-plat (au ml)
 * 3. Galet double inox 316L (à l'unité)
 * 4. MOT-01 : Motoréducteur 24V TBTS
 * 5. MOT-02 : Crémaillère M4 acier/nylon (barre 1 m)
 * 6. MOT-03-SOL : Kit coffret solaire (panneau PV 30 Wc + 2 batteries AGM 14Ah)
 * 7. MOT-03-FIL : Coffret de commande filaire 230V/24V IP65
 * 8. MOT-04 : Kit fins de course magnétiques IP68
 * 9. MOT-05 : Télécommande sécurisée 868 MHz (NF P90-308)
 */
export const FOURNITURES_DEFAUT_TERRASSE_MOBILE: readonly ReferenceFournitureMobileDefaut[] = [
  {
    code: "MOB-02",
    designation: "Profilé aluminium structurel 80x40 (au ml)",
    description: "Profilé porteur tubulaire en aluminium thermolaqué 6060 T6 (80×40 mm) pour châssis mobile grande portée",
    categorie: "TERRASSE_MOBILE",
    unite_mesure: "ml",
    conditionnement: "Barre de 6.00 m",
    pu_ht: 34.0,
    pu_revient: 22.0,
    type_cout: "matiere",
  },
  {
    code: "MOB-01",
    designation: "Rail de guidage inox 316L extra-plat (au ml)",
    description: "Rail plat discret à profil biseauté anti-trébuchement en acier Inox A4 Marine 316L (28×5 mm)",
    categorie: "TERRASSE_MOBILE",
    unite_mesure: "ml",
    conditionnement: "Barre de 3.00 m",
    pu_ht: 58.0,
    pu_revient: 38.0,
    type_cout: "matiere",
  },
  {
    code: "MOB-03",
    designation: "Galet double inox 316L (à l'unité)",
    description: "Galet double de roulement à gorge inox 316L avec roulement à billes étanche IP68 (charge utile 350 kg/galet)",
    categorie: "TERRASSE_MOBILE",
    unite_mesure: "u",
    conditionnement: "À l'unité",
    pu_ht: 42.0,
    pu_revient: 26.0,
    type_cout: "matiere",
  },
  {
    code: "MOT-01",
    designation: "MOT-01 : Motoréducteur 24V TBTS spécial terrasse mobile",
    description: "Moteur électrique 24V DC basse tension réversible avec détection d'obstacle ampérométrique et clé de débrayage de secours",
    categorie: "TERRASSE_MOBILE",
    unite_mesure: "u",
    conditionnement: "À l'unité",
    pu_ht: 480.0,
    pu_revient: 320.0,
    type_cout: "matiere",
  },
  {
    code: "MOT-02",
    designation: "MOT-02 : Crémaillère M4 acier/nylon (barre 1 m)",
    description: "Crémaillère module 4 silencieuse âme acier galvanisé surmoulée nylon anti-bruit avec fixations oblongues",
    categorie: "TERRASSE_MOBILE",
    unite_mesure: "m",
    conditionnement: "Barre de 1.00 m",
    pu_ht: 28.0,
    pu_revient: 18.0,
    type_cout: "matiere",
  },
  {
    code: "MOT-03-SOL",
    designation: "MOT-03-SOL : Kit coffret solaire (panneau PV 30 Wc + 2 batteries AGM 14Ah)",
    description: "Kit autonome 24V DC : panneau photovoltaïque 30 Wc avec support inox 35°, coffret IP65, régulateur MPPT et 2 batteries AGM 12V 14Ah",
    categorie: "TERRASSE_MOBILE",
    unite_mesure: "kit",
    conditionnement: "Kit complet",
    pu_ht: 340.0,
    pu_revient: 220.0,
    type_cout: "matiere",
  },
  {
    code: "MOT-03-FIL",
    designation: "MOT-03-FIL : Coffret de commande filaire 230V/24V IP65",
    description: "Coffret mural étanche IP65 avec transformateur torique 230V AC vers 24V DC TBTS (Très Basse Tension de Sécurité piscine NF C 15-100 §702)",
    categorie: "TERRASSE_MOBILE",
    unite_mesure: "kit",
    conditionnement: "Kit complet",
    pu_ht: 190.0,
    pu_revient: 120.0,
    type_cout: "matiere",
  },
  {
    code: "MOT-04",
    designation: "MOT-04 : Kit fins de course magnétiques IP68",
    description: "Ensemble de capteurs magnétiques bistables hermétiques IP68 avec aimants néodyme et sécurité mécanique de surcourse",
    categorie: "TERRASSE_MOBILE",
    unite_mesure: "kit",
    conditionnement: "Kit capteurs + aimants",
    pu_ht: 75.0,
    pu_revient: 45.0,
    type_cout: "matiere",
  },
  {
    code: "MOT-05",
    designation: "MOT-05 : Télécommande sécurisée 868 MHz (NF P90-308)",
    description: "Émetteur radio sécurisé 868 MHz à code tournant et appui maintenu conforme à la norme de sécurité piscine NF P90-308",
    categorie: "TERRASSE_MOBILE",
    unite_mesure: "u",
    conditionnement: "À l'unité",
    pu_ht: 48.0,
    pu_revient: 28.0,
    type_cout: "matiere",
  },
];

export interface TarifFournitureMobile {
  id?: string;
  code: string;
  designation?: string;
  unite?: string;
  pu_ht: number;
  pu_revient?: number;
}

/**
 * Mappe un tableau de lignes Supabase `catalogue_terrasse_accessoires` vers un
 * dictionnaire indexé par code d'article (`MOB-01`, `MOB-02`, `MOB-03`, `MOT-01`... `MOT-05`).
 */
export function extraireTarifsFournituresMobile(
  accessoires: Array<{
    id?: string;
    designation?: string | null;
    categorie?: string | null;
    pu_ht?: number | null;
    pu_revient?: number | null;
    prix_conditionnement?: number | null;
    unite_mesure?: string | null;
    specifications_dt?: unknown;
  }>
): Record<string, TarifFournitureMobile> {
  const result: Record<string, TarifFournitureMobile> = {};

  for (const item of accessoires) {
    const des = (item.designation || "").trim();
    const desLower = des.toLowerCase();

    // Détection du code article
    let code: string | null = null;

    if (item.specifications_dt && typeof item.specifications_dt === "object") {
      const dtCode = (item.specifications_dt as Record<string, unknown>).code_article;
      if (typeof dtCode === "string" && dtCode.trim()) {
        code = dtCode.trim().toUpperCase();
      }
    }

    if (!code) {
      if (des.includes("MOT-03-SOL") || (des.includes("MOT-03") && desLower.includes("solaire"))) {
        code = "MOT-03-SOL";
      } else if (des.includes("MOT-03-FIL") || (des.includes("MOT-03") && desLower.includes("filaire"))) {
        code = "MOT-03-FIL";
      } else if (des.includes("MOT-01") || desLower.includes("motoréducteur") || desLower.includes("motoreducteur")) {
        code = "MOT-01";
      } else if (des.includes("MOT-02") || desLower.includes("crémaillère") || desLower.includes("cremaillere")) {
        code = "MOT-02";
      } else if (des.includes("MOT-04") || desLower.includes("fins de course") || desLower.includes("fin de course")) {
        code = "MOT-04";
      } else if (des.includes("MOT-05") || desLower.includes("télécommande") || desLower.includes("telecommande")) {
        code = "MOT-05";
      } else if (des.includes("MOB-01") || (desLower.includes("rail") && desLower.includes("inox"))) {
        code = "MOB-01";
      } else if (des.includes("MOB-02") || (desLower.includes("profilé") && desLower.includes("alu")) || desLower.includes("châssis")) {
        code = "MOB-02";
      } else if (des.includes("MOB-03") || desLower.includes("galet")) {
        code = "MOB-03";
      }
    }

    if (!code) continue;

    const prixVente =
      typeof item.pu_ht === "number" && item.pu_ht >= 0
        ? item.pu_ht
        : typeof item.prix_conditionnement === "number" && item.prix_conditionnement >= 0
        ? item.prix_conditionnement
        : null;

    if (prixVente !== null) {
      result[code] = {
        id: item.id,
        code,
        designation: des || undefined,
        unite: item.unite_mesure || undefined,
        pu_ht: prixVente,
        pu_revient: typeof item.pu_revient === "number" ? item.pu_revient : undefined,
      };
    }
  }

  return result;
}
