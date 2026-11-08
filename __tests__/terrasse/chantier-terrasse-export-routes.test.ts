// @vitest-environment node
//
// Tests unitaires de cohérence des exports PDF et Excel Terrasse :
// - app/api/chantiers/[id]/terrasse/export/pdf/route.ts
// - app/api/chantiers/[id]/terrasse/export/excel/route.ts
//
// Garanties vérifiées :
//   1. Utilisation exclusive du `resultats_techniques` persisté (zéro recalcul indépendant)
//   2. Conservation intégrale des tarifs et désignations catalogue enregistrés dans l'instantané
//   3. Alignement 1:1 entre GET /terrasse (écran), POST /export/pdf et POST /export/excel
//   4. Rejet explicite (422) si `resultats_techniques` est absent (null/undefined)
//   5. Rejet explicite (500) si l'instantané ou la configuration est corrompu/incomplet (zéro valeur inventée)
//   6. Isolation multi-tenant stricte (401/404)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { GET as getTerrasse } from "@/app/api/chantiers/[id]/terrasse/route";
import { POST as postExportPdf } from "@/app/api/chantiers/[id]/terrasse/export/pdf/route";
import { POST as postExportExcel } from "@/app/api/chantiers/[id]/terrasse/export/excel/route";
import * as calculsModule from "@/lib/terrasse/calculs";
import type { ResultatCalculTerrasse } from "@/lib/terrasse/types";

const ENTREPRISE_ID = "11111111-1111-4111-8111-111111111111";
const CHANTIER_ID = "22222222-2222-4222-8222-222222222222";
const TERRASSE_ID = "33333333-3333-4333-8333-333333333333";

const etat = vi.hoisted(() => ({
  chantier: null as { id: string; nom: string; clients?: { nom: string } } | null,
  terrasse: null as Record<string, unknown> | null,
  reservations: [] as Array<Record<string, unknown>>,
  predicatesEq: {} as Record<string, Array<[string, unknown]>>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((colonne: string, valeur: unknown) => {
        (etat.predicatesEq[table] ??= []).push([colonne, valeur]);
        return chain;
      });
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(() => chain);
      chain.single = vi.fn(async () => {
        if (table === "chantiers") {
          return {
            data: etat.chantier,
            error: etat.chantier ? null : { message: "Not found" },
          };
        }
        return { data: null, error: null };
      });
      chain.maybeSingle = vi.fn(async () => {
        if (table === "chantier_terrasses") {
          return { data: etat.terrasse, error: null };
        }
        return { data: null, error: null };
      });
      chain.then = (
        onFulfilled?: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => {
        const res =
          table === "chantier_terrasse_reservations"
            ? { data: etat.reservations, error: null }
            : { data: null, error: null };
        return Promise.resolve(res).then(onFulfilled, onRejected);
      };
      return chain;
    },
  })),
}));

const resoudreTenant = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tenant", () => ({ resoudreTenant }));

function creerInstantaneValide(): ResultatCalculTerrasse {
  return {
    surfaceBruteM2: 24,
    surfaceNetteM2: 21.5,
    perimetreM: 20,
    lames: {
      essence: "ipe",
      largeurMm: 145,
      epaisseurMm: 21,
      pasMm: 150,
      nbLignesLames: 27,
      lineaireMl: 162,
      surfaceACommanderM2: 23.65,
      nbLamesStandard: 41,
    },
    lambourdes: {
      entraxeCm: 40,
      entraxeMaxDtuCm: 50,
      nbRangees: 11,
      lineaireMl: 66,
      lineaireAvecChutesMl: 71.3,
      nbBarres: 18,
      sectionMm: "45x70",
      epdmMl: 71.3,
      calesIsolationNb: 121,
    },
    plots: {
      type: "reglables",
      entraxeCm: 60,
      porteeMaxAdmissibleCm: 70,
      nbPlotsParLambourde: 11,
      nbPlotsTotal: 121,
      densiteParM2: 5.04,
      geotextileM2: 26.4,
    },
    fixations: {
      type: "clips_invisibles",
      nbVisOuClipsTotal: 334,
      nbBoites: 4,
      clipsDepartFinNb: 22,
    },
    escalier: {
      present: false,
      nbMarches: 0,
      largeurM: 0,
      gironCm: 0,
      hauteurMarcheCm: 0,
      conformeBlondel: true,
      valeurBlondelCm: 0,
      lamesMarchesMl: 0,
      limonsNb: 0,
    },
    gardeCorps: {
      present: false,
      longueurMl: 0,
      hauteurCm: 0,
      type: "bois_cables",
      nbPoteaux: 0,
      conformeNorme: true,
    },
    conformite: {
      statutGlobal: "conforme",
      controles: [
        {
          id: "DTU-ENTRAXE-LAMB",
          titre: "Entraxe des lambourdes",
          regleDtu: "NF DTU 51.4 §6.3",
          statut: "conforme",
          valeurConstatee: "40 cm",
          recommandation: "Entraxe conforme à l'épaisseur de 21 mm.",
        },
      ],
      nbConformes: 1,
      nbAvertissements: 0,
      nbNonConformes: 0,
    },
    chiffrage: {
      lignes: [
        {
          code: "CAT-LAME-IPE",
          categorie: "Platelage",
          designation: "Lame Ipé Premium Sur-Mesure Catalogue",
          quantite: 41,
          unite: "lame",
          prixUnitaireHt: 68.5,
          totalHt: 2808.5,
        },
        {
          code: "CAT-CLIP-INOX",
          categorie: "Fixation",
          designation: "Boîte 100 clips inox A4 Catalogue",
          quantite: 4,
          unite: "boîte",
          prixUnitaireHt: 89.0,
          totalHt: 356.0,
        },
      ],
      totalHt: 3164.5,
      prixM2Ht: 131.85,
    },
    calculeA: "2026-11-08T05:00:00.000Z",
  };
}

