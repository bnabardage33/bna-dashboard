// __tests__/bardage/modifier-chantier-bardage.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Action Modifier — Cartes Chantiers Bardage & Modale d'Édition", () => {
  const pagePath = path.resolve(process.cwd(), "app/terrain/chantier/page.tsx");
  const modalPath = path.resolve(
    process.cwd(),
    "components/bardage/ModifierChantierBardageModal.tsx"
  );

  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const modalContent = fs.readFileSync(modalPath, "utf-8");

  describe("1. Présentation visuelle & Intégration sur la carte (/terrain/chantier)", () => {
    it("expose le bouton Modifier avec icône Pencil et libellé 'Modifier'", () => {
      expect(pageContent).toContain("ModifierChantierBardageModal");
      expect(pageContent).toContain("setChantierAModifier(ch)");
      expect(pageContent).toContain("<Pencil");
      expect(pageContent).toContain("Modifier</span>");
    });

    it("utilise le style discret harmonisé BNA avec accent cuivre #B85B2B au survol", () => {
      expect(pageContent).toContain("hover:border-[#B85B2B]/40");
      expect(pageContent).toContain("hover:text-[#B85B2B]");
      expect(pageContent).toContain("border-[#E5E5E5]");
    });

    it("respecte la disposition responsive fluide en grille équilibrée 2 colonnes sans chevauchement", () => {
      // Les 4 actions secondaires sont réparties dans une grille équilibrée de deux colonnes
      expect(pageContent).toContain("grid grid-cols-2 gap-2");

      // Le bouton d'ouverture du Hub occupe la pleine largeur sur la ligne inférieure avec hauteur maîtrisée h-9
      expect(pageContent).toContain("inline-flex h-9 w-full items-center justify-center");
      expect(pageContent).toContain("<span>Ouvrir Hub Bardage</span>");

      // Préservation des actions existantes sans régression
      expect(pageContent).toContain("🗺️ GPS Itinéraire");
      expect(pageContent).toContain('"Lien client"');
      expect(pageContent).toContain("setChantierAMettreEnCorbeille(ch)");
      expect(pageContent).toContain("Corbeille</span>");
    });
  });

  describe("2. Modale de modification des informations générales (ModifierChantierBardageModal)", () => {
    it("déclare et expose tous les champs éditables requis", () => {
      // Identification
      expect(modalContent).toContain('id="mod-nom-du-chantier"');
      expect(modalContent).toContain('id="mod-client-associe"');
      expect(modalContent).toContain('id="mod-statut-chantier"');

      // Localisation & Planning
      expect(modalContent).toContain('id="mod-adresse-du-site"');
      expect(modalContent).toContain('id="mod-date-debut-prevue"');
      expect(modalContent).toContain('id="mod-date-fin-estimee"');

      // Spécifications techniques bardage
      expect(modalContent).toContain('id="mod-materiau-predominant"');
      expect(modalContent).toContain('id="mod-moyen-acces"');
      expect(modalContent).toContain('id="mod-zone-vent"');

      // Contact & Notes
      expect(modalContent).toContain('id="mod-contact-chantier"');
      expect(modalContent).toContain('id="mod-notes-terrain"');
    });

    it("propose les trois statuts valides pour un chantier en cours de cycle", () => {
      expect(modalContent).toContain('<option value="prevu">Prévu (Non démarré)</option>');
      expect(modalContent).toContain('<option value="en_cours">En cours de réalisation</option>');
      expect(modalContent).toContain('<option value="termine">Terminé (Livré)</option>');
    });

    it("préremplit fidèlement les champs lors de l'ouverture", () => {
      expect(modalContent).toContain("setNom(chantier.nom || \"\")");
      expect(modalContent).toContain("setClientId(chantier.client_id || \"\")");
      expect(modalContent).toContain("setAdresse(chantier.adresse_chantier || \"\")");
      expect(modalContent).toContain("setStatut(");
      expect(modalContent).toContain("setDateDebut(");
      expect(modalContent).toContain("setDateFin(");
      expect(modalContent).toContain("setMateriauStructurel(");
      expect(modalContent).toContain("setMoyenAcces(");
      expect(modalContent).toContain("setZoneVent(");
    });

    it("met à jour immédiatement l'affichage local via onSucces", () => {
      expect(modalContent).toContain("onSucces({");
      expect(modalContent).toContain("id: chantier.id");
      expect(modalContent).toContain("clients: clientSelect");
      expect(pageContent).toContain("setChantiers((prev) =>");
      expect(pageContent).toContain("prev.map((c) => (c.id === modifie.id ? { ...c, ...modifie } : c))");
    });
  });

  describe("3. Sécurité métier, RLS & Cloisonnement étanche", () => {
    it("conserve impérativement metier = 'bardage' lors de la mise à jour", () => {
      expect(modalContent).toContain('metier: "bardage"');
    });

    it("bloque catégoriquement toute modification si le chantier est de type terrasse", () => {
      expect(modalContent).toContain('if (chantier.metier === "terrasse")');
      expect(modalContent).toContain("Action non autorisée");
    });

    it("applique le contrôle d'isolation multi-tenant fail-closed", () => {
      expect(modalContent).toContain("resoudreContexteEntreprise(null)");
      expect(modalContent).toContain("if (!estUuid(entreprise_id))");
      expect(modalContent).toContain('.eq("entreprise_id", entreprise_id)');
    });

    it("ne modifie aucune table technique (façades, calepinage, métrés, facturation)", () => {
      // La modale n'écrit que dans la table chantiers
      expect(modalContent).toContain('.from("chantiers")');
      expect(modalContent).not.toContain('.from("chantier_zones")');
      expect(modalContent).not.toContain('.from("calepinage_zones")');
      expect(modalContent).not.toContain('.from("factures")');
      expect(modalContent).not.toContain('.from("devis")');
    });

    it("préserve les frais de déplacement lors du changement d'adresse", () => {
      // Aucune suppression ni écrasement dans frais_deplacement
      expect(modalContent).not.toContain('.from("frais_deplacement").delete');
      expect(modalContent).not.toContain('.from("frais_deplacement").update');
    });
  });
});
