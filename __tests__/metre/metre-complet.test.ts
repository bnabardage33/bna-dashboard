// Tests de l'API GET /api/chantiers/[id]/metre-complet.
//
// Partie A : `construirePayload` (builder pur) — scénarios métier.
// Partie B : route GET — auth (401), chantier inexistant (404), 200 avec copies strictes.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResultatMetre } from "@/lib/metre-serialization";
import type { ResultatPose } from "@/lib/poseCalcul";
import type { Zone } from "@/components/ZoneCard";
import {
  construirePayload,
  type ChantierMetreComplet,
  type ClientMetreComplet,
} from "@/lib/metre-complet";

const SupabaseMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  chantierFetch: vi.fn(),
  zonesFetch: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: SupabaseMock.getUser } }),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (_table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => SupabaseMock.chantierFetch();
      chain.order = () => SupabaseMock.zonesFetch();
      return chain;
    },
  },
}));

import { GET } from "../../app/api/chantiers/[id]/metre-complet/route";
import type { NextRequest } from "next/server";

/** Tenant de test : UUID valide, identique à celui posé dans le claim Supabase. */
const ENT = "11111111-1111-4111-8111-111111111111";
const UTILISATEUR_TENANT = {
  id: "u-1",
  app_metadata: { entreprise_id: ENT },
};

/* ==================================================================
   FIXTURES
   ================================================================== */

const CHANTIER_BASE: ChantierMetreComplet = {
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
};

const CLIENT_BASE: ClientMetreComplet = {
  id: "cl-1",
  nom: "SARL Exemple",
  societe: "SARL Exemple",
  email: "contact@exemple.fr",
  tel: "0600000000",
  adresse_facturation: "1 rue X",
  code_postal: "20000",
  ville: "Ajaccio",
  siret: "12345678900012",
};

