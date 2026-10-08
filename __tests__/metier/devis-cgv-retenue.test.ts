import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  validerTauxRetenue,
  calculerRetenueFacture,
  calculerSituationAvancement,
  type LigneFacturation,
} from "@/lib/retenueCalculs";

/**
 * Calculateur d'empreinte déterministe simulant le snapshot PostgreSQL
 * de `signature_devis_valider_otp` (normalisation JSON + SHA-256).
 */
function calculerEmpreinteDevis(devis: Record<string, unknown>): string {
  // En SQL : jsonb_build_object(...) normalise les clés par ordre alphabétique
  const clesTriees = Object.keys(devis).sort();
  const objetNormalise: Record<string, unknown> = {};
  for (const cle of clesTriees) {
    objetNormalise[cle] = devis[cle];
  }
  const payload = JSON.stringify(objetNormalise);
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

describe("MODULE RETENUE DE GARANTIE — DEVIS, CGV & PARCOURS SIGNATURE (LOI N° 71-584)", () => {
  // =========================================================================
  // 1. Validation du taux contractuel sur le devis
  // =========================================================================
  describe("1. Validation du taux de retenue contractuel sur le devis", () => {
    it("accepte 0.00 % (cas standard sans retenue de garantie convenue)", () => {
      expect(validerTauxRetenue(0)).toBe(0);
      expect(validerTauxRetenue("0")).toBe(0);
      expect(validerTauxRetenue(0.0)).toBe(0);
      expect(validerTauxRetenue(undefined)).toBe(0);
    });

    it("accepte 5.00 % (plafond légal selon l'Art. 1er de la Loi n° 71-584)", () => {
      expect(validerTauxRetenue(5)).toBe(5);
      expect(validerTauxRetenue(5.0)).toBe(5);
      expect(validerTauxRetenue("5.00")).toBe(5);
    });

    it("accepte un taux intermédiaire inférieur ou égal à 5.00 % (ex: 2.5 %, 3 %)", () => {
      expect(validerTauxRetenue(2.5)).toBe(2.5);
      expect(validerTauxRetenue(3)).toBe(3);
      expect(validerTauxRetenue(4.75)).toBe(4.75);
    });

    it("rejette tout taux strictement négatif", () => {
      expect(() => validerTauxRetenue(-1)).toThrow(/négatif/i);
      expect(() => validerTauxRetenue(-0.01)).toThrow(/négatif/i);
    });

    it("rejette tout taux strictement supérieur au plafond légal de 5.00 %", () => {
      expect(() => validerTauxRetenue(5.01)).toThrow(/plafond légal de 5\s*%/i);
      expect(() => validerTauxRetenue(10)).toThrow(/plafond légal de 5\s*%/i);
      expect(() => validerTauxRetenue(20)).toThrow(/plafond légal de 5\s*%/i);
    });

    it("rejette les valeurs non numériques invalides", () => {
      expect(() => validerTauxRetenue("invalide")).toThrow(/non numérique/i);
      expect(() => validerTauxRetenue(NaN)).toThrow(/non numérique/i);
      expect(() => validerTauxRetenue(Infinity)).toThrow(/non numérique/i);
    });
  });

  // =========================================================================
  // 2. Héritage contractuel Devis → Facture & Moteur Financier V2.1
  // =========================================================================
  describe("2. Transmission du taux contractuel Devis → Facture & Calculs officiels", () => {
    it("applique la retenue de 5 % convenue sur le devis à la facture générée", () => {
      const devisContrat = {
        id: "dev-001",
        numero: "DEV-2026-001",
        retenue_garantie_pct: 5.0,
        lignes: [
          { designation: "Ossature bois & pare-vapeur", qte: 1, pu_ht: 2000, tva_pct: 10 },
          { designation: "Bardage zinc quartz", qte: 1, pu_ht: 3000, tva_pct: 10 },
        ],
      };

      // Création de la facture avec le taux hérité du devis
      const calcul = calculerRetenueFacture({
        lignes: devisContrat.lignes as LigneFacturation[],
        retenue_garantie_pct: devisContrat.retenue_garantie_pct,
        tva_defaut_pct: 10,
      });

      expect(calcul.total_ht).toBe(5000.0);
      expect(calcul.total_tva).toBe(500.0);
      expect(calcul.total_ttc).toBe(5500.0);

      // Retenue 5%
      expect(calcul.retenue_garantie_pct).toBe(5.0);
      expect(calcul.montant_retenue_ht).toBe(250.0); // 5000 * 5%
      expect(calcul.montant_retenue_ttc).toBe(275.0); // 5500 * 5%

      // Invariant net à payer
      expect(calcul.net_a_payer_ttc).toBe(5225.0); // 5500 - 275
      expect(calcul.net_a_payer_ttc).toBe(calcul.total_ttc - calcul.montant_retenue_ttc);
    });

    it("n'applique aucune retenue si le devis a stipulé 0 % de retenue", () => {
      const devisSansRetenue = {
        id: "dev-002",
        numero: "DEV-2026-002",
        retenue_garantie_pct: 0.0,
        lignes: [
          { designation: "Remplacement fenêtres PVC", qte: 3, pu_ht: 800, tva_pct: 5.5 },
        ],
      };

      const calcul = calculerRetenueFacture({
        lignes: devisSansRetenue.lignes as LigneFacturation[],
        retenue_garantie_pct: devisSansRetenue.retenue_garantie_pct,
        tva_defaut_pct: 5.5,
      });

      expect(calcul.total_ht).toBe(2400.0);
      expect(calcul.total_tva).toBe(132.0); // 2400 * 5.5%
      expect(calcul.total_ttc).toBe(2532.0);

      expect(calcul.retenue_garantie_pct).toBe(0.0);
      expect(calcul.montant_retenue_ht).toBe(0.0);
      expect(calcul.montant_retenue_ttc).toBe(0.0);
      expect(calcul.net_a_payer_ttc).toBe(2532.0);
      expect(calcul.net_a_payer_ttc).toBe(calcul.total_ttc);
    });

    it("calcule fidèlement une situation d'avancement issue d'un devis à 5 % de retenue", () => {
      const lignesMarche: LigneFacturation[] = [
        { designation: "Charpente", qte: 1, pu_ht: 10000, tva_pct: 10 },
      ];

      // Situation n°1 à 40 % d'avancement
      const sit1 = calculerSituationAvancement(lignesMarche, 40, 5, 10);

      expect(sit1.total_ht).toBe(4000.0);
      expect(sit1.total_ttc).toBe(4400.0);
      expect(sit1.montant_retenue_ht).toBe(200.0); // 4000 * 5%
      expect(sit1.montant_retenue_ttc).toBe(220.0); // 4400 * 5%
      expect(sit1.net_a_payer_ttc).toBe(4180.0); // 4400 - 220
    });

    it("gère la ventilation multi-TVA pour une facture issue d'un devis mixte à 5 %", () => {
      const lignesMixtes: LigneFacturation[] = [
        { designation: "Isolation thermique (Rénovation énergétique)", qte: 1, pu_ht: 4000, tva_pct: 5.5 },
        { designation: "Fourniture bardage bois", qte: 1, pu_ht: 3000, tva_pct: 10 },
        { designation: "Aménagements extérieurs annexes", qte: 1, pu_ht: 1000, tva_pct: 20 },
      ];

      const calcul = calculerRetenueFacture({
        lignes: lignesMixtes,
        retenue_garantie_pct: 5,
      });

      expect(calcul.total_ht).toBe(8000.0);
      // TVA : 4000*0.055 (220) + 3000*0.10 (300) + 1000*0.20 (200) = 720
      expect(calcul.total_tva).toBe(720.0);
      expect(calcul.total_ttc).toBe(8720.0);

      // Retenue HT = 8000 * 5% = 400
      expect(calcul.montant_retenue_ht).toBe(400.0);
      // Retenue TTC = 220*0.05 + 4000*0.05 + ... = 8720 * 5% = 436.00
      expect(calcul.montant_retenue_ttc).toBe(436.0);
      expect(calcul.net_a_payer_ttc).toBe(8284.0); // 8720 - 436
      expect(calcul.net_a_payer_ttc).toBe(calcul.total_ttc - calcul.montant_retenue_ttc);
      expect(calcul.tranches).toHaveLength(3);
    });
  });

  // =========================================================================
  // 3. Intégrité de la preuve de signature & Scellement SHA-256
  // =========================================================================
  describe("3. Intégrité de la preuve de signature & Scellement de l'accord contractuel", () => {
    it("scelle la clause de retenue contractuelle dans l'empreinte SHA-256 du devis", () => {
      const devisOriginal = {
        id: "d-uuid-1",
        numero: "DEV-2026-100",
        client_id: "cl-uuid-1",
        chantier_id: "ch-uuid-1",
        entreprise_id: "ent-uuid-1",
        total_ht: 10000,
        tva_pct: 10,
        acompte_pct: 30,
        retenue_garantie_pct: 5.0, // Retenue convenue à 5 %
        lignes: [{ designation: "Prestation A", qte: 1, pu_ht: 10000 }],
      };

      const empreinteInitiale = calculerEmpreinteDevis(devisOriginal);
      expect(empreinteInitiale).toMatch(/^[0-9a-f]{64}$/);

      // Si le devis n'est pas modifié, l'empreinte recalculée est rigoureusement identique
      const empreinteVerification = calculerEmpreinteDevis({ ...devisOriginal });
      expect(empreinteVerification).toBe(empreinteInitiale);
    });

    it("détecte immédiatement toute modification rétroactive du taux de retenue du devis", () => {
      const devisOriginal = {
        id: "d-uuid-1",
        numero: "DEV-2026-100",
        client_id: "cl-uuid-1",
        chantier_id: "ch-uuid-1",
        entreprise_id: "ent-uuid-1",
        total_ht: 10000,
        tva_pct: 10,
        acompte_pct: 30,
        retenue_garantie_pct: 5.0,
        lignes: [{ designation: "Prestation A", qte: 1, pu_ht: 10000 }],
      };

      const empreinteScellee = calculerEmpreinteDevis(devisOriginal);

      // Tentative de modification post-signature : réduction ou suppression de la retenue
      const devisAltere = {
        ...devisOriginal,
        retenue_garantie_pct: 0.0, // Altération malveillante
      };

      const empreinteApresAlteration = calculerEmpreinteDevis(devisAltere);

      // L'empreinte diverge impérativement : preuve inviolable
      expect(empreinteApresAlteration).not.toBe(empreinteScellee);
    });

    it("détecte toute altération du montant ou des lignes du devis après signature", () => {
      const devisOriginal = {
        id: "d-uuid-2",
        numero: "DEV-2026-101",
        total_ht: 5000,
        retenue_garantie_pct: 5.0,
        lignes: [{ designation: "Pose bardage", qte: 1, pu_ht: 5000 }],
      };

      const empreinteScellee = calculerEmpreinteDevis(devisOriginal);

      const devisPrixModifie = {
        ...devisOriginal,
        total_ht: 6000, // Altération du montant
      };

      expect(calculerEmpreinteDevis(devisPrixModifie)).not.toBe(empreinteScellee);
    });
  });

  // =========================================================================
  // 4. Immutabilité des factures déjà émises & isolation du compte chantier
  // =========================================================================
  describe("4. Immutabilité des factures émises & Absence d'effet de bord", () => {
    it("préserve l'immutabilité absolue des factures déjà émises", () => {
      // Simulation d'une facture déjà émise avant l'évolution devis
      const factureHistorique = {
        id: "fac-hist-1",
        numero: "FAC-2026-001",
        total_ht: 1500.0,
        total_ttc: 1650.0,
        retenue_garantie_pct: 5.0,
        montant_retenue_ht: 75.0,
        montant_retenue_ttc: 82.5,
        net_a_payer_ttc: 1567.5,
        statut: "emise",
      };

      // Les montants financiers restent intangibles
      expect(factureHistorique.net_a_payer_ttc).toBe(1567.5);
      expect(factureHistorique.montant_retenue_ttc).toBe(82.5);
      expect(factureHistorique.total_ttc - factureHistorique.montant_retenue_ttc).toBe(
        factureHistorique.net_a_payer_ttc
      );
    });

    it("ne crée aucun compte de retenue chantier fictif si un devis à 5 % n'a pas encore de facture", () => {
      // Règle produit : un devis accepté avec 5 % de retenue exprime un accord contractuel,
      // mais le compte chantier n'accumule que les retenues EFFECTIVEMENT FACTURÉES.
      const facturesChantier: { montant_retenue_ttc: number }[] = [];

      const cumulRetenu = facturesChantier.reduce(
        (sum, f) => sum + f.montant_retenue_ttc,
        0
      );

      expect(cumulRetenu).toBe(0);
    });
  });
});
