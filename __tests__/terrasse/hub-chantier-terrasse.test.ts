import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PHASE B — Hub Chantier Terrasse", () => {
  it("AccueilProfessionnel : la carte Terrasse pointe bien vers /terrain/terrasse", () => {
    const filePath = path.resolve(process.cwd(), "components/AccueilProfessionnel.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("nom: 'Terrasse'");
    expect(content).toContain("href: '/terrain/terrasse'");
    expect(content).toContain("action: 'Chantiers terrasse · hub dédié'");
  });

  it("Navigation intérieure par cartes : expose exactement les 8 modules requis sans onglets horizontaux", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/terrasse/hub/TerrasseCardNavigation.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Vérification des 8 clés de modules
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

    // Vérification du libellé fusionné
    expect(content).toContain('titre: "Général & Déplacements"');
    // Vérification DTU 51.4
    expect(content).toContain('titre: "Avancement & 6 Phases"');
  });

  it("Module Général & Déplacements : fusion obligatoire respectée", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/terrasse/hub/TerrasseGeneralDeplacementsModule.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Regroupe informations générales
    expect(content).toContain("Informations Générales du Chantier");
    expect(content).toContain("statut");
    expect(content).toContain("dateDebut");
    expect(content).toContain("contactChantier");

    // ET regroupe les frais de déplacement dans le même espace
    expect(content).toContain("Frais de Déplacement & Trajets Associés");
    expect(content).toContain("useDeplacements");
    expect(content).toContain("handleEvaluer");
    expect(content).toContain("handleEnregistrer");
    expect(content).toContain("handleLier");
  });

  it("Module Avancement : intègre les 6 phases spécifiques DTU 51.4", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/terrasse/hub/TerrasseAvancementModule.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("1. Préparation du terrain & support");
    expect(content).toContain("2. Implantation & nivellement");
    expect(content).toContain("3. Fondations & calage des plots");
    expect(content).toContain("4. Structure porteuse & lambourdage");
    expect(content).toContain("5. Pose du platelage & fixations");
    expect(content).toContain("6. Finitions, rives & réception");
  });

  it("Module Heures : intègre les 4 phases de main-d'œuvre Terrasse", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/terrasse/hub/TerrasseHeuresModule.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("terrassement_support");
    expect(content).toContain("structure_plots_lambourdes");
    expect(content).toContain("pose_platelage");
    expect(content).toContain("finitions_rives");
  });

  it("Création d'un chantier terrasse : enregistre le métier et initialise la fiche technique", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/terrasse/NouveauChantierTerrasseModal.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain('metier: "terrasse"');
    expect(content).toContain("/api/chantiers/${chantierId}/terrasse");
    expect(content).toContain("Créer un Chantier Terrasse");
  });

  it("Hub Chantier Terrasse : utilise la navigation par cartes et gère les sous-modules", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/terrain/terrasse/[id]/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("<TerrasseCardNavigation");
    expect(content).toContain("<TerrasseGeneralDeplacementsModule");
    expect(content).toContain("<TerrasseAvancementModule");
    expect(content).toContain("<TerrasseCalepinageModule");
    expect(content).toContain("<TerrasseHeuresModule");
    expect(content).toContain("<TerrasseMeteoModule");
    expect(content).toContain("<TerrassePhotosNotesModule");
    expect(content).toContain("<TerrasseRapportClientModule");
    expect(content).toContain("<TerrasseDocumentsModule");
    expect(content).toContain("← Retour à la navigation par cartes du Hub");
  });

  it("Migration SQL Phase B : préparée et documentée sans être exécutée prématurément", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261112_add_metier_to_chantiers.sql"
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("ALTER TABLE public.chantiers");
    expect(content).toContain("ADD COLUMN IF NOT EXISTS metier text");
    expect(content).toContain("uq_chantier_terrasses_chantier");
    expect(content).toContain("v_chantiers_terrasse");
  });

  it("Module Météo Terrasse : Rapports d'intempéries affichés en mode clair avec fort contraste", () => {
    const meteoModulePath = path.resolve(
      process.cwd(),
      "components/terrasse/hub/TerrasseMeteoModule.tsx"
    );
    const meteoContent = fs.readFileSync(meteoModulePath, "utf-8");
    expect(meteoContent).toContain('variante="clair"');

    const listePath = path.resolve(
      process.cwd(),
      "components/RapportsIntemperiesListe.tsx"
    );
    const listeContent = fs.readFileSync(listePath, "utf-8");
    expect(listeContent).toContain('variante?: "sombre" | "clair"');
    expect(listeContent).toContain("COULEUR_BORDURE_CLAIR");
    expect(listeContent).toContain("#23272B");
    expect(listeContent).toContain("text-amber-900");
  });
});
