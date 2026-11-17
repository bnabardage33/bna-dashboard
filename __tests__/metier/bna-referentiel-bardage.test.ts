// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  BARDAGE_BOIS_DTU_41_2,
  BARDAGE_COMPOSITE_WPC,
  BARDAGE_FIBROCIMENT_EN_12467,
  BARDAGE_HPL_DTU_45_4,
  calculerParametresBardageNormatifs,
} from "@/lib/bnaReferentielBardage";
import {
  buildSystemPromptContext,
  generateLocalAssistantResponse,
  type BnaIaContext,
} from "@/lib/bnaIaService";
import { normaliserRequeteMetier } from "@/lib/bnaDictionnaireMetier";

const MOCK_CTX: BnaIaContext = {
  userName: "Gaël",
  currentDateIso: "2026-11-17",
  chantiers: [],
  commandes: [],
  devis: [],
  factures: [],
  pvs: [],
  ticketsSav: [],
};

describe("Référentiel Normatif Bardage Multi-Familles (DTU 41.2, DTU 45.4, EN 12467, WPC)", () => {
  it("couvre les 4 familles avec leurs normes exactes", () => {
    expect(BARDAGE_BOIS_DTU_41_2.normesReference).toContain("NF DTU 41.2");
    expect(BARDAGE_HPL_DTU_45_4.normesReference).toContain("NF DTU 45.4");
    expect(BARDAGE_HPL_DTU_45_4.normesReference).toContain("3799_V2");
    expect(BARDAGE_FIBROCIMENT_EN_12467.normesReference).toContain("NF EN 12467");
    expect(BARDAGE_COMPOSITE_WPC.normesReference).toContain("Exclu NF DTU 41.2");
  });

  it("répond localement à 0 ms pour HPL (Trespa/Fundermax PF Ø 5,0 mm / PC Ø 8,0 mm, EPDM 70/100 mm, joints 8-10 mm)", () => {
    const rep = generateLocalAssistantResponse(
      "Quels sont les perçages PF/PC et formats Trespa Meteon ou Fundermax en HPL ?",
      MOCK_CTX
    );
    expect(rep.tags).toContain("NF DTU 45.4");
    expect(rep.tags).toContain("CSTB 3799_V2");
    expect(rep.content).toContain("Ø 5,0 mm");
    expect(rep.content).toContain("Ø 8,0 mm");
    expect(rep.content).toContain("3050×1530");
    expect(rep.content).toContain("2800×1300");
    expect(rep.content).toContain("70 mm");
    expect(rep.content).toContain("100 mm");
    expect(rep.content).toContain("8 à 10 mm");
  });

  it("répond localement à 0 ms pour Fibrociment Equitone (PC Ø 11,0 mm manchon) et Cedral Lap (recouvrement >= 30 mm, pureau 160 mm)", () => {
    const rep = generateLocalAssistantResponse(
      "Quelles sont les règles Equitone Tectiva et Cedral Lap / Click ?",
      MOCK_CTX
    );
    expect(rep.tags).toContain("NF EN 12467");
    expect(rep.content).toContain("Ø 11,0 mm");
    expect(rep.content).toContain("manchon");
    expect(rep.content).toContain("190×3600×10 mm");
    expect(rep.content).toContain(">= 30 mm");
    expect(rep.content).toContain("160 mm");
    expect(rep.content).toContain("Cedral Click");
  });

  it("répond localement à 0 ms pour Bardage Composite WPC (point fixe central, trous oblongs, double liteau, jeu 5-8 mm)", () => {
    const rep = generateLocalAssistantResponse(
      "Comment poser un bardage composite Fiberdeck WEO ou Silvadec ?",
      MOCK_CTX
    );
    expect(rep.tags).toContain("Composite WPC");
    expect(rep.content).toContain("Point Fixe obligatoire au milieu");
    expect(rep.content).toContain("trous oblongs");
    expect(rep.content).toContain("Double liteau");
    expect(rep.content).toContain("5 à 8 mm");
  });

  it("détecte Bois massif pose verticale double tasseautage et littoral <= 3 km / Red Cedar -> Inox A4", () => {
    const params = calculerParametresBardageNormatifs(
      "Bardage bois Red Cedar pose verticale sur le Bassin d'Arcachon à 2 km"
    );
    expect(params.estLittoralOuTannique).toBe(true);
    expect(params.visserieInox).toBe("A4");
    expect(params.estPoseVerticale).toBe(true);

    const rep = generateLocalAssistantResponse(
      "Règles bardage bois Red Cedar pose verticale littoral Arcachon",
      MOCK_CTX
    );
    expect(rep.tags).toContain("NF DTU 41.2");
    expect(rep.tags).toContain("Inox A4");
    expect(rep.content).toContain("double tasseautage croisé");
    expect(rep.content).toContain("délardés >= 15°");
    expect(rep.content).toContain(">= 150 mm");
    expect(rep.content).toContain(">= 200 mm");
    expect(rep.content).toContain("Inox A4 obligatoire");

    const norm = normaliserRequeteMetier("bardage Equitone ou Trespa");
    const sys = buildSystemPromptContext(MOCK_CTX, null, norm);
    expect(sys).toContain("RÉFÉRENTIEL NORMATIF BARDAGE MULTI-FAMILLES");
  });
});
