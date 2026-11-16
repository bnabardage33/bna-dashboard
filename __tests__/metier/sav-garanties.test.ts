// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  SINISTRES_PAR_METIER,
  calculerStatutGarantie,
  parserHeuresEstimees,
  resoudreTypeGarantieParSinistre,
} from "@/lib/savGaranties";

describe("Moteur SAV & Garanties Multi-Métiers — lib/savGaranties.ts", () => {
  it("fournit des sinistres dédiés pour Bardage, Terrasse & Mobile et Clôture", () => {
    expect(SINISTRES_PAR_METIER.bardage.some((s) => s.label.includes("Infiltration"))).toBe(true);
    expect(SINISTRES_PAR_METIER.terrasse.some((s) => s.label.includes("Motorisation"))).toBe(true);
    expect(SINISTRES_PAR_METIER.cloture.some((s) => s.label.includes("Portillon"))).toBe(true);

    expect(
      resoudreTypeGarantieParSinistre("terrasse", "Motorisation / Solaire / Fin de course")
    ).toBe("biennale_2ans");
    expect(
      resoudreTypeGarantieParSinistre("cloture", "Poteau descellé / muret")
    ).toBe("decennale_10ans");
    expect(
      resoudreTypeGarantieParSinistre("bardage", "Lame voilée / fissurée")
    ).toBe("gpa_1an");
  });

  it("force Hors Garantie + Facturable pour un client externe hors chantier BNA", () => {
    const res = calculerStatutGarantie({
      typeOrigine: "client_externe",
      typeGarantie: "decennale_10ans",
      dateReception: "2026-01-01",
      dateSinistre: "2026-02-01",
    });

    expect(res.sousGarantie).toBe(false);
    expect(res.typeGarantieEffectif).toBe("hors_garantie_externe");
    expect(res.facturable).toBe(true);
    expect(res.libelleStatut).toContain("Intervention externe");
  });

  it("calcule automatiquement GPA 1 an, Biennale 2 ans et Décennale 10 ans depuis la date du PV de réception", () => {
    // PV signé le 2024-01-10, sinistre le 2025-06-01 (~17 mois plus tard)
    const gpa = calculerStatutGarantie({
      typeOrigine: "chantier_bna",
      typeGarantie: "gpa_1an",
      dateReception: "2024-01-10",
      dateSinistre: "2025-06-01",
    });
    expect(gpa.sousGarantie).toBe(false);
    expect(gpa.facturable).toBe(true);
    expect(gpa.dateExpiration).toBe("2025-01-10");

    const biennale = calculerStatutGarantie({
      typeOrigine: "chantier_bna",
      typeGarantie: "biennale_2ans",
      dateReception: "2024-01-10",
      dateSinistre: "2025-06-01",
    });
    expect(biennale.sousGarantie).toBe(true);
    expect(biennale.facturable).toBe(false);
    expect(biennale.dateExpiration).toBe("2026-01-10");

    const decennale = calculerStatutGarantie({
      typeOrigine: "chantier_bna",
      typeGarantie: "decennale_10ans",
      dateReception: "2024-01-10",
      dateSinistre: "2025-06-01",
    });
    expect(decennale.sousGarantie).toBe(true);
    expect(decennale.dateExpiration).toBe("2034-01-10");
  });

  it("parse correctement les durées texte en heures décimales pour le devis d'intervention", () => {
    expect(parserHeuresEstimees("1h30")).toBe(1.5);
    expect(parserHeuresEstimees("2h")).toBe(2);
    expect(parserHeuresEstimees("45min")).toBe(0.75);
    expect(parserHeuresEstimees("")).toBe(1);
  });
});
