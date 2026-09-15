// __tests__/metre-serialization.test.ts
import { describe, it, expect } from "vitest";
import type { Zone, ConfigTechnique } from "@/components/ZoneCard";
import { calculerZone } from "@/components/ZoneCard";
import { calculerPose } from "@/lib/poseCalcul";
import { calculerCalepinage } from "@/lib/calepinageCalcul";
import {
  VERSION_MOTEUR,
  extraireEntrees,
  serialiserResultatTechnique,
  entreesIdentiques,
  lesEntreesOntChangent,
} from "@/lib/metre-serialization";

const ZONE_BASE: Zone = {
  id: "zone-test-1",
  chantier_id: "chantier-test-1",
  type: "facade",
  nom: "Facade Nord",
  largeur: 5,
  hauteur_mur: 3,
  hauteur_faite: null,
  materiau: "plaques",
  ouvertures: [],
  famille_pose: "hpl",
  angle: false,
  largeur_lame_mm: null,
  plaque_longueur_mm: 3050,
  plaque_largeur_mm: 1300,
  module_largeur_mm: 1000,
  module_hauteur_mm: 600,
  sens_pose: "horizontal",
};

const CONFIG_BASE: ConfigTechnique = {
  type_isolant: "laine_roche",
  epaisseur_isolant_mm: 120,
  surface_paquet_m2: 4.8,
  zone_vent_rive: false,
  coef_perte_rendement: null,
};

const CONFIG_VIDE: ConfigTechnique = {
  type_isolant: null,
  epaisseur_isolant_mm: null,
  surface_paquet_m2: null,
  zone_vent_rive: null,
  coef_perte_rendement: null,
};

function hauteurPose(zone: Zone): number {
  return zone.type === "pignon" && zone.hauteur_faite ? zone.hauteur_faite : zone.hauteur_mur;
}

function calculerMoteurs(zone: Zone, zoneVent = 1, config: ConfigTechnique = CONFIG_BASE) {
  const resultatZone = calculerZone(zone, config.coef_perte_rendement);
  const pose =
    zone.famille_pose && zone.largeur > 0 && hauteurPose(zone) > 0
      ? calculerPose(
          zone.famille_pose,
          zone.largeur,
          hauteurPose(zone),
          zone.angle,
          zoneVent,
          zone.largeur_lame_mm ?? (zone.famille_pose === "cassette" ? 600 : 1000),
          {
            zoneVentRive: config.zone_vent_rive ?? zone.angle,
            epaisseurIsolantMm: config.epaisseur_isolant_mm ?? 120,
            typeIsolant: config.type_isolant ?? "laine_roche",
            surfacePaquetM2: config.surface_paquet_m2 ?? 4.8,
            moduleLargeurMm: zone.module_largeur_mm ?? null,
            moduleHauteurMm: zone.module_hauteur_mm ?? null,
            sensPose: zone.sens_pose ?? "horizontal",
          },
        )
      : null;
  const calepinage =
    zone.largeur > 0 && zone.hauteur_mur > 0
      ? calculerCalepinage({
          zoneLargeurM: zone.largeur,
          zoneHauteurM: zone.hauteur_mur,
          plaqueLongueurMm: zone.plaque_longueur_mm ?? 3050,
          plaqueLargeurMm: zone.plaque_largeur_mm ?? 1300,
          moduleLargeurMm: zone.module_largeur_mm ?? 1000,
          moduleHauteurMm: zone.module_hauteur_mm ?? 600,
          sensPose: zone.sens_pose ?? "horizontal",
          estPignon: zone.type === "pignon",
          hauteurFaiteM: zone.hauteur_faite,
        })
      : null;
  return { resultatZone, pose, calepinage };
}

