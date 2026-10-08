import { describe, it, expect } from "vitest";
import {
  arrondirCentimes,
  validerTauxRetenue,
  calculerRetenueFacture,
  calculerSituationAvancement,
  RETENUE_GARANTIE_MAX_PCT,
  RETENUE_GARANTIE_MIN_PCT,
  type LigneFacturation,
} from "@/lib/retenueCalculs";

describe("lib/retenueCalculs — Moteur financier Retenue de Garantie V2.1", () => {
  // =========================================================================
  // CAS 1 : Facture mono-taux (10 % ou 20 %)
  // =========================================================================
  describe("Cas 1 — Facture mono-taux", () => {
    it("calcule correctement une facture mono-taux à 20 % avec retenue de 5 %", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Pose bardage", qte: 10, pu_ht: 100, tva_pct: 20 },
      ];
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
        tva_defaut_pct: 20,
      });

      expect(res.total_ht).toBe(1000.0);
      expect(res.total_tva).toBe(200.0);
      expect(res.total_ttc).toBe(1200.0);
      expect(res.retenue_garantie_pct).toBe(5);
      expect(res.montant_retenue_ht).toBe(50.0); // 1000 * 5%
      expect(res.montant_retenue_ttc).toBe(60.0); // 1200 * 5%
      expect(res.net_a_payer_ttc).toBe(1140.0); // 1200 - 60

      expect(res.tranches).toHaveLength(1);
      expect(res.tranches[0]).toEqual({
        taux_tva: 20,
        base_ht: 1000.0,
        montant_tva: 200.0,
        montant_ttc: 1200.0,
        retenue_ht: 50.0,
        retenue_ttc: 60.0,
        net_a_payer_ttc: 1140.0,
      });
    });

    it("calcule correctement une facture mono-taux à 10 % avec retenue de 5 %", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Rénovation plomberie", qte: 2, pu_ht: 250, tva_pct: 10 },
      ];
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
        tva_defaut_pct: 10,
      });

      expect(res.total_ht).toBe(500.0);
      expect(res.total_tva).toBe(50.0);
      expect(res.total_ttc).toBe(550.0);
      expect(res.montant_retenue_ht).toBe(25.0);
      expect(res.montant_retenue_ttc).toBe(27.5);
      expect(res.net_a_payer_ttc).toBe(522.5);
    });
  });

  // =========================================================================
  // CAS 2 : Facture multi-taux (10 % + 20 %)
  // =========================================================================
  describe("Cas 2 — Facture multi-taux (10 % + 20 %)", () => {
    it("ventile les tranches 10 % et 20 % et consolide les totaux sans divergence", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Travaux amélioration (10 %)", qte: 1, pu_ht: 1000, tva_pct: 10 },
        { designation: "Fourniture équipement (20 %)", qte: 1, pu_ht: 1000, tva_pct: 20 },
      ];
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      // Tranche 10 % : HT 1000, TVA 100, TTC 1100, Retenue TTC = 55.00, Retenue HT = 50.00, Net = 1045.00
      // Tranche 20 % : HT 1000, TVA 200, TTC 1200, Retenue TTC = 60.00, Retenue HT = 50.00, Net = 1140.00
      expect(res.total_ht).toBe(2000.0);
      expect(res.total_tva).toBe(300.0);
      expect(res.total_ttc).toBe(2300.0);
      expect(res.montant_retenue_ht).toBe(100.0);
      expect(res.montant_retenue_ttc).toBe(115.0);
      expect(res.net_a_payer_ttc).toBe(2185.0);

      expect(res.tranches).toHaveLength(2);
      expect(res.tranches[0].taux_tva).toBe(10);
      expect(res.tranches[0].retenue_ttc).toBe(55.0);
      expect(res.tranches[1].taux_tva).toBe(20);
      expect(res.tranches[1].retenue_ttc).toBe(60.0);
    });
  });

  // =========================================================================
  // CAS 3 : Combinaison 5,5 % + 10 % + 20 %
  // =========================================================================
  describe("Cas 3 — Combinaison multi-taux 5,5 % + 10 % + 20 %", () => {
    it("gère 3 tranches distinctes avec la TVA énergétique à 5,5 %", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Isolation thermique", qte: 1, pu_ht: 1000, tva_pct: 5.5 },
        { designation: "Main d'œuvre rénovation", qte: 1, pu_ht: 2000, tva_pct: 10 },
        { designation: "Matériel neuf", qte: 1, pu_ht: 3000, tva_pct: 20 },
      ];
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      // Tranche 5.5 % : HT 1000, TVA 55.00, TTC 1055.00, Retenue TTC 52.75, Retenue HT 50.00
      // Tranche 10 %  : HT 2000, TVA 200.00, TTC 2200.00, Retenue TTC 110.00, Retenue HT 100.00
      // Tranche 20 %  : HT 3000, TVA 600.00, TTC 3600.00, Retenue TTC 180.00, Retenue HT 150.00
      expect(res.tranches).toHaveLength(3);

      expect(res.tranches[0]).toEqual({
        taux_tva: 5.5,
        base_ht: 1000,
        montant_tva: 55,
        montant_ttc: 1055,
        retenue_ht: 50,
        retenue_ttc: 52.75,
        net_a_payer_ttc: 1002.25,
      });

      expect(res.tranches[1]).toEqual({
        taux_tva: 10,
        base_ht: 2000,
        montant_tva: 200,
        montant_ttc: 2200,
        retenue_ht: 100,
        retenue_ttc: 110,
        net_a_payer_ttc: 2090,
      });

      expect(res.tranches[2]).toEqual({
        taux_tva: 20,
        base_ht: 3000,
        montant_tva: 600,
        montant_ttc: 3600,
        retenue_ht: 150,
        retenue_ttc: 180,
        net_a_payer_ttc: 3420,
      });

      expect(res.total_ht).toBe(6000);
      expect(res.total_tva).toBe(855);
      expect(res.total_ttc).toBe(6855);
      expect(res.montant_retenue_ht).toBe(300);
      expect(res.montant_retenue_ttc).toBe(342.75); // 52.75 + 110 + 180
      expect(res.net_a_payer_ttc).toBe(6512.25); // 6855 - 342.75
    });
  });

  // =========================================================================
  // CAS 4 : Taux 0 % (auto-liquidation / sous-traitance BTP art. 283-2 nonies)
  // =========================================================================
  describe("Cas 4 — Taux 0 % (auto-liquidation BTP)", () => {
    it("calcule correctement une retenue sur facture à 0 % où HT == TTC", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Sous-traitance gros œuvre", qte: 1, pu_ht: 10000, tva_pct: 0 },
      ];
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      expect(res.total_ht).toBe(10000);
      expect(res.total_tva).toBe(0);
      expect(res.total_ttc).toBe(10000);
      expect(res.montant_retenue_ht).toBe(500);
      expect(res.montant_retenue_ttc).toBe(500);
      expect(res.net_a_payer_ttc).toBe(9500);

      expect(res.tranches[0].taux_tva).toBe(0);
      expect(res.tranches[0].montant_tva).toBe(0);
      expect(res.tranches[0].retenue_ht).toBe(res.tranches[0].retenue_ttc);
    });
  });

  // =========================================================================
  // CAS 5 : Quantités décimales (ex: 14.75 m²)
  // =========================================================================
  describe("Cas 5 — Quantités décimales", () => {
    it("gère les métrés avec décimales sans perte de précision", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Fourniture carrelage", qte: 14.75, pu_ht: 40.0, tva_pct: 20 },
      ];
      // 14.75 * 40 = 590.00 € HT
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      expect(res.total_ht).toBe(590.0);
      expect(res.total_tva).toBe(118.0);
      expect(res.total_ttc).toBe(708.0);
      expect(res.montant_retenue_ht).toBe(29.5);
      expect(res.montant_retenue_ttc).toBe(35.4);
      expect(res.net_a_payer_ttc).toBe(672.6);
    });
  });

  // =========================================================================
  // CAS 6 : Prix unitaires avec plusieurs décimales (ex: 45.678 €)
  // =========================================================================
  describe("Cas 6 — Prix unitaires décimaux fins", () => {
    it("calcule le produit qte * pu_ht brut avant arrondissement de l'assiette", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Acier au kg", qte: 100, pu_ht: 45.678, tva_pct: 20 },
      ];
      // 100 * 45.678 = 4567.80 € HT
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      expect(res.total_ht).toBe(4567.8);
      expect(res.total_tva).toBe(913.56);
      expect(res.total_ttc).toBe(5481.36);
      expect(res.montant_retenue_ht).toBe(228.39);
      expect(res.montant_retenue_ttc).toBe(274.07); // 5481.36 * 0.05 = 274.068 -> 274.07
      expect(res.net_a_payer_ttc).toBe(5207.29); // 5481.36 - 274.07
    });
  });

  // =========================================================================
  // CAS 7 : Cas produisant des fractions de centime (arrondi déterministe)
  // =========================================================================
  describe("Cas 7 — Fractions de centime et arrondi bancaire / légal", () => {
    it("arrondit correctement 0.005 à 0.01 et 0.004 à 0.00", () => {
      expect(arrondirCentimes(1.005)).toBe(1.01);
      expect(arrondirCentimes(1.004)).toBe(1.0);
      expect(arrondirCentimes(12.345)).toBe(12.35);
      expect(arrondirCentimes(12.344)).toBe(12.34);
    });

    it("arrondit de façon déterministe chaque ligne avec fraction de centime", () => {
      // 1 unité à 10.33 € HT soumis à 10 % TVA :
      // HT = 10.33
      // TVA = 1.033 -> 1.03
      // TTC = 11.36
      // Retenue 5% TTC = 11.36 * 0.05 = 0.568 -> 0.57
      // Retenue 5% HT = 10.33 * 0.05 = 0.5165 -> 0.52
      // Net TTC = 11.36 - 0.57 = 10.79
      const lignes: LigneFacturation[] = [
        { designation: "Article fractionnaire", qte: 1, pu_ht: 10.33, tva_pct: 10 },
      ];
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      expect(res.total_ht).toBe(10.33);
      expect(res.total_tva).toBe(1.03);
      expect(res.total_ttc).toBe(11.36);
      expect(res.montant_retenue_ht).toBe(0.52);
      expect(res.montant_retenue_ttc).toBe(0.57);
      expect(res.net_a_payer_ttc).toBe(10.79);
    });
  });

  // =========================================================================
  // CAS 8 : Retenue à 0 %
  // =========================================================================
  describe("Cas 8 — Retenue à 0 %", () => {
    it("produit une retenue nulle et un net égal au total TTC", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Travaux sans retenue contractuelle", qte: 1, pu_ht: 5000, tva_pct: 20 },
      ];
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 0,
      });

      expect(res.retenue_garantie_pct).toBe(0);
      expect(res.montant_retenue_ht).toBe(0);
      expect(res.montant_retenue_ttc).toBe(0);
      expect(res.net_a_payer_ttc).toBe(res.total_ttc);
      expect(res.net_a_payer_ttc).toBe(6000);
    });
  });

  // =========================================================================
  // CAS 9 : Retenue à 5 % (taux légal standard)
  // =========================================================================
  describe("Cas 9 — Retenue à 5 %", () => {
    it("applique le taux légal maximal de 5.00 %", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Lot maçonnerie", qte: 1, pu_ht: 100000, tva_pct: 20 },
      ];
      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      expect(res.retenue_garantie_pct).toBe(5);
      expect(res.total_ht).toBe(100000);
      expect(res.total_tva).toBe(20000);
      expect(res.total_ttc).toBe(120000);
      expect(res.montant_retenue_ht).toBe(5000);
      expect(res.montant_retenue_ttc).toBe(6000);
      expect(res.net_a_payer_ttc).toBe(114000);
    });
  });

  // =========================================================================
  // CAS 10 : Tentative de retenue > 5 % (rejet avec exception explicite)
  // =========================================================================
  describe("Cas 10 — Plafond légal de 5.00 % et validation du taux", () => {
    it("lève une RangeError explicite si retenue > 5 %", () => {
      expect(() => validerTauxRetenue(5.01)).toThrowError(RangeError);
      expect(() => validerTauxRetenue(10)).toThrowError(
        /dépasse le plafond légal de 5 %/
      );

      expect(() =>
        calculerRetenueFacture({
          lignes: [{ qte: 1, pu_ht: 100 }],
          retenue_garantie_pct: 6,
        })
      ).toThrowError(RangeError);
    });

    it("lève une RangeError explicite si retenue < 0 %", () => {
      expect(() => validerTauxRetenue(-1)).toThrowError(RangeError);
      expect(() =>
        calculerRetenueFacture({
          lignes: [{ qte: 1, pu_ht: 100 }],
          retenue_garantie_pct: -0.5,
        })
      ).toThrowError(RangeError);
    });

    it("accepte les taux aux bornes légales [0, 5]", () => {
      expect(validerTauxRetenue(RETENUE_GARANTIE_MIN_PCT)).toBe(0);
      expect(validerTauxRetenue(RETENUE_GARANTIE_MAX_PCT)).toBe(5);
      expect(validerTauxRetenue(2.5)).toBe(2.5);
    });

    it("accepte la saisie textuelle avec virgule (ex: '4,5')", () => {
      expect(validerTauxRetenue("4,5")).toBe(4.5);
      expect(validerTauxRetenue("5")).toBe(5);
    });

    it("rejette les entrées non numériques avec TypeError", () => {
      expect(() => validerTauxRetenue("invalide")).toThrowError(TypeError);
    });
  });

  // =========================================================================
  // CAS 11 : Facture sans ligne (panier vide -> totaux à 0, pas de crash)
  // =========================================================================
  describe("Cas 11 — Facture sans ligne (panier vide)", () => {
    it("retourne des totaux à zéro sans lever d'erreur pour une liste vide", () => {
      const res = calculerRetenueFacture({
        lignes: [],
        retenue_garantie_pct: 5,
      });

      expect(res).toEqual({
        total_ht: 0,
        total_tva: 0,
        total_ttc: 0,
        retenue_garantie_pct: 5,
        montant_retenue_ht: 0,
        montant_retenue_ttc: 0,
        net_a_payer_ttc: 0,
        tranches: [],
      });
    });

    it("ignore les lignes marquées 'a_chiffrer'", () => {
      const res = calculerRetenueFacture({
        lignes: [
          { designation: "Étude géotechnique", qte: 1, pu_ht: 800, a_chiffrer: true },
        ],
        retenue_garantie_pct: 5,
      });

      expect(res.total_ht).toBe(0);
      expect(res.total_ttc).toBe(0);
      expect(res.tranches).toHaveLength(0);
    });
  });

  // =========================================================================
  // CAS 12 : Valeurs invalides (NaN, undefined, null)
  // =========================================================================
  describe("Cas 12 — Résilience aux valeurs invalides", () => {
    it("ignore les lignes ayant des quantités ou prix nuls/NaN", () => {
      const lignes: LigneFacturation[] = [
        { designation: "Ligne invalide 1", qte: null, pu_ht: 100 },
        { designation: "Ligne invalide 2", qte: undefined, pu_ht: 100 },
        { designation: "Ligne invalide 3", qte: NaN, pu_ht: 100 },
        { designation: "Ligne invalide 4", qte: 2, pu_ht: null },
        { designation: "Ligne invalide 5", qte: 2, pu_ht: NaN },
        { designation: "Ligne valide", qte: 2, pu_ht: 100, tva_pct: 20 },
      ];

      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      expect(res.total_ht).toBe(200);
      expect(res.total_tva).toBe(40);
      expect(res.total_ttc).toBe(240);
    });

    it("tolère retenue_garantie_pct absent / null / undefined et l'initialise à 0 %", () => {
      const resNull = calculerRetenueFacture({
        lignes: [{ qte: 1, pu_ht: 100, tva_pct: 20 }],
        retenue_garantie_pct: null,
      });
      expect(resNull.retenue_garantie_pct).toBe(0);
      expect(resNull.montant_retenue_ttc).toBe(0);

      const resUndefined = calculerRetenueFacture({
        lignes: [{ qte: 1, pu_ht: 100, tva_pct: 20 }],
        retenue_garantie_pct: undefined,
      });
      expect(resUndefined.retenue_garantie_pct).toBe(0);
    });
  });

  // =========================================================================
  // CAS 13 : Invariant net_a_payer_ttc = total_ttc - montant_retenue_ttc
  // =========================================================================
  describe("Cas 13 — Invariant fondamental net_a_payer_ttc", () => {
    it("garantit strictement net_a_payer_ttc = total_ttc - montant_retenue_ttc sur configurations complexes", () => {
      const lignes: LigneFacturation[] = [
        { qte: 3.33, pu_ht: 17.89, tva_pct: 5.5 },
        { qte: 12.5, pu_ht: 88.45, tva_pct: 10 },
        { qte: 1.1, pu_ht: 1234.56, tva_pct: 20 },
      ];

      for (const taux of [0, 1, 2.5, 3.8, 5]) {
        const res = calculerRetenueFacture({
          lignes,
          retenue_garantie_pct: taux,
        });

        const netTheorique = arrondirCentimes(res.total_ttc - res.montant_retenue_ttc);
        expect(res.net_a_payer_ttc).toBe(netTheorique);
        expect(res.net_a_payer_ttc).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // =========================================================================
  // CAS 14 : Conservation exacte des centimes (aucune perte sur sommes de tranches)
  // =========================================================================
  describe("Cas 14 — Conservation exacte des centimes", () => {
    it("vérifie que les totaux généraux sont strictement égaux à la somme des tranches", () => {
      const lignes: LigneFacturation[] = [
        { qte: 7, pu_ht: 14.28, tva_pct: 0 },
        { qte: 11, pu_ht: 83.33, tva_pct: 5.5 },
        { qte: 5, pu_ht: 127.49, tva_pct: 10 },
        { qte: 3, pu_ht: 499.99, tva_pct: 20 },
      ];

      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      const sommeTranchesHt = arrondirCentimes(
        res.tranches.reduce((acc, t) => acc + t.base_ht, 0)
      );
      const sommeTranchesTva = arrondirCentimes(
        res.tranches.reduce((acc, t) => acc + t.montant_tva, 0)
      );
      const sommeTranchesTtc = arrondirCentimes(
        res.tranches.reduce((acc, t) => acc + t.montant_ttc, 0)
      );
      const sommeTranchesRetenueTtc = arrondirCentimes(
        res.tranches.reduce((acc, t) => acc + t.retenue_ttc, 0)
      );
      const sommeTranchesRetenueHt = arrondirCentimes(
        res.tranches.reduce((acc, t) => acc + t.retenue_ht, 0)
      );
      const sommeTranchesNet = arrondirCentimes(
        res.tranches.reduce((acc, t) => acc + t.net_a_payer_ttc, 0)
      );

      expect(res.total_ht).toBe(sommeTranchesHt);
      expect(res.total_tva).toBe(sommeTranchesTva);
      expect(res.total_ttc).toBe(sommeTranchesTtc);
      expect(res.montant_retenue_ht).toBe(sommeTranchesRetenueHt);
      expect(res.montant_retenue_ttc).toBe(sommeTranchesRetenueTtc);
      expect(res.net_a_payer_ttc).toBe(sommeTranchesNet);
    });
  });

  // =========================================================================
  // CAS 15 : Cohérence HT / TVA / TTC par tranche
  // =========================================================================
  describe("Cas 15 — Cohérence interne de chaque tranche", () => {
    it("vérifie pour chaque tranche que TTC = HT + TVA et Net = TTC - Retenue_TTC", () => {
      const lignes: LigneFacturation[] = [
        { qte: 17, pu_ht: 19.99, tva_pct: 10 },
        { qte: 4, pu_ht: 349.5, tva_pct: 20 },
      ];

      const res = calculerRetenueFacture({
        lignes,
        retenue_garantie_pct: 5,
      });

      for (const t of res.tranches) {
        expect(t.montant_ttc).toBe(arrondirCentimes(t.base_ht + t.montant_tva));
        expect(t.net_a_payer_ttc).toBe(arrondirCentimes(t.montant_ttc - t.retenue_ttc));
      }
    });
  });

  // =========================================================================
  // EXTENSION : Situation d'avancement au prorata
  // =========================================================================
  describe("Situation d'avancement au prorata", () => {
    it("calcule une situation à 30 % avec retenue de garantie de 5 %", () => {
      const devisLignes: LigneFacturation[] = [
        { designation: "Menuiseries extérieures", qte: 1, pu_ht: 10000, tva_pct: 20 },
      ];

      const situation30 = calculerSituationAvancement(devisLignes, 30, 5, 20);

      expect(situation30.total_ht).toBe(3000);
      expect(situation30.total_tva).toBe(600);
      expect(situation30.total_ttc).toBe(3600);
      expect(situation30.montant_retenue_ht).toBe(150); // 3000 * 5%
      expect(situation30.montant_retenue_ttc).toBe(180); // 3600 * 5%
      expect(situation30.net_a_payer_ttc).toBe(3420); // 3600 - 180
    });

    it("borne l'avancement entre 0 et 100 %", () => {
      const devisLignes: LigneFacturation[] = [
        { designation: "Peinture", qte: 1, pu_ht: 1000, tva_pct: 20 },
      ];

      const situationNeg = calculerSituationAvancement(devisLignes, -10, 5);
      expect(situationNeg.total_ht).toBe(0);

      const situationSur = calculerSituationAvancement(devisLignes, 150, 5);
      expect(situationSur.total_ht).toBe(1000);
    });
  });
});
