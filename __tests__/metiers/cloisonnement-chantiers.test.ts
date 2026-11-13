// __tests__/metiers/cloisonnement-chantiers.test.ts
// Tests unitaires et d'intégration du cloisonnement multi-métiers Bardage / Terrasse (Phase E)

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Phase E — Sécurisation du Cloisonnement Métier Bardage / Terrasse", () => {
  it("1. NouveauChantierTerrasseModal : injecte explicitement metier = 'terrasse' dans l'insert SQL", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/terrasse/NouveauChantierTerrasseModal.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Vérifie que l'insertion chantier racine déclare expressément la colonne SQL metier
    expect(content).toContain('metier: "terrasse"');
    expect(content).toContain('.from("chantiers")');
    expect(content).toContain('.insert(');
  });

  it("2. Création Bardage (/terrain/chantier) : injecte explicitement metier = 'bardage'", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/terrain/chantier/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Vérifie que la création manuelle d'un chantier bardage affecte metier = 'bardage'
    expect(content).toContain('metier: "bardage"');
    expect(content).toContain('checklist: { tasseaux: false, pare_pluie: false, pose: false, finition: false }');
  });

  it("3. Filtrage liste Bardage (/terrain/chantier) : exclut hermétiquement les chantiers Terrasse", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/terrain/chantier/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Présence du filtre SQL combiné : bardage explicite ou historique NULL, hors corbeille
    expect(content).toContain('.or("metier.eq.bardage,metier.is.null")');
    expect(content).toContain('.neq("statut", "corbeille")');

    // Présence du garde-fou applicatif vérifiant l'absence de terrasse liée
    expect(content).toContain('if (c.metier === "terrasse") return false;');
    expect(content).toContain('if (Array.isArray(c.chantier_terrasses) && c.chantier_terrasses.length > 0) return false;');
  });

  it("4. Conversion Devis → Chantier : modale obligatoire avec choix explicite Bardage / Terrasse", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/bureau/devis-factures/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Présence de la modale de qualification obligatoire
    expect(content).toContain("devisToConvert");
    expect(content).toContain("data-testid=\"option-conversion-bardage\"");
    expect(content).toContain("data-testid=\"option-conversion-terrasse\"");
    expect(content).toContain("data-testid=\"confirmer-conversion-chantier\"");

    // Affectation conditionnelle du métier choisi
    expect(content).toContain("metier: metierChoisi");
    expect(content).toContain("isTerrasse");
    expect(content).toContain('nom: "Terrasse principale"');
  });

  it("5. Hub Bardage : sécurisation du routage URL face aux paramètres de module invalides", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/terrain/chantier/[id]/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Présence de la fonction de validation stricte des clés
    expect(content).toContain("MODULES_BARDAGE_VALIDES");
    expect(content).toContain("validerCleModule");
    expect(content).toContain("MODULES_BARDAGE_VALIDES.includes");
  });

  it("6. Route API Terrasse : contrôle strict de l'appartenance métier du chantier", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/api/chantiers/[id]/terrasse/route.ts"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Vérification du contrôle métier dans le GET et le POST
    expect(content).toContain('chantier.metier && chantier.metier !== "terrasse"');
    expect(content).toContain("Incohérence métier");
  });

  it("7. Hub Bardage : protection contre l'accès direct et redirection des chantiers Terrasse", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/terrain/chantier/[id]/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Vérifie que si le chantier chargé est de type Terrasse, une redirection est déclenchée
    expect(content).toContain('if (donnees.metier === "terrasse")');
    expect(content).toContain("router.replace(`/terrain/terrasse/${chantierId}`)");
  });

  it("8. Route & Service Métré complet : refus des chantiers dont le métier n'est pas Bardage", () => {
    const servicePath = path.resolve(
      process.cwd(),
      "lib/servir-metre-complet.ts"
    );
    const serviceContent = fs.readFileSync(servicePath, "utf-8");
    expect(serviceContent).toContain("MetierIncompatibleError");
    expect(serviceContent).toContain('if (chantier.metier && chantier.metier !== "bardage")');

    const routePath = path.resolve(
      process.cwd(),
      "app/api/chantiers/[id]/metre-complet/route.ts"
    );
    const routeContent = fs.readFileSync(routePath, "utf-8");
    expect(routeContent).toContain("MetierIncompatibleError");
    expect(routeContent).toContain("status: 400");
  });
});