const POSE_BASE: ResultatPose = {
  entraxeVertical: 1.35,
  entraxeHorizontal: 1.2,
  positionsChevronsM: [0],
  nbMontants: 2,
  nbSegmentsChevrons: 2,
  lineaireChevronsM: 6,
  fixationsParMontant: 4,
  nbFixationsTotal: 8,
  nbEquerresPorteuses: 2,
  nbEquerresGuides: 1,
  nbChevillesMurales: 4,
  nbVisChevronEquerre: 4,
  nbVisParement: 12,
  nbVis: 16,
  lineaireBandeEPDMM: 6,
  isolant: {
    actif: true,
    typeIsolant: "laine_roche",
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
};

const PERSISTE_PLAQUES: ResultatMetre = {
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
   
   // @ts-expect-error
  resultat_zone: { 
    bruteFacade: 15,
    brutePignon: 0,
    pente: 0,
    totalOuvertures: 0,
    surfaceNette: 15,
    surfaceACommander: 17.25,
    nombreOuvertures: 0,
    totalCoupesML: 6,
  },
  resultat_pose: POSE_BASE,
  resultat_calepinage: {
    colonnesLargeursM: [1],
    rangeesHauteursM: [3],
    pieces: [],
    nbPlaquesNecessaires: 3,
    nbPiecesPosees: 3,
    surfaceZoneM2: 15,
    surfacePlaquesAchetesM2: 15.6,
    tauxChuteBrutePct: 3.8,
    tauxChuteNettePct: 3.8,
    tauxChutePct: 3.8,
    totalChutesReutilisablesM2: 0.6,
    totalDechetsPerteM2: 0,
    nbJoints: 2,
    estPignon: false,
    hauteurFaiteM: 3,
    pentePct: 0,
    plaqueBruteLongueurMm: 3050,
    plaqueBruteLargeurMm: 1300,
    moduleCibleLargeurMm: 1000,
    moduleCibleHauteurMm: 600,
    modulesParPlaqueBrute: 6,
    plaquesDebit: [],
    entraxeReelMm: 600,
  },
};

const ZONE_PLAQUES: Zone = {
  id: "z-1",
  chantier_id: "c-1",
  type: "facade",
  nom: "Façade 1",
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
  resultats_techniques: PERSISTE_PLAQUES,
};

const ZONE_LAMES: Zone = {
  id: "z-2",
  chantier_id: "c-1",
  type: "facade",
  nom: "Façade 2",
  largeur: 4,
  hauteur_mur: 2.5,
  hauteur_faite: null,
  materiau: "lames",
  ouvertures: [],
  famille_pose: "composite",
  angle: true,
  largeur_lame_mm: 125,
  plaque_longueur_mm: null,
  plaque_largeur_mm: null,
  module_largeur_mm: null,
  module_hauteur_mm: null,
  sens_pose: "vertical",
  resultats_techniques: {
    version_moteur: "1.0.0",
    calcule_le: "2026-09-12T11:00:00.000Z",
    entrees: {
      type: "facade",
      largeur: 4,
      hauteur_mur: 2.5,
      hauteur_faite: null,
      materiau: "lames",
      famille_pose: "composite",
      angle: true,
      largeur_lame_mm: 125,
      plaque_longueur_mm: null,
      plaque_largeur_mm: null,
      module_largeur_mm: null,
      module_hauteur_mm: null,
      sens_pose: "vertical",
      type_isolant: "laine_roche",
      epaisseur_isolant_mm: 120,
      surface_paquet_m2: 4.8,
      zone_vent_rive: false,
      coef_perte_rendement: 1.12,
      ouvertures: [],
    },
     
   // @ts-expect-error
  resultat_zone: { 
      bruteFacade: 10,
      brutePignon: 0,
      pente: 0,
      totalOuvertures: 0,
      surfaceNette: 10,
      surfaceACommander: 11,
      nombreOuvertures: 0,
      totalCoupesML: 5,
    },
    resultat_pose: POSE_BASE,
    resultat_calepinage: null,
  },
};

const ZONE_SANS_RESULTATS: Zone = {
  ...ZONE_PLAQUES,
  id: "z-3",
  nom: "Pignon 1",
  type: "pignon",
  largeur: 6,
  hauteur_faite: 5,
  resultats_techniques: null,
};

const ZONE_POSE_NULLE: Zone = {
  ...ZONE_PLAQUES,
  id: "z-4",
  nom: "Façade pose absente",
  resultats_techniques: {
    version_moteur: "1.0.0",
    calcule_le: "2026-09-12T10:05:00.000Z",
    entrees: PERSISTE_PLAQUES.entrees,
    resultat_zone: PERSISTE_PLAQUES.resultat_zone,
    resultat_pose: null,
    resultat_calepinage: PERSISTE_PLAQUES.resultat_calepinage,
  },
};

const ZONE_SANS_FAMILLE: Zone = {
  ...ZONE_PLAQUES,
  id: "z-5",
  famille_pose: null,
};

/* ==================================================================
   PARTIE A — builder pur
   ================================================================== */

describe("metre-complet : construirePayload", () => {
  it("chantier complet multi-zones → complet, copies persistées strictes", () => {
    const payload = construirePayload({
      chantier: CHANTIER_BASE,
      client: CLIENT_BASE,
      zones: [ZONE_PLAQUES, ZONE_LAMES],
    });

    expect(payload.meta.statut_completude).toBe("complet");
    expect(payload.meta.manquants).toEqual([]);
    expect(payload.meta.nombre_zones).toBe(2);
    expect(payload.meta.zones_calculees).toBe(2);
    expect(payload.meta.version_moteur).toBe("1.0.0");

    expect(payload.totaux).toEqual({
      surface_m2: 42.5,
      quantite_coupes_ml: 18.4,
      singularites_nb: 3,
    });

    expect(payload.chantier).toMatchObject({
      id: "c-1",
      nom: "Villa Test",
      adresse: "Ajaccio, Corse",
      materiau_structurel: "beton",
      moyen_acces: "pied_oeuvre",
      zone_vent: 1,
      coef_perte_rendement: 1.12,
    });
    expect(payload.chantier.client).toEqual(CLIENT_BASE);

    expect(payload.configuration_technique).toEqual({
      type_isolant: "laine_roche",
      epaisseur_isolant_mm: 120,
      surface_paquet_m2: 4.8,
      zone_vent_rive: null,
      coef_perte_rendement: 1.12,
    });
  });

  it("données persistées retournées À L'IDENTIQUE, sans aucun recalcul", () => {
    const payload = construirePayload({
      chantier: CHANTIER_BASE,
      client: null,
      zones: [ZONE_PLAQUES],
    });

    const pz = payload.zones[0];
    expect(pz.version_moteur).toBe(PERSISTE_PLAQUES.version_moteur);
    expect(pz.calcule_le).toBe(PERSISTE_PLAQUES.calcule_le);
    expect(pz.entrees).toEqual(PERSISTE_PLAQUES.entrees);
    expect(pz.metrage).toBe(PERSISTE_PLAQUES.resultat_zone);
    expect(pz.pose).toBe(PERSISTE_PLAQUES.resultat_pose);
    expect(pz.calepinage).toBe(PERSISTE_PLAQUES.resultat_calepinage);
  });

  it("zone au resultats_techniques incomplet (pose null) → null renvoyé tel quel, sans recalcul", () => {
    const payload = construirePayload({
      chantier: CHANTIER_BASE,
      client: null,
      zones: [ZONE_POSE_NULLE],
    });

    expect(payload.zones[0].pose).toBeNull();
    // Le reste du JSONB est intact (aucun recalcul, aucune invention).
    expect(payload.zones[0].metrage).toEqual(PERSISTE_PLAQUES.resultat_zone);
    expect(payload.zones[0].calepinage).toEqual(PERSISTE_PLAQUES.resultat_calepinage);
    expect(payload.zones[0].entrees).toEqual(PERSISTE_PLAQUES.entrees);

    expect(payload.meta.statut_completude).toBe("incomplet");
    expect(payload.meta.manquants).toContain("pose");
  });

  it("chantier sans zones → non_calculé, manquants vides", () => {
    const payload = construirePayload({ chantier: CHANTIER_BASE, client: null, zones: [] });
    expect(payload.meta.statut_completude).toBe("non_calculé");
    expect(payload.meta.nombre_zones).toBe(0);
    expect(payload.meta.zones_calculees).toBe(0);
    expect(payload.meta.manquants).toEqual([]);
    expect(payload.zones).toEqual([]);
  });

  it("toutes zones sans resultats_techniques → non_calculé", () => {
    const payload = construirePayload({
      chantier: CHANTIER_BASE,
      client: null,
      zones: [ZONE_SANS_RESULTATS],
    });

    expect(payload.meta.statut_completude).toBe("non_calculé");
    const pz = payload.zones[0];
    expect(pz.version_moteur).toBeNull();
    expect(pz.calcule_le).toBeNull();
    expect(pz.entrees).toBeNull();
    expect(pz.metrage).toBeNull();
    expect(pz.pose).toBeNull();
    expect(pz.calepinage).toBeNull();
    // Le bloc zone (données brutes) reste rempli.
    expect(pz.zone.type).toBe("pignon");
    expect(pz.zone.nom).toBe("Pignon 1");
  });

  it("une zone calculée + une non calculée → incomplet, manquants zone-level", () => {
    const payload = construirePayload({
      chantier: CHANTIER_BASE,
      client: null,
      zones: [ZONE_PLAQUES, ZONE_SANS_RESULTATS],
    });

    expect(payload.meta.statut_completude).toBe("incomplet");
    expect(payload.meta.zones_calculees).toBe(1);
    // La zone sans résultat (plaque) est en manque de metrage, pose et calepinage.
    expect(payload.meta.manquants.sort()).toEqual(["calepinage", "metrage", "pose"]);
  });

  it("configuration_isolant absente → manquant (exemple type : famille_pose + configuration_isolant)", () => {
    const chantierSansConfig = {
      ...CHANTIER_BASE,
      type_isolant: null,
      epaisseur_isolant_mm: null,
      surface_paquet_m2: null,
    };
    const payload = construirePayload({
      chantier: chantierSansConfig,
      client: null,
      zones: [ZONE_SANS_FAMILLE],
    });

    expect(payload.meta.statut_completude).toBe("incomplet");
    expect(payload.meta.manquants).toEqual([
      "famille_pose",
      "configuration_isolant",
    ]);
  });

  it("famille_pose absente seule → manquant famille_pose", () => {
    const payload = construirePayload({
      chantier: CHANTIER_BASE,
      client: null,
      zones: [ZONE_SANS_FAMILLE],
    });
    expect(payload.meta.statut_completude).toBe("incomplet");
    expect(payload.meta.manquants).toEqual(["famille_pose"]);
  });

  it("sans_isolant avec epaisseur 0 → configuration considérée valide", () => {
    const chantierSansIsolant = {
      ...CHANTIER_BASE,
      type_isolant: "sans_isolant",
      epaisseur_isolant_mm: 0,
      surface_paquet_m2: null,
    };
    const payload = construirePayload({
      chantier: chantierSansIsolant,
      client: null,
      zones: [ZONE_PLAQUES],
    });
    expect(payload.meta.statut_completude).toBe("complet");
    expect(payload.meta.manquants).toEqual([]);
  });

  it("sans_isolant avec epaisseur non nulle → configuration_isolant manquant", () => {
    const chantierSansIsolantMalConfigure = {
      ...CHANTIER_BASE,
      type_isolant: "sans_isolant",
      epaisseur_isolant_mm: null,
    };
    const payload = construirePayload({
      chantier: chantierSansIsolantMalConfigure,
      client: null,
      zones: [ZONE_PLAQUES],
    });
    expect(payload.meta.statut_completude).toBe("incomplet");
    expect(payload.meta.manquants).toContain("configuration_isolant");
  });

  it("type_isolant présent mais epaisseur absente → configuration_isolant manquant", () => {
    const chantierEpaisseurAbsente = {
      ...CHANTIER_BASE,
      epaisseur_isolant_mm: null,
    };
    const payload = construirePayload({
      chantier: chantierEpaisseurAbsente,
      client: null,
      zones: [ZONE_PLAQUES],
    });
    expect(payload.meta.statut_completude).toBe("incomplet");
    expect(payload.meta.manquants).toContain("configuration_isolant");
  });

  it("zone_vent_rive null n'est JAMAIS un manquant (comportement Auto du moteur)", () => {
    // CHANTIER_BASE.zone_vent_rive est null et le scénario complet reste complet.
    const payload = construirePayload({
      chantier: CHANTIER_BASE,
      client: null,
      zones: [ZONE_PLAQUES],
    });
    expect(payload.meta.statut_completude).toBe("complet");
    expect(payload.meta.manquants).not.toContain("zone_vent_rive");
  });
});

/* ==================================================================
   PARTIE B — route GET
   ================================================================== */

describe("metre-complet : route GET /api/chantiers/[id]/metre-complet", () => {
  beforeEach(() => {
    SupabaseMock.getUser.mockReset();
    SupabaseMock.chantierFetch.mockReset();
    SupabaseMock.zonesFetch.mockReset();
  });

  async function appelGET(id = "c-1") {
    return GET(new Request("http://localhost/api/chantiers/c-1/metre-complet") as NextRequest, {
      params: Promise.resolve({ id }),
    });
  }

  it("accès refusé → 401 quand l'utilisateur n'est pas authentifié", async () => {
    SupabaseMock.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await appelGET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(SupabaseMock.chantierFetch).not.toHaveBeenCalled();
  });

  it("session sans claim entreprise → 403 sans aucune requête métier", async () => {
    SupabaseMock.getUser.mockResolvedValue({
      data: { user: { id: "u-1", app_metadata: {} } },
      error: null,
    });

    const res = await appelGET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(SupabaseMock.chantierFetch).not.toHaveBeenCalled();
  });

  it("chantier inexistant → 404", async () => {
    SupabaseMock.getUser.mockResolvedValue({ data: { user: UTILISATEUR_TENANT }, error: null });
    SupabaseMock.chantierFetch.mockResolvedValue({ data: null, error: null });

    const res = await appelGET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(SupabaseMock.zonesFetch).not.toHaveBeenCalled();
  });

  it("chantier appartenant à un autre tenant → 404 avant lecture des zones", async () => {
    SupabaseMock.getUser.mockResolvedValue({ data: { user: UTILISATEUR_TENANT }, error: null });
    SupabaseMock.chantierFetch.mockResolvedValue({
      data: { ...CHANTIER_BASE, entreprise_id: "22222222-2222-4222-8222-222222222222", clients: { ...CLIENT_BASE, entreprise_id: "22222222-2222-4222-8222-222222222222" } },
      error: null,
    });

    const res = await appelGET();
    expect(res.status).toBe(404);
    expect(SupabaseMock.zonesFetch).not.toHaveBeenCalled();
  });

  it("chantier complet → 200, payload construit depuis les données persistées", async () => {
    SupabaseMock.getUser.mockResolvedValue({ data: { user: UTILISATEUR_TENANT }, error: null });
    SupabaseMock.chantierFetch.mockResolvedValue({
      data: {
        ...CHANTIER_BASE,
        entreprise_id: ENT,
        clients: { ...CLIENT_BASE, entreprise_id: ENT },
      },
      error: null,
    });
    SupabaseMock.zonesFetch.mockResolvedValue({ data: [{ ...ZONE_PLAQUES, entreprise_id: ENT }], error: null });

    const res = await appelGET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);

    const { data } = body;
    expect(data.meta.statut_completude).toBe("complet");
    expect(data.meta.nombre_zones).toBe(1);
    expect(data.zones).toHaveLength(1);

    // Copies strictes du JSONB persisté → aucun recalcul.
    expect(data.zones[0].metrage).toEqual(PERSISTE_PLAQUES.resultat_zone);
    expect(data.zones[0].pose).toEqual(PERSISTE_PLAQUES.resultat_pose);
    expect(data.zones[0].calepinage).toEqual(PERSISTE_PLAQUES.resultat_calepinage);
    expect(data.zones[0].entrees).toEqual(PERSISTE_PLAQUES.entrees);

    // Totaux = agrégats chantier persistés.
    expect(data.totaux).toEqual({
      surface_m2: 42.5,
      quantite_coupes_ml: 18.4,
      singularites_nb: 3,
    });
  });
});