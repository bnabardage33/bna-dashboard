import { describe, it, expect } from "vitest";
import {
  calculerBardagePro,
  resoudrePresetBardage,
  decouperModulesCentresPro,
  genererOssatureSecondaire,
  calculerCalepinageBardagePro,
} from "@/lib/bardage/pro";

describe("Module Bardage Pro (HPL & Composite)", () => {
  it("Brique 1 : résout correctement les presets fabricants HPL et Composite", () => {
    const presetHpl = resoudrePresetBardage("trespa_meteon");
    expect(presetHpl.typeMateriau).toBe("panneaux_hpl");
    expect(presetHpl.entraxeChevronsMaxMm).toBe(600);
    expect(presetHpl.diametreTrouFixeMm).toBe(6.0);
    expect(presetHpl.diametreTrouGlissantMm).toBe(8.5);

    const presetComp = resoudrePresetBardage("weo_composite");
    expect(presetComp.typeMateriau).toBe("lames_composite");
    expect(presetComp.entraxeChevronsMaxMm).toBe(400);
    expect(presetComp.fixationType).toBe("clips_rainure");
  });

  it("Brique 3 : applique le centrage symétrique et la règle anti-micro-panneaux (>= minRiveMm)", () => {
    // Largeur 2.3 m avec module de 1.0 m et minRive = 250 mm
    // Rive brute = (2.3 - 2 * 1.0) / 2 = 150 mm < 250 mm -> Décalage / scission automatique
    const res = decouperModulesCentresPro(2.3, 1.0, 0.25);
    expect(res.rivesDecalees).toBe(true);
    for (const w of res.largeursM) {
      expect(w).toBeGreaterThanOrEqual(0.249);
    }
  });

  it("Brique 2 : aligne obligatoirement l'ossature sur les joints verticaux des panneaux", () => {
    const preset = resoudrePresetBardage("trespa_meteon");
    const jointsX = [1.2, 2.4, 3.6];
    const ossature = genererOssatureSecondaire(
      {
        type: "facade",
        largeurM: 4.8,
        hauteurMurM: 2.8,
      },
      preset,
      jointsX
    );

    // Chaque joint vertical doit avoir un chevron correspondant avec le rôle 'joint_panneau'
    for (const jx of jointsX) {
      const chJoint = ossature.chevrons.find((c) => Math.abs(c.xM - jx) < 0.001);
      expect(chJoint).toBeDefined();
      expect(chJoint?.role).toBe("joint_panneau");
      expect(chJoint?.estDoubleOuLarge).toBe(true);
      expect(chJoint?.largeurMm).toBe(preset.largeurChevronJointMm);
    }

    // Aucun entraxe entre chevrons consécutifs ne doit dépasser 600 mm
    for (let i = 0; i < ossature.chevrons.length - 1; i++) {
      const distMm = Math.round((ossature.chevrons[i + 1].xM - ossature.chevrons[i].xM) * 1000);
      expect(distMm).toBeLessThanOrEqual(preset.entraxeChevronsMaxMm + 1);
    }
  });

  it("Brique 4 : produit un résultat complet BardageProGeometricResult avec séparation Q_net / Q_tech / Q_appro", () => {
    const resultat = calculerBardagePro(
      {
        id: "facade-sud",
        nom: "Façade Sud Principale",
        type: "facade",
        largeurM: 6.0,
        hauteurMurM: 3.0,
      },
      {
        gamme: "trespa_meteon",
        margeApproPct: 4.0,
      }
    );

    expect(resultat).toBeDefined();
    expect(resultat.geometry.panneauxPoses.length).toBeGreaterThan(0);
    expect(resultat.geometry.ossature.chevrons.length).toBeGreaterThan(0);

    // 1. Q_net (posé)
    expect(resultat.quantities.qNet.surfacePoseeM2).toBeCloseTo(18.0, 1);
    expect(resultat.quantities.qNet.nbVisTotal).toBeGreaterThan(0);
    expect(resultat.quantities.qNet.nbVisPointsFixes).toBe(resultat.geometry.panneauxPoses.length);

    // 2. Q_tech (matière découpée)
    expect(resultat.quantities.qTech.nbPlaquesMeresDebitees).toBeGreaterThan(0);
    expect(resultat.quantities.qTech.surfacePlaquesConsommeesM2).toBeGreaterThanOrEqual(
      resultat.quantities.qNet.surfacePoseeM2
    );

    // 3. Q_appro (commandé avec marge et colisage)
    expect(resultat.quantities.qAppro.nbPlaquesMeresACommander).toBeGreaterThanOrEqual(
      resultat.quantities.qTech.nbPlaquesMeresDebitees
    );
    expect(resultat.quantities.qAppro.fixations.nbBoites).toBeGreaterThanOrEqual(1);
    expect(resultat.quantities.qAppro.barresChevronsACommander.quantiteBarres).toBeGreaterThan(0);
  });

  it("Pignons : effectue la découpe sous rampant et le couplage tête-bêche", () => {
    const resultat = calculerBardagePro(
      {
        id: "pignon-ouest",
        nom: "Pignon Ouest",
        type: "pignon",
        largeurM: 8.0,
        hauteurMurM: 2.5,
        hauteurFaiteM: 4.5,
      },
      {
        gamme: "trespa_meteon",
      }
    );

    expect(resultat.diagnostic.estPignon).toBe(true);
    const pignons = resultat.geometry.panneauxPoses.filter((p) => p.type === "pignon");
    expect(pignons.length).toBeGreaterThan(0);

    // Les pignons possèdent les détails atelier pour la coupe
    for (const p of pignons) {
      expect(p.pignonDetails).toBeDefined();
      expect(p.pignonDetails?.cutWidthMm).toBeGreaterThan(0);
      expect(p.pignonDetails?.cutHeightMm).toBeGreaterThan(0);
    }
  });
});
