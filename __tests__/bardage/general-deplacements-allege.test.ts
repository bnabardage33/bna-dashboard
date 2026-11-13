// __tests__/bardage/general-deplacements-allege.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Allègement du Module Général & Déplacements Bardage", () => {
  const filePath = path.resolve(
    process.cwd(),
    "components/bardage/hub/BardageGeneralDeplacementsModule.tsx"
  );
  const content = fs.readFileSync(filePath, "utf-8");

  describe("1. Retrait complet des sections non pertinentes", () => {
    it("ne contient plus la section 'Exécution Façade & Accès en Hauteur'", () => {
      expect(content).not.toContain("Exécution Façade & Accès en Hauteur");
      expect(content).not.toContain("Matériau structurel");
      expect(content).not.toContain("Zone de vent (Calcul météo)");
      expect(content).not.toContain("setMateriauStructurel");
      expect(content).not.toContain("setMoyenAcces");
      expect(content).not.toContain("setZoneVent");
    });

    it("ne contient plus la section 'Checklist Préparatoire Chantier'", () => {
      expect(content).not.toContain("Checklist Préparatoire Chantier");
      expect(content).not.toContain("tasseaux");
      expect(content).not.toContain("pare_pluie");
      expect(content).not.toContain("finition");
      expect(content).not.toContain("toggleTache");
      expect(content).not.toContain("setChecklist");
    });
  });

  describe("2. Préservation intégrale des éléments légitimes du module", () => {
    it("conserve les informations générales du chantier", () => {
      expect(content).toContain("Informations Générales du Chantier");
      expect(content).toContain("Client");
      expect(content).toContain("Date de début");
      expect(content).toContain("Date de fin prévisionnelle");
      expect(content).toContain("Adresse du chantier");
      expect(content).toContain("Statut opérationnel");
      expect(content).toContain("Code client");
    });

    it("utilise le schéma réel d'itinéraire Google Maps Directions API pour l'adresse", () => {
      expect(content).toContain("google.com/maps/dir/?api=1&destination=");
      expect(content).toContain("travelmode=driving");
    });

    it("conserve le bloc PPSPS Express IA", () => {
      expect(content).toContain("PPSPS Express (Consignes de Sécurité IA)");
      expect(content).toContain("genererSecuriteIA");
      expect(content).toContain("/api/ia-securite");
    });

    it("intègre le moteur et l'interface harmonisée des frais de déplacement (thème clair BNA aligné Terrasse)", () => {
      expect(content).toContain("Frais de Déplacement &amp; Trajets Associés");
      expect(content).toContain("Évaluer un trajet pour ce chantier");
      expect(content).toContain("Trajets &amp; Déplacements Enregistrés");
      expect(content).toContain("useDeplacements");
      expect(content).toContain("composerAdresseDepart");
    });

    it("conserve la passerelle vers le PV de Réception et fin de chantier", () => {
      expect(content).toContain("Fin de Chantier &amp; Procès-Verbal de Réception");
      expect(content).toContain("/bureau/fin-chantier?chantierId=");
    });

    it("conserve le bouton d'enregistrement dédié aux informations générales", () => {
      expect(content).toContain("Enregistrer les modifications");
      expect(content).toContain("Informations enregistrées avec succès");
      expect(content).toContain("handleSauvegarder");
    });
  });

  describe("3. Préservation stricte des données et non-régression technique", () => {
    it("la sauvegarde générale ne modifie ni n'écrase materiau_structurel, moyen_acces, zone_vent ni checklist", () => {
      // Vérifier le payload exact dans handleSauvegarder
      expect(content).toContain("statut,");
      expect(content).toContain("date_debut: dateDebut || null,");
      expect(content).toContain("date_fin: dateFin || null,");
      expect(content).toContain("adresse_chantier: adresse.trim() || null,");

      // S'assurer qu'aucun de ces champs n'est écrasé par le update
      const updateBlock = content.slice(
        content.indexOf(".update({"),
        content.indexOf(".eq(\"id\", chantierId)")
      );
      expect(updateBlock).not.toContain("materiau_structurel");
      expect(updateBlock).not.toContain("moyen_acces");
      expect(updateBlock).not.toContain("zone_vent");
      expect(updateBlock).not.toContain("checklist");
    });

    it("conserve les props optionnelles pour compatibilité ascendante avec les parents", () => {
      expect(content).toContain("materiauStructurel?: Materiau;");
      expect(content).toContain("moyenAcces?: Acces;");
      expect(content).toContain("zoneVent?: number;");
      expect(content).toContain("checklist?: Record<string, boolean>;");
    });
  });
});