describe("metre-serialization", () => {
  describe("serialiserResultatTechnique", () => {
    it("retourne un objet avec version, date, entrées et les 3 résultats", () => {
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE);
      const result = serialiserResultatTechnique(ZONE_BASE, CONFIG_BASE, resultatZone, pose, calepinage);

      expect(result.version_moteur).toBe(VERSION_MOTEUR);
      expect(result.calcule_le).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.entrees).toBeDefined();
      expect(result.resultat_zone).toBeDefined();
      expect(result.resultat_pose).toBeDefined();
      expect(result.resultat_calepinage).toBeDefined();
    });

    it("version_moteur est non vide", () => {
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE);
      const result = serialiserResultatTechnique(ZONE_BASE, CONFIG_BASE, resultatZone, pose, calepinage);
      expect(result.version_moteur.length).toBeGreaterThan(0);
    });

    it("les entrées reflètent la zone sans champs de gestion", () => {
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE);
      const result = serialiserResultatTechnique(ZONE_BASE, CONFIG_BASE, resultatZone, pose, calepinage);

      expect(result.entrees).not.toHaveProperty("id");
      expect(result.entrees).not.toHaveProperty("chantier_id");
      expect(result.entrees).not.toHaveProperty("nom");
      expect(result.entrees.type).toBe("facade");
      expect(result.entrees.largeur).toBe(5);
      expect(result.entrees.hauteur_mur).toBe(3);
      expect(result.entrees.famille_pose).toBe("hpl");
      // Point O : zone_vent n'est PLUS une entrée (aucun moteur ne le lit).
      expect(result.entrees).not.toHaveProperty("zone_vent");
    });

    it("la configuration isolant des entrées provient du chantier (source de vérité)", () => {
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE);
      const configChantier: ConfigTechnique = {
        type_isolant: "laine_verre",
        epaisseur_isolant_mm: 160,
        surface_paquet_m2: 6.0,
        zone_vent_rive: true,
        coef_perte_rendement: 1.12,
      };
      const result = serialiserResultatTechnique(ZONE_BASE, configChantier, resultatZone, pose, calepinage);

      expect(result.entrees.type_isolant).toBe("laine_verre");
      expect(result.entrees.epaisseur_isolant_mm).toBe(160);
      expect(result.entrees.surface_paquet_m2).toBe(6.0);
      expect(result.entrees.zone_vent_rive).toBe(true);
      expect(result.entrees).not.toHaveProperty("zone_vent");
    });

    it("les résultats proviennent bien du moteur calculerZone", () => {
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE);
      const result = serialiserResultatTechnique(ZONE_BASE, CONFIG_BASE, resultatZone, pose, calepinage);

      expect(result.resultat_zone).toEqual(resultatZone);
      expect(result.resultat_zone.surfaceNette).toBe(resultatZone.surfaceNette);
      expect(result.resultat_zone.surfaceACommander).toBe(resultatZone.surfaceACommander);
      expect(result.resultat_zone.totalCoupesML).toBe(resultatZone.totalCoupesML);
    });

    it("coef_perte_rendement configuré pilote la surface à commander", () => {
      const configAvecCoef: ConfigTechnique = { ...CONFIG_BASE, coef_perte_rendement: 1.12 };
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE, 1, configAvecCoef);
      const result = serialiserResultatTechnique(ZONE_BASE, configAvecCoef, resultatZone, pose, calepinage);

      expect(result.resultat_zone.surfaceACommander).toBeCloseTo(result.resultat_zone.surfaceNette * 1.12, 6);
      expect(result.entrees.coef_perte_rendement).toBe(1.12);
    });

    it("sans coef configuré, la marge par matériau est conservée (plaques 1.15)", () => {
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE);
      const result = serialiserResultatTechnique(ZONE_BASE, CONFIG_BASE, resultatZone, pose, calepinage);
      expect(result.resultat_zone.surfaceACommander).toBeCloseTo(result.resultat_zone.surfaceNette * 1.15, 6);
    });

    it("sans coef configuré, la marge par matériau est conservée (lames 1.1)", () => {
      const zoneLames: Zone = { ...ZONE_BASE, materiau: "lames" };
      const { resultatZone, pose, calepinage } = calculerMoteurs(zoneLames);
      const result = serialiserResultatTechnique(zoneLames, CONFIG_BASE, resultatZone, pose, calepinage);
      expect(result.resultat_zone.surfaceACommander).toBeCloseTo(result.resultat_zone.surfaceNette * 1.1, 6);
    });

    it("les résultats proviennent bien du moteur calculerPose", () => {
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE);
      const result = serialiserResultatTechnique(ZONE_BASE, CONFIG_BASE, resultatZone, pose, calepinage);

      expect(result.resultat_pose).toEqual(pose);
      expect(result.resultat_pose!.nbEquerresPorteuses).toBe(pose!.nbEquerresPorteuses);
      expect(result.resultat_pose!.nbChevillesMurales).toBe(pose!.nbChevillesMurales);
      expect(result.resultat_pose!.isolant.nbPaquetsACommander).toBe(pose!.isolant.nbPaquetsACommander);
    });

    it("la config chantier pilote réellement calculerPose (paquets + équerres)", () => {
      const configLaineVerre160: ConfigTechnique = { ...CONFIG_BASE, type_isolant: "laine_verre", epaisseur_isolant_mm: 160 };
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE, 1, configLaineVerre160);
      const result = serialiserResultatTechnique(ZONE_BASE, configLaineVerre160, resultatZone, pose, calepinage);

      expect(result.resultat_pose!.isolant.epaisseurMm).toBe(160);
      expect(result.resultat_pose!.isolant.typeIsolant).toBe("Laine de verre semi-rigide (ISOVER / Knauf)");
    });

    it("epaisseur 0 configurée → pas d'isolant (aucun retour silencieux à 120)", () => {
      const configSansIsolant: ConfigTechnique = { ...CONFIG_BASE, epaisseur_isolant_mm: 0 };
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE, 1, configSansIsolant);
      const result = serialiserResultatTechnique(ZONE_BASE, configSansIsolant, resultatZone, pose, calepinage);

      expect(result.entrees.epaisseur_isolant_mm).toBe(0);
      expect(result.resultat_pose!.isolant.actif).toBe(false);
      expect(result.resultat_pose!.isolant.nbPaquetsACommander).toBe(0);
    });

    it("les résultats proviennent bien du moteur calculerCalepinage", () => {
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE);
      const result = serialiserResultatTechnique(ZONE_BASE, CONFIG_BASE, resultatZone, pose, calepinage);

      expect(result.resultat_calepinage).toEqual(calepinage);
      expect(result.resultat_calepinage!.nbPlaquesNecessaires).toBe(calepinage!.nbPlaquesNecessaires);
      expect(result.resultat_calepinage!.tauxChutePct).toBe(calepinage!.tauxChutePct);
    });

    it("sans famille de pose, resultat_pose est null (moteur non applicable)", () => {
      const zoneSansPose: Zone = { ...ZONE_BASE, famille_pose: null, largeur_lame_mm: null };
      const { resultatZone, pose, calepinage } = calculerMoteurs(zoneSansPose);
      const result = serialiserResultatTechnique(zoneSansPose, CONFIG_BASE, resultatZone, pose, calepinage);
      expect(result.resultat_pose).toBeNull();
    });
  });

  describe("entreesIdentiques / lesEntreesOntChangent", () => {
    it("même entrée = aucun changement", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const e2 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      expect(entreesIdentiques(e1, e2)).toBe(true);
      expect(lesEntreesOntChangent(e1, e2)).toBe(false);
    });

    it("largeur modifiée = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const e2 = extraireEntrees({ ...ZONE_BASE, largeur: 6 }, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    describe("Persistance de autoriserRotation (Faille 3)", () => {
      it("true est correctement sauvegardé (et par défaut)", () => {
        const e = extraireEntrees(ZONE_BASE, CONFIG_BASE, true);
        expect(e.autoriser_rotation).toBe(true);
      });

      it("false est correctement sauvegardé", () => {
        const e = extraireEntrees(ZONE_BASE, CONFIG_BASE, false);
        expect(e.autoriser_rotation).toBe(false);
      });

      it("l'absence de la propriété dans une ancienne sauvegarde retourne true (par défaut au runtime via ?? true)", () => {
        const jsonAncien = { largeur: 5, hauteur_mur: 3, materiau: "plaques" }; // pas de autoriser_rotation
        // Ce cas est surtout géré dans ZoneCard au `useState(zone.resultats... ?? true)`
        // Mais on vérifie que entreesIdentiques l'acceptera s'il est null vs null.
        expect(entreesIdentiques(jsonAncien as any, jsonAncien as any)).toBe(true);
      });

      it("la modification du toggle déclenche bien la persistance", () => {
        const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE, true);
        const e2 = extraireEntrees(ZONE_BASE, CONFIG_BASE, false);
        expect(lesEntreesOntChangent(e1, e2)).toBe(true);
      });

      it("le Composite V2 n'est pas pollué par autoriser_rotation (forcé à null)", () => {
        const zoneComposite: Zone = { ...ZONE_BASE, materiau: "lames", famille_pose: "composite" };
        const eTrue = extraireEntrees(zoneComposite, CONFIG_BASE, true);
        const eFalse = extraireEntrees(zoneComposite, CONFIG_BASE, false);
        
        expect(eTrue.autoriser_rotation).toBeNull();
        expect(eFalse.autoriser_rotation).toBeNull();
        expect(lesEntreesOntChangent(eTrue, eFalse)).toBe(false); // Pas de changement vu
      });
    });

    it("hauteur mur modifiée = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const e2 = extraireEntrees({ ...ZONE_BASE, hauteur_mur: 4 }, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("ouverture ajoutée = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const avecOuverture: Zone = {
        ...ZONE_BASE,
        ouvertures: [{ id: "ouv-1", type: "fenetre", largeur: 1.2, hauteur: 1.5 }],
      };
      const e2 = extraireEntrees(avecOuverture, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("ouverture modifiée (dimensions) = changement détecté", () => {
      const avecOuverture: Zone = {
        ...ZONE_BASE,
        ouvertures: [{ id: "ouv-1", type: "fenetre", largeur: 1.2, hauteur: 1.5 }],
      };
      const modifiee: Zone = {
        ...ZONE_BASE,
        ouvertures: [{ id: "ouv-1", type: "fenetre", largeur: 1.5, hauteur: 1.8 }],
      };
      const e1 = extraireEntrees(avecOuverture, CONFIG_BASE);
      const e2 = extraireEntrees(modifiee, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("ouverture supprimée = changement détecté", () => {
      const avecOuverture: Zone = {
        ...ZONE_BASE,
        ouvertures: [{ id: "ouv-1", type: "fenetre", largeur: 1.2, hauteur: 1.5 }],
      };
      const e1 = extraireEntrees(avecOuverture, CONFIG_BASE);
      const e2 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("simple réordonnancement des ouvertures = aucun changement", () => {
      const deuxOuvertures: Zone = {
        ...ZONE_BASE,
        ouvertures: [
          { id: "ouv-1", type: "fenetre", largeur: 1.2, hauteur: 1.5 },
          { id: "ouv-2", type: "porte", largeur: 0.9, hauteur: 2.1 },
        ],
      };
      const inverse: Zone = {
        ...ZONE_BASE,
        ouvertures: [
          { id: "ouv-2", type: "porte", largeur: 0.9, hauteur: 2.1 },
          { id: "ouv-1", type: "fenetre", largeur: 1.2, hauteur: 1.5 },
        ],
      };
      const e1 = extraireEntrees(deuxOuvertures, CONFIG_BASE);
      const e2 = extraireEntrees(inverse, CONFIG_BASE);
      expect(entreesIdentiques(e1, e2)).toBe(true);
      expect(lesEntreesOntChangent(e1, e2)).toBe(false);
    });

    it("type_isolant chantier modifié = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const configLaineVerre: ConfigTechnique = { ...CONFIG_BASE, type_isolant: "laine_verre" };
      const e2 = extraireEntrees(ZONE_BASE, configLaineVerre);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("epaisseur_isolant_mm chantier modifiée = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const config160: ConfigTechnique = { ...CONFIG_BASE, epaisseur_isolant_mm: 160 };
      const e2 = extraireEntrees(ZONE_BASE, config160);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("surface_paquet_m2 chantier modifiée = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const configPaquet: ConfigTechnique = { ...CONFIG_BASE, surface_paquet_m2: 5.0 };
      const e2 = extraireEntrees(ZONE_BASE, configPaquet);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("coef_perte_rendement chantier modifié = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const configCoef: ConfigTechnique = { ...CONFIG_BASE, coef_perte_rendement: 1.08 };
      const e2 = extraireEntrees(ZONE_BASE, configCoef);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("zone_vent_rive chantier modifiée = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const configRive: ConfigTechnique = { ...CONFIG_BASE, zone_vent_rive: true };
      const e2 = extraireEntrees(ZONE_BASE, configRive);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("config chantier non configurée vs configurée = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_VIDE);
      const e2 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("zone_vent (grille vent) ne déclenche PLUS aucun changement d'entrées (point O)", () => {
      // zone_vent n'est plus lu par aucun moteur : sa valeur n'apparaît pas dans
      // les entrées et n'existe donc pas dans la comparaison de persistance.
      const e = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      expect(e).not.toHaveProperty("zone_vent");
    });

    it("famille de pose modifiée = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const e2 = extraireEntrees({ ...ZONE_BASE, famille_pose: "composite" }, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("sens de pose modifié = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const e2 = extraireEntrees({ ...ZONE_BASE, sens_pose: "vertical" }, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("changement de type de zone = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const pignon: Zone = { ...ZONE_BASE, type: "pignon", hauteur_faite: 5 };
      const e2 = extraireEntrees(pignon, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });

    it("changement d'angle = changement détecté", () => {
      const e1 = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const e2 = extraireEntrees({ ...ZONE_BASE, angle: true }, CONFIG_BASE);
      expect(lesEntreesOntChangent(e1, e2)).toBe(true);
    });
  });

  describe("cycle complet (persistance simulée)", () => {
    it("calcul → sérialisation → relecture → comparaison", () => {
      // Sérialisation d'une zone (comme à la saisie)
      const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE);
      const resultatStocker = serialiserResultatTechnique(ZONE_BASE, CONFIG_BASE, resultatZone, pose, calepinage);

      // "Rechargement" : on relit les entrées stockées dans le JSONB
      const entreesStoquees = resultatStocker.entrees;

      // Même zone + même config chantier rechargées → pas de recalcul
      const entreesRelues = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      expect(lesEntreesOntChangent(entreesStoquees, entreesRelues)).toBe(false);

      // Config chantier modifiée → recalcul nécessaire
      const configModifiee: ConfigTechnique = { ...CONFIG_BASE, epaisseur_isolant_mm: 200 };
      const entreesConfigModifiee = extraireEntrees(ZONE_BASE, configModifiee);
      expect(lesEntreesOntChangent(entreesStoquees, entreesConfigModifiee)).toBe(true);

      // Zone modifiée (ouverture ajoutée) → recalcul nécessaire
      const zoneModifiee: Zone = {
        ...ZONE_BASE,
        ouvertures: [{ id: "ouv-1", type: "fenetre", largeur: 1.2, hauteur: 1.5 }],
      };
      const entreesModifiees = extraireEntrees(zoneModifiee, CONFIG_BASE);
      expect(lesEntreesOntChangent(entreesStoquees, entreesModifiees)).toBe(true);
    });
  });
});

/* ========================================================================
   COUVERTURE DES ENTRÉES — « contrat » entre les moteurs et extraireEntrees
   ========================================================================
   Tout champ de Zone ou de config technique qui influence réellement un moteur
   (calculerZone / calculerPose / calculerCalepinage) DOIT être surveillé par
   les entrées, sinon modifier ce champ ne déclencherait ni recalcul ni
   réécriture de `resultats_techniques`.

   RÈGLE DE MAINTENANCE :
     * Ajouter un champ à `Zone` → soit l'ajouter à CHAMPS_COUVERTS (mutateur +
       clé d'entrée), soit l'ajouter à CHAMPS_NON_INFLUENTS s'il est purement
       de gestion (id, nom…). Sinon le test échoue.
     * Ajouter un champ influent à un moteur → l'ajouter SANS EXCEPTION à
       CHAMPS_COUVERTS. Sinon le test échoue.
   Les moteurs métier ne sont JAMAIS modifiés pour satisfaire ce contrat.
   ======================================================================== */

const CHAMPS_NON_INFLUENTS = new Set(["id", "chantier_id", "nom", "resultats_techniques"]);

type SpecCouverture = {
  source: "zone" | "config";
  champ: string;
  entreesCle: string;
  attendu: unknown;
  muter: (
    zone: Zone,
    config: ConfigTechnique,
    zoneVent: number,
  ) => { zone: Zone; config: ConfigTechnique; zoneVent: number };
};

function muterZone(zone: Zone, config: ConfigTechnique, zoneVent: number, patch: Partial<Zone>) {
  return { zone: { ...zone, ...patch }, config, zoneVent };
}
function muterConfig(zone: Zone, config: ConfigTechnique, zoneVent: number, patch: Partial<ConfigTechnique>) {
  return { zone, config: { ...config, ...patch }, zoneVent };
}

const CHAMPS_COUVERTS: SpecCouverture[] = [
  { source: "zone", champ: "type", entreesCle: "type", attendu: "pignon", muter: (z, c, v) => muterZone(z, c, v, { type: "pignon" }) },
  { source: "zone", champ: "largeur", entreesCle: "largeur", attendu: 6, muter: (z, c, v) => muterZone(z, c, v, { largeur: 6 }) },
  { source: "zone", champ: "hauteur_mur", entreesCle: "hauteur_mur", attendu: 4, muter: (z, c, v) => muterZone(z, c, v, { hauteur_mur: 4 }) },
  { source: "zone", champ: "hauteur_faite", entreesCle: "hauteur_faite", attendu: 5, muter: (z, c, v) => muterZone(z, c, v, { hauteur_faite: 5 }) },
  { source: "zone", champ: "materiau", entreesCle: "materiau", attendu: "lames", muter: (z, c, v) => muterZone(z, c, v, { materiau: "lames" }) },
  {
    source: "zone",
    champ: "ouvertures",
    entreesCle: "ouvertures",
    attendu: [{ id: "ouv-couv-1", type: "fenetre", largeur: 1.2, hauteur: 1.5 }],
    muter: (z, c, v) =>
      muterZone(z, c, v, {
        ouvertures: [{ id: "ouv-couv-1", type: "fenetre", largeur: 1.2, hauteur: 1.5 }],
      }),
  },
  { source: "zone", champ: "famille_pose", entreesCle: "famille_pose", attendu: "composite", muter: (z, c, v) => muterZone(z, c, v, { famille_pose: "composite" }) },
  { source: "zone", champ: "angle", entreesCle: "angle", attendu: true, muter: (z, c, v) => muterZone(z, c, v, { angle: true }) },
  { source: "zone", champ: "largeur_lame_mm", entreesCle: "largeur_lame_mm", attendu: 125, muter: (z, c, v) => muterZone(z, c, v, { largeur_lame_mm: 125 }) },
  { source: "zone", champ: "plaque_longueur_mm", entreesCle: "plaque_longueur_mm", attendu: 3500, muter: (z, c, v) => muterZone(z, c, v, { plaque_longueur_mm: 3500 }) },
  { source: "zone", champ: "plaque_largeur_mm", entreesCle: "plaque_largeur_mm", attendu: 1100, muter: (z, c, v) => muterZone(z, c, v, { plaque_largeur_mm: 1100 }) },
  { source: "zone", champ: "module_largeur_mm", entreesCle: "module_largeur_mm", attendu: 800, muter: (z, c, v) => muterZone(z, c, v, { module_largeur_mm: 800 }) },
  { source: "zone", champ: "module_hauteur_mm", entreesCle: "module_hauteur_mm", attendu: 500, muter: (z, c, v) => muterZone(z, c, v, { module_hauteur_mm: 500 }) },
  { source: "zone", champ: "sens_pose", entreesCle: "sens_pose", attendu: "vertical", muter: (z, c, v) => muterZone(z, c, v, { sens_pose: "vertical" }) },
  { source: "config", champ: "type_isolant", entreesCle: "type_isolant", attendu: "laine_verre", muter: (z, c, v) => muterConfig(z, c, v, { type_isolant: "laine_verre" }) },
  { source: "config", champ: "epaisseur_isolant_mm", entreesCle: "epaisseur_isolant_mm", attendu: 160, muter: (z, c, v) => muterConfig(z, c, v, { epaisseur_isolant_mm: 160 }) },
  { source: "config", champ: "surface_paquet_m2", entreesCle: "surface_paquet_m2", attendu: 6.0, muter: (z, c, v) => muterConfig(z, c, v, { surface_paquet_m2: 6.0 }) },
  { source: "config", champ: "zone_vent_rive", entreesCle: "zone_vent_rive", attendu: true, muter: (z, c, v) => muterConfig(z, c, v, { zone_vent_rive: true }) },
  { source: "config", champ: "coef_perte_rendement", entreesCle: "coef_perte_rendement", attendu: 1.12, muter: (z, c, v) => muterConfig(z, c, v, { coef_perte_rendement: 1.12 }) },
];

describe("couverture des entrées (moteurs)", () => {
  it("chaque clé influente surveillée est réellement portée par extraireEntrees", () => {
    const clesProduites = Object.keys(extraireEntrees(ZONE_BASE, CONFIG_BASE));
    for (const spec of CHAMPS_COUVERTS) {
      expect(clesProduites, `clé d'entrée '${spec.entreesCle}' absente de extraireEntrees`).toContain(
        spec.entreesCle,
      );
    }
  });

  it("chaque clé surveillée est unique (pas de doublon dans le contrat)", () => {
    const cles = CHAMPS_COUVERTS.map((s) => s.entreesCle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it.each(CHAMPS_COUVERTS.map((s) => [s.champ, s] as const))(
    "mutation de « %s » seule → entrée modifiée + changement détecté",
    (_champ, spec) => {
      const entreesBase = extraireEntrees(ZONE_BASE, CONFIG_BASE);
      const mute = spec.muter(ZONE_BASE, CONFIG_BASE, 1);
      const entreesMutees = extraireEntrees(mute.zone, mute.config);

      // La valeur observée dans les entrées a bien changé (la mutation a un effet)
      expect((entreesMutees as Record<string, unknown>)[spec.entreesCle]).toEqual(spec.attendu);
      // ET cela déclenche bien la détection de changement → recalcul/réécriture
      expect(lesEntreesOntChangent(entreesBase, entreesMutees)).toBe(true);
    },
  );

  it("TOUS les champs de Zone (hors gestion) sont couverts", () => {
    const couverts = new Set(CHAMPS_COUVERTS.filter((s) => s.source === "zone").map((s) => s.champ));
    const champsAbsents = Object.keys(ZONE_BASE).filter(
      (k) => !CHAMPS_NON_INFLUENTS.has(k) && !couverts.has(k),
    );
    expect(champsAbsents).toEqual([]);
  });

  it("TOUS les champs de la configuration technique sont couverts", () => {
    const couverts = new Set(CHAMPS_COUVERTS.filter((s) => s.source === "config").map((s) => s.champ));
    const nonCouverts = Object.keys(CONFIG_BASE).filter((k) => !couverts.has(k));
    expect(nonCouverts).toEqual([]);
  });

  it("zone_vent n'est PLUS une entrée surveillée (aucun moteur ne le lit)", () => {
    // Point O : le champ grille-vent du chantier reste une donnée brute (payload
    // metre-complet) mais n'influence aucun calcul → aucune surveillance requise.
    expect(CHAMPS_COUVERTS.some((s) => s.entreesCle === "zone_vent")).toBe(false);
    expect(extraireEntrees(ZONE_BASE, CONFIG_BASE)).not.toHaveProperty("zone_vent");
  });
});