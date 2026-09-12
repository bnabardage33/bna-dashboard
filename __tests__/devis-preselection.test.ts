// Tests ÉTAPE 12 — présélection « Générer un devis » depuis le chantier.
//
// Vérifie la transmission de l'ID (sans transformation), la lecture du query
// param, la présélection client + chantier, l'ouverture de la modale, et le
// comportement strictement inchangé sans chantier_id ou avec un ID inexistant.

import { describe, it, expect } from "vitest";
import {
  hrefDevisChantier,
  chantierIdDepuisRecherche,
  preselectSiValide,
  planPreselectionDevis,
} from "@/lib/devisPreselection";

const CHANTIER = { id: "chant-abc", client_id: "client-1" };

describe("hrefDevisChantier", () => {
  it("transmet l'ID source exact dans le query string", () => {
    expect(hrefDevisChantier("chant-abc")).toBe(
      "/bureau/devis-factures?chantier_id=chant-abc",
    );
  });

  it("encode l'ID sans le transformer (aucune déduction ni recherche par nom)", () => {
    expect(hrefDevisChantier("chant id/à espaces")).toBe(
      "/bureau/devis-factures?chantier_id=chant%20id%2F%C3%A0%20espaces",
    );
  });
});

describe("chantierIdDepuisRecherche", () => {
  const params = (v: string | null) => ({ get: (_: string) => v });

  it("absente (null) → aucun chantier à présélectionner", () => {
    expect(chantierIdDepuisRecherche(params(null))).toBeNull();
  });

  it("présente → retourne l'ID une fois trimé", () => {
    expect(chantierIdDepuisRecherche(params("  chant-abc  "))).toBe("chant-abc");
  });

  it("vide → considérée comme absente (comportement inchangé)", () => {
    expect(chantierIdDepuisRecherche(params(""))).toBeNull();
    expect(chantierIdDepuisRecherche(params("   "))).toBeNull();
  });
});

describe("preselectSiValide", () => {
  it("chantier valide avec client → présélection client + chantier exacts", () => {
    expect(preselectSiValide("chant-abc", CHANTIER)).toEqual({
      chantierId: "chant-abc",
      clientId: "client-1",
    });
  });

  it("ID inexistant (chantier null) → aucune sélection forcée", () => {
    expect(preselectSiValide("chant-inconnu", null)).toBeNull();
  });

  it("ID demandé ≠ ID retourné → aucune présélection (pas de confusion entre chantiers)", () => {
    expect(preselectSiValide("chant-autre", CHANTIER)).toBeNull();
  });

  it("pas de chantier_id demandé → aucune présélection", () => {
    expect(preselectSiValide(null, CHANTIER)).toBeNull();
  });

  it("chantier sans client → aucune sélection forcée", () => {
    expect(preselectSiValide("chant-abc", { id: "chant-abc", client_id: null })).toBeNull();
  });
});

describe("planPreselectionDevis", () => {
  it("valide → ouvre la modale avec client + chantier", () => {
    expect(planPreselectionDevis("chant-abc", false, CHANTIER)).toEqual({
      chantierId: "chant-abc",
      clientId: "client-1",
      ouvrirModale: true,
    });
  });

  it("sélection manuelle déjà effectuée → aucune écrasement, modale non ouverte", () => {
    expect(planPreselectionDevis("chant-abc", true, CHANTIER)).toBeNull();
  });

  it("sans chantier_id → plan null (comportement actuel conservé)", () => {
    expect(planPreselectionDevis(null, false, CHANTIER)).toBeNull();
  });
});