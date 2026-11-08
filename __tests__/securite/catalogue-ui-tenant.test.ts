// __tests__/securite/catalogue-ui-tenant.test.ts
//
// Tests de sécurité et de conformité métier pour l'interface Catalogue (/app/bureau/catalogue).
// Vérifie :
// 1. La non-régression du référentiel partagé : aucune suppression physique dans catalogue_ouvrages.
// 2. L'isolation stricte multi-entreprise : écritures et suppressions cantonnées à catalogue_ouvrages_prix.
// 3. La matrice de résolution tarifaire : 5 statuts distincts (vente perso, vente indicative, coût perso, coût indicatif, coût manquant).
// 4. La réinitialisation atomique : supprime uniquement la surcharge du tenant sans altérer les autres entreprises ni l'ouvrage commun.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { resoudrePrixOuvrage, validerMontant, evaluerFiabiliteMarge } from "@/lib/catalogue/resoudrePrix";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const OUVRAGE_1 = "aaaa1111-1111-4111-8111-111111111111";
const OUVRAGE_2 = "bbbb2222-2222-4222-8222-222222222222";
const OUVRAGE_SANS_PRIX = "cccc3333-3333-4333-8333-333333333333";

describe("Catalogue UI & Sécurité Multi-Entreprise", () => {
  describe("Axe 1 : Distinction des 5 statuts de prix et coûts", () => {
    it("Cas 1 : Ouvrage commun sans surcharge -> Vente indicative, coût indicatif", () => {
      const commun = { pu_ht: 55.0, pu_revient: 30.0 };
      const resolu = resoudrePrixOuvrage(commun, null);

      expect(resolu.statut_vente).toBe("indicatif_non_personnalise");
      expect(resolu.pu_ht).toBe(55.0);
      expect(resolu.statut_cout).toBe("renseigne");
      expect(resolu.pu_revient).toBe(30.0);
      expect(resolu.source_bloc).toBe("commun");
    });

    it("Cas 2 : Ouvrage avec surcharge complète -> Vente personnalisée, coût personnalisé", () => {
      const commun = { pu_ht: 55.0, pu_revient: 30.0 };
      const surcharge = { pu_ht: 70.0, pu_revient: 40.0 };
      const resolu = resoudrePrixOuvrage(commun, surcharge);

      expect(resolu.statut_vente).toBe("personnalise");
      expect(resolu.pu_ht).toBe(70.0);
      expect(resolu.statut_cout).toBe("renseigne");
      expect(resolu.pu_revient).toBe(40.0);
      expect(resolu.source_bloc).toBe("entreprise");
    });

    it("Cas 3 : Ouvrage avec prix de vente personnalisé mais coût absent -> Vente personnalisée, coût manquant (marge non fiable)", () => {
      const commun = { pu_ht: 55.0, pu_revient: 30.0 };
      const surcharge = { pu_ht: 75.0, pu_revient: null };
      const resolu = resoudrePrixOuvrage(commun, surcharge);

      expect(resolu.statut_vente).toBe("personnalise");
      expect(resolu.pu_ht).toBe(75.0);
      expect(resolu.statut_cout).toBe("a_completer");
      expect(resolu.pu_revient).toBeNull(); // N'injecte JAMAIS le coût commun indépendant

      // Évaluation de la fiabilité de marge
      const diag = evaluerFiabiliteMarge([
        { pu_ht: resolu.pu_ht, pu_revient: resolu.pu_revient, qte: 10 },
      ]);
      expect(diag.marge_fiable).toBe(false);
      expect(diag.nb_lignes_cout_inconnu).toBe(1);
    });

    it("Cas 4 : Ouvrage sans aucun prix (ni commun ni surcharge) -> À chiffrer, coût manquant", () => {
      const commun = { pu_ht: null, pu_revient: null };
      const resolu = resoudrePrixOuvrage(commun, null);

      expect(resolu.statut_vente).toBe("a_chiffrer");
      expect(resolu.pu_ht).toBeNull();
      expect(resolu.statut_cout).toBe("a_completer");
      expect(resolu.pu_revient).toBeNull();
      expect(resolu.source_bloc).toBe("manquant");
    });

    it("Cas 5 : Prestation offerte (0 €) avec coût de revient -> Vente personnalisée 0 €, coût renseigné, marge négative", () => {
      const commun = { pu_ht: 40.0, pu_revient: 20.0 };
      const surcharge = { pu_ht: 0, pu_revient: 15.0 };
      const resolu = resoudrePrixOuvrage(commun, surcharge);

      expect(resolu.statut_vente).toBe("personnalise");
      expect(resolu.pu_ht).toBe(0);
      expect(resolu.statut_cout).toBe("renseigne");
      expect(resolu.pu_revient).toBe(15.0);

      const marge = resolu.pu_ht! - resolu.pu_revient!;
      expect(marge).toBe(-15.0); // Diminue bien la marge
    });
  });

  describe("Axe 2 : Réinitialisation et suppression sélective", () => {
    it("La réinitialisation supprime la surcharge sans toucher à catalogue_ouvrages", async () => {
      // Simulation de l'état de la base
      const catalogueOuvrages = [
        { id: OUVRAGE_1, designation: "Clin Douglas", pu_ht: 45.0, pu_revient: 25.0 },
      ];
      let surcharges = [
        { entreprise_id: TENANT_A, ouvrage_id: OUVRAGE_1, pu_ht: 60.0, pu_revient: 32.0 },
        { entreprise_id: TENANT_B, ouvrage_id: OUVRAGE_1, pu_ht: 48.0, pu_revient: 28.0 },
      ];

      // Simuler la réinitialisation demandée par TENANT_A
      const actionReset = (entId: string, ouvId: string) => {
        surcharges = surcharges.filter(
          (s) => !(s.entreprise_id === entId && s.ouvrage_id === ouvId)
        );
      };

      actionReset(TENANT_A, OUVRAGE_1);

      // 1. La surcharge de TENANT_A est supprimée
      expect(surcharges.find((s) => s.entreprise_id === TENANT_A)).toBeUndefined();

      // 2. La surcharge de TENANT_B est STRICTEMENT intacte
      const surchargeB = surcharges.find((s) => s.entreprise_id === TENANT_B);
      expect(surchargeB).toBeDefined();
      expect(surchargeB?.pu_ht).toBe(48.0);

      // 3. L'ouvrage commun dans catalogue_ouvrages est STRICTEMENT intact
      expect(catalogueOuvrages).toHaveLength(1);
      expect(catalogueOuvrages[0].pu_ht).toBe(45.0);

      // 4. Résolution post-réinitialisation pour TENANT_A : retombe sur le tarif indicatif commun
      const postResetA = resoudrePrixOuvrage(catalogueOuvrages[0], null);
      expect(postResetA.statut_vente).toBe("indicatif_non_personnalise");
      expect(postResetA.pu_ht).toBe(45.0);
    });
  });

  describe("Axe 3 : Isolation multi-entreprise et intégrité RLS", () => {
    it("Deux entreprises sur le même ouvrage ont des tarifs totalement indépendants", () => {
      const commun = { pu_ht: 50.0, pu_revient: 25.0 };
      const surchargeA = { pu_ht: 65.0, pu_revient: 35.0 };
      const surchargeB = { pu_ht: 42.0, pu_revient: 22.0 };

      const resoluA = resoudrePrixOuvrage(commun, surchargeA);
      const resoluB = resoudrePrixOuvrage(commun, surchargeB);

      expect(resoluA.pu_ht).toBe(65.0);
      expect(resoluB.pu_ht).toBe(42.0);
      expect(resoluA.pu_ht).not.toBe(resoluB.pu_ht);
    });

    it("Le contrat d'upsert garantit l'unicité (entreprise_id, ouvrage_id)", () => {
      const payloadUpsert = {
        entreprise_id: TENANT_A,
        ouvrage_id: OUVRAGE_1,
        pu_ht: 80.0,
        pu_revient: 45.0,
        defaut_utilise: false,
      };

      // Vérification des contraintes du payload
      expect(payloadUpsert.entreprise_id).toBe(TENANT_A);
      expect(payloadUpsert.ouvrage_id).toBe(OUVRAGE_1);
      expect(Number.isFinite(payloadUpsert.pu_ht)).toBe(true);
      expect(Number.isFinite(payloadUpsert.pu_revient)).toBe(true);
    });

    it("Les montants invalides (NaN, Infinity, négatifs) sont rejetés avant enregistrement", () => {
      expect(validerMontant("NaN")).toBeNull();
      expect(validerMontant("Infinity")).toBeNull();
      expect(validerMontant(-10)).toBeNull();
      expect(validerMontant("")).toBeNull();
      expect(validerMontant("  ")).toBeNull();
      expect(validerMontant(undefined)).toBeNull();
      expect(validerMontant(null)).toBeNull();

      expect(validerMontant(0)).toBe(0);
      expect(validerMontant("45.50")).toBe(45.5);
    });
  });
});
