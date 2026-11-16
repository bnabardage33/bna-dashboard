// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  construireOuvragesCloture,
  construireOuvragesTerrasse,
  getDefaultsFinChantierParMetier,
} from "@/lib/finChantierMetier";
import PVReceptionPDF, { type EntrepriseInfo, type PVReceptionData } from "@/components/PVReceptionPDF";

const ENTREPRISE_TEST: EntrepriseInfo = {
  raison_sociale: "BNA BTP SAS",
  siret: "12345678900012",
  telephone: "05 56 00 00 00",
  email: "contact@bna.fr",
  adresse: "12 Rue de l'Artisanat",
  code_postal: "33000",
  ville: "Bordeaux",
  logo_url: null,
};

describe("Fin de chantier & Réceptions Multi-Métiers", () => {
  it("fournit les libellés, notices et checklist adaptés pour Bardage, Terrasse Mobile et Clôture", () => {
    const bardage = getDefaultsFinChantierParMetier("bardage");
    expect(bardage.typeTravaux).toContain("bardage");
    expect(bardage.noticeEntretien.controle_joints_recommande).toContain("bavettes");
    expect(bardage.libelleRepliMateriel).toBe("Échafaudage démonté");

    const terrasseMobile = getDefaultsFinChantierParMetier("terrasse", {
      terrasseMobileActive: true,
    });
    expect(terrasseMobile.typeTravaux).toContain("NF DTU 51.4");
    expect(terrasseMobile.typeTravaux).toContain("NF P90-308");
    expect(terrasseMobile.noticeEntretien.controle_joints_recommande).toContain("rails inox");
    expect(terrasseMobile.libelleRepliMateriel).toBe("Abords nettoyés et repli matériel");

    const cloture = getDefaultsFinChantierParMetier("cloture");
    expect(cloture.typeTravaux).toContain("clôture");
    expect(cloture.noticeEntretien.controle_joints_recommande).toContain("portillon");
    expect(cloture.libelleRepliMateriel).toBe("Abords nettoyés et repli matériel");
  });

  it("construit les ouvrages réceptionnés depuis chantier_terrasses et chantier_clotures/troncons", () => {
    const ouvragesTerrasse = construireOuvragesTerrasse({
      id: "t1",
      nom: "Terrasse Piscine",
      longueur_m: 6,
      largeur_m: 4,
      essence_bois: "pin_cl4",
      systeme_terrasse: "bois_vis",
      resultats_techniques: { terrasseMobile: { active: true, motorisation: { active: true } } },
    });
    expect(ouvragesTerrasse).toHaveLength(1);
    expect(ouvragesTerrasse[0].surfaceNette).toBe(24);
    expect(ouvragesTerrasse[0].materiau).toContain("Terrasse Mobile motorisée");

    const ouvragesCloture = construireOuvragesCloture(
      {
        id: "cl1",
        materiau: "COMPOSITE",
        hauteur_utile_m: 1.8,
        presence_soubassement: true,
      },
      [
        { id: "tr1", code_segment: "A", longueur_m: 12.5, presence_portillon: true, largeur_portillon_m: 1.0 },
        { id: "tr2", code_segment: "B", longueur_m: 8.0, presence_portillon: false },
      ]
    );
    expect(ouvragesCloture).toHaveLength(2);
    expect(ouvragesCloture[0].unite).toBe("ml");
    expect(ouvragesCloture[0].nom).toContain("Portillon 1m");
    expect(ouvragesCloture[0].surfaceNette).toBe(12.5);
  });

  it("adapte le rendu PVReceptionPDF selon le métier (badge, unité ml/m² et checklist de repli)", () => {
    const pvCloture: PVReceptionData = {
      numero: "PV-2026-014",
      date_reception: "2026-11-16",
      statut: "sans_reserve",
      metier: "cloture",
      type_travaux: "Pose de clôture, soubassements et portillons",
      adresse_chantier: "10 Rue des Lilas",
      materiaux_utilises: "Composite + Soubassement béton",
      zones_metres: [
        {
          id: "tr1",
          nom: "Côté A (+ Portillon 1m)",
          type: "facade",
          largeur: 12.5,
          hauteur_mur: 1.8,
          surfaceBrute: 12.5,
          surfaceOuvertures: 0,
          surfaceNette: 12.5,
          unite: "ml",
          materiau: "COMPOSITE",
        },
      ],
      reserves: [],
      observations: null,
      signature_client: null,
      signataire_client_nom: "Client",
      signature_entreprise: null,
      signataire_entreprise_nom: "BNA",
      checklist_repli: {
        nettoyage: true,
        dechets_evacues: true,
        echafaudage_demonte: true,
        fiches_techniques_remises: true,
      },
    };

    const html = renderToStaticMarkup(
      createElement(PVReceptionPDF, {
        pv: pvCloture,
        entreprise: ENTREPRISE_TEST,
        client: { nom: "Jean Martin" },
        chantier: { nom: "Clôture Sud" },
      })
    );

    expect(html).toContain("CLÔTURE");
    expect(html).toContain("12.50 ml");
    expect(html).toContain("Abords nettoyés et repli matériel");
    expect(html).not.toContain("Échafaudage démonté");
  });
});
