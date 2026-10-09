// Moteur d'audit de conformité technique pour terrasse composite + clips invisibles
// Référentiels : DTA CSTB GS 2.1, CPT applicables, Prescriptions des fabricants (Silvadec, Fiberdeck, NeoLife, etc.)

import {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  ControleDTU51_4,
  RapportConformiteDTU,
  StatutControle,
} from "../types";
import { estDTAExpire, getFabricantComposite, getGammeDefaut } from "./fabricants";

export function auditComposite(
  config: ChantierTerrasseConfig,
  reservations: ChantierTerrasseReservation[] = []
): RapportConformiteDTU {
  const fabricant = getFabricantComposite(config.fabricant_composite);
  const gamme = config.gamme_composite
    ? (fabricant.gammes.find((g) => g.gamme === config.gamme_composite) || getGammeDefaut(fabricant))
    : getGammeDefaut(fabricant);

  const zone = config.zone_environnement || "normal";
  const controles: ControleDTU51_4[] = [];

  // 1. Audit Validité DTA CSTB (Avis Technique)
  const dta = fabricant.dta;
  const dtaExpire = estDTAExpire(dta);
  if (dtaExpire) {
    controles.push({
      id: "comp_dta_expiration",
      titre: `DTA CSTB Fabricant (${fabricant.nom})`,
      regleDtu: `DTA ${dta.numero} en cours de validité (CSTB GS 2.1)`,
      valeurConstatee: `Expiré le ${dta.expirationDTA}`,
      statut: "avertissement",
      recommandation: `Le DTA CSTB est arrivé à échéance. Vérifier le renouvellement auprès de ${fabricant.nom} pour conformité décennale.`,
      sourceNormative: `CSTB ${dta.groupeSpecialise}`,
    });
  } else {
    controles.push({
      id: "comp_dta_expiration",
      titre: `DTA CSTB Fabricant (${fabricant.nom})`,
      regleDtu: `DTA ${dta.numero} valide jusqu'au ${dta.expirationDTA}`,
      valeurConstatee: `Valide (${dta.versionDTA})`,
      statut: "conforme",
      recommandation: `Matériau et système sous certification CSTB active.`,
      sourceNormative: `CSTB ${dta.groupeSpecialise}`,
    });
  }

  // 2. Entraxe des lambourdes vs certification DTA
  const entraxeReelCm = config.entraxe_lambourdes_cm || 40;
  const entraxeMaxCm = gamme.entraxeMaxCm;
  if (entraxeReelCm > entraxeMaxCm) {
    controles.push({
      id: "comp_entraxe_lambourdes",
      titre: "Entraxe des lambourdes (Fluage thermique)",
      regleDtu: `Entraxe max certifié DTA pour ${gamme.gamme} : ≤ ${entraxeMaxCm} cm`,
      valeurConstatee: `${entraxeReelCm} cm`,
      statut: "non_conforme",
      recommandation: `Réduire l'entraxe à maximum ${entraxeMaxCm} cm pour éviter tout fléchissement irréversible du composite sous forte chaleur.`,
      sourceNormative: `DTA ${dta.numero} § Prescriptions de pose`,
    });
  } else {
    controles.push({
      id: "comp_entraxe_lambourdes",
      titre: "Entraxe des lambourdes (Fluage thermique)",
      regleDtu: `Entraxe max certifié DTA : ≤ ${entraxeMaxCm} cm`,
      valeurConstatee: `${entraxeReelCm} cm`,
      statut: "conforme",
      recommandation: `Entraxe conforme aux spécifications du fabricant.`,
      sourceNormative: `DTA ${dta.numero}`,
    });
  }

  // 3. Double lambourdage obligatoire à chaque aboutage
  const longueurLameM = config.longueur_lame_m || gamme.longueursDisponiblesM[0] || 4.0;
  const necessiteAboutage = config.longueur_m > longueurLameM;
  if (necessiteAboutage) {
    if (!config.double_lambourdage_aboutage) {
      controles.push({
        id: "comp_double_lambourdage",
        titre: "Double lambourde aux aboutages de lames",
        regleDtu: "Double lambourde avec 2 clips distincts obligatoire à chaque raccord longitudinal",
        valeurConstatee: "Lambourde simple",
        statut: "non_conforme",
        recommandation: "Interdiction DTA d'aboutiser deux lames composites sur une seule lambourde de 45mm : risque de rupture des clips.",
        sourceNormative: "DTA CSTB GS 2.1",
      });
    } else {
      controles.push({
        id: "comp_double_lambourdage",
        titre: "Double lambourde aux aboutages de lames",
        regleDtu: "Double lambourdage activé avec 2 clips par croisement",
        valeurConstatee: "Double lambourde active",
        statut: "conforme",
        recommandation: "Conforme aux prescriptions DTA de dilatation en bout de lame.",
        sourceNormative: "DTA CSTB GS 2.1",
      });
    }
  }

  // 4. Pente minimale pour évacuation
  const pentePct = config.pente_pct || 0;
  const penteMinPct = gamme.penteMinimalePct;
  if (pentePct < penteMinPct) {
    controles.push({
      id: "comp_pente",
      titre: "Pente d'évacuation de l'eau",
      regleDtu: `Pente minimale recommandée par ${fabricant.nom} : ≥ ${penteMinPct} %`,
      valeurConstatee: `${pentePct} %`,
      statut: "avertissement",
      recommandation: `Une pente inférieure à ${penteMinPct}% entraîne des retenues d'eau stagnante et favorise l'encrassement des surfaces rainurées.`,
      sourceNormative: `Guide de pose ${fabricant.nom}`,
    });
  } else {
    controles.push({
      id: "comp_pente",
      titre: "Pente d'évacuation de l'eau",
      regleDtu: `Pente minimale : ≥ ${penteMinPct} %`,
      valeurConstatee: `${pentePct} %`,
      statut: "conforme",
      recommandation: "Pente suffisante pour un bon écoulement gravitaire.",
      sourceNormative: `Guide de pose ${fabricant.nom}`,
    });
  }

  // 5. Ventilation sous-face
  const hauteurSolCm = config.hauteur_sol_cm || 0;
  const hauteurMinSolCm = gamme.ventilationSousFaceMm / 10;
  if (hauteurSolCm < hauteurMinSolCm) {
    controles.push({
      id: "comp_ventilation",
      titre: "Hauteur de ventilation sous platelage",
      regleDtu: `Garde au sol minimale pour circulation d'air : ≥ ${hauteurMinSolCm} cm (${gamme.ventilationSousFaceMm} mm)`,
      valeurConstatee: `${hauteurSolCm} cm`,
      statut: "non_conforme",
      recommandation: "Espace sous-face insuffisant : risque de surchauffe thermique en été et condensation stagnante.",
      sourceNormative: "CPT & DTA GS 2.1",
    });
  } else {
    controles.push({
      id: "comp_ventilation",
      titre: "Hauteur de ventilation sous platelage",
      regleDtu: `Garde au sol : ≥ ${hauteurMinSolCm} cm`,
      valeurConstatee: `${hauteurSolCm} cm`,
      statut: "conforme",
      recommandation: "Ventilation sous-face assurée.",
      sourceNormative: "CPT & DTA GS 2.1",
    });
  }

  // 6. Zone environnementale & Qualité de l'inox
  if (zone === "piscine" || zone === "littoral") {
    controles.push({
      id: "comp_inox_grade",
      titre: "Grade d'inox en environnement agressif",
      regleDtu: "Inox A4 Marine (AISI 316) obligatoire en zone piscine (chlore/sel) et littoral (embruns)",
      valeurConstatee: `Zone ${zone.toUpperCase()} détectée → Inox A4 requis`,
      statut: "conforme",
      recommandation: "Kit clips et vis Inox A4 Marine automatiquement spécifiés dans la nomenclature.",
      sourceNormative: "Règles professionnelles & DTA",
    });
  }

  // 7. Support aluminium vs bois
  if (gamme.supportAluRecommande && config.type_lambourde !== "alu_structure") {
    if (!config.bande_etancheite_epdm) {
      controles.push({
        id: "comp_support_epdm",
        titre: "Protection lambourdes bois sous composite",
        regleDtu: "Bande EPDM obligatoire si lambourdes bois sous platelage composite imperméable",
        valeurConstatee: "Aucune bande EPDM",
        statut: "non_conforme",
        recommandation: "Activer la bande EPDM ou opter pour une structure en lambourdes aluminium.",
        sourceNormative: `Guide de pose ${fabricant.nom}`,
      });
    } else {
      controles.push({
        id: "comp_support_structure",
        titre: "Nature du support lambourdes",
        regleDtu: `${fabricant.nom} recommande une structure aluminium pour une parfaite planéité pérenne`,
        valeurConstatee: "Lambourde bois autoclave Cl4 avec bande EPDM",
        statut: "avertissement",
        recommandation: "Admissible avec EPDM, mais l'aluminium offre une garantie décennale optimale sans déformation.",
        sourceNormative: `Guide ${fabricant.nom}`,
      });
    }
  }

  // 8. Réservations (piscines, trappes, etc.)
  if (reservations.length > 0) {
    controles.push({
      id: "comp_reservations_renfort",
      titre: "Encadrement et renforts des réservations",
      regleDtu: `${reservations.length} réservation(s) détectée(s) : double lambourdage et jeu périphérique requis`,
      valeurConstatee: `${reservations.length} réservation(s) configurée(s)`,
      statut: "conforme",
      recommandation: `Respecter un jeu périphérique de minimum ${gamme.jeuPeripheriqueMm} mm autour de chaque obstacle et poser un cadre de lambourdes.`,
      sourceNormative: "DTA CSTB GS 2.1",
    });
  }

  // Synthèse globale
  const nbConformes = controles.filter((c) => c.statut === "conforme").length;
  const nbAvertissements = controles.filter((c) => c.statut === "avertissement").length;
  const nbNonConformes = controles.filter((c) => c.statut === "non_conforme").length;

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
