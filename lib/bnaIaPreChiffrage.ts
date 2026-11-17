import { fmtEuro } from "@/lib/financeCalculs";
import { calculerPose, type FamillePose } from "@/lib/bardage/poseCalcul";
import { calculerHabillageOuverturesEtProfils1D } from "@/lib/bardage/pro/profils-finitions";
import {
  CADENCES_DEFAUT,
  calculerTempsPoseBardage,
  calculerTempsPoseTerrasse,
} from "@/lib/tempsPoseCalcul";
import {
  calculerTerrasse,
  convertirChiffrageTerrasseEnLignesDevis,
} from "@/lib/terrasse/calculs";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";
import type { FenceConfig, FenceMaterial } from "@/lib/cloture/calepinageCloture";
import { calculerChiffrageCloture } from "@/lib/cloture/calculs";
import type { MetierBna } from "@/lib/bnaIaService";
import type { ResultatMetre } from "@/lib/metre-serialization";
import { calculerParametresTerrasseNormatifs } from "@/lib/bnaReferentielTerrasse";
import { calculerParametresBardageNormatifs } from "@/lib/bnaReferentielBardage";

export interface LigneDevisIaPreRemplie {
  catalogue_id: string | null;
  designation: string;
  description: string;
  qte: number;
  unite: string;
  pu_ht: number;
  pu_revient: number | null;
  type_cout: "matiere" | "main_oeuvre";
  a_chiffrer: boolean;
}

export interface DevisPrefillPayload {
  objet: string;
  typeTravaux: string;
  surfaceM2: number;
  lignes: LigneDevisIaPreRemplie[];
}

export interface PreChiffrageBnaResult {
  metier: MetierBna;
  titre: string;
  surfaceOuLineaire: number;
  unitePrincipale: "m²" | "ml";
  heuresPoseTotal: number;
  totalMateriauxHt: number;
  totalMainOeuvreHt: number;
  totalHt: number;
  syntheseTexte: string;
  devisPrefill: DevisPrefillPayload;
  estMultiLots?: boolean;
  lots?: PreChiffrageBnaResult[];
  detailsBardage?: {
    surfaceBruteM2: number;
    surfaceOuverturesM2: number;
    surfaceNetteM2: number;
    nbCouchesIte: number;
    surfaceIsolantACommanderM2: number;
    nbPlaquesHplMeres: number;
    bavetteLongueurM: number;
    tableauLongueurM: number;
    linteauLongueurM: number;
    nbOuvertures: number;
    nbPignons: number;
  };
  detailsTerrasse?: {
    entraxeLambourdesMm: number;
    fabricant: string | null;
    visserieInox: "A4" | "A2" | "clips";
    alertePlotsDepassement: string | null;
  };
  detailsCloture?: {
    lineaireTotalM: number;
    nbPortillons: number;
    presencePortail: boolean;
    deductionPortailM: number;
  };
}

function arrondir(v: number): number {
  return Math.round(v * 100) / 100;
}

function parseNombreFr(raw: string): number {
  return Number(raw.replace(",", "."));
}

function extraireDimensionsOuverture(
  texte: string
): Array<{ id: string; nom: string; type: "fenetre" | "porte"; largeurM: number; hauteurM: number }> {
  const ouvertures: Array<{
    id: string;
    nom: string;
    type: "fenetre" | "porte";
    largeurM: number;
    hauteurM: number;
  }> = [];

  const regexOuv =
    /(?:\b(\d+)\s+)?(fen[êe]tre|baie|porte(?:-fen[êe]tre)?|ouverture)s?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*(?:m\s*)?[x×*]\s*(\d+(?:[.,]\d+)?)/gi;

  let m: RegExpExecArray | null;
  let idx = 1;
  while ((m = regexOuv.exec(texte)) !== null) {
    const nb = Math.max(1, Number(m[1] || 1));
    const typeRaw = m[2].toLowerCase();
    const largeurM = parseNombreFr(m[3]);
    const hauteurM = parseNombreFr(m[4]);
    if (largeurM > 0 && hauteurM > 0) {
      for (let i = 0; i < nb; i++) {
        ouvertures.push({
          id: `ouv-${idx}`,
          nom: `${typeRaw.includes("porte") ? "Porte" : "Fenêtre"} ${idx}`,
          type: typeRaw.includes("porte") ? "porte" : "fenetre",
          largeurM,
          hauteurM,
        });
        idx++;
      }
    }
  }
  return ouvertures;
}

