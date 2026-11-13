// __tests__/bardage/suppression-rapport-intemperies.test.tsx
//
// Tests unitaires et d'intégration pour la suppression des rapports d'intempéries Bardage :
// 1. Fonction helper `supprimerRapportIntemperie` (contrôle des paramètres, scoping chantier + id)
// 2. Présence de l'action de suppression sur les cartes de rapports (bouton Trash2, aria-label, prévention de navigation)
// 3. Modale de confirmation (identification du rapport, message d'irréversibilité, annulation, validation)
// 4. Intégration dans le composant parent `BardageMeteoModule`

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  supprimerRapportIntemperie,
} from "@/components/RapportsIntemperiesListe";

describe("Suppression des rapports d'intempéries — Module Météo Bardage", () => {
  const listeSource = readFileSync(
    join(process.cwd(), "components/RapportsIntemperiesListe.tsx"),
    "utf-8"
  );
  const meteoModuleSource = readFileSync(
    join(process.cwd(), "components/bardage/hub/BardageMeteoModule.tsx"),
    "utf-8"
  );

  describe("1. Helper supprimerRapportIntemperie (Scoping & Sécurité)", () => {
    it("rejette immédiatement un rapportId ou chantierId manquant sans appel réseau", async () => {
      const mockSupabase = { from: vi.fn() } as unknown as Parameters<
        typeof supprimerRapportIntemperie
      >[0];

      const res1 = await supprimerRapportIntemperie(mockSupabase, "", "chantier-123");
      expect(res1.success).toBe(false);
      expect(res1.error).toContain("manquant");

      const res2 = await supprimerRapportIntemperie(mockSupabase, "rap-456", "");
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("manquant");

      expect(mockSupabase.from).not.toHaveBeenCalled();
    });

    it("cible strictement public.rapports_intemperies avec filtre combiné id ET chantier_id", async () => {
      const eqFns: { col: string; val: string }[] = [];
      const chaineEq = {
        eq: vi.fn((col: string, val: string) => {
          eqFns.push({ col, val });
          return chaineEq;
        }),
      };
      // Simuler fin de requête résolue sans erreur
      Object.assign(chaineEq, {
        then: (resolve: (val: { error: null }) => unknown) =>
          resolve({ error: null }),
      });

      const chaineDelete = {
        delete: vi.fn(() => chaineEq),
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          expect(table).toBe("rapports_intemperies");
          return chaineDelete;
        }),
      } as unknown as Parameters<typeof supprimerRapportIntemperie>[0];

      const res = await supprimerRapportIntemperie(
        mockSupabase,
        "uuid-rap-789",
        "uuid-chantier-123"
      );

      expect(mockSupabase.from).toHaveBeenCalledWith("rapports_intemperies");
      expect(chaineDelete.delete).toHaveBeenCalled();
      expect(eqFns).toEqual([
        { col: "id", val: "uuid-rap-789" },
        { col: "chantier_id", val: "uuid-chantier-123" },
      ]);
      expect(res.success).toBe(true);
    });

    it("remonte fidèlement les erreurs Supabase éventuelles", async () => {
      const chaineEq = {
        eq: vi.fn(() => chaineEq),
        then: (resolve: (val: { error: { message: string } }) => unknown) =>
          resolve({ error: { message: "RLS violation: permission denied" } }),
      };
      const chaineDelete = {
        delete: vi.fn(() => chaineEq),
      };
      const mockSupabase = {
        from: vi.fn(() => chaineDelete),
      } as unknown as Parameters<typeof supprimerRapportIntemperie>[0];

      const res = await supprimerRapportIntemperie(
        mockSupabase,
        "uuid-rap-error",
        "uuid-chantier-123"
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe("RLS violation: permission denied");
    });
  });

  describe("2. Interface utilisateur — Bouton Trash2 sur chaque carte", () => {
    it("déclare l'icône Trash2 avec un bouton accessible et zone tactile confortable", () => {
      expect(listeSource).toContain("Trash2");
      expect(listeSource).toContain('title={`Supprimer le rapport ${r.numero}`}');
      expect(listeSource).toContain('aria-label={`Supprimer le rapport ${r.numero}`}');
      // Style tactile : au moins h-8 w-8 ou sm:h-9 sm:w-9
      expect(listeSource).toMatch(/h-8\s+w-8|h-9\s+w-9/);
    });

    it("empêche explicitement la navigation vers la page de détail au clic sur supprimer", () => {
      expect(listeSource).toContain("e.preventDefault()");
      expect(listeSource).toContain("e.stopPropagation()");
      expect(listeSource).toContain("setRapportASupprimer(r)");
    });

    it("utilise un style rouge doux harmonisé BNA pour la corbeille", () => {
      expect(listeSource).toContain("text-rose-600");
      expect(listeSource).toContain("bg-rose-50");
      expect(listeSource).toContain("border-rose-200");
    });
  });

  describe("3. Modale de confirmation de suppression", () => {
    it("présente le dialogue accessible avec titre et avertissement d'irréversibilité", () => {
      expect(listeSource).toContain('role="dialog"');
      expect(listeSource).toContain('aria-modal="true"');
      expect(listeSource).toContain("Supprimer ce rapport d'intempéries ?");
      expect(listeSource).toContain("Cette action est irréversible.");
      expect(listeSource).toContain("La suppression est définitive");
    });

    it("identifie précisément les caractéristiques du rapport dans la modale", () => {
      expect(listeSource).toContain("rapportASupprimer.numero");
      expect(listeSource).toContain("rapportASupprimer.cree_le");
      expect(listeSource).toContain("rapportASupprimer.vigilance_officielle");
      expect(listeSource).toContain("rapportASupprimer.jour_arrete");
      expect(listeSource).toContain("rapportASupprimer.motif");
    });

    it("offre deux boutons d'action clairs : Annuler et Supprimer définitivement", () => {
      expect(listeSource).toContain("Annuler");
      expect(listeSource).toContain("Supprimer définitivement");
      expect(listeSource).toContain("executerSuppression");
      expect(listeSource).toContain("setRapportASupprimer(null)");
    });

    it("met à jour dynamiquement l'état local et recalcule à valider sans rechargement complet", () => {
      // Filtrage local immédiat dans le state
      expect(listeSource).toContain(
        "setRapports((prev) => prev.filter((r) => r.id !== rapportASupprimer.id))"
      );
      // Recalcul automatique du nombre de rapports à valider
      expect(listeSource).toContain(
        "const aValiderCount = rapports.filter((r) => r.a_valider).length;"
      );
    });
  });

  describe("4. Intégration dans BardageMeteoModule", () => {
    it("utilise RapportsIntemperiesListe avec la variante claire harmonisée", () => {
      expect(meteoModuleSource).toContain('<RapportsIntemperiesListe');
      expect(meteoModuleSource).toContain('variante="clair"');
      expect(meteoModuleSource).toContain('chantierId={chantierId}');
    });

    it("conserve la section Rapports d'Intempéries avec en-tête et icône ShieldAlert", () => {
      expect(meteoModuleSource).toContain("Arrêts de Travail &amp; Déclarations Intempéries BTP du Chantier");
      expect(meteoModuleSource).toContain("<ShieldAlert");
    });
  });
});
