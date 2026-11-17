import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const CODE = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const DASHBOARD = CODE(lire("components/DashboardAccueil.tsx"));
const ACCUEIL_PRO = CODE(lire("components/AccueilProfessionnel.tsx"));
const PAGE_CHANTIER = CODE(lire("app/terrain/accueil/page.tsx"));

describe("Phase 2 — Accueil & Cockpit Principal Responsive", () => {
  describe("Structure et conteneur principal", () => {
    it("la page Accueil Chantier utilise un conteneur borné et centré", () => {
      expect(PAGE_CHANTIER).toContain("max-w-6xl");
      expect(PAGE_CHANTIER).toContain("mx-auto");
      expect(PAGE_CHANTIER).toContain("px-4");
      expect(PAGE_CHANTIER).toContain("<AccueilProfessionnel");
      expect(PAGE_CHANTIER).toContain("<DashboardAccueil");
    });

    it("l'en-tête de bienvenue s'adapte entre mobile et grand écran", () => {
      expect(ACCUEIL_PRO).toContain("lg:flex");
      expect(ACCUEIL_PRO).toContain("lg:items-center");
      expect(ACCUEIL_PRO).toContain("lg:justify-between");
      expect(ACCUEIL_PRO).not.toContain("BNA Bardage"); // Pas de doublon avec le logo
    });
  });

  describe("Grille des Métiers & BNA-IA (Bardage, Terrasse, Clôture, BNA-IA)", () => {
    it("la grille des métiers s'adapte en 1 col mobile, 2x2 tablette et 4 cols desktop", () => {
      expect(ACCUEIL_PRO).toContain("grid-cols-1");
      expect(ACCUEIL_PRO).toContain("sm:grid-cols-2");
      expect(ACCUEIL_PRO).toContain("lg:grid-cols-4");
    });

    it("les cartes métiers disposent d'effets visuels et de hauteur minimale adaptée", () => {
      expect(ACCUEIL_PRO).toContain("min-h-40");
      expect(ACCUEIL_PRO).toContain("group-hover:-translate-y-0.5");
      expect(ACCUEIL_PRO).toContain("group-hover:border-[#B85B2B]/50");
    });
  });

  describe("Section métiers sans grille socle commun", () => {
    it("la section métiers inclut l'emplacement réservé BNA-IA sans grille socle commun", () => {
      expect(ACCUEIL_PRO).toContain("BNA-IA · Centre de contrôle IA");
      expect(ACCUEIL_PRO).toContain("border-dashed border-[#B85B2B]/40");
      expect(ACCUEIL_PRO).not.toContain("ACCES_TRANSVERSES");
    });

    it("les cartes métiers utilisent la charte claire BNA", () => {
      expect(ACCUEIL_PRO).toContain("border-[#E5E5E5]");
      expect(ACCUEIL_PRO).toContain("bg-white");
      expect(ACCUEIL_PRO).toContain("group-hover:-translate-y-0.5");
    });
  });

  describe("Cockpit DashboardAccueil et structure épurée", () => {
    it("les blocs fonctionnels ordonnés sont préservés", () => {
      expect(DASHBOARD).toContain("Actions rapides du jour");
      expect(DASHBOARD).toContain("Impact météo sur les chantiers actifs");
      expect(DASHBOARD).toContain("Chantiers à préparer");
      expect(DASHBOARD).toContain("Alertes");
      expect(DASHBOARD).toContain("Dernières notes vocales");
    });

    it("l'assistant vocal BoutonMicroNote et sa bulle de statut restent actifs", () => {
      expect(DASHBOARD).toContain("BoutonMicroNote");
      expect(DASHBOARD).toContain("handleTexteReformule");
      expect(DASHBOARD).toContain('role="status"');
    });

    it("le cockpit quotidien s'organise en 2 colonnes sur desktop", () => {
      expect(DASHBOARD).toContain("grid grid-cols-1 items-start gap-5 lg:grid-cols-2");
    });

    it("les cartes de chantiers à préparer disposent d'indicateurs interactifs", () => {
      expect(DASHBOARD).toContain("hover:border-[#B85B2B]/50");
      expect(DASHBOARD).toContain("group-hover:text-[#B85B2B]");
    });

    it("les cartes de notes récentes disposent d'un feedback au survol", () => {
      expect(DASHBOARD).toContain("hover:border-[#B85B2B]/40");
      expect(DASHBOARD).toContain("hover:bg-white");
    });
  });

  describe("Matrice des paliers responsive (360, 390, 768, 1024, 1280, 1440 px)", () => {
    const PALIERS = [
      { w: 360, type: "Mobile compact" },
      { w: 390, type: "Mobile standard" },
      { w: 768, type: "Tablette portrait" },
      { w: 1024, type: "Desktop compact / Tablette paysage" },
      { w: 1280, type: "Desktop standard" },
      { w: 1440, type: "Desktop large / QHD" },
    ];

    PALIERS.forEach(({ w, type }) => {
      it(`le layout est conforme au palier ${w}px (${type})`, () => {
        if (w < 768) {
          expect(ACCUEIL_PRO).toContain("grid-cols-1");
          expect(DASHBOARD).toContain("grid-cols-1");
        } else if (w < 1024) {
          expect(ACCUEIL_PRO).toContain("sm:grid-cols-2");
          expect(DASHBOARD).toContain("grid-cols-1");
        } else {
          expect(ACCUEIL_PRO).toContain("lg:grid-cols-4");
          expect(DASHBOARD).toContain("lg:grid-cols-2");
        }
      });
    });
  });
});