function calculerPreChiffrageBardage(
  message: string,
  options?: { autoriserHypotheseMaison?: boolean }
): PreChiffrageBnaResult | null {
  const lower = message.toLowerCase();
  const sansOuvertures = message.replace(
    /(?:\b\d+\s+)?(fen[êe]tre|baie|porte(?:-fen[êe]tre)?|ouverture)s?\s*(?:de\s*)?\d+(?:[.,]\d+)?\s*(?:m\s*)?[x×*]\s*\d+(?:[.,]\d+)?/gi,
    " "
  );

  // 0a. Extraction de TOUS les pignons (largeur + faîtage + égout)
  interface SegmentBardage {
    type: "facade" | "pignon";
    largeurM: number;
    hauteurMurM: number;
    hauteurFaiteM: number | null;
    surfaceBruteM2: number;
  }
  const segments: SegmentBardage[] = [];
  let sansPignons = sansOuvertures;

  const regexPignon =
    /(?:(\d+)\s*)?pignons?\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*m?\b[^.;\n]*?(?:fa[îi]tage\s*(?:de\s*|à\s*)?(\d+(?:[.,]\d+)?)\s*m?\b[^.;\n]*?[ée]gouts?\s*(?:de\s*|à\s*)?(\d+(?:[.,]\d+)?)\s*m?\b|[ée]gouts?\s*(?:de\s*|à\s*)?(\d+(?:[.,]\d+)?)\s*m?\b[^.;\n]*?fa[îi]tage\s*(?:de\s*|à\s*)?(\d+(?:[.,]\d+)?)\s*m?\b)/gi;

  sansPignons = sansPignons.replace(
    regexPignon,
    (_full, nbRaw, largRaw, fait1, egout1, egout2, fait2) => {
      const nb = Math.max(1, Number(nbRaw || 1));
      const larg = parseNombreFr(largRaw);
      const hFait = parseNombreFr(fait1 || fait2);
      const hEgout = parseNombreFr(egout1 || egout2);
      if (larg > 0 && hFait > 0 && hEgout > 0) {
        const surfTrap = arrondir((larg * (hEgout + hFait)) / 2);
        for (let i = 0; i < nb; i++) {
          segments.push({
            type: "pignon",
            largeurM: larg,
            hauteurMurM: hEgout,
            hauteurFaiteM: hFait,
            surfaceBruteM2: surfTrap,
          });
        }
      }
      return " ";
    }
  );

  // 0b. Extraction de TOUTES les façades rectangulaires L × H
  const regexFacade =
    /(?:(double|deux|\d+)\s*fa[çc]ades?\s*(?:de\s*)?)?(\d+(?:[.,]\d+)?)\s*(?:m\s*)?(?:[x×*]|sur)\s*(\d+(?:[.,]\d+)?)\s*m?\b/gi;
  let mFac: RegExpExecArray | null;
  const facadesTrouvees: Array<{ nb: number; largeurM: number; hauteurM: number }> = [];
  while ((mFac = regexFacade.exec(sansPignons)) !== null) {
    const multRaw = mFac[1]?.toLowerCase();
    const nb =
      multRaw === "double" || multRaw === "deux"
        ? 2
        : multRaw
          ? Math.max(1, Number(multRaw))
          : 1;
    const w = parseNombreFr(mFac[2]);
    const h = parseNombreFr(mFac[3]);
    if (w > 0 && h > 0) {
      facadesTrouvees.push({ nb, largeurM: w, hauteurM: h });
    }
  }

  if (
    facadesTrouvees.length === 1 &&
    facadesTrouvees[0].nb === 1 &&
    /double\s*fa[çc]ade|2\s*fa[çc]ades|deux\s*fa[çc]ades/i.test(sansPignons)
  ) {
    facadesTrouvees[0].nb = 2;
  }

  for (const f of facadesTrouvees) {
    for (let i = 0; i < f.nb; i++) {
      segments.push({
        type: "facade",
        largeurM: f.largeurM,
        hauteurMurM: f.hauteurM,
        hauteurFaiteM: null,
        surfaceBruteM2: arrondir(f.largeurM * f.hauteurM),
      });
    }
  }

  let estHypotheseMaison = false;
  const estEtageR1 = /[ée]tage|r\+1/i.test(lower);
  const aGarage = /garage/i.test(lower);

  // Fallback surface globale en m² si aucune dimension L×H ni pignon
  if (segments.length === 0) {
    const matchM2 = sansPignons.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
    if (matchM2) {
      const surf = parseNombreFr(matchM2[1]);
      if (surf > 0) {
        segments.push({
          type: "facade",
          largeurM: arrondir(surf / 3.0),
          hauteurMurM: 3.0,
          hauteurFaiteM: null,
          surfaceBruteM2: arrondir(surf),
        });
      }
    } else if (
      (options?.autoriserHypotheseMaison ||
        /maison|[ée]tage|r\+1|4\s*c[ôo]t[ée]s?|garage/i.test(lower)) &&
      /maison|[ée]tage|r\+1|4\s*c[ôo]t[ée]s?|garage/i.test(lower)
    ) {
      // Hypothèses de référence réalistes pour Maison R+1 / 4 côtés + garage attenant (à affiner dans le Calepineur 3D)
      estHypotheseMaison = true;
      const hMaison = estEtageR1 ? 5.5 : 3.0;
      segments.push(
        { type: "facade", largeurM: 10, hauteurMurM: hMaison, hauteurFaiteM: null, surfaceBruteM2: arrondir(10 * hMaison) },
        { type: "facade", largeurM: 10, hauteurMurM: hMaison, hauteurFaiteM: null, surfaceBruteM2: arrondir(10 * hMaison) },
        { type: "facade", largeurM: 8, hauteurMurM: hMaison, hauteurFaiteM: null, surfaceBruteM2: arrondir(8 * hMaison) },
        { type: "facade", largeurM: 8, hauteurMurM: hMaison, hauteurFaiteM: null, surfaceBruteM2: arrondir(8 * hMaison) }
      );
      if (aGarage) {
        // Garage attenant 6m x 3.5m sur 2.80m (3 faces visibles)
        segments.push(
          { type: "facade", largeurM: 6, hauteurMurM: 2.8, hauteurFaiteM: null, surfaceBruteM2: arrondir(6 * 2.8) },
          { type: "facade", largeurM: 3.5, hauteurMurM: 2.8, hauteurFaiteM: null, surfaceBruteM2: arrondir(3.5 * 2.8) },
          { type: "facade", largeurM: 6, hauteurMurM: 2.8, hauteurFaiteM: null, surfaceBruteM2: arrondir(6 * 2.8) }
        );
      }
    }
  }

  if (segments.length === 0) return null;

  const ouvertures = extraireDimensionsOuverture(message);
  if (estHypotheseMaison || /porte\s*(?:de\s*)?garage/i.test(lower)) {
    if (
      /porte\s*(?:de\s*)?garage/i.test(lower) &&
      !ouvertures.some((o) => o.nom.toLowerCase().includes("garage"))
    ) {
      ouvertures.push({
        id: `ouv-garage-${ouvertures.length + 1}`,
        nom: "Porte de garage (réf. 2,40×2,15 m)",
        type: "porte",
        largeurM: 2.4,
        hauteurM: 2.15,
      });
    }
    const sansPorteGarage = lower.replace(/porte\s*(?:de\s*)?garage/gi, " ");
    if (
      /\bporte(?:\s*d['’]entr[ée]e)?\b/i.test(sansPorteGarage) &&
      !ouvertures.some((o) => o.nom.toLowerCase().includes("entrée"))
    ) {
      ouvertures.push({
        id: `ouv-entree-${ouvertures.length + 1}`,
        nom: "Porte d'entrée (réf. 0,90×2,15 m)",
        type: "porte",
        largeurM: 0.9,
        hauteurM: 2.15,
      });
    }
    if (/fen[êe]tres?/i.test(lower) && !ouvertures.some((o) => o.type === "fenetre")) {
      const nbFenRef = estEtageR1 ? 6 : 4;
      for (let i = 1; i <= nbFenRef; i++) {
        ouvertures.push({
          id: `ouv-fen-ref-${i}`,
          nom: `Fenêtre ${i} (réf. 1,20×1,20 m)`,
          type: "fenetre",
          largeurM: 1.2,
          hauteurM: 1.2,
        });
      }
    }
  }
  const surfaceBruteM2 = arrondir(
    segments.reduce((s, seg) => s + seg.surfaceBruteM2, 0)
  );
  const surfaceOuverturesM2 = arrondir(
    ouvertures.reduce((s, o) => s + o.largeurM * o.hauteurM, 0)
  );
  const surfaceNetteM2 = arrondir(Math.max(0, surfaceBruteM2 - surfaceOuverturesM2));
  const nbPignons = segments.filter((s) => s.type === "pignon").length;
  const nbFacadesRect = segments.filter((s) => s.type === "facade").length;

  const estHpl = /hpl|trespa|polyrey|fundermax|compact/i.test(lower);
  const estComposite = /composite/i.test(lower);
  const estClaireVoie = /claire[-\s]?voie/i.test(lower);
  const famille: FamillePose = estHpl
    ? "hpl"
    : estComposite
      ? "composite"
      : "bois_naturel";

  const iteActif = /\bite\b|isolant|isolation|laine/i.test(lower);
  const nbCouchesIte =
    iteActif && /ite\s*2|2\s*couches|deux\s*couches|double\s*couche/i.test(lower)
      ? 2
      : iteActif
        ? 1
        : 0;

  // 1. Calcul ossature & isolant via le moteur réel BNA (poseCalcul.ts) sur chaque zone
  let nbSegmentsChevrons = 0;
  let nbEquerresTotal = 0;
  let nbChevillesMurales = 0;
  let lineaireEpdm = 0;
  let nbVisParement = 0;
  let nbEquerresPorteuses = 0;
  let nbEquerresGuides = 0;

  const zonesMetre: ResultatMetre[] = segments.map((seg, idx) => {
    const hCalcul =
      seg.type === "pignon" && seg.hauteurFaiteM
        ? arrondir((seg.hauteurMurM + seg.hauteurFaiteM) / 2)
        : seg.hauteurMurM;
    const poseZone = calculerPose(famille, seg.largeurM, hCalcul, true, 1, 135, {
      epaisseurIsolantMm: iteActif ? 140 : 0,
      typeIsolant: "laine_roche",
      surfacePaquetM2: 4.8,
      moduleLargeurMm: estHpl ? 1300 : undefined,
      moduleHauteurMm: estHpl ? 3050 : undefined,
    });

    nbSegmentsChevrons += poseZone.nbSegmentsChevrons;
    nbEquerresTotal += poseZone.nbFixationsTotal;
    nbChevillesMurales += poseZone.nbChevillesMurales;
    lineaireEpdm += poseZone.lineaireBandeEPDMM;
    nbVisParement += poseZone.nbVisParement;
    nbEquerresPorteuses += poseZone.nbEquerresPorteuses;
    nbEquerresGuides += poseZone.nbEquerresGuides;

    const ouvZone = idx === 0 ? ouvertures : [];
    const surfOuvZone = ouvZone.reduce((s, o) => s + o.largeurM * o.hauteurM, 0);
    const surfNetteZone = Math.max(0, seg.surfaceBruteM2 - surfOuvZone);

    return {
      version_moteur: "1.0.0",
      calcule_le: new Date().toISOString(),
      entrees: {
        type: seg.type,
        largeur: seg.largeurM,
        hauteur_mur: seg.hauteurMurM,
        hauteur_faite: seg.hauteurFaiteM,
        materiau: estHpl ? "plaques" : "lames",
        famille_pose: famille,
        angle: true,
        largeur_lame_mm: estHpl ? null : 135,
        plaque_longueur_mm: estHpl ? 3050 : null,
        plaque_largeur_mm: estHpl ? 1300 : null,
        module_largeur_mm: estHpl ? 1300 : null,
        module_hauteur_mm: estHpl ? 3050 : null,
        sens_pose: "horizontal",
        type_isolant: iteActif ? "laine_roche" : "sans_isolant",
        epaisseur_isolant_mm: iteActif ? 140 : 0,
        surface_paquet_m2: 4.8,
        zone_vent_rive: true,
        coef_perte_rendement: 1.1,
        autoriser_rotation: true,
        ouvertures: ouvZone.map((o) => ({
          id: o.id,
          type: o.type,
          largeur: o.largeurM,
          hauteur: o.hauteurM,
        })),
      },
      resultat_zone: {
        bruteFacade: seg.type === "facade" ? seg.surfaceBruteM2 : 0,
        brutePignon: seg.type === "pignon" ? seg.surfaceBruteM2 : 0,
        pente: 0,
        totalOuvertures: surfOuvZone,
        surfaceNette: surfNetteZone,
        surfaceACommander: arrondir(surfNetteZone * 1.1),
        nombreOuvertures: ouvZone.length,
        totalCoupesML: 0,
        lamesACommander: 0,
        surfaceTheoriqueLames: 0,
        lamesNeuvesSimul: 0,
        morceauxReutilises: 0,
        longueurChutesGenerees: 0,
        longueurChutesReutilisees: 0,
        chutesPerdues: 0,
        marge: 1.1,
      },
      resultat_pose: poseZone,
      resultat_calepinage: null,
    };
  });
  lineaireEpdm = arrondir(lineaireEpdm);

  const largeurTotale = segments.reduce((s, seg) => s + seg.largeurM, 0);
  const hauteurRef = segments[0].hauteurMurM;

  // 2. Calcul habillage ouvertures & profilés 1D (barres 3,00 m)
  const profils = calculerHabillageOuverturesEtProfils1D({
    largeurM: largeurTotale,
    hauteurMurM: hauteurRef,
    nbAnglesSortants: 2 * segments.length,
    ouvertures,
  });

  // 3. Calcul temps de pose réel (tempsPoseCalcul.ts — inclut majoration +25% sur pignons)
  const tempsPose = calculerTempsPoseBardage(zonesMetre, {
    claireVoie: estClaireVoie,
  });

  // Heures supplémentaires si ITE 2 couches croisées (+65% sur phase isolation)
  const heuresIte2 =
    nbCouchesIte === 2 ? arrondir(tempsPose.parPhase.isolation * 0.65) : 0;
  const heuresPoseTotal = arrondir(tempsPose.totalHeures + heuresIte2);

  // Quantités HPL plaques mères 3,05 × 1,30 m = 3,965 m² (CSTB 3194)
  const surfaceParementApproM2 = arrondir(surfaceNetteM2 * 1.1);
  const nbPlaquesHplMeres = estHpl
    ? Math.ceil(surfaceParementApproM2 / (3.05 * 1.3))
    : 0;

  const surfaceIsolantACommanderM2 =
    nbCouchesIte > 0 ? arrondir(surfaceNetteM2 * 1.08 * nbCouchesIte) : 0;
  const nbPaquetsIsolant =
    surfaceIsolantACommanderM2 > 0
      ? Math.ceil(surfaceIsolantACommanderM2 / 4.8)
      : 0;

  const puParementM2 = estHpl ? 89 : estComposite ? 74 : 52;
  const lignesDevis: LigneDevisIaPreRemplie[] = [
    {
      catalogue_id: null,
      designation: estHpl
        ? `Panneaux HPL (plaques mères 3,05 × 1,30 m — ${nbPlaquesHplMeres} plaques, CSTB 3194)`
        : `Parement bardage ${estComposite ? "Composite" : estClaireVoie ? "Bois claire-voie" : "Bois massif"} (DTU 41.2)`,
      description: `Surface nette ${surfaceNetteM2} m² (brute ${surfaceBruteM2} m² − ouvertures ${surfaceOuverturesM2} m²) + 10 % calepinage`,
      qte: surfaceParementApproM2,
      unite: "m²",
      pu_ht: puParementM2,
      pu_revient: arrondir(puParementM2 * 0.62),
      type_cout: "matiere",
      a_chiffrer: false,
    },
    ...(nbCouchesIte > 0
      ? [
          {
            catalogue_id: null,
            designation: `Isolant ITE laine de roche (${nbCouchesIte} couche${nbCouchesIte > 1 ? "s" : ""} croisée${nbCouchesIte > 1 ? "s" : ""}, ${nbPaquetsIsolant} paquets de 4,8 m²)`,
            description: `Surface nette ${surfaceNetteM2} m² × ${nbCouchesIte} couche(s) + 8 % pertes`,
            qte: surfaceIsolantACommanderM2,
            unite: "m²",
            pu_ht: 24,
            pu_revient: 15,
            type_cout: "matiere" as const,
            a_chiffrer: false,
          },
        ]
      : []),
    {
      catalogue_id: null,
      designation: `Ossature bois chevrons 60×40 (long. 3,00 m) + bande EPDM (${lineaireEpdm} ml)`,
      description: `Lame d'air ventilée ≥ 20 mm · ${nbSegmentsChevrons} chevrons`,
      qte: nbSegmentsChevrons,
      unite: "pièces",
      pu_ht: 14.5,
      pu_revient: 8.8,
      type_cout: "matiere",
      a_chiffrer: false,
    },
    {
      catalogue_id: null,
      designation: `Équerres Isolco (${nbEquerresPorteuses} porteuses + ${nbEquerresGuides} guides) + ${nbChevillesMurales} chevilles façade + ${nbVisParement} vis parement`,
      description: estHpl
        ? "Point fixe Ø5,1 mm + points coulissants Ø8 mm (CSTB 3194)"
        : "Fixations inox A2/A4 conformes DTU 41.2",
      qte: nbEquerresTotal,
      unite: "ensembles",
      pu_ht: 4.8,
      pu_revient: 2.9,
      type_cout: "matiere",
      a_chiffrer: false,
    },
    ...(profils.totaux.totalBarres3MACommander > 0
      ? [
          {
            catalogue_id: null,
            designation: `Profilés alu laqués d'habillage & finitions (barres 3,00 m — optimisation 1D)`,
            description: profils.detailsParOuverture
              .map(
                (o) =>
                  `${o.ouvertureNom}: bavette ${o.bavetteAppui ? `${o.bavetteAppui.longueurM.toFixed(2)} m (+60 mm)` : "aucune"}, 2 tableaux ${o.tableauxLateraux.longueurUnitaireM.toFixed(2)} m, linteau ${o.linteauGoutteEau.longueurM.toFixed(2)} m (+40 mm)`
              )
              .join(" · "),
            qte: profils.totaux.totalBarres3MACommander,
            unite: "barres 3m",
            pu_ht: 36,
            pu_revient: 22,
            type_cout: "matiere" as const,
            a_chiffrer: false,
          },
        ]
      : []),
    {
      catalogue_id: null,
      designation: `Main-d'œuvre pose complète Bardage${nbCouchesIte > 0 ? ` + ITE ${nbCouchesIte} couche(s)` : ""}`,
      description: `Ossature + ${nbCouchesIte > 0 ? "ITE + " : ""}parement + habillage ouvertures/angles`,
      qte: heuresPoseTotal,
      unite: "h",
      pu_ht: CADENCES_DEFAUT.taux_horaire_vente_ht,
      pu_revient: CADENCES_DEFAUT.taux_horaire_charge_ht,
      type_cout: "main_oeuvre",
      a_chiffrer: false,
    },
  ];

  const totalMateriauxHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "matiere")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalMainOeuvreHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "main_oeuvre")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalHt = arrondir(totalMateriauxHt + totalMainOeuvreHt);

  const premOuv = profils.detailsParOuverture[0];
  const detailProfilsTxt = premOuv
    ? `- Habillage ouvertures (${ouvertures.length} ouverture(s)) : ${ouvertures.length}× [bavette ${premOuv.bavetteAppui ? `${premOuv.bavetteAppui.longueurM.toFixed(2)} m (+60 mm)` : "aucune"}, 2 tableaux de ${premOuv.tableauxLateraux.longueurUnitaireM.toFixed(2)} m, linteau ${premOuv.linteauGoutteEau.longueurM.toFixed(2)} m (+40 mm)] · Total profilés : ${profils.totaux.totalBarres3MACommander} barre(s) de 3,00 m.\n`
    : `- Profilés d'angle/finitions : ${profils.totaux.totalBarres3MACommander} barre(s) de 3,00 m.\n`;

  const paramsBardageNorm = calculerParametresBardageNormatifs(message);
  const normeBardageSynthese = estHpl
    ? "- Normes HPL (NF DTU 45.4 / CSTB 3799_V2) : Point Fixe Ø 5,0 mm au centre + Points Coulissants Ø 8,0 mm, joints ouverts 8–10 mm, EPDM 70 mm (courant) / 100 mm (jonction), anti-micro-rives < 250 mm.\n"
    : estComposite
      ? "- Normes Composite WPC (DTA fabricants) : entraxe 400–600 mm, jeu en bout 5–8 mm, double liteau aux aboutages, 1 vis de Point Fixe obligatoire au centre de chaque lame.\n"
      : `- Normes Bois Massif (NF DTU 41.2) : garde au sol >= 150 mm (sol dur) / >= 200 mm (terre), grille anti-rongeurs >= 50 cm²/ml, visserie Inox ${paramsBardageNorm.visserieInox}${paramsBardageNorm.estLittoralOuTannique ? " OBLIGATOIRE (littoral <= 3 km / bois tannique)" : ""}.\n` +
        (estClaireVoie
          ? "- Exigence Claire-voie : Pare-pluie spécial joints ouverts résistant aux UV 5000h noir + bande EPDM sur tous les tasseaux.\n"
          : "");

  const resumeSegments = segments
    .map((s) =>
      s.type === "pignon"
        ? `Pignon ${s.largeurM}×(${s.hauteurMurM}/${s.hauteurFaiteM} m)`
        : `Façade ${s.largeurM}×${s.hauteurMurM} m`
    )
    .join(" + ");

  const syntheseTexte =
    `### PRÉ-CHIFFRAGE BNA CERTIFIÉ (BARDAGE ${estHpl ? "HPL CSTB 3194 / NF DTU 45.4" : "DTU 41.2"})\n` +
    (estHypotheseMaison
      ? `- Hypothèses de référence (à affiner dans le Calepineur 3D) : Maison ${estEtageR1 ? "R+1 (10×8 m, H = 5,50 m)" : "plain-pied (10×8 m, H = 3,00 m)"}${aGarage ? " + Garage attenant (6×3,5 m, H = 2,80 m)" : ""}.\n`
      : "") +
    (estEtageR1
      ? `- ⚠️ Vigilance échafaudage R+1 : hauteur > 3,00 m — prévoir échafaudage de pied conforme NF EN 12811.\n`
      : "") +
    `- Surface brute : ${surfaceBruteM2} m² (${nbFacadesRect} façade(s)${nbPignons > 0 ? `, ${nbPignons} pignon(s) avec +25 % temps de pose` : ""} : ${resumeSegments}) | Déduction ouvertures : ${surfaceOuverturesM2} m² | Surface nette : ${surfaceNetteM2} m²\n` +
    `- Parement Q_appro (+10 %) : ${surfaceParementApproM2} m²` +
    (estHpl ? ` (${nbPlaquesHplMeres} plaques mères HPL 3,05 × 1,30 m = 3,965 m²/u)\n` : `\n`) +
    (nbCouchesIte > 0
      ? `- Isolant ITE ${nbCouchesIte} couche(s) : ${surfaceIsolantACommanderM2} m² (${nbPaquetsIsolant} paquets de 4,8 m²)\n`
      : "") +
    `- Ossature : ${nbSegmentsChevrons} chevrons 60×40 (3,00 m), ${nbEquerresTotal} équerres Isolco (${nbEquerresPorteuses} porteuses + ${nbEquerresGuides} guides), ${nbChevillesMurales} chevilles façade, bande EPDM ${lineaireEpdm} ml, lame d'air ventilée ≥ 20 mm, ${nbVisParement} vis parement\n` +
    normeBardageSynthese +
    detailProfilsTxt +
    `- Main-d'œuvre calculée : ${heuresPoseTotal} h (dont ossature ${tempsPose.parPhase.ossature} h, isolation ${arrondir(tempsPose.parPhase.isolation + heuresIte2)} h, parement ${tempsPose.parPhase.bardage} h, finitions ${tempsPose.parPhase.finitions} h)\n` +
    `- Estimation indicative HT : Matériaux ${fmtEuro(totalMateriauxHt)} + Main-d'œuvre ${fmtEuro(totalMainOeuvreHt)} = **${fmtEuro(totalHt)} HT**`;

  return {
    metier: "bardage",
    titre: `Bardage ${estHpl ? "HPL" : "Bois/Composite"}${nbCouchesIte > 0 ? ` + ITE ${nbCouchesIte} couche(s)` : ""} — ${surfaceNetteM2} m² nets`,
    surfaceOuLineaire: surfaceNetteM2,
    unitePrincipale: "m²",
    heuresPoseTotal,
    totalMateriauxHt,
    totalMainOeuvreHt,
    totalHt,
    syntheseTexte,
    devisPrefill: {
      objet: `Travaux de bardage ${estHpl ? "HPL (CSTB 3194)" : "DTU 41.2"}${nbCouchesIte > 0 ? ` avec ITE ${nbCouchesIte} couche(s)` : ""} — ${surfaceNetteM2} m²`,
      typeTravaux: "Bardage & Isolation Extérieure (ITE)",
      surfaceM2: surfaceNetteM2,
      lignes: lignesDevis,
    },
    detailsBardage: {
      surfaceBruteM2,
      surfaceOuverturesM2,
      surfaceNetteM2,
      nbCouchesIte,
      surfaceIsolantACommanderM2,
      nbPlaquesHplMeres,
      bavetteLongueurM: premOuv?.bavetteAppui?.longueurM ?? 0,
      tableauLongueurM: premOuv?.tableauxLateraux.longueurUnitaireM ?? 0,
      linteauLongueurM: premOuv?.linteauGoutteEau.longueurM ?? 0,
      nbOuvertures: ouvertures.length,
      nbPignons,
    },
  };
}

