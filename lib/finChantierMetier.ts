import type {
  ChecklistRepli,
  NoticeEntretien,
  ZoneMetre,
} from "@/components/PVReceptionPDF";

export type MetierFinChantier = "bardage" | "terrasse" | "cloture";

export interface DefaultsFinChantierMetier {
  metier: MetierFinChantier;
  libelleBadge: string;
  typeTravaux: string;
  materiauxDefaut: string;
  noticeEntretien: NoticeEntretien;
  checklistRepli: ChecklistRepli;
  libelleRepliMateriel: string;
}

export function normaliserMetierFinChantier(raw?: string | null): MetierFinChantier {
  const v = (raw || "bardage").toLowerCase().trim();
  if (v === "terrasse") return "terrasse";
  if (v === "cloture") return "cloture";
  return "bardage";
}

export function infererMetierDepuisTypeTravaux(
  typeTravaux?: string | null
): MetierFinChantier {
  const s = (typeTravaux || "").toLowerCase();
  if (s.includes("terrasse")) return "terrasse";
  if (s.includes("clôture") || s.includes("cloture") || s.includes("portillon")) {
    return "cloture";
  }
  return "bardage";
}

export function getDefaultsFinChantierParMetier(
  rawMetier?: string | null,
  options?: { materiauStructurel?: string | null; terrasseMobileActive?: boolean }
): DefaultsFinChantierMetier {
  const metier = normaliserMetierFinChantier(rawMetier);

  if (metier === "terrasse") {
    const mobile = Boolean(options?.terrasseMobileActive);
    return {
      metier: "terrasse",
      libelleBadge: mobile ? "Terrasse & Mobile" : "Terrasse",
      typeTravaux: mobile
        ? "Réalisation de terrasse bois/composite (NF DTU 51.4) et Terrasse Mobile motorisée (NF P90-308)"
        : "Réalisation de terrasse bois/composite (NF DTU 51.4)",
      materiauxDefaut: mobile
        ? "Lames platelage / Plots & Lambourdes / Rails inox & Motorisation terrasse mobile"
        : "Lames bois/composite / Lambourdes / Plots réglables",
      noticeEntretien: {
        remise_fiches_techniques: true,
        remise_guide_entretien: true,
        remise_attestation_decennale: true,
        frequence_nettoyage_recommandee:
          "Nettoyage doux annuel à l'eau claire et brosse souple (haute pression strictement interdite) ; application d'un dégriseur/saturateur adapté.",
        controle_joints_recommande: mobile
          ? "Contrôle annuel des rails inox, galets, fins de course, motorisation solaire et verrouillage sécurité enfant (NF P90-308)."
          : "Inspection annuelle des lambourdes, calage des plots, clips de fixation et écoulement des eaux.",
      },
      checklistRepli: {
        nettoyage: true,
        dechets_evacues: true,
        echafaudage_demonte: true,
        fiches_techniques_remises: true,
      },
      libelleRepliMateriel: "Abords nettoyés et repli matériel",
    };
  }

  if (metier === "cloture") {
    return {
      metier: "cloture",
      libelleBadge: "Clôture",
      typeTravaux: "Pose de clôture, soubassements et portillons",
      materiauxDefaut:
        "Lames/panneaux / Poteaux aluminium ou bois / Plaques soubassement béton / Portillon",
      noticeEntretien: {
        remise_fiches_techniques: true,
        remise_guide_entretien: true,
        remise_attestation_decennale: true,
        frequence_nettoyage_recommandee:
          "Lavage annuel des lames et poteaux à l'eau savonneuse douce (sans solvant abrasif).",
        controle_joints_recommande:
          "Contrôle annuel du serrage des platines/poteaux et lubrification de la serrure, gâche et gonds du portillon.",
      },
      checklistRepli: {
        nettoyage: true,
        dechets_evacues: true,
        echafaudage_demonte: true,
        fiches_techniques_remises: true,
      },
      libelleRepliMateriel: "Abords nettoyés et repli matériel",
    };
  }

  return {
    metier: "bardage",
    libelleBadge: "Bardage",
    typeTravaux: "Travaux de bardage rapporté et isolation extérieure (ITE)",
    materiauxDefaut: options?.materiauStructurel
      ? `Bardage ${options.materiauStructurel} / Équerres Isolco / Isolant ITE`
      : "Panneaux HPL / Équerres Isolco 3000 P2 / Isolant Laine minérale",
    noticeEntretien: {
      remise_fiches_techniques: true,
      remise_guide_entretien: true,
      remise_attestation_decennale: true,
      frequence_nettoyage_recommandee:
        "Lavage annuel à l'eau douce tiède et savon doux neutre (sans solvants ni haute pression)",
      controle_joints_recommande:
        "Inspection visuelle annuelle des bavettes, grilles anti-rongeurs et joints de dilatation (DTU 41.2)",
    },
    checklistRepli: {
      nettoyage: true,
      dechets_evacues: true,
      echafaudage_demonte: true,
      fiches_techniques_remises: true,
    },
    libelleRepliMateriel: "Échafaudage démonté",
  };
}

