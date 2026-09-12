// __tests__/persistance-metre.test.ts
// Cycle de vie complet de la persistance de `chantier_zones.resultats_techniques`.
//
// Réplique fidèlement le chemin pris par ZoneCard (les mêmes fonctions pures :
// extraireEntrees / persistanceNecessaire / serialiserResultatTechnique) contre un
// store en mémoire, avec les VRAIS moteurs (calculerZone / calculerPose /
// calculerCalepinage). Aucun Supabase ici : on vérifie la DÉCISION d'écriture.
import { describe, it, expect } from "vitest";
import type { Zone, ConfigTechnique } from "@/components/ZoneCard";
import { calculerZone } from "@/components/ZoneCard";
import { calculerPose } from "@/lib/poseCalcul";
import { calculerCalepinage } from "@/lib/calepinageCalcul";
import type { ResultatMetre } from "@/lib/metre-serialization";
import {
  extraireEntrees,
  serialiserResultatTechnique,
} from "@/lib/metre-serialization";
import { persistanceNecessaire } from "@/lib/metre-persistance";

const ZONE_BASE: Zone = {
  id: "zone-1",
  chantier_id: "chantier-1",
  type: "facade",
  nom: "Facade Sud",
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
  resultats_techniques: null,
};

const CONFIG_BASE: ConfigTechnique = {
  type_isolant: "laine_roche",
  epaisseur_isolant_mm: 120,
  surface_paquet_m2: 4.8,
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

// "Store" en mémoire : représente la colonne resultats_techniques de la ligne
// chantier_zones du serveur.
type StoreZone = { resultats_techniques: ResultatMetre | null };

// Réplique la DÉCISION de ZoneCard : même comparaison d'entrées, mêmes objets
// résultats produit / rien ne change → aucune écriture (renvoie le stocké).
function evaluerPersistance(
  store: StoreZone,
  zone: Zone,
  zoneVent: number,
  config: ConfigTechnique,
): { ecriture: boolean; resultat: ResultatMetre | null } {
  const stocker = store.resultats_techniques;
  const entrees = extraireEntrees(zone, config);
  if (!persistanceNecessaire(stocker, entrees)) {
    return { ecriture: false, resultat: stocker };
  }
  const { resultatZone, pose, calepinage } = calculerMoteurs(zone, zoneVent, config);
  const resultat = serialiserResultatTechnique(zone, config, resultatZone, pose, calepinage);
  store.resultats_techniques = resultat;
  return { ecriture: true, resultat };
}

describe("persistance resultats_techniques", () => {
  it("persistanceNecessaire : premier calcul → persiste, entrées identiques → non, modifiées → oui", () => {
    const entrees = extraireEntrees(ZONE_BASE, CONFIG_BASE);
    expect(persistanceNecessaire(null, entrees)).toBe(true);
    expect(persistanceNecessaire(undefined, entrees)).toBe(true);

    const stockerSur = (e: typeof entrees): ResultatMetre => ({
      version_moteur: "1.0.0",
      calcule_le: "2026-09-12T10:00:00.000Z",
      entrees: e,
      resultat_zone: calculerZone(ZONE_BASE, CONFIG_BASE.coef_perte_rendement),
      resultat_pose: null,
      resultat_calepinage: null,
    });

    expect(persistanceNecessaire(stockerSur(entrees), entrees)).toBe(false);

    const entreesModifiees = extraireEntrees({ ...ZONE_BASE, largeur: 6 }, CONFIG_BASE);
    expect(persistanceNecessaire(stockerSur(entrees), entreesModifiees)).toBe(true);
  });

  it("création zone → calcul → sauvegarde (entrées du JSONB = entrées des moteurs)", () => {
    const store: StoreZone = { resultats_techniques: null };
    const { ecriture, resultat } = evaluerPersistance(store, ZONE_BASE, 1, CONFIG_BASE);

    expect(ecriture).toBe(true);
    expect(resultat).not.toBeNull();
    expect(resultat!.entrees).toEqual(extraireEntrees(ZONE_BASE, CONFIG_BASE));
    // Le résultat persisté est EXACTEMENT ce que les moteurs produisent pour
    // ces entrées : aucun deuxième chemin de calcul.
    const { resultatZone, pose, calepinage } = calculerMoteurs(ZONE_BASE, 1, CONFIG_BASE);
    expect(resultat!.resultat_zone).toEqual(resultatZone);
    expect(resultat!.resultat_pose).toEqual(pose);
    expect(resultat!.resultat_calepinage).toEqual(calepinage);
    expect(resultat!.resultat_zone.surfaceACommander).toBeCloseTo(15 * 1.15, 6);
    expect(store.resultats_techniques).toBe(resultat);
  });

  it("rechargement → résultat identique → AUCUNE réécriture", () => {
    const store: StoreZone = { resultats_techniques: null };
    // 1. Enregistrement initial (zone saisie)
    evaluerPersistance(store, ZONE_BASE, 1, CONFIG_BASE);

    // 2. « Rechargement » : relecture de la base (le stocké est renvoyé tel quel)
    const reload = { resultats_techniques: store.resultats_techniques };

    // 3. Zone repliée depuis le serveur avec les mêmes valeurs
    const zoneReload: Zone = { ...ZONE_BASE, resultats_techniques: reload.resultats_techniques };

    // 4. La zone n'est PAS réécrite, le résultat rechargé reste la source
    const { ecriture, resultat } = evaluerPersistance(reload, zoneReload, 1, CONFIG_BASE);
    expect(ecriture).toBe(false);
    expect(resultat).toEqual(store.resultats_techniques);
  });

  it("aucun changement → aucune réécriture (répété)", () => {
    const store: StoreZone = { resultats_techniques: null };
    evaluerPersistance(store, ZONE_BASE, 1, CONFIG_BASE);

    const calculeLeInitial = store.resultats_techniques!.calcule_le;
    for (let i = 0; i < 3; i++) {
      const { ecriture } = evaluerPersistance(store, { ...ZONE_BASE }, 1, CONFIG_BASE);
      expect(ecriture).toBe(false);
    }
    // calcule_le n'a jamais été réécrit
    expect(store.resultats_techniques!.calcule_le).toBe(calculeLeInitial);
  });

  it("POINT O : changer uniquement zone_vent de 1 à 3 → AUCUNE nouvelle persistance", () => {
    const store: StoreZone = { resultats_techniques: null };
    evaluerPersistance(store, ZONE_BASE, 1, CONFIG_BASE);
    const calculeLeInitial = store.resultats_techniques!.calcule_le;

    // Même zone + même config chantier, seule la grille-vent (zone_vent) change.
    // zone_vent n'étant plus une entrée moteur, aucune réécriture ne doit avoir lieu.
    const { ecriture, resultat } = evaluerPersistance(store, ZONE_BASE, 3, CONFIG_BASE);
    expect(ecriture).toBe(false);
    expect(resultat).toEqual(store.resultats_techniques);
    expect(store.resultats_techniques!.calcule_le).toBe(calculeLeInitial);
  });

  it("relecture JSONB réelle (stringify/parse = ordre de clés différent) → AUCUNE réécriture", () => {
    const store: StoreZone = { resultats_techniques: null };
    evaluerPersistance(store, ZONE_BASE, 1, CONFIG_BASE);

    // Relecture depuis Postgres : le JSONB est désérialisé en JS avec un ordre
    // de clés différent (tri alphabétique) de celui d'origine.
    const relu = JSON.parse(JSON.stringify(store.resultats_techniques)) as ResultatMetre;
    const calculeLeInitial = store.resultats_techniques!.calcule_le;

    // La page stocke ce que la base a renvoyé ; la zone est ré-hydratée telle quelle.
    const storeRelu: StoreZone = { resultats_techniques: relu };
    const zoneReload: Zone = { ...ZONE_BASE, resultats_techniques: relu };

    const { ecriture, resultat } = evaluerPersistance(storeRelu, zoneReload, 1, CONFIG_BASE);
    expect(ecriture).toBe(false);
    expect(resultat).toEqual(relu);
    // calcule_le n'a pas été réécrit : les entrées sont identiques malgré
    // l'ordre de clés JSON différent.
    expect(storeRelu.resultats_techniques!.calcule_le).toBe(calculeLeInitial);
  });

  it("resultats_techniques mal formé (objet sans entrees exploitables) → repersisté", () => {
    const malForme = { version_moteur: "0.9.0" } as unknown as ResultatMetre;
    const entrees = extraireEntrees(ZONE_BASE, CONFIG_BASE);
    expect(persistanceNecessaire(malForme, entrees)).toBe(true);
  });

  it("modification d'une dimension → recalcul + nouvelle sauvegarde", () => {
    const store: StoreZone = { resultats_techniques: null };
    evaluerPersistance(store, ZONE_BASE, 1, CONFIG_BASE);
    const avant = store.resultats_techniques;

    const zoneModifiee: Zone = { ...ZONE_BASE, largeur: 6 };
    const { ecriture, resultat } = evaluerPersistance(store, zoneModifiee, 1, CONFIG_BASE);

    expect(ecriture).toBe(true);
    expect(resultat!.entrees).toEqual(extraireEntrees(zoneModifiee, CONFIG_BASE));
    expect(resultat!.resultat_zone.surfaceNette).toBeCloseTo(18, 6);
    expect(resultat!.resultat_zone.surfaceACommander).toBeCloseTo(18 * 1.15, 6);
    expect(store.resultats_techniques).not.toBe(avant);

    // Redevient stable : re-évaluation identique → plus d'écriture
    const { ecriture: ecriture2 } = evaluerPersistance(store, zoneModifiee, 1, CONFIG_BASE);
    expect(ecriture2).toBe(false);
  });

  it("modification de la configuration technique du chantier → recalcul + nouvelle sauvegarde", () => {
    const store: StoreZone = { resultats_techniques: null };
    evaluerPersistance(store, ZONE_BASE, 1, CONFIG_BASE);

    const configModifiee: ConfigTechnique = {
      ...CONFIG_BASE,
      type_isolant: "laine_verre",
      epaisseur_isolant_mm: 160,
      coef_perte_rendement: 1.12,
    };
    const { ecriture, resultat } = evaluerPersistance(store, ZONE_BASE, 1, configModifiee);

    expect(ecriture).toBe(true);
    expect(resultat!.entrees.type_isolant).toBe("laine_verre");
    expect(resultat!.entrees.epaisseur_isolant_mm).toBe(160);
    // La surface à commander suit le coefficient persisté, pas la marge par défaut
    const { resultatZone } = calculerMoteurs(ZONE_BASE, 1, configModifiee);
    expect(resultat!.resultat_zone).toEqual(resultatZone);
    expect(resultat!.resultat_zone.surfaceACommander).toBeCloseTo(15 * 1.12, 6);

    // L'isolant constaté dans le résultat persiste reflète la config (laine de verre 160)
    expect(resultat!.resultat_pose!.isolant.epaisseurMm).toBe(160);
  });

  it("zone historique avec resultats_techniques NULL → jamais cassée, première écriture suffit", () => {
    const store: StoreZone = { resultats_techniques: null };
    const zoneHistorique: Zone = { ...ZONE_BASE, resultats_techniques: null };
    const { ecriture, resultat } = evaluerPersistance(store, zoneHistorique, 1, CONFIG_BASE);
    expect(ecriture).toBe(true);
    expect(resultat!.version_moteur).toBe("1.0.0");
    expect(store.resultats_techniques).not.toBeNull();
  });

  it("suppression de zone → aucun résultat orphelin", () => {
    // Le JSONB vit sur la ligne chantier_zones : supprimer la zone supprime son
    // résultat avec elle. Simulation du flux `supprimerZone` (delete de la ligne).
    const zonesEnBase = new Map<string, StoreZone>([
      ["zone-1", { resultats_techniques: null }],
      ["zone-2", { resultats_techniques: null }],
    ]);

    const evalZone1 = evaluerPersistance(zonesEnBase.get("zone-1")!, ZONE_BASE, 1, CONFIG_BASE);
    expect(evalZone1.ecriture).toBe(true);
    expect(zonesEnBase.get("zone-1")!.resultats_techniques).not.toBeNull();

    // Suppression : la ligne (et son JSONB) disparaissent de la base
    zonesEnBase.delete("zone-1");
    expect(zonesEnBase.has("zone-1")).toBe(false);
    expect(zonesEnBase.has("zone-2")).toBe(true);
    // Aucun résultat de zone-1 ne subsiste nulle part
    expect(zonesEnBase.get("zone-2")!.resultats_techniques).toBeNull();
  });

  it("le résultat persisté correspond EXACTEMENT à l'affichage ZoneCard (façade, pose, calepinage)", () => {
    const store: StoreZone = { resultats_techniques: null };
    const zoneComplexe: Zone = {
      ...ZONE_BASE,
      ouvertures: [{ id: "ouv-1", type: "fenetre", largeur: 1.2, hauteur: 1.5 }],
      angle: true,
    };
    const { resultat } = evaluerPersistance(store, zoneComplexe, 3, CONFIG_BASE);

    const { resultatZone, pose, calepinage } = calculerMoteurs(zoneComplexe, 3, CONFIG_BASE);
    expect(resultat!.resultat_zone).toEqual(resultatZone);
    expect(resultat!.resultat_pose).toEqual(pose);
    expect(resultat!.resultat_calepinage).toEqual(calepinage);
    // Point O : zone_vent n'est plus une entrée persistance (aucun moteur ne le lit).
    expect(resultat!.entrees).not.toHaveProperty("zone_vent");
    expect(resultat!.entrees.zone_vent_rive).toBe(CONFIG_BASE.zone_vent_rive); // null → suivi angle en affichage
  });

  it("le double évaluation en vol ne réécrit pas (garde-fou anti-boucle ZoneCard)", () => {
    // Si la page n'a pas encore acquitté, ZoneCard ne doit pas réémettre pour
    // les mêmes entrées : c'est le ref de garde + persistanceNecessaire.
    const entrees = extraireEntrees(ZONE_BASE, CONFIG_BASE);
    const stocker = storeStub(entrees);
    expect(persistanceNecessaire(stocker, entrees)).toBe(false);
  });
});

function storeStub(entrees: ReturnType<typeof extraireEntrees>): ResultatMetre {
  return {
    version_moteur: "1.0.0",
    calcule_le: "2026-09-12T10:00:00.000Z",
    entrees,
    resultat_zone: calculerZone(ZONE_BASE, CONFIG_BASE.coef_perte_rendement),
    resultat_pose: null,
    resultat_calepinage: null,
  };
}