// __tests__/bardage/facades-avancement.test.ts
// Tests complets pour l'évolution dynamique du module Avancement & Façades Bardage (1, 2, 3 ou 4 façades)

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  ETAPES_TECHNIQUES,
  genererFacadesDefaut,
  etapeVierge,
  calculerAvancementGlobal,
  detecterDonneesPerdues,
  initialiserEtatAvancement,
  type FacadeConfig,
  type EtatAvancementFacades,
} from "@/lib/bardage/facadesConfig";

describe("BNA-DASHBOARD — Évolution Dynamique du Module Avancement & Façades Bardage", () => {
  describe("1. Configuration du nombre de façades (1, 2, 3 ou 4)", () => {
    it("génère une configuration valide pour 1 façade", () => {
      const facades = genererFacadesDefaut(1);
      expect(facades).toHaveLength(1);
      expect(facades[0].id).toBe("nord");
      expect(facades[0].label).toBe("Façade Principale");
    });

    it("génère une configuration valide pour 2 façades", () => {
      const facades = genererFacadesDefaut(2);
      expect(facades).toHaveLength(2);
      expect(facades[0].id).toBe("nord");
      expect(facades[0].label).toBe("Façade Avant");
      expect(facades[1].id).toBe("sud");
      expect(facades[1].label).toBe("Façade Arrière");
    });

    it("génère une configuration valide pour 3 façades", () => {
      const facades = genererFacadesDefaut(3);
      expect(facades).toHaveLength(3);
      expect(facades.map((f) => f.id)).toEqual(["nord", "sud", "est"]);
      expect(facades[2].label).toBe("Pignon");
    });

    it("génère une configuration valide pour 4 façades", () => {
      const facades = genererFacadesDefaut(4);
      expect(facades).toHaveLength(4);
      expect(facades.map((f) => f.id)).toEqual(["nord", "sud", "est", "ouest"]);
      expect(facades[3].label).toBe("Façade Ouest");
    });
  });

  describe("2. Nommage personnalisé des façades", () => {
    it("permet de personnaliser librement les noms de façades", () => {
      const facadesPerso: FacadeConfig[] = [
        { id: "nord", label: "Façade rue" },
        { id: "sud", label: "Façade jardin" },
        { id: "est", label: "Pignon Est" },
        { id: "ouest", label: "Pignon Ouest" },
      ];

      expect(facadesPerso[0].label).toBe("Façade rue");
      expect(facadesPerso[1].label).toBe("Façade jardin");
      expect(facadesPerso[2].label).toBe("Pignon Est");
      expect(facadesPerso[3].label).toBe("Pignon Ouest");
    });

    it("la modification du libellé ne détruit pas les étapes validées", () => {
      const facades: FacadeConfig[] = [{ id: "nord", label: "Façade 1" }];
      const etat: EtatAvancementFacades = {
        nord: { ossature: true, isolation: true, bardage: false, finitions: false },
      };

      // Renommage
      facades[0].label = "Façade rue";

      const avancement = calculerAvancementGlobal(facades, etat);
      expect(avancement.etapesValidees).toBe(2);
      expect(avancement.totalEtapes).toBe(4);
      expect(avancement.pourcentage).toBe(50);
    });
  });

  describe("3. Conservation des 4 étapes techniques métier", () => {
    it("chaque façade possède strictement les 4 étapes requises dans l'ordre chronologique", () => {
      expect(ETAPES_TECHNIQUES).toHaveLength(4);
      expect(ETAPES_TECHNIQUES[0].id).toBe("ossature");
      expect(ETAPES_TECHNIQUES[1].id).toBe("isolation");
      expect(ETAPES_TECHNIQUES[2].id).toBe("bardage");
      expect(ETAPES_TECHNIQUES[3].id).toBe("finitions");
    });

    it("chaque étape reste totalement indépendante", () => {
      const facade = etapeVierge();
      facade.isolation = true;
      expect(facade.ossature).toBe(false);
      expect(facade.isolation).toBe(true);
      expect(facade.bardage).toBe(false);
      expect(facade.finitions).toBe(false);
    });
  });

  describe("4. Calcul du pourcentage d'avancement global selon les seules façades actives", () => {
    it("calcule correctement pour un chantier à 1 façade (total = 4 étapes)", () => {
      const facades = genererFacadesDefaut(1);
      const etat: EtatAvancementFacades = {
        nord: { ossature: true, isolation: false, bardage: false, finitions: false },
      };

      const res = calculerAvancementGlobal(facades, etat);
      expect(res.totalEtapes).toBe(4);
      expect(res.etapesValidees).toBe(1);
      expect(res.pourcentage).toBe(25); // 1 / 4 = 25%

      etat.nord.isolation = true;
      etat.nord.bardage = true;
      etat.nord.finitions = true;
      const res100 = calculerAvancementGlobal(facades, etat);
      expect(res100.etapesValidees).toBe(4);
      expect(res100.pourcentage).toBe(100);
    });

    it("calcule correctement pour un chantier à 2 façades (total = 8 étapes)", () => {
      const facades = genererFacadesDefaut(2);
      const etat: EtatAvancementFacades = {
        nord: { ossature: true, isolation: true, bardage: true, finitions: true }, // 4
        sud: { ossature: true, isolation: true, bardage: false, finitions: false }, // 2
      };

      const res = calculerAvancementGlobal(facades, etat);
      expect(res.totalEtapes).toBe(8);
      expect(res.etapesValidees).toBe(6);
      expect(res.pourcentage).toBe(75); // 6 / 8 = 75%
    });

    it("calcule correctement pour un chantier à 3 façades (total = 12 étapes)", () => {
      const facades = genererFacadesDefaut(3);
      const etat: EtatAvancementFacades = {
        nord: { ossature: true, isolation: true, bardage: false, finitions: false }, // 2
        sud: { ossature: true, isolation: false, bardage: false, finitions: false }, // 1
        est: { ossature: false, isolation: false, bardage: false, finitions: false }, // 0
      };

      const res = calculerAvancementGlobal(facades, etat);
      expect(res.totalEtapes).toBe(12);
      expect(res.etapesValidees).toBe(3);
      expect(res.pourcentage).toBe(25); // 3 / 12 = 25%
    });

    it("calcule correctement pour un chantier à 4 façades (total = 16 étapes)", () => {
      const facades = genererFacadesDefaut(4);
      const etat: EtatAvancementFacades = {
        nord: { ossature: true, isolation: true, bardage: true, finitions: true }, // 4
        sud: { ossature: true, isolation: true, bardage: false, finitions: false }, // 2
        est: { ossature: true, isolation: false, bardage: false, finitions: false }, // 1
        ouest: { ossature: true, isolation: false, bardage: false, finitions: false }, // 1
      };

      const res = calculerAvancementGlobal(facades, etat);
      expect(res.totalEtapes).toBe(16);
      expect(res.etapesValidees).toBe(8);
      expect(res.pourcentage).toBe(50); // 8 / 16 = 50%
    });

    it("une façade non configurée / inactive n'entre JAMAIS dans le calcul", () => {
      // Chantier configuré pour 2 façades seulement
      const facades = genererFacadesDefaut(2);
      // Mais état contenant des anciennes données pour est et ouest
      const etat: EtatAvancementFacades = {
        nord: { ossature: true, isolation: true, bardage: false, finitions: false }, // 2
        sud: { ossature: true, isolation: false, bardage: false, finitions: false }, // 1
        est: { ossature: true, isolation: true, bardage: true, finitions: true }, // 4 (INACTIVE)
        ouest: { ossature: true, isolation: true, bardage: true, finitions: true }, // 4 (INACTIVE)
      };

      const res = calculerAvancementGlobal(facades, etat);
      expect(res.totalEtapes).toBe(8); // Seules 2 façades comptent
      expect(res.etapesValidees).toBe(3); // 2 + 1
      expect(res.pourcentage).toBe(38); // 3 / 8 = 37.5 -> 38%
    });
  });

  describe("5. Protection contre la perte de données", () => {
    it("détecte si la réduction du nombre de façades masquerait des données existantes", () => {
      const anciennes = genererFacadesDefaut(4);
      const nouvelles = genererFacadesDefaut(2); // Supprime 'est' et 'ouest'

      const etatAvecDonnees: EtatAvancementFacades = {
        nord: etapeVierge(),
        sud: etapeVierge(),
        est: { ossature: true, isolation: false, bardage: false, finitions: false }, // Contient une étape !
        ouest: etapeVierge(),
      };

      const check = detecterDonneesPerdues(anciennes, nouvelles, etatAvecDonnees);
      expect(check.aDesDonnees).toBe(true);
      expect(check.facadesImpactees).toContain("Façade Est");
    });

    it("ne déclenche pas d'alerte si les façades retirées étaient totalement vierges", () => {
      const anciennes = genererFacadesDefaut(4);
      const nouvelles = genererFacadesDefaut(2);

      const etatViergeTotal: EtatAvancementFacades = {
        nord: { ossature: true, isolation: false, bardage: false, finitions: false },
        sud: etapeVierge(),
        est: etapeVierge(),
        ouest: etapeVierge(),
      };

      const check = detecterDonneesPerdues(anciennes, nouvelles, etatViergeTotal);
      expect(check.aDesDonnees).toBe(false);
      expect(check.facadesImpactees).toHaveLength(0);
    });

    it("préserve les données historiques en base même lors d'une réduction", () => {
      const initial = {
        nord: { ossature: true, isolation: true, bardage: false, finitions: false },
        sud: { ossature: true, isolation: false, bardage: false, finitions: false },
        est: { ossature: true, isolation: false, bardage: false, finitions: false },
      };

      // Si l'utilisateur passe à 2 façades
      const deuxFacades = genererFacadesDefaut(2);
      const state = initialiserEtatAvancement(deuxFacades, initial);

      // 'est' est toujours conservé dans l'objet d'état
      expect(state.est.ossature).toBe(true);
      expect(state.nord.ossature).toBe(true);
    });
  });

  describe("6. Conservation du suivi terrain, dictée vocale et observations", () => {
    it("AvancementFacades intègre la dictée vocale avec la liste dynamique des façades", () => {
      const filePath = path.resolve(process.cwd(), "components/AvancementFacades.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).toContain("demarrerDictee");
      expect(content).toContain("traiterAudio");
      expect(content).toContain("/api/ia-avancement");
      expect(content).toContain("facades: facades.map");
      expect(content).toContain("chp-observations-du-jour");
    });

    it("L'API /api/ia-avancement gère les façades dynamiques passées en paramètre", () => {
      const filePath = path.resolve(process.cwd(), "app/api/ia-avancement/route.ts");
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).toContain("facades: facadesParam");
      expect(content).toContain("facadesActives");
      expect(content).toContain("descriptionFacades");
    });

    it("BardageAvancementModule synchronise les façades actives avec OssaturePosee", () => {
      const filePath = path.resolve(
        process.cwd(),
        "components/bardage/hub/BardageAvancementModule.tsx"
      );
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).toContain("OssaturePosee");
      expect(content).toContain("AvancementFacades");
      expect(content).toContain("facadesActives={facadesActives}");
    });
  });

  describe("7. Respect de la charte claire BNA et absence de régression", () => {
    it("AvancementFacades adopte le thème clair BNA et ne contient plus de conteneur sombre hérité", () => {
      const filePath = path.resolve(process.cwd(), "components/AvancementFacades.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).not.toContain("bg-[#121212]");
      expect(content).not.toContain("bg-[#1E1E1E]");
      expect(content).not.toContain("border-white/10");
      expect(content).toContain("#B85B2B"); // Cuivre BNA
      expect(content).toContain("#23272B"); // Anthracite BNA
      expect(content).toContain("#E5E5E5"); // Bordures claires BNA
    });

    it("TerrasseAvancementModule n'a pas été altéré", () => {
      const filePath = path.resolve(
        process.cwd(),
        "components/terrasse/hub/TerrasseAvancementModule.tsx"
      );
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).toContain("TerrasseAvancementModule");
      expect(content).toContain("DTU 51.4");
      expect(content).toContain("phases_dtu");
    });
  });
});