export function construireOuvragesTerrasse(terrasse: {
  id: string;
  nom?: string | null;
  longueur_m?: number | null;
  largeur_m?: number | null;
  essence_bois?: string | null;
  systeme_terrasse?: string | null;
  resultats_techniques?: unknown;
}): ZoneMetre[] {
  const L = Number(terrasse.longueur_m) || 0;
  const l = Number(terrasse.largeur_m) || 0;
  const surface = Math.round(L * l * 100) / 100;
  const rt = (terrasse.resultats_techniques || {}) as {
    terrasseMobile?: { active?: boolean; motorisation?: { active?: boolean } };
  };
  const mobile = Boolean(rt?.terrasseMobile?.active);
  const motorise = Boolean(rt?.terrasseMobile?.motorisation?.active);

  return [
    {
      id: terrasse.id,
      nom: terrasse.nom || "Terrasse principale",
      type: "facade",
      largeur: L,
      hauteur_mur: l,
      hauteur_faite: null,
      surfaceBrute: surface,
      surfaceOuvertures: 0,
      surfaceNette: surface,
      unite: "m2",
      materiau: [
        terrasse.essence_bois?.replace("_", " "),
        terrasse.systeme_terrasse?.replace("_", " "),
        mobile ? (motorise ? "Terrasse Mobile motorisée" : "Terrasse Mobile") : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
  ];
}

export function construireOuvragesCloture(
  cloture: {
    id: string;
    nom?: string | null;
    forme?: string | null;
    materiau?: string | null;
    hauteur_utile_m?: number | null;
    presence_soubassement?: boolean | null;
  } | null,
  troncons: Array<{
    id: string;
    code_segment: string;
    longueur_m: number;
    presence_portillon?: boolean | null;
    largeur_portillon_m?: number | null;
  }>
): ZoneMetre[] {
  if (!troncons || troncons.length === 0) return [];
  const hU = Number(cloture?.hauteur_utile_m) || 1.8;
  return troncons.map((t) => {
    const len = Math.round((Number(t.longueur_m) || 0) * 100) / 100;
    return {
      id: t.id,
      nom: `Côté ${t.code_segment}${t.presence_portillon ? ` (+ Portillon ${t.largeur_portillon_m ?? 1}m)` : ""}`,
      type: "facade",
      largeur: len,
      hauteur_mur: hU,
      hauteur_faite: null,
      surfaceBrute: len,
      surfaceOuvertures: 0,
      surfaceNette: len,
      unite: "ml",
      materiau: `${cloture?.materiau || "COMPOSITE"}${cloture?.presence_soubassement ? " + Soubassement béton" : ""}`,
    };
  });
}
