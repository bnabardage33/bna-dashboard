// __tests__/servir-metre-complet.test.ts
// Source de vérité serveur UNIQUE (lib/servir-metre-complet.ts) — la même
// fonction utilisée par GET /api/chantiers/[id]/metre-complet ET POST
// /api/ia-devis. Ici on vérifie la construction du payload à partir des
// données PERSISTÉES (Supabase mocké), sans auth (celle-ci reste aux routes).

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  servirPayloadMetreComplet,
  ChantierIntrouvableError,
} from "@/lib/servir-metre-complet";

const SupabaseMock = vi.hoisted(() => ({
  chantierFetch: vi.fn(),
  zonesFetch: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: (_cols: string) =>
        table === "chantiers"
          ? {
              eq: (_a: unknown, _b: unknown) => ({
                maybeSingle: () => SupabaseMock.chantierFetch(),
              }),
            }
          : {
              eq: (_a: unknown, _b: unknown) => ({
                order: (_c: unknown, _d: unknown) => SupabaseMock.zonesFetch(),
              }),
            },
    }),
  },
}));

const CHANTIER_ROW = {
  id: "c-1",
  nom: "Villa Test",
  client_id: "cl-1",
  adresse_chantier: "Ajaccio, Corse",
  materiau_structurel: "beton",
  moyen_acces: "pied_oeuvre",
  zone_vent: 1,
  coef_perte_rendement: 1.12,
  type_isolant: "laine_roche",
  epaisseur_isolant_mm: 120,
  surface_paquet_m2: 4.8,
  zone_vent_rive: null,
  surface_m2: 42.5,
  quantite_coupes_ml: 18.4,
  singularites_nb: 3,
  clients: {
    id: "cl-1",
    nom: "SARL Exemple",
    societe: "SARL Exemple",
    email: "contact@exemple.fr",
    tel: "0600000000",
    adresse_facturation: "1 rue X",
    code_postal: "20000",
    ville: "Ajaccio",
    siret: "12345678900012",
  },
};

const ZONE_ROW = {
  id: "z-1",
  chantier_id: "c-1",
  nom: "Façade Nord",
  type: "facade",
  largeur: 5,
  hauteur_mur: 3,
  hauteur_faite: null,
  materiau: "plaques",
  famille_pose: "hpl",
  sens_pose: "horizontal",
  angle: false,
  largeur_lame_mm: null,
  plaque_longueur_mm: 3050,
  plaque_largeur_mm: 1300,
  module_largeur_mm: 1000,
  module_hauteur_mm: 600,
  ouvertures: null,
  resultats_techniques: {
    version_moteur: "1.0.0",
    calcule_le: "2026-09-12T10:00:00.000Z",
    entrees: {
      type: "facade",
      largeur: 5,
      hauteur_mur: 3,
      hauteur_faite: null,
      materiau: "plaques",
      famille_pose: "hpl",
      angle: false,
      largeur_lame_mm: null,
      plaque_longueur_mm: 3050,
      plaque_largeur_mm: 1300,
      module_largeur_mm: 1000,
      module_hauteur_mm: 600,
      sens_pose: "horizontal",
      type_isolant: "laine_roche",
      epaisseur_isolant_mm: 120,
      surface_paquet_m2: 4.8,
      zone_vent_rive: false,
      coef_perte_rendement: 1.12,
      ouvertures: [],
    },
    resultat_zone: {
      bruteFacade: 15,
      brutePignon: 0,
      pente: 0,
      totalOuvertures: 0,
      surfaceNette: 15,
      surfaceACommander: 16.8,
      nombreOuvertures: 0,
      totalCoupesML: 6,
    },
    resultat_pose: {
      entraxeVertical: 1.35,
      entraxeHorizontal: 1.2,
      positionsChevronsM: [0],
      nbMontants: 2,
      nbSegmentsChevrons: 2,
      lineaireChevronsM: 9,
      fixationsParMontant: 4,
      nbFixationsTotal: 8,
      nbEquerresPorteuses: 2,
      nbEquerresGuides: 1,
      nbChevillesMurales: 6,
      nbVisChevronEquerre: 10,
      nbVisParement: 16,
      nbVis: 26,
      lineaireBandeEPDMM: 9,
      isolant: {
        actif: true,
        typeIsolant: "Laine de roche semi-rigide (ROCKWOOL)",
        epaisseurMm: 120,
        surfaceNetteM2: 15,
        surfaceACommanderM2: 16.2,
        tauxPertePct: 0.08,
        surfacePaquetM2: 4.8,
        nbPaquetsACommander: 4,
        nbChevillesRosaces: 75,
        modeleEquerreIsolco: "Isolco 3000 P2 140 mm (Isolant 120mm + lame d'air 20mm)",
      },
      joint: "chevrons 14 mm",
      remarques: [],
    },
    resultat_calepinage: {
      colonnesLargeursM: [0.5, 1, 1, 1, 1, 0.5],
      rangeesHauteursM: [0.6, 0.6, 0.6],
      pieces: [],
      nbPlaquesNecessaires: 9,
      nbPiecesPosees: 15,
      surfaceZoneM2: 15,
      surfacePlaquesAchetesM2: 16.83,
      tauxChuteBrutePct: 10.9,
      tauxChuteNettePct: 8.2,
      tauxChutePct: 8.2,
      totalChutesReutilisablesM2: 0.4,
      totalDechetsPerteM2: 1.4,
      nbJoints: 12,
      estPignon: false,
      hauteurFaiteM: 0,
      pentePct: 0,
      plaqueBruteLongueurMm: 3050,
      plaqueBruteLargeurMm: 1300,
      moduleCibleLargeurMm: 1000,
      moduleCibleHauteurMm: 600,
      modulesParPlaqueBrute: 6,
      plaquesDebit: [],
      entraxeReelMm: 500,
    },
  },
};

