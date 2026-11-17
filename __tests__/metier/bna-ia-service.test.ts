// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  buildSystemPromptContext,
  calculerAlertesProactives,
  calculerSyntheseFinanciereBna,
  detectBnaIaActions,
  detecterChantierComplexe,
  findMentionedChantier,
  generateLocalAssistantResponse,
  parseNaturalDate,
  urlHubPourChantier,
  type BnaIaContext,
} from "@/lib/bnaIaService";
import { detecterEtCalculerPreChiffrage } from "@/lib/bnaIaPreChiffrage";
import { normaliserRequeteMetier } from "@/lib/bnaDictionnaireMetier";

const MOCK_CONTEXT: BnaIaContext = {
  userName: "Gaël",
  currentDateIso: "2026-11-17",
  chantiers: [
    {
      id: "ch-terrasse-1",
      nom: "Terrasse Martin",
      ville: "Mérignac",
      metier: "terrasse",
      statut: "en_cours",
      avancement: 65,
      date_debut: "2026-11-15",
      date_fin: "2026-11-20",
      alerte_meteo: "Pluie modérée prévue demain",
    },
    {
      id: "ch-bardage-2",
      nom: "Bardage Dupont",
      ville: "Pessac",
      metier: "bardage",
      statut: "prevu",
      avancement: 20,
      date_debut: "2026-11-18",
      date_fin: "2026-11-25",
    },
    {
      id: "ch-cloture-3",
      nom: "Clôture Leroy",
      ville: "Bordeaux",
      metier: "cloture",
      statut: "en_cours",
      avancement: 50,
      date_debut: "2026-11-16",
      date_fin: "2026-11-19",
    },
  ],
  commandes: [
    {
      id: "cmd-1",
      designation: "Lames Cumaru 21x145",
      fournisseur_nom: "Dispano",
      chantier_id: "ch-terrasse-1",
      chantier_nom: "Terrasse Martin",
      statut: "commandee",
      date_livraison_prevue: "2026-11-14",
      montant_ht: 2400,
    },
    {
      id: "cmd-2",
      designation: "Poteaux alu H1.80",
      fournisseur_nom: "Clôture Pro",
      chantier_id: "ch-cloture-3",
      chantier_nom: "Clôture Leroy",
      statut: "livree",
      date_livraison_prevue: "2026-11-15",
      montant_ht: 950,
    },
  ],
  devis: [
    {
      id: "dev-1",
      numero: "DEV-2026-010",
      chantier_id: "ch-terrasse-1",
      statut: "signe",
      total_ht: 12000,
      marge_ht: 4200,
      marge_pct: 35,
    },
    {
      id: "dev-2",
      numero: "DEV-2026-011",
      chantier_id: "ch-cloture-3",
      statut: "envoye",
      total_ht: 4500,
      marge_ht: 1500,
      marge_pct: 33.3,
    },
  ],
  factures: [
    {
      id: "fac-1",
      numero: "FAC-2026-005",
      chantier_id: "ch-terrasse-1",
      statut: "envoyee",
      total_ttc: 6000,
      montant_paye_ttc: 2000,
      date_echeance: "2026-11-10",
    },
  ],
  pvs: [
    {
      id: "pv-1",
      numero: "PV-2026-002",
      chantier_id: "ch-bardage-2",
      statut: "avec_reserves",
      reserves_nb: 2,
    },
  ],
  ticketsSav: [
    {
      id: "sav-1",
      numero: "SAV-2026-003",
      titre: "Réglage galet terrasse mobile",
      metier: "terrasse",
      statut: "nouveau",
      priorite: "urgente",
    },
  ],
};