function calculerPreChiffrageTerrasse(
  message: string,
  options?: { autoriserHypothese?: boolean }
): PreChiffrageBnaResult | null {
  const lower = message.toLowerCase();
  let longueurM = 0;
  let largeurM = 0;
  let dimensionsLabel = "";
  let estHypotheseTerrasse = false;
  const aTerrasseSimple = /terrasse\s*simple/i.test(lower);
  const aTerrassePiscine = /terrasse\s*(?:avec\s*)?piscine|terrasse\s*mobile/i.test(lower);

  // Extraire d'abord un éventuel plateau mobile ("terrasse mobile filaire 5m x 3m")
  const regexMobileDims =
    /(?:terrasse\s+mobile|plateau\s+mobile|coulissante)[^.;\n]*?(\d+(?:[.,]\d+)?)\s*(?:m\s*)?(?:[x×*]|sur)\s*(\d+(?:[.,]\d+)?)\s*m?\b/i;
  let mobileRect: { longueur: number; largeur: number } | null = null;
  const sansMobile = message.replace(regexMobileDims, (_full, d1, d2) => {
    const a = parseNombreFr(d1);
    const b = parseNombreFr(d2);
    if (a > 0 && b > 0) {
      mobileRect = { longueur: Math.max(a, b), largeur: Math.min(a, b) };
    }
    return " ";
  });

  // Cumul de TOUS les rectangles de la terrasse (forme en L / en U : "6m x 4m + retour 3m x 2.5m")
  const regexRect =
    /(\d+(?:[.,]\d+)?)\s*(?:m\s*)?(?:[x×*]|sur)\s*(\d+(?:[.,]\d+)?)\s*m?\b/gi;
  const rectangles: Array<{ longueur: number; largeur: number }> = [];
  let mRect: RegExpExecArray | null;
  while ((mRect = regexRect.exec(sansMobile)) !== null) {
    const a = parseNombreFr(mRect[1]);
    const b = parseNombreFr(mRect[2]);
    if (a > 0 && b > 0) {
      rectangles.push({ longueur: Math.max(a, b), largeur: Math.min(a, b) });
    }
  }

  if (rectangles.length > 0 && options?.autoriserHypothese !== true) {
    const surfaceTotale = arrondir(
      rectangles.reduce((s, r) => s + r.longueur * r.largeur, 0)
    );
    largeurM = rectangles[0].largeur;
    longueurM = surfaceTotale / largeurM;
    dimensionsLabel = rectangles
      .map((r) => `${r.longueur} × ${r.largeur} m`)
      .join(" + ");
  } else if (mobileRect) {
    const mr = mobileRect as { longueur: number; largeur: number };
    longueurM = mr.longueur;
    largeurM = mr.largeur;
    dimensionsLabel = `${longueurM} × ${largeurM} m`;
  } else {
    const matchM2 = message.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
    if (matchM2) {
      const surf = parseNombreFr(matchM2[1]);
      if (surf > 0) {
        largeurM = 4.0;
        longueurM = arrondir(surf / largeurM);
        dimensionsLabel = `${longueurM} × ${largeurM} m`;
      }
    } else if (options?.autoriserHypothese) {
      estHypotheseTerrasse = true;
      if (aTerrasseSimple && aTerrassePiscine) {
        // Cumul distinct Terrasse simple (6×4 = 24 m²) + Terrasse piscine (8×4 = 32 m²) = 56 m²
        largeurM = 4.0;
        longueurM = 14.0;
        dimensionsLabel = "Terrasse simple 6 × 4 m (24 m²) + Terrasse piscine 8 × 4 m (32 m²)";
      } else if (aTerrassePiscine) {
        largeurM = 4.0;
        longueurM = 8.0;
        dimensionsLabel = "Terrasse piscine 8 × 4 m (réf. 32 m²)";
      } else {
        largeurM = 4.0;
        longueurM = 6.0;
        dimensionsLabel = "Terrasse simple 6 × 4 m (réf. 24 m²)";
      }
    }
  }
  if (longueurM <= 0 || largeurM <= 0) return null;

  const paramsNorm = calculerParametresTerrasseNormatifs(message);
  const estMobile = paramsNorm.estMobile;
  const estComposite = paramsNorm.estComposite;
  const estMotorise = estMobile && !/manuel/i.test(lower);
  const essenceBois = estComposite
    ? "composite"
    : /ip[ée]/i.test(lower)
      ? "ipe"
      : /cumaru/i.test(lower)
        ? "cumaru"
        : /douglas/i.test(lower)
          ? "douglas"
          : "pin_cl4";

  const config: ChantierTerrasseConfig = {
    chantier_id: "ia-preview",
    entreprise_id: "ia-preview",
    nom: estMobile ? "Terrasse Mobile" : "Terrasse Platelage",
    longueur_m: longueurM,
    largeur_m: largeurM,
    hauteur_sol_cm:
      paramsNorm.hauteurPlotsMm !== null
        ? Math.round(paramsNorm.hauteurPlotsMm / 10)
        : 18,
    type_sol: "dalle_beton",
    pente_pct: 1.5,
    essence_bois: essenceBois,
    systeme_terrasse: estComposite ? "composite_clip" : "bois_vis",
    type_pose: paramsNorm.estDiagonale ? "diagonale" : "parallele",
    largeur_lame_mm: 145,
    epaisseur_lame_mm: paramsNorm.epaisseurLameMm ?? 21,
    longueur_lame_m: 4.0,
    espacement_lames_mm: 5,
    type_fixation: estComposite ? "clips_invisibles" : "vis_inox",
    zone_environnement: paramsNorm.estBordDeMerOuPiscine ? "littoral" : "normal",
    type_lambourde: estMobile ? "alu_structure" : "bois_cl4",
    section_largeur_mm: 45,
    section_hauteur_mm: 70,
    longueur_lambourde_m: 4.0,
    entraxe_lambourdes_cm: paramsNorm.entraxeLambourdesCm,
    double_lambourdage_aboutage: true,
    bande_etancheite_epdm: true,
    cales_isolation: true,
    type_plots: "reglables",
    entraxe_plots_cm: 60,
    hauteur_reglage_plots: "40_60",
    geotextile: false,
    presence_escalier: false,
    escalier_nb_marches: 2,
    escalier_largeur_m: 2,
    escalier_giron_cm: 28,
    escalier_hauteur_marche_cm: 16,
    presence_garde_corps: false,
    garde_corps_longueur_ml: 0,
    garde_corps_type: "bois_cables",
    garde_corps_hauteur_cm: 100,
    coef_perte_lames: 1.1,
    coef_perte_lambourdes: 1.08,
    lame_id: null,
    clip_id: null,
    lambourde_id: null,
    plot_id: null,
    quantite_accessoires: {},
    terrasse_mobile: estMobile
      ? {
          active: true,
          mode: "1_plateau",
          sens_refoulement: "droite",
          hauteur_chassis_alu_mm: 100,
          jeu_fonctionnel_peripherique_mm: 20,
          motorise: estMotorise,
          type_motorisation: /filaire/i.test(lower)
            ? "filaire"
            : estMotorise
              ? "solaire"
              : "aucune",
        }
      : undefined,
  };

  const res = calculerTerrasse(config, [], null, { inclureMainOeuvre: true });
  const lignesDevis: LigneDevisIaPreRemplie[] = convertirChiffrageTerrasseEnLignesDevis(res).map((l) => ({
    catalogue_id: null,
    designation: l.designation,
    description: l.description || "",
    qte: Number(l.qte ?? 0),
    unite: l.unite,
    pu_ht: Number(l.pu_ht ?? 0),
    pu_revient: l.pu_revient ?? null,
    type_cout: l.type_cout === "main_oeuvre" ? "main_oeuvre" : "matiere",
    a_chiffrer: false,
  }));

  const tempsPoseTerrasse = calculerTempsPoseTerrasse(res);
  const heuresPoseTotal = tempsPoseTerrasse.totalHeures;
  const totalMateriauxHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "matiere")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalMainOeuvreHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "main_oeuvre")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalHt = arrondir(totalMateriauxHt + totalMainOeuvreHt);

  const normeLabel = paramsNorm.fabricant
    ? `COMPOSITE ${paramsNorm.fabricant.nom.toUpperCase()} (Hors NF DTU 51.4)`
    : `${estMobile ? "MOBILE NF P90-308 & " : ""}NF DTU 51.4`;

  const fixationsLabel = estComposite
    ? "Clips fabricant"
    : `Visserie Inox Ø ${paramsNorm.visserieDiametreMm} mm (${paramsNorm.visserieInox === "A4" ? "Inox A4 obligatoire" : "Inox A2"} — Tableau 9 NF DTU 51.4 2018)`;

  const syntheseTexte =
    `### PRÉ-CHIFFRAGE BNA CERTIFIÉ (TERRASSE ${normeLabel})\n` +
    (estHypotheseTerrasse
      ? `- Hypothèses de référence (à affiner dans le Calepineur 3D) : ${dimensionsLabel}.\n`
      : "") +
    `- Dimensions : ${dimensionsLabel} (${res.surfaceNetteM2} m² nets) | Entraxe lambourdes : ${paramsNorm.entraxeLambourdesMm} mm${paramsNorm.estDiagonale ? " (diagonale)" : ""}\n` +
    `- Lames à commander : ${res.lames.nbLamesStandard} u (${res.lames.surfaceACommanderM2} m²) | Lambourdes : ${res.lambourdes.nbBarres} u (${res.lambourdes.lineaireMl} ml)\n` +
    `- Plots : ${res.plots.nbPlotsTotal} u | Fixations (${fixationsLabel}) : ${res.fixations.nbVisOuClipsTotal} u\n` +
    (paramsNorm.fabricant
      ? `- Règles ${paramsNorm.fabricant.nom} : ${paramsNorm.fabricant.reglesSpecifiques[0]} Jeux : aboutage ${paramsNorm.fabricant.jeuAboutageMm}, mur ${paramsNorm.fabricant.jeuMurMm}.\n`
      : "") +
    (paramsNorm.alertePlotsDepassement ? `${paramsNorm.alertePlotsDepassement}\n` : "") +
    (estMobile
      ? `- Kit Terrasse Mobile NF P90-308${mobileRect ? ` (${(mobileRect as { longueur: number; largeur: number }).longueur} × ${(mobileRect as { longueur: number; largeur: number }).largeur} m)` : ""} : châssis porteur alu + rails inox 316L + galets${estMotorise ? (/filaire/i.test(lower) ? " + motorisation filaire" : " + motorisation 24V") : ""}\n`
      : "") +
    `- Main-d'œuvre calculée : ${heuresPoseTotal} h\n` +
    `- Estimation indicative HT : Matériaux ${fmtEuro(totalMateriauxHt)} + Main-d'œuvre ${fmtEuro(totalMainOeuvreHt)} = **${fmtEuro(totalHt)} HT**`;

  return {
    metier: "terrasse",
    titre: `Terrasse ${estMobile ? "Mobile " : ""}${paramsNorm.fabricant ? paramsNorm.fabricant.nom : estComposite ? "Composite" : "Bois"} — ${res.surfaceNetteM2} m²`,
    surfaceOuLineaire: res.surfaceNetteM2,
    unitePrincipale: "m²",
    heuresPoseTotal,
    totalMateriauxHt,
    totalMainOeuvreHt,
    totalHt,
    syntheseTexte,
    detailsTerrasse: {
      entraxeLambourdesMm: paramsNorm.entraxeLambourdesMm,
      fabricant: paramsNorm.fabricant?.nom ?? null,
      visserieInox: paramsNorm.visserieInox,
      alertePlotsDepassement: paramsNorm.alertePlotsDepassement,
    },
    devisPrefill: {
      objet: `Terrasse ${estMobile ? "Mobile motorisée (NF P90-308) " : ""}${estComposite ? "Composite" : "Bois"} — ${res.surfaceNetteM2} m²`,
      typeTravaux: estMobile ? "Terrasse & Terrasse Mobile" : "Terrasse & Platelage",
      surfaceM2: res.surfaceNetteM2,
      lignes: lignesDevis,
    },
  };
}

