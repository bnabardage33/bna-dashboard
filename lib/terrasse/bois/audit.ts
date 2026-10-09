// Moteur d'audit de conformité technique pour terrasse bois (Vissage & Clips)
// Référentiels : DTU 51.4 P1-1 et Avis Techniques / CPT 3669

import {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  ControleDTU51_4,
  RapportConformiteDTU,
  StatutControle,
} from "../types";
import { verifierEligibiliteClipBois } from "./clipsBois";
import { getEssenceBoisDetail } from "./essences";
import { calculerVissageApparentDTU } from "./vissage";

export function auditBois(
  config: ChantierTerrasseConfig,
  reservations: ChantierTerrasseReservation[] = []
): RapportConformiteDTU {
  const controles: ControleDTU51_4[] = [];
  const essenceDetail = getEssenceBoisDetail(config.essence_bois);
  const zone = config.zone_environnement || "normal";
  const estModeClip =
    config.systeme_terrasse === "bois_clip" ||
    config.type_fixation === "clips_invisibles";

  // 1. Entraxe des lambourdes (Règle DTU 51.4 P1-1 § 5.2)
  const ratioMax = essenceDetail.ratioEntraxeEpaisseur;
  const entraxeMaxCm = Math.floor((config.epaisseur_lame_mm * ratioMax) / 10);
  const entraxeReelCm = config.entraxe_lambourdes_cm || 40;

  if (entraxeReelCm > entraxeMaxCm) {
    controles.push({
      id: "bois_entraxe",
      titre: "Entraxe des lambourdes (DTU 51.4)",
      regleDtu: `Entraxe max ≤ ${ratioMax} x épaisseur (${ratioMax} x ${config.epaisseur_lame_mm}mm = ${entraxeMaxCm} cm)`,
      valeurConstatee: `${entraxeReelCm} cm`,
      statut: "non_conforme",
      recommandation: `Réduire l'entraxe à maximum ${entraxeMaxCm} cm pour respecter la résistance mécanique DTU 51.4.`,
      sourceNormative: "NF DTU 51.4 P1-1 § 5.2",
    });
  } else {
    controles.push({
      id: "bois_entraxe",
      titre: "Entraxe des lambourdes (DTU 51.4)",
      regleDtu: `Entraxe max admissible : ${entraxeMaxCm} cm`,
      valeurConstatee: `${entraxeReelCm} cm`,
      statut: "conforme",
      recommandation: `Entraxe conforme aux spécifications de l'essence ${essenceDetail.nom}.`,
      sourceNormative: "NF DTU 51.4 P1-1 § 5.2",
    });
  }

  // 2. Mode de fixation & Compatibilité
  if (estModeClip) {
    const verif = verifierEligibiliteClipBois(
      config.essence_bois,
      config.largeur_lame_mm,
      config.epaisseur_lame_mm,
      zone
    );
    if (!verif.estEligible) {
      controles.push({
        id: "bois_fixation_clip",
        titre: "Éligibilité fixation invisible sur bois",
        regleDtu: "Clips invisibles autorisés UNIQUEMENT sur essences stables ≤ 120 mm sous Avis Technique",
        valeurConstatee: `${essenceDetail.nom} en ${config.largeur_lame_mm} mm`,
        statut: "non_conforme",
        recommandation: verif.motif || "Basculez en vissage apparent ou choisissez une essence stable ≤ 120 mm.",
        sourceNormative: "Avis Techniques CSTB & DTU 51.4",
      });
    } else {
      controles.push({
        id: "bois_fixation_clip",
        titre: "Éligibilité fixation invisible sur bois",
        regleDtu: "Essence et profil validés pour fixation invisible sous Avis Technique",
        valeurConstatee: `${essenceDetail.nom} ${config.largeur_lame_mm} mm (≤ ${verif.largeurMaxAutoriseeMm} mm)`,
        statut: "conforme",
        recommandation: `Respecter les cales d'écartement de ${verif.jeuTransversalRecommandeMm} mm pour le gonflement du bois.`,
        sourceNormative: "Avis Techniques CSTB",
      });
    }
  } else {
    // Vissage apparent DTU 51.4
    const specVis = calculerVissageApparentDTU(
      config.epaisseur_lame_mm,
      config.largeur_lame_mm,
      config.essence_bois,
      zone
    );
    controles.push({
      id: "bois_vissage_apparent",
      titre: "Vissage apparent (DTU 51.4)",
      regleDtu: `2 vis Inox ${specVis.inoxGrade} diam. ≥ 5mm, L ≥ ${specVis.longueurVisMinMm}mm à ${specVis.distanceRiveMm}mm des bords`,
      valeurConstatee: "2 vis par croisement",
      statut: "conforme",
      recommandation: specVis.prepercageRequis
        ? "Pré-perçage et fraisage impératifs sur bois exotique haute densité."
        : "Vissage direct avec vis auto-foreuses spécifiques terrasse.",
      sourceNormative: "NF DTU 51.4 P1-1 § 5.4",
    });
  }

  // 3. Zone environnementale & Inox
  if (zone === "piscine" || zone === "littoral") {
    controles.push({
      id: "bois_inox_zone",
      titre: "Nuance d'Inox en milieu agressif",
      regleDtu: "Inox A4 Marine obligatoire en zone piscine (chlore/sel) et bord de mer (embruns)",
      valeurConstatee: `Zone ${zone.toUpperCase()} → Inox A4 requis`,
      statut: "conforme",
      recommandation: "Vis et accessoires Inox A4 Marine indispensables pour éviter la corrosion prématurée.",
      sourceNormative: "NF DTU 51.4 P1-1 § 5.4.1",
    });
  }

  // 4. Double lambourdage aux aboutages
  const longueurLameM = config.longueur_lame_m || 4.0;
  if (config.longueur_m > longueurLameM) {
    if (!config.double_lambourdage_aboutage) {
      controles.push({
        id: "bois_aboutage",
        titre: "Double lambourde aux aboutages",
        regleDtu: "Chaque bout de lame doit reposer sur sa propre lambourde (largeur minimale d'appui 40 mm)",
        valeurConstatee: "Lambourde simple",
        statut: "non_conforme",
        recommandation: "Activer le double lambourdage à l'aboutage pour respecter la portée d'appui de 40 mm par lame.",
        sourceNormative: "NF DTU 51.4 P1-1 § 5.3",
      });
    } else {
      controles.push({
        id: "bois_aboutage",
        titre: "Double lambourde aux aboutages",
        regleDtu: "Double lambourdage activé",
        valeurConstatee: "Double lambourde active",
        statut: "conforme",
        recommandation: "Appui complet assuré sur chaque extrémité de lame.",
        sourceNormative: "NF DTU 51.4 P1-1 § 5.3",
      });
    }
  }

  // 5. Bande EPDM sur lambourdes bois
  if (config.type_lambourde !== "alu_structure") {
    if (!config.bande_etancheite_epdm) {
      controles.push({
        id: "bois_epdm",
        titre: "Bande d'étanchéité EPDM sur lambourdes",
        regleDtu: "Bande bitumineuse ou EPDM recommandée pour protéger le dessus de la lambourde du ruissellement",
        valeurConstatee: "Absente",
        statut: "avertissement",
        recommandation: "Poser une bande EPDM pour prolonger significativement la durée de vie des lambourdes.",
        sourceNormative: "NF DTU 51.4 P1-1 § 5.2.4",
      });
    } else {
      controles.push({
        id: "bois_epdm",
        titre: "Bande d'étanchéité EPDM sur lambourdes",
        regleDtu: "Bande EPDM protectrice présente",
        valeurConstatee: "Présente",
        statut: "conforme",
        recommandation: "Excellente protection contre le piégeage d'eau entre lame et lambourde.",
        sourceNormative: "NF DTU 51.4 P1-1 § 5.2.4",
      });
    }
  }

  // Synthèse
  const nbConformes = controles.filter((c) => c.statut === "conforme").length;
  const nbAvertissements = controles.filter((c) => c.statut === "avertissement").length;
  const nbNonConformes = controles.filter((c) => c.statut === "non_conforme").length;

  let statutGlobal: StatutControle = "conforme";
  if (nbNonConformes > 0) statutGlobal = "non_conforme";
  else if (nbAvertissements > 0) statutGlobal = "avertissement";

  return {
    statutGlobal,
    controles,
    nbConformes,
    nbAvertissements,
    nbNonConformes,
  };
}
