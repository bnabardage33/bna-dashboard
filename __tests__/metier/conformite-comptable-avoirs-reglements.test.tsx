// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  calculerRetenueFacture,
  calculerSoldeRestantDu,
} from "@/lib/retenueCalculs";
import DocumentPDF, {
  type Client,
  type DocumentData,
  type Entreprise,
} from "@/components/DocumentPDF";

const ENTREPRISE_TEST: Entreprise = {
  raison_sociale: "BNA Facades SAS",
  siret: "12345678900012",
  telephone: "04 00 00 00 00",
  email: "contact@bna.fr",
  adresse: "10 Rue des Artisans",
  code_postal: "38000",
  ville: "Grenoble",
  assurance: "AXA",
  iban: "FR761234567890",
  bic: "AGRIFRPP",
  mentions_legales: "TVA acquittee sur les debits",
  logo_url: null,
};

const CLIENT_TEST: Client = {
  nom: "Jean Dupont",
  societe: "Entreprise Generale BTP",
  adresse_facturation: "25 Avenue Jean Jaures",
  code_postal: "69007",
  ville: "Lyon",
  tel: "06 00 00 00 00",
  email: "compta@egbtp.fr",
  siren_client: "987654321",
};

describe("Conformite comptable : Avoirs, Autoliquidation, SIREN & Reglements partiels", () => {
  it("autorise les montants negatifs sur un avoir comptable", () => {
    const res = calculerRetenueFacture({
      lignes: [
        { designation: "Annulation bardage", qte: 10, unite: "m2", pu_ht: -100, tva_pct: 20 },
      ],
      retenue_garantie_pct: 0,
      tva_defaut_pct: 20,
      autoriser_negatif: true,
    });

    expect(res.total_ht).toBe(-1000);
    expect(res.total_tva).toBe(-200);
    expect(res.total_ttc).toBe(-1200);
    expect(res.net_a_payer_ttc).toBe(-1200);
  });

  it("force la TVA a 0 % sur toutes les lignes en autoliquidation sous-traitance", () => {
    const res = calculerRetenueFacture({
      lignes: [
        { designation: "Pose bardage", qte: 20, unite: "m2", pu_ht: 50, tva_pct: 10 },
        { designation: "Fourniture", qte: 1, unite: "forfait", pu_ht: 500, tva_pct: 20 },
      ],
      retenue_garantie_pct: 5,
      tva_defaut_pct: 20,
      autoliquidation_tva: true,
    });

    expect(res.total_ht).toBe(1500);
    expect(res.total_tva).toBe(0);
    expect(res.total_ttc).toBe(1500);
    expect(res.tranches).toHaveLength(1);
    expect(res.tranches[0].taux_tva).toBe(0);
    expect(res.montant_retenue_ttc).toBe(75);
    expect(res.net_a_payer_ttc).toBe(1425);
  });

  it("calcule le cumul regle et le reste a encaisser pour les reglements partiels", () => {
    const partiel = calculerSoldeRestantDu(1200, [
      { montant_ttc: 400 },
      { montant_ttc: 350.5 },
    ]);
    expect(partiel.total_regle_ttc).toBe(750.5);
    expect(partiel.reste_a_encaisser_ttc).toBe(449.5);
    expect(partiel.est_soldee).toBe(false);

    const solde = calculerSoldeRestantDu(1200, [
      { montant_ttc: 750.5 },
      { montant_ttc: 449.5 },
    ]);
    expect(solde.total_regle_ttc).toBe(1200);
    expect(solde.reste_a_encaisser_ttc).toBe(0);
    expect(solde.est_soldee).toBe(true);
  });

  it("affiche AVOIR, le SIREN client, la mention CGI 283-2 nonies et le reste a encaisser dans DocumentPDF", () => {
    const docAvoir: DocumentData = {
      kind: "facture",
      type_facture: "avoir",
      numero: "AVO-2026-001",
      statut: "emise",
      date_emission: "2026-11-16",
      objet: "Annulation facture FAC-2026-012",
      adresse_chantier: null,
      type_travaux: "Bardage",
      lignes: [
        { designation: "Avoir sur travaux", qte: 1, unite: "forfait", pu_ht: -1000 },
      ],
      tva_pct: 0,
      autoliquidation_tva: true,
      siren_client: "987654321",
    };

    const htmlAvoir = renderToStaticMarkup(
      <DocumentPDF doc={docAvoir} entreprise={ENTREPRISE_TEST} client={CLIENT_TEST} />
    );

    expect(htmlAvoir).toContain("AVOIR");
    expect(htmlAvoir).toContain("SIREN : 987654321");
    expect(htmlAvoir).toContain(
      "Autoliquidation de la TVA par le preneur — Article 283-2 nonies du Code Général des Impôts"
    );

    const docFacturePartielle: DocumentData = {
      kind: "facture",
      type_facture: "totale",
      numero: "FAC-2026-099",
      statut: "envoyee",
      date_emission: "2026-11-16",
      objet: "Travaux ITE",
      adresse_chantier: null,
      type_travaux: "ITE",
      lignes: [
        { designation: "Pose ITE", qte: 10, unite: "m2", pu_ht: 100 },
      ],
      tva_pct: 20,
      net_a_payer_ttc: 1200,
      total_regle_ttc: 500,
      reste_a_encaisser_ttc: 700,
    };

    const htmlFacture = renderToStaticMarkup(
      <DocumentPDF
        doc={docFacturePartielle}
        entreprise={ENTREPRISE_TEST}
        client={CLIENT_TEST}
      />
    );

    expect(htmlFacture).toContain("FACTURE");
    expect(htmlFacture).toContain("Déjà réglé");
    expect(htmlFacture).toContain("Reste à encaisser TTC");
  });
});