function calculerPreChiffrageCloture(
  message: string,
  options?: { autoriserHypothese?: boolean }
): PreChiffrageBnaResult | null {
  const lower = message.toLowerCase();
  const matchMl = message.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|m\b|m[èe]tres?)/i);

  let estHypotheseCloture = false;
  let lineaireBrutM = matchMl ? parseNombreFr(matchMl[1]) : 0;
  if (lineaireBrutM <= 0) {
    if (options?.autoriserHypothese) {
      estHypotheseCloture = true;
      lineaireBrutM = 40;
    } else {
      return null;
    }
  }

  const materiau: FenceMaterial = /alu/i.test(lower)
    ? "ALU"
    : /bois/i.test(lower)
      ? "BOIS"
      : "COMPOSITE";

  const matchNbPortillons = lower.match(/(\d+)\s*portillons?/i);
  const nbPortillons = matchNbPortillons
    ? Math.max(1, Number(matchNbPortillons[1]))
    : /portillon/i.test(lower)
      ? 1
      : 0;
  const presencePortail = /\bportail\b/i.test(lower);
  const deductionPortailM = presencePortail ? 3.5 : 0;
  const lineaireM = Math.max(2, arrondir(lineaireBrutM - deductionPortailM));
  const presenceSoubassement = /soubassement/i.test(lower);

  const portillons = Array.from({ length: nbPortillons }, () => ({
    segment: "A" as const,
    largeurM: 1.0,
  }));

  const config: FenceConfig = {
    forme: "DROITE",
    extremites: "LIBRE",
    materiau,
    hauteurUtile: 1.8,
    longueurLameBrute: 1.8,
    hauteurLame: 0.15,
    typePoseSol: "DIRECT_SOL",
    presenceSoubassement,
    hauteurSoubassementM: 0.25,
    gestionPente: "PLAT",
    segments: { A: lineaireM, B: 0, C: 0 },
    portillons,
  };

  const res = calculerChiffrageCloture(config, { inclureMainOeuvre: true });
  const lignesDevis: LigneDevisIaPreRemplie[] = res.lignesDevis.map((l) => ({
    catalogue_id: null,
    designation: l.designation,
    description: l.description || "",
    qte: l.qte,
    unite: l.unite,
    pu_ht: l.pu_ht,
    pu_revient: l.pu_revient,
    type_cout: l.type_cout,
    a_chiffrer: false,
  }));

  if (presencePortail) {
    lignesDevis.push({
      catalogue_id: null,
      designation: "Poteaux piliers renforcés pour portail (déduction 3,50 m)",
      description: "2 poteaux piliers renforcés + scellement béton adapté",
      qte: 2,
      unite: "u",
      pu_ht: 145,
      pu_revient: 90,
      type_cout: "matiere",
      a_chiffrer: false,
    });
  }

  const totalMateriauxHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "matiere")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalMainOeuvreHt = arrondir(
    lignesDevis
      .filter((l) => l.type_cout === "main_oeuvre")
      .reduce((s, l) => s + l.qte * l.pu_ht, 0)
  );
  const totalHt = arrondir(totalMateriauxHt + totalMainOeuvreHt);

  const syntheseTexte =
    `### PRÉ-CHIFFRAGE BNA CERTIFIÉ (CLÔTURE ${materiau})\n` +
    (estHypotheseCloture
      ? `- Hypothèse de référence (à affiner dans le Calepineur 3D) : Linéaire périphérique 40,0 ml brut${presencePortail ? " − 3,50 m (portail)" : ""} = ${lineaireM} ml.\n`
      : "") +
    `- Linéaire : ${res.calepinage.lineaireTotalM} ml · ${res.calepinage.nbTraveesTotal} travée(s) · Hauteur ${config.hauteurUtile} m\n` +
    `- Lames : ${res.calepinage.nbTotalLames} u | Poteaux : ${res.calepinage.totalPoteauxComplets} u | Sacs béton 35 kg : ${res.calepinage.nbSacsBeton35kg} u` +
    (nbPortillons > 0
      ? ` | ${nbPortillons} portillon(s) (${nbPortillons} × 1,00 m + ${nbPortillons * 2} poteaux renforcés)`
      : "") +
    (presencePortail
      ? " | Portail 3,50 m déduit (+ 2 poteaux piliers renforcés)"
      : "") +
    `\n- Main-d'œuvre calculée : ${res.tempsPose.totalHeures} h\n` +
    `- Estimation indicative HT : Matériaux ${fmtEuro(totalMateriauxHt)} + Main-d'œuvre ${fmtEuro(totalMainOeuvreHt)} = **${fmtEuro(totalHt)} HT**`;

  return {
    metier: "cloture",
    titre: `Clôture ${materiau} — ${res.calepinage.lineaireTotalM} ml`,
    surfaceOuLineaire: res.calepinage.lineaireTotalM,
    unitePrincipale: "ml",
    heuresPoseTotal: res.tempsPose.totalHeures,
    totalMateriauxHt,
    totalMainOeuvreHt,
    totalHt,
    syntheseTexte,
    detailsCloture: {
      lineaireTotalM: res.calepinage.lineaireTotalM,
      nbPortillons,
      presencePortail,
      deductionPortailM,
    },
    devisPrefill: {
      objet: `Clôture ${materiau} (${res.calepinage.lineaireTotalM} ml${presencePortail ? " + portail" : ""}${nbPortillons > 0 ? ` + ${nbPortillons} portillon(s)` : ""})`,
      typeTravaux: "Clôture & Aménagement Extérieur",
      surfaceM2: res.calepinage.lineaireTotalM,
      lignes: lignesDevis,
    },
  };
}