function creerTerrasseBase(surcharges: Record<string, unknown> = {}) {
  return {
    id: TERRASSE_ID,
    chantier_id: CHANTIER_ID,
    entreprise_id: ENTREPRISE_ID,
    nom: "Terrasse Sud Piscine",
    longueur_m: 6,
    largeur_m: 4,
    hauteur_sol_cm: 15,
    type_sol: "dalle_beton",
    pente_pct: 1.5,
    essence_bois: "ipe",
    type_pose: "parallele",
    largeur_lame_mm: 145,
    epaisseur_lame_mm: 21,
    longueur_lame_m: 4,
    espacement_lames_mm: 5,
    type_fixation: "clips_invisibles",
    type_lambourde: "exotique_cl4",
    section_largeur_mm: 45,
    section_hauteur_mm: 70,
    longueur_lambourde_m: 4,
    entraxe_lambourdes_cm: 40,
    double_lambourdage_aboutage: true,
    bande_etancheite_epdm: true,
    cales_isolation: true,
    type_plots: "reglables",
    entraxe_plots_cm: 60,
    hauteur_reglage_plots: "40_60",
    geotextile: true,
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
    resultats_techniques: creerInstantaneValide(),
    ...surcharges,
  };
}

function paramsRoute(id = CHANTIER_ID) {
  return { params: Promise.resolve({ id }) };
}

