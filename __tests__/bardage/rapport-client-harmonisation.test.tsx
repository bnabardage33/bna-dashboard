// __tests__/bardage/rapport-client-harmonisation.test.tsx
//
// Tests unitaires et d'intégration pour l'harmonisation visuelle du module Rapport Client Hub Bardage :
// 1. Conformité à la charte claire BNA (fonds blancs/gris clair, bordures #E5E5E5, accents cuivre #B85B2B, suppression de l'ancien thème sombre)
// 2. Bloc de génération du rapport hebdomadaire (bouton cuivre BNA, icônes)
// 3. Historique des rapports (distinction du rapport actif, badges d'état clairs, dates formatées)
// 4. Aperçu du rapport sélectionné et actions (Aperçu PDF, Enregistrer, Envoyer au client, modale de confirmation)
// 5. 3 Indicateurs de synthèse (Avancement période, Avancement global, Temps)
// 6. Suivi des façades dynamiques (1, 2, 3 ou 4 façades, labels personnalisés, badges clairs)
// 7. Photos, Météo, Observations et Mot du patron (textarea focus cuivre, lecture seule post-envoi)
// 8. Préservation intégrale du moteur métier

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("BNA — Harmonisation visuelle du module Rapport Client (Hub Bardage)", () => {
  const modulePath = join(
    process.cwd(),
    "components/bardage/hub/BardageRapportClientModule.tsx"
  );
  const rapportClientPath = join(
    process.cwd(),
    "components/RapportClient.tsx"
  );
  const wrapperPath = join(
    process.cwd(),
    "components/RapportClientWrapper.tsx"
  );

  const moduleSource = readFileSync(modulePath, "utf-8");
  const rapportClientSource = readFileSync(rapportClientPath, "utf-8");
  const wrapperSource = readFileSync(wrapperPath, "utf-8");

  describe("1. Charte graphique claire BNA & Suppression du thème sombre", () => {
    it("utilise les fonds et bordures de la charte claire BNA (#FFFFFF, #F8F9FA, #E5E5E5)", () => {
      expect(rapportClientSource).toContain("bg-white");
      expect(rapportClientSource).toContain("bg-[#F8F9FA]");
      expect(rapportClientSource).toContain("border-[#E5E5E5]");
      expect(rapportClientSource).toContain("text-[#23272B]");
      expect(rapportClientSource).toContain("text-[#777777]");
      expect(rapportClientSource).toContain("bg-[#B85B2B]");
    });

    it("ne contient plus les fonds noirs et sombres obsolètes (#1E1E1E, #121212)", () => {
      expect(rapportClientSource).not.toContain("#1E1E1E");
      expect(rapportClientSource).not.toContain("#121212");
      expect(wrapperSource).not.toContain("#1E1E1E");
      expect(moduleSource).not.toContain("#1E1E1E");
    });

    it("l'en-tête du module BardageRapportClientModule adopte la carte blanche BNA avec icône cuivre", () => {
      expect(moduleSource).toContain("rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white");
      expect(moduleSource).toContain("text-[#B85B2B]");
      expect(moduleSource).toContain("Compte-Rendu d&apos;Intervention &amp; Rapport Client");
      expect(moduleSource).toContain("Synthèse hebdomadaire Bardage");
    });
  });

  describe("2. Bloc de génération du rapport hebdomadaire", () => {
    it("présente le bouton de génération en cuivre BNA #B85B2B avec icône RefreshCw", () => {
      expect(rapportClientSource).toContain("Rapport hebdomadaire client");
      expect(rapportClientSource).toContain("Générer le rapport de la semaine passée");
      expect(rapportClientSource).toContain("bg-[#B85B2B]");
      expect(rapportClientSource).toContain("hover:bg-[#9C4B23]");
      expect(rapportClientSource).toContain("<RefreshCw");
    });

    it("gère l'état de chargement avec un spinner Loader2", () => {
      expect(rapportClientSource).toContain("generationEnCours");
      expect(rapportClientSource).toContain("<Loader2");
      expect(rapportClientSource).toContain("Génération en cours…");
    });
  });

  describe("3. Historique des rapports existants", () => {
    it("affiche chaque rapport dans une sous-carte claire et met en valeur le rapport actif", () => {
      expect(rapportClientSource).toContain("Rapports existants");
      // Rapport sélectionné : accent cuivre et fond doux
      expect(rapportClientSource).toContain("border-[#B85B2B]");
      expect(rapportClientSource).toContain("bg-[#FFF7ED]/70");
      expect(rapportClientSource).toContain("text-[#B85B2B]");
    });

    it("affiche des badges de statut conformes (Envoyé en vert discret, Brouillon en ambre)", () => {
      expect(rapportClientSource).toContain("bg-emerald-50 border-emerald-200 text-emerald-800");
      expect(rapportClientSource).toContain("bg-amber-50 border-amber-200 text-amber-800");
      expect(rapportClientSource).toContain("Envoyé");
      expect(rapportClientSource).toContain("Brouillon");
    });
  });

  describe("4. Aperçu du rapport sélectionné & Actions", () => {
    it("propose le bouton Aperçu PDF harmonisé et les boutons d'enregistrement et d'envoi", () => {
      expect(rapportClientSource).toContain("Aperçu PDF");
      expect(rapportClientSource).toContain("<Printer");
      expect(rapportClientSource).toContain("Enregistrer");
      expect(rapportClientSource).toContain("Envoyer au client");
    });

    it("affiche une modale de confirmation d'envoi au style clair BNA", () => {
      expect(rapportClientSource).toContain('role="dialog"');
      expect(rapportClientSource).toContain('aria-modal="true"');
      expect(rapportClientSource).toContain("Envoyer le rapport au client ?");
      expect(rapportClientSource).toContain("Une fois envoyé, ce rapport passera définitivement en lecture seule.");
      expect(rapportClientSource).toContain("Confirmer l&apos;envoi");
    });
  });

  describe("5. Indicateurs de synthèse (3 KPIs)", () => {
    it("harmonise les 3 indicateurs en cartes blanches avec typographie contrastée", () => {
      expect(rapportClientSource).toContain("Avancement période");
      expect(rapportClientSource).toContain("Avancement global");
      expect(rapportClientSource).toContain("Temps de la semaine");
      // Valeur d'avancement période en cuivre BNA
      expect(rapportClientSource).toContain("text-[#B85B2B]");
      expect(rapportClientSource).toContain("font-black");
    });
  });

  describe("6. Suivi des façades & Configuration dynamique", () => {
    it("intègre les façades dynamiques du chantier (1 à 4 façades)", () => {
      expect(rapportClientSource).toContain("facadesConfig");
      expect(rapportClientSource).toContain("checklist");
      expect(rapportClientSource).toContain("listeFacadesAffichees");
    });

    it("applique le helper de style clair pour chaque état de façade", () => {
      expect(rapportClientSource).toContain("statutFacadeClair");
      expect(rapportClientSource).toContain("border-emerald-200 bg-emerald-50/70");
      expect(rapportClientSource).toContain("border-amber-200 bg-amber-50/70");
      expect(rapportClientSource).toContain("border-[#E5E5E5] bg-[#F8F9FA]");
    });
  });

  describe("7. Photos, Météo, Observations et Mot du patron", () => {
    it("présente les photos avec état vide lisible et bordures soignées", () => {
      expect(rapportClientSource).toContain("Photos de la semaine");
      expect(rapportClientSource).toContain("Aucune photo prise cette semaine.");
    });

    it("affiche les relevés météo et intempéries sur cartes claires sans fond sombre", () => {
      expect(rapportClientSource).toContain("Météo relevée");
      expect(rapportClientSource).toContain("Intempéries &amp; Arrêts");
      expect(rapportClientSource).toContain("EMOJI_VIGILANCE");
    });

    it("fournit une zone de saisie du mot du patron avec focus cuivre et verrouillage post-envoi", () => {
      expect(rapportClientSource).toContain("Mot du patron pour le client");
      expect(rapportClientSource).toContain("focus:border-[#B85B2B]");
      expect(rapportClientSource).toContain("focus:ring-[#B85B2B]/30");
      expect(rapportClientSource).toContain("disabled={estEnvoye}");
      expect(rapportClientSource).toContain("Ce message est figé car le rapport a déjà été transmis au client.");
    });
  });

  describe("8. Préservation absolue du moteur métier", () => {
    it("conserve intacts les appels aux routes et requêtes Supabase", () => {
      expect(rapportClientSource).toContain('fetch("/api/rapports-client/generer"');
      expect(rapportClientSource).toContain('.from("rapports_client")');
      expect(rapportClientSource).toContain('.from("entreprise_settings")');
      expect(rapportClientSource).toContain('.from("chantiers")');
    });

    it("maintient l'impression PDF et le composant RapportClientPrint", () => {
      expect(rapportClientSource).toContain("<RapportClientPrint");
      expect(rapportClientSource).toContain("preparerEtImprimer()");
    });
  });
});
