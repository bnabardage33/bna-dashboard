// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  buildSystemPromptContext,
  calculerAlertesProactives,
  calculerChiffrageDeplacementBna,
  calculerSyntheseFinanciereBna,
  detectBnaIaActions,
  detecterChantierComplexe,
  estQuestionConseilOuSuivi,
  evaluerAlertesDtuMeteoJour,
  extraireDestinationLibre,
  extraireVilleMeteoLibre,
  findMentionedChantier,
  formaterDateFrEuropeParis,
  formaterVigilanceMeteoFrance,
  generateLocalAssistantResponse,
  parseNaturalDate,
  urlHubPourChantier,
  type BnaIaContext,
} from "@/lib/bnaIaService";
import { detecterEtCalculerPreChiffrage, segmenterRequeteParLots } from "@/lib/bnaIaPreChiffrage";
import { adresseVersDepartements } from "@/lib/meteoDepartements";
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

  it("cumule façades + pignons + 2 jeux d'ouvertures (Red Cedar claire-voie Arcachon ~54.11 m²) et forme en L Terrasse + alerte plots 35cm", () => {
    const promptBardage =
      "bardage bois Red Cedar claire-voie Arcachon 1 façade 9m x 3m 2 fenêtres 1.20m x 1.10m 1 pignon 7m faîtage 5.50m égouts 3m";
    const preBardage = detecterEtCalculerPreChiffrage(promptBardage);
    expect(preBardage).not.toBeNull();
    expect(preBardage?.metier).toBe("bardage");
    expect(preBardage?.detailsBardage?.surfaceBruteM2).toBe(56.75);
    expect(preBardage?.detailsBardage?.surfaceOuverturesM2).toBe(2.64);
    expect(preBardage?.detailsBardage?.surfaceNetteM2).toBe(54.11);
    expect(preBardage?.detailsBardage?.nbOuvertures).toBe(2);
    expect(preBardage?.detailsBardage?.nbPignons).toBe(1);
    expect(preBardage?.detailsBardage?.bavetteLongueurM).toBe(1.26);
    expect(preBardage?.detailsBardage?.tableauLongueurM).toBe(1.1);
    expect(preBardage?.detailsBardage?.linteauLongueurM).toBe(1.24);
    expect(preBardage?.syntheseTexte).toContain("UV 5000h noir");
    expect(preBardage?.syntheseTexte).toContain("Inox A4");

    const promptTerrasse =
      "terrasse bois Ipé 27mm plots polymères 35cm forme en L 6m x 4m + retour 3m x 2.5m terrasse mobile filaire 5m x 3m";
    const preTerrasse = detecterEtCalculerPreChiffrage(promptTerrasse);
    expect(preTerrasse).not.toBeNull();
    expect(preTerrasse?.metier).toBe("terrasse");
    expect(preTerrasse?.surfaceOuLineaire).toBe(31.5);
    expect(preTerrasse?.syntheseTexte).toContain("NON CONFORME NF DTU 51.4");
    expect(preTerrasse?.syntheseTexte).toContain("300 mm");
    expect(preTerrasse?.syntheseTexte).toContain("Ø 6 mm");
  });

  it("traite un projet Multi-Lots complet (Maison à étage + garage + 2 terrasses + clôture portail & 2 portillons)", () => {
    const promptMulti =
      "maison complète à étage 4 côté avec les fenêtres porte garage attenant avec porte de garage + montage d'une terrasse simple et une terrasse avec piscine et avec clôture avec portail et 2 portillon";

    const pre = detecterEtCalculerPreChiffrage(promptMulti);
    expect(pre).not.toBeNull();
    expect(pre?.estMultiLots).toBe(true);
    expect(pre?.lots?.length).toBe(3);
    expect(pre?.lots?.map((l) => l.metier)).toEqual([
      "bardage",
      "terrasse",
      "cloture",
    ]);

    // Lot 1 : Bardage R+1 + garage attenant + porte garage + porte entrée + fenêtres + vigilance échafaudage
    expect(pre?.detailsBardage?.surfaceBruteM2).toBeGreaterThan(200);
    expect(pre?.syntheseTexte).toContain("échafaudage R+1");
    expect(pre?.syntheseTexte).toContain("Garage attenant");

    // Lot 2 : Terrasse simple (24 m²) + Terrasse piscine (32 m²) = 56 m²
    const lotTerrasse = pre?.lots?.find((l) => l.metier === "terrasse");
    expect(lotTerrasse?.surfaceOuLineaire).toBe(56);
    expect(pre?.syntheseTexte).toContain("Terrasse simple");
    expect(pre?.syntheseTexte).toContain("Terrasse piscine");

    // Lot 3 : Clôture avec portail (déduction 3,50 m + 2 piliers) et 2 portillons
    expect(pre?.detailsCloture?.presencePortail).toBe(true);
    expect(pre?.detailsCloture?.nbPortillons).toBe(2);
    expect(pre?.detailsCloture?.deductionPortailM).toBe(3.5);
    expect(pre?.syntheseTexte).toContain("2 portillon(s)");
    expect(pre?.syntheseTexte).toContain("Portail 3,50 m");

    // Consolidation globale + Devis global + Escalade Calepineurs 3D
    expect(pre?.syntheseTexte).toContain("TOTAL GÉNÉRAL CONSOLIDÉ HT");
    const rep = generateLocalAssistantResponse(promptMulti, MOCK_CONTEXT);
    expect(
      rep.actions.some(
        (a) =>
          a.type === "create_devis" &&
          a.title === "Créer le devis global multi-lots"
      )
    ).toBe(true);
    const calepineurs = rep.actions.filter(
      (a) => a.type === "open_calepineur_3d"
    );
    expect(calepineurs.length).toBe(3);
    expect(calepineurs.map((a) => a.payload.href)).toEqual([
      "/terrain/chantier",
      "/terrain/terrasse",
      "/terrain/cloture",
    ]);
  });

  it("segmente strictement les lots 1) 2) 3), exclut les ouvertures/portes de garage des façades et priorise 48 ml en Clôture", () => {
    const promptSegmente =
      "1) Bardage HPL maison 10m x 5m avec porte de garage 2.40m x 2.15m et 2 fenêtres 1.20m x 1.10m\n" +
      "2) Terrasse composite 6m x 4m\n" +
      "3) Clôture alu 48 ml hauteur 1.80 m avec portillon";

    const segs = segmenterRequeteParLots(promptSegmente);
    expect(segs.bardage).not.toContain("6m x 4m");
    expect(segs.bardage).not.toContain("48 ml");
    expect(segs.terrasse).toContain("6m x 4m");
    expect(segs.cloture).toContain("48 ml");

    const pre = detecterEtCalculerPreChiffrage(promptSegmente);
    expect(pre).not.toBeNull();
    expect(pre?.estMultiLots).toBe(true);
    // Bardage brute = 10*5 = 50 m² (ni 6x4=24 ni 2.40x2.15=5.16 ajoutés en façade)
    expect(pre?.detailsBardage?.surfaceBruteM2).toBe(50);
    // Ouvertures = 2.40*2.15 (5.16) + 2*(1.20*1.10) (2.64) = 7.80 m² -> nette = 42.2 m²
    expect(pre?.detailsBardage?.surfaceOuverturesM2).toBe(7.8);
    expect(pre?.detailsBardage?.surfaceNetteM2).toBe(42.2);
    expect(pre?.detailsBardage?.nbOuvertures).toBe(3);

    const lotTerrasse = pre?.lots?.find((l) => l.metier === "terrasse");
    expect(lotTerrasse?.surfaceOuLineaire).toBe(24);

    const lotCloture = pre?.lots?.find((l) => l.metier === "cloture");
    expect(lotCloture?.surfaceOuLineaire).toBe(48);
  });

  it("conserve la mémoire persistante sur les questions de suivi (jamais de message d'accueil générique)", () => {
    const pre = detecterEtCalculerPreChiffrage(
      "1) Bardage HPL 10m x 5m\n2) Terrasse 6m x 4m"
    );
    expect(pre).not.toBeNull();

    const sysPrompt = buildSystemPromptContext(
      MOCK_CONTEXT,
      null,
      null,
      null,
      pre?.syntheseTexte
    );
    expect(sysPrompt).toContain("DERNIER PRÉ-CHIFFRAGE CALCULÉ DANS CETTE CONVERSATION");
    expect(sysPrompt).toContain("Lot 1");

    const suivi = generateLocalAssistantResponse(
      "détaille plus le Lot 1",
      MOCK_CONTEXT,
      {
        history: [
          { role: "user", content: "1) Bardage HPL 10m x 5m 2) Terrasse 6m x 4m" },
          { role: "assistant", content: pre?.syntheseTexte || "" },
        ],
        dernierPreChiffrage: pre?.syntheseTexte,
      }
    );
    expect(suivi.content).not.toContain("Je suis prêt à vous aider sur vos");
    expect(suivi.content).toContain("Lot 1");
    expect(suivi.tags).toContain("Suivi Conversationnel");
  });

  it("formate la date Europe/Paris et croise les prévisions météo 3 jours avec les alertes DTU (0 ms)", () => {
    const dt = formaterDateFrEuropeParis(new Date("2026-11-17T15:30:00Z"));
    expect(dt.dateIso).toBe("2026-11-17");
    expect(dt.dateFr).toContain("Mardi 17 novembre 2026");

    const alertes = evaluerAlertesDtuMeteoJour({
      tempMinC: 3,
      tempMaxC: 9,
      rafalesKmh: 58,
      pluieMm: 12,
      conditions: "Pluie forte",
    });
    expect(alertes.some((a) => a.includes("Océwood / Neowood"))).toBe(true);
    expect(alertes.some((a) => a.includes("50 km/h"))).toBe(true);
    expect(alertes.some((a) => a.includes("Pluie >= 5 mm"))).toBe(true);

    const ctxMeteo: BnaIaContext = {
      ...MOCK_CONTEXT,
      currentDateFr: dt.dateFr,
      currentTimeParis: dt.heureParis,
      chantiers: [
        {
          ...MOCK_CONTEXT.chantiers[0],
          previsionsMeteo3J: [
            {
              date: "2026-11-17",
              tempMinC: 3,
              tempMaxC: 10,
              rafalesKmh: 55,
              pluieMm: 8.5,
              conditions: "Averses",
              alertesDtu: alertes,
            },
          ],
        },
      ],
    };

    const sys = buildSystemPromptContext(ctxMeteo);
    expect(sys).toContain("Mardi 17 novembre 2026");
    expect(sys).toContain("rafales 55 km/h");

    const repMeteo = generateLocalAssistantResponse("Météo & Pose DTU", ctxMeteo);
    expect(repMeteo.content).toContain("Mardi 17 novembre 2026");
    expect(repMeteo.content).toContain("3°C / 10°C");
    expect(repMeteo.content).toContain("55 km/h");
    expect(repMeteo.content).toContain("Océwood / Neowood");
    expect(repMeteo.tags).toContain("Pose DTU");
  });

  it("extrait une ville libre (ex: Madrid) pour la météo en direct hors base et répond à 0 ms", () => {
    const promptMadrid =
      "j'ai un chantier à Madrid demain en bardage, est-ce que les conditions sont bonnes ?";
    expect(extraireVilleMeteoLibre(promptMadrid)).toBe("Madrid");
    expect(
      extraireVilleMeteoLibre("Vérifie la vigilance météo sur mes chantiers actifs.")
    ).toBeNull();

    const ctxMadrid: BnaIaContext = {
      ...MOCK_CONTEXT,
      chantiers: [],
      meteoVilleLibre: {
        ville: "Madrid",
        previsions: [
          {
            date: "2026-11-18",
            tempMinC: 7,
            tempMaxC: 16,
            rafalesKmh: 22,
            pluieMm: 0,
            conditions: "Ciel dégagé",
            alertesDtu: [],
          },
        ],
      },
    };

    const sys = buildSystemPromptContext(ctxMadrid);
    expect(sys).toContain("MÉTÉO EN DIRECT (Madrid — Open-Meteo 3 jours)");
    expect(sys).toContain("16°C");

    const rep = generateLocalAssistantResponse(promptMadrid, ctxMadrid);
    expect(rep.content).toContain("Madrid");
    expect(rep.content).toContain("7°C / 16°C");
    expect(rep.content).toContain("Conditions compatibles DTU");
  });

  it("calcule les frais de déplacement depuis Générac (33920) et les injecte dans la réponse + devis pré-rempli", () => {
    expect(extraireDestinationLibre("chantier à Arcachon bardage 5x8")).toBe("Arcachon");
    expect(extraireDestinationLibre("déplacement à Biarritz demain")).toBe("Biarritz");

    const dep = calculerChiffrageDeplacementBna({
      destination: "Arcachon",
      distanceAllerKm: 92,
      dureeTrajetAllerMin: 75,
      tarifKmHt: 1.0,
      nbJoursChantier: 2,
    });
    expect(dep.depart).toBe("Générac (33920)");
    expect(dep.distanceTotaleArKm).toBe(184);
    expect(dep.coutUnitaireArHt).toBe(184);
    expect(dep.coutTotalDeplacementHt).toBe(368);

    const ctxDep: BnaIaContext = {
      ...MOCK_CONTEXT,
      deplacementVilleLibre: dep,
    };
    const promptChantier = "bardage HPL 5x8 chantier à Arcachon";
    const sys = buildSystemPromptContext(ctxDep);
    expect(sys).toContain("Générac (33920)");
    expect(sys).toContain("184 km A/R");

    const rep = generateLocalAssistantResponse(promptChantier, ctxDep);
    expect(rep.content).toContain("Générac (33920) -> Arcachon");
    expect(rep.content).toContain("184 km A/R");
    expect(rep.content).toContain("1h15");

    const actionDevis = rep.actions.find((a) => a.type === "create_devis");
    expect(actionDevis).toBeDefined();
    expect(
      actionDevis?.payload.devisPrefill?.lignes.some((l) =>
        l.designation.includes("Frais de déplacement (Générac (33920) -> Arcachon)")
      )
    ).toBe(true);
  });

  it("couple la Vigilance officielle Météo-France (Jaune/Orange/Rouge) sur les destinations de France métropolitaine", () => {
    expect(adresseVersDepartements("Nord-Pas-de-Calais")).toEqual(["59", "62"]);
    expect(adresseVersDepartements("Pas-de-Calais")).toEqual(["62"]);
    expect(adresseVersDepartements("Nord")).toEqual(["59"]);
    expect(adresseVersDepartements("Gironde")).toEqual(["33"]);
    expect(adresseVersDepartements("Madrid")).toEqual([]);

    const promptNpdC = "météo chantier dans le Nord-Pas-de-Calais demain";
    expect(extraireVilleMeteoLibre(promptNpdC)).toBe("Nord-Pas-de-Calais");

    const vigTexte = formaterVigilanceMeteoFrance([
      {
        departement: "62",
        couleur: "orange",
        phenomenesActifs: [
          { nom: "Vent violent", couleur: "orange" },
          { nom: "Pluie-Inondation", couleur: "jaune" },
        ],
      },
    ]);
    expect(vigTexte).toContain("ALERTE VIGILANCE MÉTÉO-FRANCE Dépt. 62 (ORANGE)");
    expect(vigTexte).toContain("Vent violent (ORANGE)");

    const ctxVig: BnaIaContext = {
      ...MOCK_CONTEXT,
      meteoVilleLibre: {
        ville: "Nord-Pas-de-Calais",
        previsions: [
          {
            date: "2026-11-18",
            tempMinC: 6,
            tempMaxC: 11,
            rafalesKmh: 72,
            pluieMm: 14,
            conditions: "Pluie modérée",
            alertesDtu: ["Rafales >= 50 km/h : alerte manutention panneaux HPL grand format et échafaudages."],
          },
        ],
        vigilanceMf: [
          {
            departement: "62",
            couleur: "orange",
            phenomenesActifs: [{ nom: "Vent violent", couleur: "orange" }],
          },
        ],
      },
    };

    const sys = buildSystemPromptContext(ctxVig);
    expect(sys).toContain("ALERTE VIGILANCE MÉTÉO-FRANCE Dépt. 62 (ORANGE)");

    const rep = generateLocalAssistantResponse(promptNpdC, ctxVig);
    expect(rep.content).toContain("Nord-Pas-de-Calais");
    expect(rep.content).toContain("Vent violent (ORANGE)");
  });

  it("route les questions de conseil et suivi (« qu'es que tu me conseilles ») vers le Cloud LLM avec persona Conducteur de Travaux", () => {
    expect(estQuestionConseilOuSuivi("qu'es que tu me conseilles", false)).toBe(true);
    expect(estQuestionConseilOuSuivi("que me conseilles-tu ?", false)).toBe(true);
    expect(estQuestionConseilOuSuivi("vaut mieux repousser demain ?", false)).toBe(true);
    expect(estQuestionConseilOuSuivi("et pour les fixations ?", true)).toBe(true);

    const ctxMadrid: BnaIaContext = {
      ...MOCK_CONTEXT,
      meteoVilleLibre: {
        ville: "Madrid",
        previsions: [
          {
            date: "2026-11-18",
            tempMinC: 7,
            tempMaxC: 14,
            rafalesKmh: 59,
            pluieMm: 6.4,
            conditions: "Pluie modérée",
            alertesDtu: [
              "Rafales >= 50 km/h : alerte manutention panneaux HPL grand format et échafaudages.",
              "Pluie >= 5 mm : alerte traitement des coupes bois et collage/étanchéité.",
            ],
          },
        ],
      },
      deplacementVilleLibre: calculerChiffrageDeplacementBna({
        destination: "Madrid",
        distanceAllerKm: 738.8,
        dureeTrajetAllerMin: 440,
        tarifKmHt: 1.0,
        nbJoursChantier: 1,
      }),
    };

    const sys = buildSystemPromptContext(ctxMadrid);
    expect(sys).toContain("conducteur de travaux expérimenté");
    expect(sys).toContain("Maintenir ou Repousser");
    expect(sys).toContain("rafales 59 km/h");
    expect(sys).toContain("1477.6 km A/R");

    const fallback = generateLocalAssistantResponse("qu'es que tu me conseilles", ctxMadrid, {
      history: [{ role: "user", content: "chantier à Madrid demain en bardage" }],
    });
    expect(fallback.content).not.toContain("Reprise de votre conversation");
    expect(fallback.content).not.toContain("Dernier élément analysé");
    expect(fallback.content).toContain("Repousser");

    // Priorité absolue à Météo / Déplacement même si « bardage » est mentionné
    const promptComplet =
      "j'ai un chantier à Madrid à faire demain en bardage, est-ce que les conditions sont bonnes ou vaut mieux repousser et combien coûte le déplacement ?";
    const repComplet = generateLocalAssistantResponse(promptComplet, ctxMadrid);
    expect(repComplet.content).toContain("Madrid");
    expect(repComplet.content).toContain("1477.6 km A/R");
    expect(repComplet.content).toContain("Repousser");
    expect(repComplet.content).toContain("Bardage");
    expect(repComplet.tags).toContain("Météo");
  });

  it("extrait correctement les villes libres après à / sur / vers / pour sans avaler demain, pour ou les verbes d'action", () => {
    expect(extraireDestinationLibre("chantier à Madrid demain")).toBe("Madrid");
    expect(extraireDestinationLibre("chantier sur Madrid pour vendredi")).toBe("Madrid");
    expect(extraireDestinationLibre("déplacement vers Madrid")).toBe("Madrid");
    expect(extraireDestinationLibre("météo pour Madrid jusqu'à vendredi")).toBe("Madrid");
    expect(extraireDestinationLibre("météo pour demain à Madrid")).toBe("Madrid");
    expect(extraireDestinationLibre("Explique les points clés pour chiffrer une Terrasse Mobile")).toBeNull();
    expect(extraireDestinationLibre("Quels sont mes réserves PV à lever ?")).toBeNull();
  });
});
