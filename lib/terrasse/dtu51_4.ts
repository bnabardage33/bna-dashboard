// Moteur de contrôle de conformité DTU 51.4 (Platelages extérieurs en bois)
// et normes de sécurité associées (NF P01-012, NF P01-013).

import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  ControleDTU51_4,
  RapportConformiteDTU,
  StatutControle,
} from "./types";
import { auditComposite } from "./composite/audit";
import { auditBois } from "./bois/audit";

/**
 * Calcule l'entraxe maximal admissible des lambourdes selon l'épaisseur de la lame
 * et l'essence (DTU 51.4 - limitation de la flexion sous charge de 2.5 kN/m²).
 */
export function calculerEntraxeMaxLambourdes(
  epaisseurLameMm: number,
  essence: ChantierTerrasseConfig["essence_bois"]
): number {
  if (essence === "composite") {
    // Les composites ont une rigidité moindre : entraxe plafonné à 35-40 cm
    return Math.min(40, Math.floor((epaisseurLameMm * 18) / 10));
  }
  if (essence === "ipe" || essence === "cumaru" || essence === "bambou_thermo") {
    // Bois exotiques denses classe 4 : ratio jusqu'à 23x l'épaisseur
    return Math.floor((epaisseurLameMm * 23) / 10);
  }
  // Résineux standard (Pin cl4, Douglas, Mélèze) : ratio standard 20x l'épaisseur
  return Math.floor((epaisseurLameMm * 20) / 10);
}

/**
 * Calcule la portée maximale admissible d'une lambourde entre plots
 * selon sa section et son matériau (DTU 51.4).
 */
export function calculerPorteeMaxLambourde(
  sectionHauteurMm: number,
  sectionLargeurMm: number,
  typeLambourde: ChantierTerrasseConfig["type_lambourde"]
): number {
  if (typeLambourde === "alu_structure") {
    return 65; // Profilé aluminium rigide
  }
  if (typeLambourde === "bois_exotique") {
    // Portée plus forte grâce au module d'élasticité élevé
    if (sectionHauteurMm >= 70) return 75;
    if (sectionHauteurMm >= 60) return 65;
    return 55;
  }
  // Résineux classe 4 (sur chant)
  if (sectionHauteurMm >= 70) return 70;
  if (sectionHauteurMm >= 60) return 55;
  if (sectionHauteurMm >= 50) return 45;
  return 40;
}

/**
 * Exécute l'audit complet de conformité DTU 51.4 sur la terrasse configurée.
 */
