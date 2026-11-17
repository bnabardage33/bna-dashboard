// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DTU_51_4_BOIS_MASSIF,
  DTU_51_4_FRONTIERES,
  REFERENTIEL_FABRICANTS_COMPOSITE,
  calculerParametresTerrasseNormatifs,
} from "@/lib/bnaReferentielTerrasse";
import { detecterEtCalculerPreChiffrage } from "@/lib/bnaIaPreChiffrage";
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

describe("Référentiel Normatif Terrasse (NF DTU 51.4 & Composite)", () => {
  it("contient les frontières NF DTU 51.4, Tableau 8/9 et les 4 fabricants composites", () => {
    expect(DTU_51_4_FRONTIERES.hauteurMaxFiniM).toBe(1.0);
    expect(DTU_51_4_FRONTIERES.porteeLambourdeMax3AppuisMm).toBe(700);
    expect(DTU_51_4_FRONTIERES.porteeLambourdeMax2AppuisMm).toBe(600);
    expect(DTU_51_4_FRONTIERES.hauteurMaxPlotsPolymeresMm).toBe(300);
    expect(DTU_51_4_BOIS_MASSIF.calesDePoseTableau8.map((c) => c.jeuMm)).toEqual([
      7, 5, 3,
    ]);
    expect(Object.keys(REFERENTIEL_FABRICANTS_COMPOSITE)).toEqual([
      "silvadec",
      "fiberdeck",
      "neowood",
      "ocewood",
    ]);
  });

  it("applique l'entraxe 300 mm sur pré-chiffrage « terrasse composite Fiberdeck 30 m² en diagonale »", () => {
    const pre = detecterEtCalculerPreChiffrage(
      "terrasse composite Fiberdeck 30 m² en diagonale"
    );
    expect(pre).not.toBeNull();
    expect(pre?.metier).toBe("terrasse");
    expect(pre?.surfaceOuLineaire).toBe(30);
    expect(pre?.detailsTerrasse?.fabricant).toBe("Fiberdeck");
    expect(pre?.detailsTerrasse?.entraxeLambourdesMm).toBe(300);
    expect(pre?.syntheseTexte).toContain("300 mm");
    expect(pre?.syntheseTexte).toContain("Hors NF DTU 51.4");
  });

  it("répond localement à 0 ms pour Silvadec (400 mm / 200 mm à 45°, lambourde composite interdite)", () => {
    const params45 = calculerParametresTerrasseNormatifs(
      "terrasse Silvadec pose à 45°"
    );
    expect(params45.entraxeLambourdesMm).toBe(200);

    const rep = generateLocalAssistantResponse(
      "Quelles sont les règles de pose Silvadec ?",
      MOCK_CTX
    );
    expect(rep.tags).toContain("Silvadec");
    expect(rep.content).toContain("200 mm");
    expect(rep.content).toContain("80 cm");
    expect(rep.content).toContain("INTERDITE");
  });

  it("détecte Ipé bord de mer -> Inox A4 obligatoire (Tableau 9 DTU 51.4)", () => {
    const rep = generateLocalAssistantResponse(
      "Quelle visserie pour une terrasse Ipé en bord de mer ?",
      MOCK_CTX
    );
    expect(rep.tags).toContain("NF DTU 51.4");
    expect(rep.content).toContain("Inox A4 OBLIGATOIRE");
    expect(rep.content).toContain("Tableau 8");
    expect(rep.content).toContain("Tableau 9");

    const preIpe = detecterEtCalculerPreChiffrage("terrasse Ipé bord de mer 25 m²");
    expect(preIpe?.detailsTerrasse?.visserieInox).toBe("A4");
  });

  it("alerte et bascule en NF DTU 31.1 lorsque les plots dépassent 300 mm", () => {
    const rep = generateLocalAssistantResponse(
      "Puis-je poser une terrasse bois sur plots de 350 mm ?",
      MOCK_CTX
    );
    expect(rep.tags).toContain("Plots > 300 mm");
    expect(rep.tags).toContain("NF DTU 31.1");
    expect(rep.content).toContain("300 mm");
    expect(rep.content).toContain("NF DTU 31.1");
  });

  it("injecte automatiquement le référentiel Neowood / Océwood dans buildSystemPromptContext", () => {
    const msg = "Conseils pose Océwood par 4°C ou Neowood Expression en public";
    const norm = normaliserRequeteMetier(msg);
    const sys = buildSystemPromptContext(MOCK_CTX, null, norm);
    expect(sys).toContain("RÉFÉRENTIEL NORMATIF TERRASSE");
    expect(sys).toContain("Océwood");
  });
});
