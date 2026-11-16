import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import DocumentPDF from "@/components/DocumentPDF";
import { construireLignesDeductionFacturesAnterieures } from "@/lib/devisCalcul";
import { calculerRetenueFacture } from "@/lib/retenueCalculs";
import {
  calculerTerrasse,
  convertirChiffrageTerrasseEnLignesDevis,
} from "@/lib/terrasse/calculs";
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
} from "@/lib/terrasse/types";

let root: Root | null = null;
let conteneur: HTMLDivElement | null = null;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (conteneur) {
    conteneur.remove();
    conteneur = null;
  }
});

describe("DocumentPDF — rendu multi-TVA", () => {
  it("affiche chaque tranche de TVA (0 % autoliquidation, 10 %, 20 %) et le net à payer", async () => {
    conteneur = document.createElement("div");
    document.body.appendChild(conteneur);
    root = createRoot(conteneur);

    await act(async () => {
      root!.render(
        <DocumentPDF
          doc={{
            kind: "facture",
            numero: "FAC-2026-042",
            statut: "envoyee",
            date_emission: "2026-11-16",
            objet: "Rénovation + extension",
            adresse_chantier: "12 rue des Lilas",
            type_travaux: "Bardage",
            tva_pct: 10,
            retenue_garantie_pct: 5,
            lignes: [
              { designation: "Rénovation façade", qte: 1, unite: "forfait", pu_ht: 1000, tva_pct: 10 },
              { designation: "Extension neuve", qte: 1, unite: "forfait", pu_ht: 2000, tva_pct: 20 },
              { designation: "Sous-traitance", qte: 1, unite: "forfait", pu_ht: 500, tva_pct: 0 },
            ],
          }}
          entreprise={{
            raison_sociale: "BNA Test",
            siret: "12345678900012",
            adresse: "1 rue Test",
            code_postal: "33000",
            ville: "Bordeaux",
            telephone: "0500000000",
            email: "test@bna.fr",
            assurance: "AXA",
            iban: "FR760000",
            bic: "AGRIFRPP",
            mentions_legales: "",
            logo_url: null,
          }}
          client={{
            nom: "Dupont",
            societe: null,
            adresse_facturation: "12 rue des Lilas",
            code_postal: "33000",
            ville: "Bordeaux",
            tel: "0600000000",
            email: "dupont@test.fr",
          }}
        />,
      );
    });

    const texte = conteneur.textContent || "";
    expect(texte).toContain("TVA 0 % (Autoliquidation / Exonéré)");
    expect(texte).toContain("TVA (10 %)");
    expect(texte).toContain("TVA (20 %)");
    // Total HT = 3500, TVA = 0 + 100 + 400 = 500, TTC = 4000, Retenue 5% = 200, Net = 3800
    expect(texte).toContain("3\u202f500,00\u00a0€");
    expect(texte).toContain("4\u202f000,00\u00a0€");
    expect(texte).toContain("3\u202f800,00\u00a0€");
  });
});

describe("Déduction complète sur facture de solde", () => {
  it("déduit acomptes et situations non annulées en conservant la ventilation TVA", () => {
    const deductions = construireLignesDeductionFacturesAnterieures(
      [
        {
          numero: "FAC-2026-001",
          type_facture: "acompte",
          statut: "payee",
          tva_pct: 10,
          lignes: [{ designation: "Acompte 30%", qte: 1, pu_ht: 300 }],
        },
        {
          numero: "SIT-2026-001",
          type_facture: "situation",
          statut: "envoyee",
          tva_pct: 10,
          lignes: [
            { designation: "Travaux réno", qte: 1, pu_ht: 400, tva_pct: 10 },
            { designation: "Extension", qte: 1, pu_ht: 500, tva_pct: 20 },
          ],
        },
        {
          numero: "SIT-2026-002",
          type_facture: "situation",
          statut: "annulee",
          tva_pct: 10,
          lignes: [{ designation: "Annulée", qte: 1, pu_ht: 999 }],
        },
      ],
      10,
    );

    expect(deductions).toHaveLength(3);
    expect(deductions.some((d) => d.designation.includes("SIT-2026-002"))).toBe(false);

    const lignesSolde = [
      { designation: "Total réno", qte: 1, unite: "forfait", pu_ht: 1000, tva_pct: 10 },
      { designation: "Total extension", qte: 1, unite: "forfait", pu_ht: 1000, tva_pct: 20 },
      ...deductions,
    ];

    const res = calculerRetenueFacture({
      lignes: lignesSolde,
      retenue_garantie_pct: 0,
      tva_defaut_pct: 10,
    });

    // Réno 10%: 1000 - 300 - 400 = 300 HT (TVA 30)
    // Extension 20%: 1000 - 500 = 500 HT (TVA 100)
    expect(res.total_ht).toBe(800);
    expect(res.total_tva).toBe(130);
    expect(res.total_ttc).toBe(930);
  });
});

