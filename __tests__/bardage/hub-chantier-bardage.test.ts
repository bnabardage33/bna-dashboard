import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Refonte du Hub Chantier Bardage — Harmonisation et Architecture Modulaire", () => {
  it("Navigation intérieure par cartes : expose exactement les 8 modules requis", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/bardage/hub/BardageCardNavigation.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    const modulesRequis = [
      "general",
      "avancement",
      "calepinage",
      "heures",
      "meteo",
      "photos",
      "rapport",
      "documents",
    ];

    for (const m of modulesRequis) {
      expect(content).toContain(`cle: "${m}"`);
    }

    expect(content).toContain('titre: "Général & Déplacements"');
    expect(content).toContain('titre: "Avancement & Façades"');
    expect(content).toContain('titre: "Métrés & Calepinage Bardage"');
  });

  it("Module Général & Déplacements : fusionne les informations générales et les frais de déplacement", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/bardage/hub/BardageGeneralDeplacementsModule.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Informations générales
    expect(content).toContain("Informations Générales du Chantier");
    expect(content).toContain("statut");
    expect(content).toContain("dateDebut");
    expect(content).toContain("adresseChantier");
    expect(content).toContain("PPSPS Express");

    // Intégration du composant FraisDeplacementTab
    expect(content).toContain("FraisDeplacementTab");
    expect(content).toContain("adresseDepartDefaut");
    expect(content).toContain("devisLikables");
  });

  it("Module Avancement : intègre le parcours terrain ossature et le suivi par façades", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/bardage/hub/BardageAvancementModule.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("OssaturePosee");
    expect(content).toContain("AvancementFacades");
  });

  it("Module Métrés & Calepinage : intègre la configuration technique, les zones de bardage et la quincaillerie", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/bardage/hub/BardageCalepinageModule.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("ZoneCard");
    expect(content).toContain("CommandeModal");
    expect(content).toContain("calculerBesoinsBardage");
    expect(content).toContain("type_isolant");
    expect(content).toContain("coef_perte_rendement");
  });

  it("Page contrôleur Hub Bardage : bouton Accueil chantier permanent et suppression de l'onglet Terrasse", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/terrain/chantier/[id]/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Bouton permanent Accueil chantier
    expect(content).toContain('href="/terrain/chantier"');
    expect(content).toContain("Accueil chantier");

    // Plus de sous-onglet horizontal ni de composant terrasse imbriqué
    expect(content).not.toContain('const TABS = ["Général"');
    expect(content).not.toContain("ChantierTerrasseTab");

    // Présence de la navigation par cartes
    expect(content).toContain("BardageCardNavigation");
  });

  it("Contrats de régression : entreprise_settings pour déplacements et lien devis présents", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/terrain/chantier/[id]/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain('from("entreprise_settings")');
    expect(content).toContain('.eq("id", 1)');
    expect(content).toContain('select("adresse, code_postal, ville")');
    expect(content).toContain("adresseDepartDefaut={adresseDepartDefaut}");
    expect(content).toContain("bureau/devis-factures?chantier_id=");
  });
});