describe("BNA-IA — Moteur métier, Alertes Proactives & Actions", () => {
  it("calcule la synthèse financière et les alertes proactives multi-métiers", () => {
    const fin = calculerSyntheseFinanciereBna(
      MOCK_CONTEXT.devis,
      MOCK_CONTEXT.factures,
      MOCK_CONTEXT.currentDateIso
    );
    expect(fin.caSigneHt).toBe(12000);
    expect(fin.pipelineHt).toBe(4500);
    expect(fin.encaisseTtc).toBe(2000);
    expect(fin.resteAEncaisserTtc).toBe(4000);
    expect(fin.nbFacturesEchues).toBe(1);
    expect(fin.montantEchuTtc).toBe(4000);

    const alertes = calculerAlertesProactives(MOCK_CONTEXT);
    expect(alertes.map((a) => a.categorie)).toEqual([
      "commande",
      "facture",
      "sav",
      "pv",
      "meteo",
    ]);
    expect(alertes[0].href).toContain("/bureau/fournisseurs?tab=commandes&retard=cmd-1");
  });

  it("génère le prompt système avec les 3 métiers, commandes, trésorerie et SAV", () => {
    const prompt = buildSystemPromptContext(MOCK_CONTEXT);
    expect(prompt).toContain("[TERRASSE] Terrasse Martin");
    expect(prompt).toContain("[BARDAGE] Bardage Dupont");
    expect(prompt).toContain("[CLOTURE] Clôture Leroy");
    expect(prompt).toContain("NF DTU 51.4");
    expect(prompt).toContain("NF P90-308");
    expect(prompt).toContain("Tickets SAV ouverts : 1");
  });

  it("résout les hubs métiers et détecte les actions (avancement, décalage planning, note)", () => {
    expect(urlHubPourChantier("1", "bardage")).toBe("/terrain/chantier/1");
    expect(urlHubPourChantier("2", "terrasse")).toBe("/terrain/terrasse/2");
    expect(urlHubPourChantier("3", "cloture")).toBe("/terrain/cloture/3");

    expect(findMentionedChantier("Ouvre Clôture Leroy", MOCK_CONTEXT.chantiers)?.id).toBe(
      "ch-cloture-3"
    );
    expect(parseNaturalDate("demain", "2026-11-17")).toBe("2026-11-18");

    const actAvancement = detectBnaIaActions(
      "Passe l'avancement de Terrasse Martin à 85%",
      MOCK_CONTEXT
    );
    expect(actAvancement.some((a) => a.type === "update_avancement" && a.payload.nouvelAvancement === 85)).toBe(true);

    const actShift = detectBnaIaActions(
      "Décale Bardage Dupont de 3 jours sur le planning",
      MOCK_CONTEXT
    );
    expect(actShift.some((a) => a.type === "shift_planning" && a.payload.decalageJours === 3)).toBe(true);

    const actNote = detectBnaIaActions("Note : Commander 12 sacs béton demain", MOCK_CONTEXT);
    expect(actNote.some((a) => a.type === "create_note")).toBe(true);
  });

  it("répond localement à 0ms sur briefing, DTU, trésorerie, SAV et bascule en Copilote BNA sinon", () => {
    const briefing = generateLocalAssistantResponse("Briefing du jour", MOCK_CONTEXT);
    expect(briefing.tags).toContain("Briefing");
    expect(briefing.content).toContain("Bardage (1), Terrasse (1), Clôture (1)");

    const dtu = generateLocalAssistantResponse("Règles DTU 51.4 et P90-308", MOCK_CONTEXT);
    expect(dtu.content).toContain("NF DTU 51.4");
    expect(dtu.content).toContain("NF P90-308");

    const fallback = generateLocalAssistantResponse("Explique-moi comment optimiser ma semaine", MOCK_CONTEXT);
    expect(fallback.tags).toContain("Copilote BNA");
  });

  it("calcule sans hallucination un pré-chiffrage Bardage HPL ITE 2 double façade 5x8 fenêtre 3x1.5 et génère l'action devis", () => {
    const prompt = "bardage HPL ITE 2 double façade 5x8 fenêtre 3x1.5";
    const pre = detecterEtCalculerPreChiffrage(prompt);
    expect(pre).not.toBeNull();
    expect(pre?.metier).toBe("bardage");
    expect(pre?.detailsBardage?.surfaceBruteM2).toBe(80);
    expect(pre?.detailsBardage?.surfaceOuverturesM2).toBe(4.5);
    expect(pre?.detailsBardage?.surfaceNetteM2).toBe(75.5);
    expect(pre?.detailsBardage?.nbCouchesIte).toBe(2);
    expect(pre?.detailsBardage?.surfaceIsolantACommanderM2).toBe(163.08);
    expect(pre?.detailsBardage?.bavetteLongueurM).toBe(3.06);
    expect(pre?.detailsBardage?.tableauLongueurM).toBe(1.5);
    expect(pre?.detailsBardage?.linteauLongueurM).toBe(3.04);
    expect(pre?.heuresPoseTotal).toBeGreaterThan(0);

    const rep = generateLocalAssistantResponse(prompt, MOCK_CONTEXT);
    expect(rep.tags).toContain("Pré-chiffrage Certifié");
    expect(rep.content).toContain("75.5");
    expect(rep.content).toContain("3,05 × 1,30 m");
    expect(rep.actions.some((a) => a.type === "create_devis")).toBe(true);

    const sysPrompt = buildSystemPromptContext(MOCK_CONTEXT, pre);
    expect(sysPrompt).toContain("Utilise EXCLUSIVEMENT les quantités");

    const preTerrasse = detecterEtCalculerPreChiffrage("terrasse mobile 8x4");
    expect(preTerrasse?.metier).toBe("terrasse");
    expect(preTerrasse?.surfaceOuLineaire).toBe(32);

    const preCloture = detecterEtCalculerPreChiffrage("clôture 25m avec portillon");
    expect(preCloture?.metier).toBe("cloture");
    expect(preCloture?.surfaceOuLineaire).toBe(25);
  });

  it("escalade vers le Calepineur 3D sur chantier complexe (maison complète, pignons, > 3 ouvertures, terrasse mobile)", () => {
    const promptComplexe =
      "bardage HPL maison complète 4 façades 10x3 avec 2 pignons et 5 fenêtres 1.2x1.2";
    const esc = detecterChantierComplexe(promptComplexe);
    expect(esc).not.toBeNull();
    expect(esc?.estComplexe).toBe(true);
    expect(esc?.metier).toBe("bardage");
    expect(esc?.href).toBe("/terrain/chantier");

    const rep = generateLocalAssistantResponse(promptComplexe, MOCK_CONTEXT);
    expect(rep.content).toContain("Chantier complexe détecté");
    expect(rep.content).toContain("Calepineur 3D");
    expect(rep.actions.some((a) => a.type === "open_calepineur_3d")).toBe(true);
    expect(rep.actions.some((a) => a.type === "create_devis")).toBe(true);

    const norm = normaliserRequeteMetier(promptComplexe);
    const sys = buildSystemPromptContext(MOCK_CONTEXT, null, norm, esc);
    expect(sys).toContain("DICTIONNAIRE MÉTIER BNA");
    expect(sys).toContain("ESCALADE CALEPINEUR 3D");

    const repMobile = generateLocalAssistantResponse("terrasse mobile 8x4", MOCK_CONTEXT);
    expect(repMobile.content).toContain("Chantier complexe détecté");
    expect(
      repMobile.actions.some(
        (a) => a.type === "open_calepineur_3d" && a.payload.href === "/terrain/terrasse"
      )
    ).toBe(true);
  });
});