export function detecterEtCalculerPreChiffrage(
  message: string
): PreChiffrageBnaResult | null {
  const lower = message.toLowerCase();

  const hasBardage =
    /bardage|\bhpl\b|trespa|fundermax|equitone|cedral|\bweo\b|newtechwood|\bite\b|fa[çc]ade|claire[-\s]?voie|maison.*(?:[ée]tage|compl[èe]te|4\s*c[ôo]t[ée]s?)|garage\s+attenant/i.test(
      lower
    );
  const hasTerrasse =
    /terrasse|platelage|piscine|silvadec|fiberdeck|neowood|oc[ée]wood/i.test(
      lower
    );
  const hasCloture = /cl[ôo]ture|palissade|portillon|\bportail\b/i.test(lower);

  const nbLotsDetectes = [hasBardage, hasTerrasse, hasCloture].filter(Boolean).length;

  // Orchestration Multi-Lots simultanés (Bardage + Terrasse + Clôture)
  if (nbLotsDetectes >= 2) {
    const lots: PreChiffrageBnaResult[] = [];
    if (hasBardage) {
      const b = calculerPreChiffrageBardage(message, { autoriserHypotheseMaison: true });
      if (b) lots.push(b);
    }
    if (hasTerrasse) {
      const t = calculerPreChiffrageTerrasse(message, { autoriserHypothese: true });
      if (t) lots.push(t);
    }
    if (hasCloture) {
      const c = calculerPreChiffrageCloture(message, { autoriserHypothese: true });
      if (c) lots.push(c);
    }

    if (lots.length >= 2) {
      const heuresPoseTotal = arrondir(
        lots.reduce((s, l) => s + l.heuresPoseTotal, 0)
      );
      const totalMateriauxHt = arrondir(
        lots.reduce((s, l) => s + l.totalMateriauxHt, 0)
      );
      const totalMainOeuvreHt = arrondir(
        lots.reduce((s, l) => s + l.totalMainOeuvreHt, 0)
      );
      const totalHt = arrondir(totalMateriauxHt + totalMainOeuvreHt);

      const corpsSynthese = lots
        .map((lot, idx) => {
          const sansTitre = lot.syntheseTexte.replace(/^### .*\n/, "");
          return `### Lot ${idx + 1} — ${lot.titre}\n${sansTitre}`;
        })
        .join("\n\n");

      const syntheseTexte =
        `### PRÉ-CHIFFRAGE BNA MULTI-LOTS CONSOLIDÉ (MAISON COMPLÈTE)\n\n` +
        `${corpsSynthese}\n\n` +
        `### TOTAL GÉNÉRAL CONSOLIDÉ HT (${lots.length} LOTS)\n` +
        `- Total Matériaux HT : ${fmtEuro(totalMateriauxHt)}\n` +
        `- Total Main-d'œuvre HT : ${fmtEuro(totalMainOeuvreHt)} (${heuresPoseTotal} h au total)\n` +
        `- **TOTAL GÉNÉRAL HT : ${fmtEuro(totalHt)} HT**`;

      const lignesConsolidees: LigneDevisIaPreRemplie[] = lots.flatMap((lot, idx) =>
        lot.devisPrefill.lignes.map((ligne) => ({
          ...ligne,
          designation: `[LOT ${idx + 1} · ${lot.metier.toUpperCase()}] ${ligne.designation}`,
        }))
      );

      return {
        metier: lots[0].metier,
        titre: `Projet Multi-Lots (${lots.map((l) => l.metier.toUpperCase()).join(" + ")})`,
        surfaceOuLineaire: lots[0].surfaceOuLineaire,
        unitePrincipale: lots[0].unitePrincipale,
        heuresPoseTotal,
        totalMateriauxHt,
        totalMainOeuvreHt,
        totalHt,
        syntheseTexte,
        estMultiLots: true,
        lots,
        detailsBardage: lots.find((l) => l.metier === "bardage")?.detailsBardage,
        detailsTerrasse: lots.find((l) => l.metier === "terrasse")?.detailsTerrasse,
        detailsCloture: lots.find((l) => l.metier === "cloture")?.detailsCloture,
        devisPrefill: {
          objet: `Devis Global Multi-Lots — ${lots.map((l) => l.titre).join(" + ")}`,
          typeTravaux: "Multi-Lots (Bardage / Terrasse / Clôture)",
          surfaceM2: lots[0].surfaceOuLineaire,
          lignes: lignesConsolidees,
        },
      };
    }
  }

  const aUnChiffre = /\d/.test(message);
  if (!aUnChiffre && !/maison|[ée]tage|r\+1/i.test(lower)) return null;

  if (hasTerrasse) {
    return calculerPreChiffrageTerrasse(message);
  }
  if (hasBardage) {
    return calculerPreChiffrageBardage(message, { autoriserHypotheseMaison: true });
  }
  if (hasCloture) {
    return calculerPreChiffrageCloture(message);
  }
  return null;
}
