// __tests__/bardage/deplacements-harmonisation.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("BNA-DASHBOARD — Harmonisation Visuelle Déplacements Bardage sur Terrasse", () => {
  const bardageFilePath = path.resolve(
    process.cwd(),
    "components/bardage/hub/BardageGeneralDeplacementsModule.tsx"
  );
  const terrasseFilePath = path.resolve(
    process.cwd(),
    "components/terrasse/hub/TerrasseGeneralDeplacementsModule.tsx"
  );

  const bardageContent = fs.readFileSync(bardageFilePath, "utf-8");
  const terrasseContent = fs.readFileSync(terrasseFilePath, "utf-8");

  describe("1. Structure visuelle reprise 1:1 de Terrasse", () => {
    it("comporte la carte principale Déplacements avec style blanc BNA et icône Car", () => {
      expect(bardageContent).toContain("Frais de Déplacement &amp; Trajets Associés");
      expect(bardageContent).toContain("<Car className=\"h-5 w-5\"");
      expect(bardageContent).toContain("border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]");
    });

    it("affiche le sous-titre explicatif aligné sur le métier bardage", () => {
      expect(bardageContent).toContain(
        "Calcul kilométrique, barème d&apos;indemnités et liaison directe avec les devis bardage"
      );
    });

    it("affiche les indicateurs regroupés en haut à droite (Total trajets & Cumul distance)", () => {
      expect(bardageContent).toContain("Total trajets");
      expect(bardageContent).toContain("Cumul distance");
      expect(bardageContent).toContain("fmtEuro(totalHT)");
      expect(bardageContent).toContain("totalKmAR.toFixed(1)");
    });
  });

  describe("2. Formulaire de calcul d'un trajet", () => {
    it("utilise un conteneur clair structuré bg-[#F8F9FA]", () => {
      expect(bardageContent).toContain("Évaluer un trajet pour ce chantier");
      expect(bardageContent).toContain("bg-[#F8F9FA]");
    });

    it("comporte les champs Départ et Arrivée avec icône MapPin", () => {
      expect(bardageContent).toContain("Départ (Dépôt / Entreprise)");
      expect(bardageContent).toContain("Arrivée (Adresse Bardage)");
      expect(bardageContent).toContain("value={adresseDepart}");
      expect(bardageContent).toContain("value={adresseArrivee}");
      expect(bardageContent).toContain("<MapPin");
    });

    it("comporte le bouton 'Calculer le trajet' et la mention OSRM", () => {
      expect(bardageContent).toContain("Calculer le trajet");
      expect(bardageContent).toContain("Barème fiscal appliqué automatiquement via OpenStreetMap / OSRM");
      expect(bardageContent).toContain("isEvaluating ? \"Calcul de distance...\" : \"Calculer le trajet\"");
    });

    it("gère les états d'évaluation, d'erreur et affiche la bannière de résultat émeraude", () => {
      expect(bardageContent).toContain("evalError");
      expect(bardageContent).toContain("evaluation.distanceAllerKm");
      expect(bardageContent).toContain("evaluation.distanceRetourKm");
      expect(bardageContent).toContain("evaluation.tarifKm");
      expect(bardageContent).toContain("Effacer");
      expect(bardageContent).toContain("Conserver ce déplacement");
    });
  });

  describe("3. Historique des déplacements et responsive mobile", () => {
    it("intègre le tableau clair BNA avec toutes les colonnes requises", () => {
      expect(bardageContent).toContain("Date");
      expect(bardageContent).toContain("Trajet Aller / Retour");
      expect(bardageContent).toContain("Distance A/R");
      expect(bardageContent).toContain("Montant HT");
      expect(bardageContent).toContain("Devis associé");
      expect(bardageContent).toContain("Action");
    });

    it("fournit un conteneur responsive avec overflow-x-auto et min-w-[600px] pour mobile", () => {
      expect(bardageContent).toContain("overflow-x-auto rounded-xl border border-[#E5E5E5]");
      expect(bardageContent).toContain("min-w-[600px]");
      expect(bardageContent).toContain("whitespace-nowrap");
    });

    it("permet la liaison au devis et la suppression avec confirmation", () => {
      expect(bardageContent).toContain("lierAuDevis");
      expect(bardageContent).toContain("supprimerDeplacement");
      expect(bardageContent).toContain("Sélectionner devis...");
      expect(bardageContent).toContain("Voulez-vous vraiment supprimer ce trajet enregistré ?");
      expect(bardageContent).toContain("Action impossible : déplacement déjà rattaché à un devis.");
    });
  });

  describe("4. Suppression des blocs noirs et respect de la charte claire BNA", () => {
    it("ne contient aucun bloc sombre de l'ancienne version (#252525)", () => {
      expect(bardageContent).not.toContain("bg-[#252525]");
      expect(bardageContent).not.toContain("bg-[#1a1a1a]");
      expect(bardageContent).not.toContain("bg-[#121212]");
      expect(bardageContent).not.toContain("border-white/10");
    });

    it("utilise les couleurs et styles de la charte BNA claire", () => {
      expect(bardageContent).toContain("#B85B2B"); // cuivre BNA
      expect(bardageContent).toContain("#23272B"); // anthracite BNA
      expect(bardageContent).toContain("#E5E5E5"); // bordure BNA
      expect(bardageContent).toContain("#F8F9FA"); // fond gris très léger
    });
  });

  describe("5. Préservation absolue du moteur de calcul et des services", () => {
    it("utilise exactement le même hook useDeplacements que le module Terrasse", () => {
      expect(bardageContent).toContain("import { useDeplacements } from \"@/hooks/useDeplacements\";");
      expect(terrasseContent).toContain("import { useDeplacements } from \"@/hooks/useDeplacements\";");
    });

    it("utilise composerAdresseDepart pour le dépôt de l'entreprise", () => {
      expect(bardageContent).toContain("import { composerAdresseDepart } from \"@/lib/deplacement/adresse\";");
      expect(terrasseContent).toContain("import { composerAdresseDepart } from \"@/lib/deplacement/adresse\";");
    });

    it("préserve le formatage monétaire standard fmtEuro", () => {
      expect(bardageContent).toContain("import { fmtEuro } from \"@/lib/financeCalculs\";");
      expect(terrasseContent).toContain("import { fmtEuro } from \"@/lib/financeCalculs\";");
    });
  });
});