function requeteExport(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("Cohérence des exports PDF et Excel Terrasse avec l'instantané historique", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    etat.chantier = {
      id: CHANTIER_ID,
      nom: "Villa Bellevue",
      clients: { nom: "M. Dupont" },
    };
    etat.terrasse = creerTerrasseBase();
    etat.reservations = [];
    etat.predicatesEq = {};
    resoudreTenant.mockResolvedValue({
      ok: true,
      entrepriseId: ENTREPRISE_ID,
      userId: "user-1",
      role: "patron",
    });
  });

  it("utilise exactement le même resultats_techniques que GET /terrasse sans appeler calculerTerrasse et conserve les données catalogue", async () => {
    const spyCalculer = vi.spyOn(calculsModule, "calculerTerrasse");

    // 1. Lecture écran via GET
    const reqGet = new NextRequest(
      `http://localhost/api/chantiers/${CHANTIER_ID}/terrasse`,
      { method: "GET" }
    );
    const resEcran = await getTerrasse(reqGet, paramsRoute());
    expect(resEcran.status).toBe(200);
    const jsonEcran = (await resEcran.json()) as {
      resultat: ResultatCalculTerrasse;
      source_resultat: string;
    };
    expect(jsonEcran.source_resultat).toBe("historique");
    expect(jsonEcran.resultat.chiffrage.totalHt).toBe(3164.5);

    // 2. Export Excel (même si un body client contradictoire est envoyé)
    const resExcel = await postExportExcel(
      requeteExport(
        `http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/excel`,
        { longueur_m: 99, largeur_m: 99 }
      ),
      paramsRoute()
    );
    expect(resExcel.status).toBe(200);
    expect(resExcel.headers.get("Content-Type")).toContain("spreadsheetml.sheet");

    const bufferExcel = await resExcel.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bufferExcel);
    const wsQuantitatif = workbook.getWorksheet("Nomenclature & Devis");
    expect(wsQuantitatif).toBeDefined();

    const lignesTexteExcel: string[] = [];
    wsQuantitatif!.eachRow((row) => {
      lignesTexteExcel.push(JSON.stringify(row.values));
    });
    const dumpExcel = lignesTexteExcel.join("\n");
    expect(dumpExcel).toContain("Lame Ipé Premium Sur-Mesure Catalogue");
    expect(dumpExcel).toContain("Boîte 100 clips inox A4 Catalogue");
    expect(dumpExcel).toContain("2808.5");
    expect(dumpExcel).toContain("3164.5");

    const wsDtu = workbook.getWorksheet("Audit DTU 51.4 & Géométrie");
    const lignesDtu: string[] = [];
    wsDtu!.eachRow((row) => {
      lignesDtu.push(JSON.stringify(row.values));
    });
    const dumpDtu = lignesDtu.join("\n");
    expect(dumpDtu).toContain("21.5 m²"); // surfaceNetteM2 de l'instantané (avec réservation)
    expect(dumpDtu).toContain("6 m × 4 m"); // Dimensions base de données, pas le body 99x99

    // 3. Export PDF (même si un body client contradictoire est envoyé)
    const resPdf = await postExportPdf(
      requeteExport(
        `http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/pdf`,
        { longueur_m: 99, largeur_m: 99 }
      ),
      paramsRoute()
    );
    expect(resPdf.status).toBe(200);
    expect(resPdf.headers.get("Content-Type")).toBe("application/pdf");
    const pdfBytes = new Uint8Array(await resPdf.arrayBuffer());
    expect(pdfBytes.byteLength).toBeGreaterThan(500);
    // En-tête %PDF-
    expect(Buffer.from(pdfBytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");

    // Aucun recalcul indépendant n'a eu lieu ni sur GET ni sur PDF ni sur Excel
    expect(spyCalculer).not.toHaveBeenCalled();
  });

  it("rejette explicitement (422) l'export PDF et Excel lorsque resultats_techniques est null, sans recalculer", async () => {
    const spyCalculer = vi.spyOn(calculsModule, "calculerTerrasse");
    etat.terrasse = creerTerrasseBase({ resultats_techniques: null });

    const resPdf = await postExportPdf(
      requeteExport(`http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/pdf`),
      paramsRoute()
    );
    expect(resPdf.status).toBe(422);
    const jsonPdf = await resPdf.json();
    expect(jsonPdf.error).toContain("Aucun instantané des résultats techniques");

    const resExcel = await postExportExcel(
      requeteExport(`http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/excel`),
      paramsRoute()
    );
    expect(resExcel.status).toBe(422);
    const jsonExcel = await resExcel.json();
    expect(jsonExcel.error).toContain("Aucun instantané des résultats techniques");

    expect(spyCalculer).not.toHaveBeenCalled();
  });

  it("rejette explicitement (500) un instantané incomplet ou corrompu sans inventer de valeurs par défaut", async () => {
    const spyCalculer = vi.spyOn(calculsModule, "calculerTerrasse");

    // Cas A : chiffrage.lignes vide
    const instantaneSansLignes = creerInstantaneValide();
    instantaneSansLignes.chiffrage.lignes = [];
    etat.terrasse = creerTerrasseBase({
      resultats_techniques: instantaneSansLignes,
    });

    const resPdfA = await postExportPdf(
      requeteExport(`http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/pdf`),
      paramsRoute()
    );
    expect(resPdfA.status).toBe(500);
    expect((await resPdfA.json()).error).toContain("invalide ou incomplet");

    const resExcelA = await postExportExcel(
      requeteExport(`http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/excel`),
      paramsRoute()
    );
    expect(resExcelA.status).toBe(500);
    expect((await resExcelA.json()).error).toContain("invalide ou incomplet");

    // Cas B : prixUnitaireHt manquant / NaN dans une ligne de chiffrage
    const instantaneLigneCorrompue = creerInstantaneValide();
    (instantaneLigneCorrompue.chiffrage.lignes[0] as unknown as Record<string, unknown>).prixUnitaireHt =
      null;
    etat.terrasse = creerTerrasseBase({
      resultats_techniques: instantaneLigneCorrompue,
    });

    const resPdfB = await postExportPdf(
      requeteExport(`http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/pdf`),
      paramsRoute()
    );
    expect(resPdfB.status).toBe(500);
    expect((await resPdfB.json()).error).toContain("ligne de chiffrage corrompue");

    // Cas C : nom de l'ouvrage manquant dans la configuration terrasse (pas d'invention)
    etat.terrasse = creerTerrasseBase({ nom: "   " });
    const resPdfC = await postExportPdf(
      requeteExport(`http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/pdf`),
      paramsRoute()
    );
    expect(resPdfC.status).toBe(500);
    expect((await resPdfC.json()).error).toContain("champ nom est manquant ou vide");

    expect(spyCalculer).not.toHaveBeenCalled();
  });

  it("respecte l'isolation multi-tenant (401 sans tenant, 404 si chantier d'une autre entreprise)", async () => {
    resoudreTenant.mockResolvedValueOnce({
      ok: false,
      reponse: new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
      }),
    });

    const res401 = await postExportPdf(
      requeteExport(`http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/pdf`),
      paramsRoute()
    );
    expect(res401.status).toBe(401);
    expect(etat.predicatesEq.chantiers).toBeUndefined();

    // Chantier introuvable pour l'entreprise courante
    etat.chantier = null;
    const res404 = await postExportExcel(
      requeteExport(`http://localhost/api/chantiers/${CHANTIER_ID}/terrasse/export/excel`),
      paramsRoute()
    );
    expect(res404.status).toBe(404);
    expect(etat.predicatesEq.chantiers).toContainEqual([
      "entreprise_id",
      ENTREPRISE_ID,
    ]);
  });
});