describe("servirPayloadMetreComplet", () => {
  beforeEach(() => {
    SupabaseMock.chantierFetch.mockReset();
    SupabaseMock.zonesFetch.mockReset();
  });

  it("constitue le payload depuis les données persistées (copies strictes, aucun recalcul)", async () => {
    SupabaseMock.chantierFetch.mockResolvedValue({ data: CHANTIER_ROW, error: null });
    SupabaseMock.zonesFetch.mockResolvedValue({ data: [ZONE_ROW], error: null });

    const payload = await servirPayloadMetreComplet("c-1");

    expect(payload.chantier.id).toBe("c-1");
    expect(payload.chantier.zone_vent).toBe(1); // donnée brute chantier conservée
    expect(payload.totaux).toEqual({ surface_m2: 42.5, quantite_coupes_ml: 18.4, singularites_nb: 3 });

    expect(payload.zones).toHaveLength(1);
    const pz = payload.zones[0];
    expect(pz.zone.id).toBe("z-1");
    expect(pz.metrage).toEqual(ZONE_ROW.resultats_techniques.resultat_zone);
    expect(pz.pose).toEqual(ZONE_ROW.resultats_techniques.resultat_pose);
    expect(pz.calepinage).toEqual(ZONE_ROW.resultats_techniques.resultat_calepinage);

    expect(payload.meta.statut_completude).toBe("complet");
    expect(payload.meta.manquants).toEqual([]);
  });

  it("chantier introuvable → ChantierIntrouvableError (les routes décident le 404)", async () => {
    SupabaseMock.chantierFetch.mockResolvedValue({ data: null, error: null });

    await expect(servirPayloadMetreComplet("inconnu")).rejects.toThrow(ChantierIntrouvableError);
    expect(SupabaseMock.zonesFetch).not.toHaveBeenCalled();
  });

  it("erreur supabase → levée (répercutée par les routes en 500)", async () => {
    SupabaseMock.chantierFetch.mockResolvedValue({ data: null, error: new Error("boom") });

    await expect(servirPayloadMetreComplet("c-1")).rejects.toThrow("boom");
  });

  it("resultats_techniques mal formé → null renvoyé tel quel (normalisation JSONB)", async () => {
    SupabaseMock.chantierFetch.mockResolvedValue({ data: CHANTIER_ROW, error: null });
    SupabaseMock.zonesFetch.mockResolvedValue({
      data: [{ ...ZONE_ROW, resultats_techniques: "chaîne invalide" }],
      error: null,
    });

    const payload = await servirPayloadMetreComplet("c-1");
    expect(payload.zones[0].metrage).toBeNull();
    expect(payload.zones[0].pose).toBeNull();
    expect(payload.zones[0].calepinage).toBeNull();
    expect(payload.zones[0].entrees).toBeNull();
  });
});