describe("Passerelle Terrasse & Terrasse Mobile -> Devis", () => {
  it("convertit fournitures, terrasse mobile, motorisation MOT-01..05 et MO-TER-01..04 en lignes de devis", () => {
    const config: ChantierTerrasseConfig = {
      chantier_id: "c-ter-1",
      nom: "Terrasse Piscine",
      longueur_m: 8,
      largeur_m: 4,
      hauteur_sol_cm: 20,
      type_sol: "dalle_beton",
      pente_pct: 1.5,
      essence_bois: "pin_cl4",
      type_pose: "perpendiculaire",
      largeur_lame_mm: 145,
      epaisseur_lame_mm: 27,
      longueur_lame_m: 4,
      espacement_lames_mm: 5,
      type_fixation: "vis_inox",
      type_lambourde: "bois_cl4",
      section_largeur_mm: 45,
      section_hauteur_mm: 70,
      longueur_lambourde_m: 4,
      entraxe_lambourdes_cm: 45,
      double_lambourdage_aboutage: false,
      bande_etancheite_epdm: true,
      cales_isolation: true,
      type_plots: "reglables",
      entraxe_plots_cm: 60,
      hauteur_reglage_plots: "90_150",
      geotextile: true,
      presence_escalier: true,
      escalier_nb_marches: 2,
      escalier_largeur_m: 1.2,
      escalier_giron_cm: 28,
      escalier_hauteur_marche_cm: 17,
      presence_garde_corps: false,
      garde_corps_longueur_ml: 0,
      garde_corps_type: "alu_verre",
      garde_corps_hauteur_cm: 100,
      coef_perte_lames: 1.1,
      coef_perte_lambourdes: 1.1,
    };

    const reservations: ChantierTerrasseReservation[] = [
      {
        terrasse_id: "t-1",
        type_reservation: "piscine",
        nom: "Bassin",
        x: 1,
        y: 1,
        largeur: 3,
        longueur: 4,
        terrasse_mobile: {
          active: true,
          mode: "1_plateau",
          sens_refoulement: "droite",
          hauteur_chassis_alu_mm: 120,
          jeu_fonctionnel_peripherique_mm: 20,
          motorise: true,
          type_motorisation: "solaire",
        },
      },
    ];

    const res = calculerTerrasse(config, reservations, null, {
      inclureMainOeuvre: true,
      cadences: { taux_horaire_vente_ht: 50 },
    });
    const lignesDevis = convertirChiffrageTerrasseEnLignesDevis(res);

    expect(lignesDevis.some((l) => l.description?.includes("[MOB-01]"))).toBe(true);
    expect(lignesDevis.some((l) => l.description?.includes("[MOT-01]"))).toBe(true);
    expect(lignesDevis.some((l) => l.description?.includes("[MOT-05]"))).toBe(true);

    const lignesMo = lignesDevis.filter((l) => l.type_cout === "main_oeuvre");
    expect(lignesMo.length).toBe(4); // MO-TER-01..04
    expect(lignesMo.every((l) => l.unite === "h" && l.pu_ht === 50)).toBe(true);
  });
});
