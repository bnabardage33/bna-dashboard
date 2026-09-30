import { describe, it, expect } from "vitest";
import { validerFraisDeplacement } from "../../lib/deplacement/validation";
import { FraisDeplacementInsert } from "../../lib/deplacement/types";

describe("Validation de FraisDeplacement", () => {
  const validPayload: Partial<FraisDeplacementInsert> = {
    entreprise_id: "123",
    chantier_id: "456",
    date: "2026-09-30",
    distance_aller_km: 10,
    distance_retour_km: 10,
    tarif_km: 1,
    montant_ht: 20,
    statut: "prevu"
  };

  it("accepte un payload valide", () => {
    const res = validerFraisDeplacement(validPayload);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.chantier_id).toBe("456");
    }
  });

  it("rejette une distance négative", () => {
    const payload = { ...validPayload, distance_aller_km: -5 };
    const res = validerFraisDeplacement(payload);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.erreur).toContain("positif ou nul");
    }
  });

  it("rejette un tarif nul ou négatif", () => {
    let payload = { ...validPayload, tarif_km: 0 };
    let res = validerFraisDeplacement(payload);
    expect(res.ok).toBe(false);
    
    payload = { ...validPayload, tarif_km: -1.5 };
    res = validerFraisDeplacement(payload);
    expect(res.ok).toBe(false);
  });

  it("rejette un statut invalide", () => {
    const payload = { ...validPayload, statut: "inconnu" as any };
    const res = validerFraisDeplacement(payload);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.erreur).toContain("Statut invalide");
    }
  });

  it("accepte une distance nulle", () => {
    const payload = { ...validPayload, distance_aller_km: 0, distance_retour_km: 0 };
    const res = validerFraisDeplacement(payload);
    expect(res.ok).toBe(true);
  });
});