export function verifierConformiteDTU51_4(
  config: ChantierTerrasseConfig,
  reservations: ChantierTerrasseReservation[] = []
): RapportConformiteDTU {
  if (config.systeme_terrasse === "composite_clip") {
    const audit = auditComposite(config, reservations);
    // Contrôles de sécurité universels (Garde-corps et escalier)
    if (config.hauteur_sol_cm > 100 && !config.presence_garde_corps) {
      audit.controles.push({
        id: "norme-garde-corps-obligatoire",
        titre: "Garde-corps antichute (NF P01-012)",
        regleDtu: "Norme NF P01-012 : Garde-corps obligatoire si hauteur de chute > 1.00 m",
        valeurConstatee: `Hauteur de ${config.hauteur_sol_cm} cm sans garde-corps`,
        statut: "non_conforme",
        recommandation: "Ajouter impérativement un garde-corps d'au moins 1.00 m sur les côtés ouverts.",
        sourceNormative: "NF P01-012",
      });
      audit.nbNonConformes += 1;
      audit.statutGlobal = "non_conforme";
    }
    if (config.presence_escalier) {
      const blondel = 2 * config.escalier_hauteur_marche_cm + config.escalier_giron_cm;
      const blondelOk = blondel >= 60 && blondel <= 64;
      audit.controles.push({
        id: "norme-escalier-blondel",
        titre: "Confort escalier (Loi de Blondel)",
        regleDtu: "Règle de l'art : 2H + G doit être compris entre 60 cm et 64 cm",
        valeurConstatee: `2×${config.escalier_hauteur_marche_cm} + ${config.escalier_giron_cm} = ${blondel.toFixed(1)} cm`,
        statut: blondelOk ? "conforme" : "avertissement",
        recommandation: blondelOk
          ? "Escalier ergonomique et confortable."
          : `Ajuster la marche ou le giron (actuellement ${blondel.toFixed(1)} cm) pour cibler ~62 cm.`,
        sourceNormative: "Règles de l'art",
      });
      if (blondelOk) audit.nbConformes += 1;
      else audit.nbAvertissements += 1;
    }
    return audit;
  }

  if (config.systeme_terrasse === "bois_clip") {
    const audit = auditBois(config, reservations);
    if (config.hauteur_sol_cm > 100 && !config.presence_garde_corps) {
      audit.controles.push({
        id: "norme-garde-corps-obligatoire",
        titre: "Garde-corps antichute (NF P01-012)",
        regleDtu: "Norme NF P01-012 : Garde-corps obligatoire si hauteur de chute > 1.00 m",
        valeurConstatee: `Hauteur de ${config.hauteur_sol_cm} cm sans garde-corps`,
        statut: "non_conforme",
        recommandation: "Ajouter impérativement un garde-corps d'au moins 1.00 m sur les côtés ouverts.",
        sourceNormative: "NF P01-012",
      });
      audit.nbNonConformes += 1;
      audit.statutGlobal = "non_conforme";
    }
    return audit;
  }

  const controles: ControleDTU51_4[] = [];

  // 1. Entraxe lambourdes vs épaisseur lame
  const entraxeMax = calculerEntraxeMaxLambourdes(
    config.epaisseur_lame_mm,
    config.essence_bois
  );
  if (config.entraxe_lambourdes_cm <= entraxeMax) {
    controles.push({
      id: "dtu-entraxe-lambourdes",
      titre: "Entraxe des lambourdes",
      regleDtu: `DTU 51.4 § 5.3 : Entraxe ≤ ${entraxeMax} cm (≤ 20× l'épaisseur de la lame de ${config.epaisseur_lame_mm} mm)`,
      valeurConstatee: `${config.entraxe_lambourdes_cm} cm`,
      statut: "conforme",
      recommandation: "Entraxe adapté à la rigidité des lames.",
    });
  } else if (config.entraxe_lambourdes_cm <= entraxeMax + 5) {
    controles.push({
      id: "dtu-entraxe-lambourdes",
      titre: "Entraxe des lambourdes",
      regleDtu: `DTU 51.4 § 5.3 : Entraxe max recommandé ${entraxeMax} cm pour une lame de ${config.epaisseur_lame_mm} mm`,
      valeurConstatee: `${config.entraxe_lambourdes_cm} cm (dépassement de ${config.entraxe_lambourdes_cm - entraxeMax} cm)`,
      statut: "avertissement",
      recommandation: `Rapprocher les lambourdes à ${entraxeMax} cm max pour éviter tout risque de souplesse ou d'effet ressort.`,
    });
  } else {
    controles.push({
      id: "dtu-entraxe-lambourdes",
      titre: "Entraxe des lambourdes",
      regleDtu: `DTU 51.4 § 5.3 : Entraxe max obligatoire ${entraxeMax} cm pour une lame de ${config.epaisseur_lame_mm} mm`,
      valeurConstatee: `${config.entraxe_lambourdes_cm} cm (> limite normative)`,
      statut: "non_conforme",
      recommandation: `Réduire l'entraxe à ${entraxeMax} cm max pour garantir la sécurité et la résistance à la flexion.`,
    });
  }

  // 2. Portée de la lambourde entre plots
  const porteeMax = calculerPorteeMaxLambourde(
    config.section_hauteur_mm,
    config.section_largeur_mm,
    config.type_lambourde
  );
  if (config.entraxe_plots_cm <= porteeMax) {
    controles.push({
      id: "dtu-portee-plots",
      titre: "Portée des lambourdes (espacement plots)",
      regleDtu: `DTU 51.4 § 5.2 : Portée admissible max ${porteeMax} cm pour une section de ${config.section_largeur_mm}x${config.section_hauteur_mm} mm`,
      valeurConstatee: `${config.entraxe_plots_cm} cm`,
      statut: "conforme",
      recommandation: "Espacement des plots conforme à la résistance mécanique de la lambourde.",
    });
  } else {
    controles.push({
      id: "dtu-portee-plots",
      titre: "Portée des lambourdes (espacement plots)",
      regleDtu: `DTU 51.4 § 5.2 : Portée admissible max ${porteeMax} cm pour une section de ${config.section_largeur_mm}x${config.section_hauteur_mm} mm`,
      valeurConstatee: `${config.entraxe_plots_cm} cm (excède la portée max de ${config.entraxe_plots_cm - porteeMax} cm)`,
      statut: "non_conforme",
      recommandation: `Rapprocher les plots à ${porteeMax} cm d'entraxe maximum ou augmenter la hauteur de lambourde.`,
    });
  }

  // 3. Jeu / espacement entre lames (dilatation / drainage)
  if (config.espacement_lames_mm >= 4 && config.espacement_lames_mm <= 7) {
    controles.push({
      id: "dtu-jeu-lames",
      titre: "Espacement entre lames",
      regleDtu: "DTU 51.4 § 6.2 : Jeu requis entre 4 mm et 7 mm pour le retrait/gonflement",
      valeurConstatee: `${config.espacement_lames_mm} mm`,
      statut: "conforme",
      recommandation: "Jeu idéal pour l'écoulement de l'eau et les variations hygrométriques.",
    });
  } else if (config.espacement_lames_mm < 4) {
    controles.push({
      id: "dtu-jeu-lames",
      titre: "Espacement entre lames",
      regleDtu: "DTU 51.4 § 6.2 : Jeu minimum 4 mm (3 mm strict sur bois très sec)",
      valeurConstatee: `${config.espacement_lames_mm} mm (trop serré)`,
      statut: "non_conforme",
      recommandation: "Augmenter le jeu à 5 mm pour prévenir le tuilage et le soulèvement des lames par temps humide.",
    });
  } else {
    controles.push({
      id: "dtu-jeu-lames",
      titre: "Espacement entre lames",
      regleDtu: "DTU 51.4 § 6.2 : Jeu maximum recommandé 7 mm",
      valeurConstatee: `${config.espacement_lames_mm} mm (trop large)`,
      statut: "avertissement",
      recommandation: "Réduire le jeu à 5-6 mm pour le confort de marche et éviter le passage d'objets ou talons.",
    });
  }

  // 4. Ventilation sous platelage
  const hauteurMinRequiseCm = config.type_sol === "dalle_beton" ? 2.0 : 5.0;
  if (config.hauteur_sol_cm >= hauteurMinRequiseCm) {
    controles.push({
      id: "dtu-ventilation-sous-platelage",
      titre: "Garde au sol & ventilation sous platelage",
      regleDtu: `DTU 51.4 § 5.1 : Hauteur minimale de ${hauteurMinRequiseCm} cm requise sur ${config.type_sol === "dalle_beton" ? "dalle béton" : "sol meuble"}`,
      valeurConstatee: `${config.hauteur_sol_cm} cm`,
      statut: "conforme",
      recommandation: "Ventilation sous-face suffisante pour la longévité de la structure.",
    });
  } else {
    controles.push({
      id: "dtu-ventilation-sous-platelage",
      titre: "Garde au sol & ventilation sous platelage",
      regleDtu: `DTU 51.4 § 5.1 : Hauteur minimale de ${hauteurMinRequiseCm} cm requise`,
      valeurConstatee: `${config.hauteur_sol_cm} cm (ventilation insuffisante)`,
      statut: "non_conforme",
      recommandation: "Rehausser les plots ou décaisser le sol pour ménager une lame d'air de circulation d'au moins 5 cm.",
    });
  }

  // 5. Pente d'évacuation des eaux
  if (config.pente_pct >= 1.5) {
    controles.push({
      id: "dtu-pente-ecoulement",
      titre: "Pente d'évacuation de l'eau",
      regleDtu: "DTU 51.4 § 5.2 : Pente minimale recommandée de 1.5 % dans le sens de la pente",
      valeurConstatee: `${config.pente_pct} %`,
      statut: "conforme",
      recommandation: "Pente suffisante pour empêcher toute stagnation prolongée d'eau.",
    });
  } else if (config.pente_pct >= 1.0) {
    controles.push({
      id: "dtu-pente-ecoulement",
      titre: "Pente d'évacuation de l'eau",
      regleDtu: "DTU 51.4 § 5.2 : Pente recommandée 1.5 %",
      valeurConstatee: `${config.pente_pct} %`,
      statut: "avertissement",
      recommandation: "Prévoir idéalement 1.5 % pour éviter l'encrassement et le développement de mousses.",
    });
  } else {
    controles.push({
      id: "dtu-pente-ecoulement",
      titre: "Pente d'évacuation de l'eau",
      regleDtu: "DTU 51.4 § 5.2 : Pente minimale 1.5 %",
      valeurConstatee: `${config.pente_pct} % (pente quasi nulle)`,
      statut: "non_conforme",
      recommandation: "Créer une pente d'au moins 1.5 % sur le support pour assurer l'évacuation pluviale.",
    });
  }

  // 6. Double lambourdage aux aboutages
  if (config.double_lambourdage_aboutage) {
    controles.push({
      id: "dtu-double-lambourdage",
      titre: "Aboutage des lames",
      regleDtu: "DTU 51.4 § 6.3 : Double lambourdage ou lambourde large obligatoire aux jonctions de bout de lame",
      valeurConstatee: "Activé (double lambourde avec cales)",
      statut: "conforme",
      recommandation: "Permet de respecter la distance de fixation à 20 mm du bord et d'éviter les pièges à eau.",
    });
  } else {
    controles.push({
      id: "dtu-double-lambourdage",
      titre: "Aboutage des lames",
      regleDtu: "DTU 51.4 § 6.3 : Deux vis indépendantes par lame requises à 20 mm du bout",
      valeurConstatee: "Lambourde simple unique aux aboutages",
      statut: "avertissement",
      recommandation: "Activer le double lambourdage pour éviter de fendre les extrémités de lames au vissage.",
    });
  }

  // 7. Protection de la lambourde (Bande bitumineuse / EPDM)
  if (config.bande_etancheite_epdm) {
    controles.push({
      id: "dtu-bande-epdm",
      titre: "Protection des lambourdes (Bande EPDM)",
      regleDtu: "DTU 51.4 § 5.4 : Bande de protection étanche recommandée sur lambourde bois",
      valeurConstatee: "Présente",
      statut: "conforme",
      recommandation: "Protège le bois des eaux d'infiltration et amortit les bruits d'impact.",
    });
  } else if (config.type_lambourde !== "alu_structure") {
    controles.push({
      id: "dtu-bande-epdm",
      titre: "Protection des lambourdes (Bande EPDM)",
      regleDtu: "DTU 51.4 § 5.4 : Bande bitumineuse ou EPDM recommandée",
      valeurConstatee: "Absente",
      statut: "avertissement",
      recommandation: "Ajouter une bande EPDM sur les lambourdes pour doubler la durée de vie de l'ossature.",
    });
  }

  // 8. Feutre géotextile sur sol meuble
  if (config.type_sol === "terre_meuble" || config.type_sol === "stabilise_grave") {
    if (config.geotextile) {
      controles.push({
        id: "dtu-geotextile",
        titre: "Barrière anti-végétation (Géotextile)",
        regleDtu: "DTU 51.4 § 4.2 : Feutre géotextile requis sous platelage sur sol naturel",
        valeurConstatee: "Prévu",
        statut: "conforme",
        recommandation: "Empêche la pousse de mauvaises herbes qui bloqueraient la ventilation.",
      });
    } else {
      controles.push({
        id: "dtu-geotextile",
        titre: "Barrière anti-végétation (Géotextile)",
        regleDtu: "DTU 51.4 § 4.2 : Feutre géotextile obligatoire sur sol naturel",
        valeurConstatee: "Non prévu",
        statut: "non_conforme",
        recommandation: "Poser un feutre géotextile avec recouvrement de 20 cm sous toute l'emprise.",
      });
    }
  }

  // 9. Garde-corps & sécurité antichute (NF P01-012)
  if (config.hauteur_sol_cm > 100) {
    if (!config.presence_garde_corps) {
      controles.push({
        id: "norme-garde-corps-obligatoire",
        titre: "Garde-corps antichute (NF P01-012)",
        regleDtu: "Norme NF P01-012 : Garde-corps obligatoire si hauteur de chute > 1.00 m",
        valeurConstatee: `Hauteur de ${config.hauteur_sol_cm} cm sans garde-corps`,
        statut: "non_conforme",
        recommandation: "Ajouter impérativement un garde-corps d'au moins 1.00 m de hauteur sur les côtés ouverts.",
      });
    } else if (config.garde_corps_hauteur_cm < 100) {
      controles.push({
        id: "norme-garde-corps-hauteur",
        titre: "Hauteur du garde-corps",
        regleDtu: "Norme NF P01-012 : Hauteur minimale de 1.00 m obligatoire",
        valeurConstatee: `${config.garde_corps_hauteur_cm} cm`,
        statut: "non_conforme",
        recommandation: "Porter la hauteur du garde-corps à 100 cm minimum.",
      });
    } else {
      controles.push({
        id: "norme-garde-corps-conforme",
        titre: "Garde-corps antichute (NF P01-012)",
        regleDtu: "Norme NF P01-012 : Garde-corps conforme présent (H ≥ 1.00 m)",
        valeurConstatee: `${config.garde_corps_longueur_ml} ml de garde-corps (${config.garde_corps_hauteur_cm} cm)`,
        statut: "conforme",
        recommandation: "Sécurité antichute assurée.",
      });
    }
  } else if (config.hauteur_sol_cm >= 45 && !config.presence_garde_corps) {
    controles.push({
      id: "norme-garde-corps-recommande",
      titre: "Sécurité de rive (chute > 45 cm)",
      regleDtu: "Recommandation : Garde-corps conseillé à partir de 45 cm de dénivelé",
      valeurConstatee: `Hauteur de rive ${config.hauteur_sol_cm} cm`,
      statut: "avertissement",
      recommandation: "Envisager un garde-corps ou une marche intermédiaire pour sécuriser la bordure.",
    });
  }

  // 10. Escaliers & Loi de Blondel (si escalier configuré)
  if (config.presence_escalier) {
    const blondel = 2 * config.escalier_hauteur_marche_cm + config.escalier_giron_cm;
    if (blondel >= 60 && blondel <= 64) {
      controles.push({
        id: "norme-escalier-blondel",
        titre: "Confort escalier (Loi de Blondel)",
        regleDtu: "Règle de l'art : 2H + G compris entre 60 cm et 64 cm",
        valeurConstatee: `2×${config.escalier_hauteur_marche_cm} + ${config.escalier_giron_cm} = ${blondel.toFixed(1)} cm`,
        statut: "conforme",
        recommandation: "Escalier ergonomique et confortable.",
      });
    } else {
      controles.push({
        id: "norme-escalier-blondel",
        titre: "Confort escalier (Loi de Blondel)",
        regleDtu: "Règle de l'art : 2H + G doit être compris entre 60 cm et 64 cm",
        valeurConstatee: `2×${config.escalier_hauteur_marche_cm} + ${config.escalier_giron_cm} = ${blondel.toFixed(1)} cm`,
        statut: "avertissement",
        recommandation: `Ajuster la marche ou le giron (actuellement ${blondel.toFixed(1)} cm) pour cibler ~62 cm.`,
      });
    }
  }

  // Synthèse globale
  const nbNonConformes = controles.filter((c) => c.statut === "non_conforme").length;
  const nbAvertissements = controles.filter((c) => c.statut === "avertissement").length;
  const nbConformes = controles.filter((c) => c.statut === "conforme").length;

  let statutGlobal: StatutControle = "conforme";
  if (nbNonConformes > 0) {
    statutGlobal = "non_conforme";
  } else if (nbAvertissements > 0) {
    statutGlobal = "avertissement";
  }

  return {
    statutGlobal,
    controles,
    nbConformes,
    nbAvertissements,
    nbNonConformes,
  };
}
