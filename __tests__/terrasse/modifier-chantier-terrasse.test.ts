// __tests__/terrasse/modifier-chantier-terrasse.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { extraireFicheTerrasse } from "@/components/terrasse/ModifierChantierTerrasseModal";

describe("OBJECTIFS 2, 3 & 4 — Carte Terrasse & Modale de Modification Corrigée", () => {
  const pagePath = path.resolve(process.cwd(), "app/terrain/terrasse/page.tsx");
  const modalPath = path.resolve(
    process.cwd(),
    "components/terrasse/ModifierChantierTerrasseModal.tsx"
  );

  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const modalContent = fs.readFileSync(modalPath, "utf-8");

  describe("1. Harmonisation de la carte Terrasse (/terrain/terrasse)", () => {
    it("expose la grille équilibrée de deux colonnes (2x2) pour les actions secondaires", () => {
      expect(pageContent).toContain("grid grid-cols-2 gap-2");
    });

    it("contient l'action Modifier avec icône Pencil et style cuivré BNA", () => {
      expect(pageContent).toContain("ModifierChantierTerrasseModal");
      expect(pageContent).toContain("setChantierAModifier(c)");
      expect(pageContent).toContain("<Pencil");
      expect(pageContent).toContain("Modifier</span>");
      expect(pageContent).toContain("hover:border-[#B85B2B]/40");
      expect(pageContent).toContain("hover:text-[#B85B2B]");
    });

    it("contient l'action GPS Itinéraire réel avec lien Directions API", () => {
      expect(pageContent).toContain("🗺️ GPS Itinéraire");
      expect(pageContent).toContain("google.com/maps/dir/?api=1&destination=");
      expect(pageContent).toContain("travelmode=driving");
    });

    it("contient l'action Lien client avec copie du code d'accès et toast visuel", () => {
      expect(pageContent).toContain('"Lien client"');
      expect(pageContent).toContain("Copié !");
      expect(pageContent).toContain("setCopiedId(c.id)");
      expect(pageContent).toContain("/espace-client/");
    });

    it("conserve l'action Corbeille avec traitement rouge doux et libellé 'Corbeille'", () => {
      expect(pageContent).toContain("setChantierAMettreEnCorbeille(c)");
      expect(pageContent).toContain("<Trash2");
      expect(pageContent).toContain("Corbeille</span>");
      expect(pageContent).toContain("text-red-500");
      expect(pageContent).toContain("bg-red-50");
    });

    it("expose le bouton principal 'Ouvrir Hub Terrasse' en pleine largeur sous la grille avec hauteur maîtrisée h-9", () => {
      expect(pageContent).toContain("inline-flex h-9 w-full items-center justify-center");
      expect(pageContent).toContain("<span>Ouvrir Hub Terrasse</span>");
      expect(pageContent).toContain("bg-[#23272B]");
      expect(pageContent).toContain("hover:bg-[#B85B2B]");
    });

    it("extrait fidèlement terrasseInfo que la relation Supabase soit singulière (objet) ou multiple", () => {
      expect(pageContent).toContain("const terrasseInfo = Array.isArray(c.chantier_terrasses)");
      expect(pageContent).toContain("? c.chantier_terrasses[0]");
      expect(pageContent).toContain(": c.chantier_terrasses");
    });
  });

  describe("2. Résolution du bug bloquant 'chantier.chantier_terrasses?.map is not a function'", () => {
    it("fonction utilitaire extraireFicheTerrasse extrait correctement un objet singulier", () => {
      const objetSingulier = {
        id: "terr-123",
        nom: "Terrasse principale",
        essence_bois: "ipe",
        type_sol: "dalle_beton",
      };
      const res = extraireFicheTerrasse(objetSingulier);
      expect(res).not.toBeNull();
      expect(res?.id).toBe("terr-123");
      expect(res?.essence_bois).toBe("ipe");
    });

    it("fonction utilitaire extraireFicheTerrasse extrait le premier élément d'un tableau", () => {
      const tableau = [
        {
          id: "terr-456",
          nom: "Terrasse piscine",
          essence_bois: "cumaru",
          type_sol: "plots_reglables",
        },
      ];
      const res = extraireFicheTerrasse(tableau);
      expect(res).not.toBeNull();
      expect(res?.id).toBe("terr-456");
      expect(res?.essence_bois).toBe("cumaru");
    });

    it("fonction utilitaire extraireFicheTerrasse gère gracieusement null, undefined et tableaux vides", () => {
      expect(extraireFicheTerrasse(null)).toBeNull();
      expect(extraireFicheTerrasse(undefined)).toBeNull();
      expect(extraireFicheTerrasse([])).toBeNull();
    });

    it("dans la modale, chantier_terrasses n'appelle jamais .map() directement sans vérifier Array.isArray", () => {
      // Vérifie qu'il n'y a plus aucun appel non gardé chantier.chantier_terrasses?.map
      expect(modalContent).not.toContain("chantier.chantier_terrasses?.map");
      expect(modalContent).toContain("if (Array.isArray(chantier.chantier_terrasses))");
      expect(modalContent).toContain("else if (chantier.chantier_terrasses && typeof chantier.chantier_terrasses === \"object\")");
    });

    it("préremplit les champs essence et sol depuis un objet singulier réel sans erreur", () => {
      expect(modalContent).toContain("const terr = extraireFicheTerrasse(chantier.chantier_terrasses);");
      expect(modalContent).toContain("setEssenceBois(terr.essence_bois || \"pin_cl4\");");
      expect(modalContent).toContain("setTypeSol(terr.type_sol || \"dalle_beton\");");
    });
  });

  describe("3. Responsive Mobile & Suppression des débordements horizontaux", () => {
    it("la modale applique min-width: 0 et overflow-x-hidden pour proscrire tout scroll horizontal", () => {
      expect(modalContent).toContain("overflow-x-hidden");
      expect(modalContent).toContain("min-w-0");
      expect(modalContent).toContain("max-w-full");
    });

    it("utilise des grilles adaptatives minmax(0, 1fr) à une seule colonne sur mobile", () => {
      expect(modalContent).toContain("[grid-template-columns:minmax(0,1fr)]");
      expect(modalContent).toContain("sm:[grid-template-columns:repeat(2,minmax(0,1fr))]");
    });

    it("les sélecteurs et champs possèdent box-border et truncate pour éviter l'éclatement du conteneur", () => {
      expect(modalContent).toContain("box-border");
      expect(modalContent).toContain("truncate");
    });

    it("le pied de modale empile verticalement Annuler et Enregistrer sur smartphone (flex-col-reverse)", () => {
      expect(modalContent).toContain("flex-col-reverse sm:flex-row");
      expect(modalContent).toContain("w-full sm:w-auto h-10 sm:h-9");
    });

    it("les marges internes sont allégées sur mobile (px-4 py-3 sm:px-6 sm:py-4)", () => {
      expect(modalContent).toContain("px-4 py-3.5 sm:px-6 sm:py-4");
      expect(modalContent).toContain("p-4 sm:p-6");
    });
  });

  describe("4. Cloisonnement strict & Sécurité multi-tenant", () => {
    it("conserve impérativement metier = 'terrasse'", () => {
      expect(modalContent).toContain('metier: "terrasse"');
    });

    it("bloque catégoriquement toute tentative de modification d'un chantier bardage", () => {
      expect(modalContent).toContain('if (chantier.metier === "bardage")');
      expect(modalContent).toContain(
        "Action non autorisée : les chantiers bardage ne peuvent pas être modifiés ici."
      );
    });

    it("applique le contrôle d'isolation multi-tenant fail-closed", () => {
      expect(modalContent).toContain("resoudreContexteEntreprise(null)");
      expect(modalContent).toContain("if (!estUuid(entreprise_id))");
      expect(modalContent).toContain('.eq("entreprise_id", entreprise_id)');
    });

    it("met à jour la fiche technique chantier_terrasses sans toucher aux autres tables sensibles", () => {
      expect(modalContent).toContain('.from("chantiers")');
      expect(modalContent).toContain('.from("chantier_terrasses")');
      expect(modalContent).not.toContain('.from("chantier_zones")');
      expect(modalContent).not.toContain('.from("calepinage_zones")');
      expect(modalContent).not.toContain('.from("factures")');
      expect(modalContent).not.toContain('.from("devis")');
    });

    it("préserve intégralement les frais de déplacement", () => {
      expect(modalContent).not.toContain('.from("frais_deplacement").delete');
      expect(modalContent).not.toContain('.from("frais_deplacement").update');
    });
  });
});
