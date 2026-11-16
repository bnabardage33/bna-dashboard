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
      expect(PAGE_CHANTIER).toContain("max-w-7xl");
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

  describe("Grille des Métiers (Bardage, Terrasse, Clôture)", () => {
    it("la grille des métiers s'adapte sur 1 colonne mobile et 3 colonnes desktop", () => {
      expect(ACCUEIL_PRO).toContain("grid-cols-1");
      expect(ACCUEIL_PRO).toContain("md:grid-cols-3");
    });

    it("les cartes métiers disposent d'effets visuels et de hauteur minimale adaptée", () => {
      expect(ACCUEIL_PRO).toContain("min-h-44");
      expect(ACCUEIL_PRO).toContain("group-hover:-translate-y-1");
      expect(ACCUEIL_PRO).toContain("group-hover:border-[#B85B2B]/60");
    });
  });

  describe("Accès rapides du socle commun", () => {
    it("la grille s'adapte en 2 cols (mobile), 3 cols (tablette) et 6 cols (desktop)", () => {
      expect(ACCUEIL_PRO).toContain("grid-cols-2");
      expect(ACCUEIL_PRO).toContain("sm:grid-cols-3");
      expect(ACCUEIL_PRO).toContain("lg:grid-cols-6");
    });

    it("tous les accès rapides ont des cibles tactiles confortables (min-h-12)", () => {
      expect(ACCUEIL_PRO).toContain("min-h-12");
      expect(ACCUEIL_PRO).toContain("hover:-translate-y-0.5");
    });
  });

  describe("Cockpit DashboardAccueil et 5 blocs fonctionnels", () => {
    it("les 5 blocs fonctionnels ordonnés sont préservés", () => {
      expect(DASHBOARD).toContain("Votre activité");
      expect(DASHBOARD).toContain("Météo générale");
      expect(DASHBOARD).toContain("Impact météo sur les chantiers");
      expect(DASHBOARD).toContain("Chantiers à préparer");
      expect(DASHBOARD).toContain("Notes & alertes");
    });

    it("l'assistant vocal BoutonMicroNote et sa bulle de statut restent actifs", () => {
      expect(DASHBOARD).toContain("BoutonMicroNote");
      expect(DASHBOARD).toContain("handleTexteReformule");
      expect(DASHBOARD).toContain('role="status"');
    });

    it("la grille principale 12 colonnes optimise la météo et l'impact sur desktop", () => {
      expect(DASHBOARD).toContain(
        "grid grid-cols-1 items-start gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-12"
      );
      expect(DASHBOARD).toContain('className="xl:col-span-5"');
      expect(DASHBOARD).toContain('className="xl:col-span-7"');
    });

    it("les cartes de chantiers à préparer disposent d'indicateurs interactifs", () => {
      expect(DASHBOARD).toContain("hover:-translate-y-0.5");
      expect(DASHBOARD).toContain("hover:border-[#B85B2B]/50");
      expect(DASHBOARD).toContain("group-hover:text-[#B85B2B]");
    });

    it("les cartes de notes récentes disposent d'un feedback au survol", () => {
      expect(DASHBOARD).toContain("hover:-translate-y-0.5");
      expect(DASHBOARD).toContain("hover:border-[#B85B2B]/50");
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
          // Mobile : 1 col pour métiers, 2 cols pour accès rapides, 1 col pour dashboard
          expect(ACCUEIL_PRO).toContain("grid-cols-1");
          expect(ACCUEIL_PRO).toContain("grid-cols-2");
          expect(DASHBOARD).toContain("grid-cols-1");
        } else if (w < 1024) {
          // Tablette : 3 cols pour métiers, 3 cols pour accès rapides, 2 cols pour dashboard
          expect(ACCUEIL_PRO).toContain("md:grid-cols-3");
          expect(ACCUEIL_PRO).toContain("sm:grid-cols-3");
          expect(DASHBOARD).toContain("md:grid-cols-2");
        } else {
          // Desktop (>= 1024px) : 3 cols pour métiers, 6 cols pour accès rapides, grille 12 cols
          expect(ACCUEIL_PRO).toContain("md:grid-cols-3");
          expect(ACCUEIL_PRO).toContain("lg:grid-cols-6");
          expect(DASHBOARD).toContain("xl:grid-cols-12");
          expect(DASHBOARD).toContain("xl:col-span-5");
          expect(DASHBOARD).toContain("xl:col-span-7");
        }
      });
    });
  });
});
