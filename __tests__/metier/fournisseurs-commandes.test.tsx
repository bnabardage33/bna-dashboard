// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SPECIALITES_FOURNISSEUR,
  badgeMetierConfig,
  calculerAnalyseMarges,
  correspondMetierSpecialite,
  extraireFournituresDepuisCloture,
  extraireFournituresDepuisTerrasse,
  extraireFournituresDepuisZonesBardage,
} from "@/lib/fournisseursCommandes";
import BonCommandePDF from "@/components/BonCommandePDF";

describe("Fournisseurs, Commandes Matériaux & Analyse des Marges", () => {
  it("filtre correctement les spécialités fournisseurs par corps d'état", () => {
    expect(SPECIALITES_FOURNISSEUR).toContain("Bardage / ITE");
    expect(SPECIALITES_FOURNISSEUR).toContain("Terrasse & Mobile");
    expect(SPECIALITES_FOURNISSEUR).toContain("Clôture / Portillons");

    expect(correspondMetierSpecialite("Bardage / ITE", "bardage")).toBe(true);
    expect(correspondMetierSpecialite("Bardage / ITE", "cloture")).toBe(false);
    expect(correspondMetierSpecialite("Terrasse & Mobile", "terrasse")).toBe(true);
    expect(correspondMetierSpecialite("Clôture / Portillons", "cloture")).toBe(true);
    expect(correspondMetierSpecialite("Quincaillerie / Visserie", "terrasse")).toBe(true);
    expect(correspondMetierSpecialite("Métal / Bac acier", "terrasse")).toBe(false);
    expect(correspondMetierSpecialite(null, "tous")).toBe(true);

    expect(badgeMetierConfig("terrasse").label).toBe("Terrasse");
    expect(badgeMetierConfig("cloture").badgeClass).toContain("#B85B2B");
  });

  it("extrait les fournitures Q_appro pour Bardage, Terrasse (hors main-d'œuvre) et Clôture", () => {
    const bardage = extraireFournituresDepuisZonesBardage([
      {
        id: "z1",
        nom: "Façade Sud",
        materiau: "Douglas",
        largeur: 10,
        hauteur_mur: 3,
        resultats_techniques: {
          surfaceACommander: 33.5,
          pose: {
            isolant: {
              actif: true,
              typeIsolant: "Laine de bois",
              epaisseurMm: 140,
              nbPaquetsACommander: 8,
            },
            nbSegmentsChevrons: 24,
            nbFixationsTotal: 48,
            nbChevillesMurales: 96,
            lineaireBandeEPDMM: 42.2,
            nbVisParement: 400,
          },
        },
      },
    ]);
    expect(bardage).toHaveLength(7);
    expect(bardage[0]).toEqual({
      designation: "Douglas — Façade Sud",
      quantite: 33.5,
      unite: "m²",
    });

    const terrasse = extraireFournituresDepuisTerrasse({
      resultats_techniques: {
        chiffrage: {
          lignes: [
            {
              code: "LAM-01",
              categorie: "Platelage",
              designation: "Lames Pin CL4 28x145",
              quantite: 45,
              unite: "m²",
              prixUnitaireHt: 38,
            },
            {
              code: "MO-POSE",
              categorie: "Main d'œuvre pose",
              designation: "Pose terrasse",
              quantite: 18,
              unite: "h",
              prixUnitaireHt: 55,
            },
          ],
        },
      },
    });
    expect(terrasse).toHaveLength(1);
    expect(terrasse[0]).toEqual({
      designation: "Lames Pin CL4 28x145",
      quantite: 45,
      unite: "m²",
      pu_ht: 38,
    });

    const cloture = extraireFournituresDepuisCloture({
      resultats_techniques: {
        lignesFournitures: [
          {
            designation: "Poteaux alu H1.80",
            qte: 12,
            unite: "u",
            pu_revient: 42,
            type_cout: "matiere",
          },
          {
            designation: "Main d'œuvre scellement",
            qte: 6,
            unite: "h",
            pu_ht: 50,
            type_cout: "main_oeuvre",
          },
        ],
      },
    });
    expect(cloture).toHaveLength(1);
    expect(cloture[0]).toEqual({
      designation: "Poteaux alu H1.80",
      quantite: 12,
      unite: "u",
      pu_ht: 42,
    });
  });

  it("calcule l'analyse des marges globale, par chantier et par métier", () => {
    const resume = calculerAnalyseMarges(
      [
        { id: "c1", nom: "Villa Nord", metier: "bardage", clients: { nom: "Dupont" } },
        { id: "c2", nom: "Piscine Sud", metier: "terrasse", clients: { nom: "Martin" } },
        { id: "c3", nom: "Clôture Est", metier: "cloture", clients: { nom: "Leroy" } },
      ],
      [
        {
          id: "d1",
          chantier_id: "c1",
          statut: "signe",
          total_ht: 10000,
          cout_matiere_ht: 6000,
          cout_main_oeuvre_ht: 4000,
        },
        {
          id: "d2",
          chantier_id: "c2",
          statut: "accepte",
          total_ht: 8000,
          cout_matiere_ht: 0,
          cout_main_oeuvre_ht: 3000,
        },
        {
          id: "d3",
          chantier_id: "c3",
          statut: "refuse",
          total_ht: 5000,
          cout_matiere_ht: 3000,
          cout_main_oeuvre_ht: 2000,
        },
      ],
      [
        { id: "cmd1", chantier_id: "c1", montant_ht: 3800, statut: "livree" },
        { id: "cmd2", chantier_id: "c1", montant_ht: 500, statut: "annulee" },
        { id: "cmd3", chantier_id: "c2", montant_ht: 3200, statut: "commandee" },
        { id: "cmd4", chantier_id: "c3", montant_ht: 1500, statut: "livree" },
      ]
    );

    // c1 ventes = 6000, c2 ventes = 8000 - 3000 = 5000, c3 refusé = 0 => total 11000
    expect(resume.totalVentesMateriauxHt).toBe(11000);
    // achats engagés = 3800 + 3200 + 1500 = 8500 (500 annulée exclue)
    expect(resume.totalAchatsEngagesHt).toBe(8500);
    // achats livrés = 3800 + 1500 = 5300
    expect(resume.totalAchatsLivresHt).toBe(5300);
    expect(resume.margeBruteHt).toBe(2500);
    expect(resume.parMetier.bardage.margeBruteHt).toBe(2200);
    expect(resume.parMetier.terrasse.margeBruteHt).toBe(1800);
    expect(resume.parMetier.cloture.margeBruteHt).toBe(-1500);
  });

  it("rend le BonCommandePDF sans erreur côté serveur", () => {
    const html = renderToStaticMarkup(
      createElement(BonCommandePDF, {
        commande: {
          id: "12345678-1234-1234-1234-1234567890ab",
          created_at: "2026-11-16T10:00:00Z",
          designation: "Lames composite clôture",
          quantite: 40,
          unite: "u",
          montant_ht: 756,
          date_livraison_prevue: "2026-11-25",
        },
        fournisseur: {
          nom: "Dispano Bordeaux",
          contact: "Jean Marc",
          telephone: "05 56 11 22 33",
          email: "commandes@dispano.fr",
          conditions_paiement: "30j fin de mois",
        },
        chantier: {
          nom: "Chantier Clôture Test",
          adresse: "10 Rue des Pins",
          clientNom: "Client Test",
        },
        entreprise: {
          raison_sociale: "BNA BTP",
          siret: "12345678900012",
          telephone: "05 56 00 00 00",
          email: "contact@bna.fr",
          adresse: "12 Rue Artisanat",
          code_postal: "33000",
          ville: "Bordeaux",
          assurance: null,
          iban: null,
          bic: null,
          mentions_legales: null,
          logo_url: null,
        },
      })
    );
    expect(html).toContain("Dispano Bordeaux");
    expect(html).toContain("Lames composite clôture");
  });
});
