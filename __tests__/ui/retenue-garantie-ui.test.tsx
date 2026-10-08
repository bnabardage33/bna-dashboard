import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import RetenueGarantieChantier from "@/components/RetenueGarantieChantier";
import DocumentPDF, { DocumentData, Entreprise, Client } from "@/components/DocumentPDF";

const mockFetch = vi.fn();
global.fetch = mockFetch;
// @ts-expect-error React act testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let conteneur: HTMLDivElement;
let root: Root;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.clearAllMocks();
  window.alert = vi.fn();
  window.confirm = vi.fn().mockReturnValue(true);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  conteneur.remove();
});

const mockEntreprise: Entreprise = {
  raison_sociale: "BNA BARDAGE & ISOLATION",
  siret: "12345678900012",
  telephone: "01 23 45 67 89",
  email: "contact@bna-bardage.fr",
  adresse: "10 rue du BTP",
  code_postal: "75001",
  ville: "Paris",
  assurance: "Décennale AXA 998877",
  iban: "FR76 1234 5678 9012 3456 7890 123",
  bic: "BNAPFRPP",
  mentions_legales: "SAS au capital de 50 000 €",
  logo_url: null,
};

const mockClient: Client = {
  nom: "SCI Les Peupliers",
  societe: "SCI Les Peupliers",
  adresse_facturation: "12 avenue de la Gare",
  code_postal: "69000",
  ville: "Lyon",
  tel: "04 78 00 11 22",
  email: "gestion@peupliers.fr",
};

describe("PHASE 5 — Interface Utilisateur & Facturation Retenue de Garantie", () => {
  // =========================================================================
  // 1. Rendu DocumentPDF — Facture avec vs sans retenue
  // =========================================================================
  describe("1. DocumentPDF (Aperçu & impression de facture)", () => {
    it("affiche le TOTAL TTC, la Retenue 5 % et le NET À PAYER TTC lorsqu'une retenue est présente", async () => {
      const docFactureAvecRetenue: DocumentData = {
        kind: "facture",
        numero: "FAC-2026-001",
        statut: "emise",
        date_emission: "2026-10-08",
        objet: "Travaux de bardage ITE",
        adresse_chantier: "15 rue des Lilas",
        type_travaux: "Bardage",
        lignes: [{ designation: "Pose bardage", qte: 10, unite: "m²", pu_ht: 100 }],
        tva_pct: 20,
        retenue_garantie_pct: 5,
        montant_retenue_ht: 50,
        montant_retenue_ttc: 60,
        net_a_payer_ttc: 1140,
      };

      await act(async () => {
        root.render(
          createElement(DocumentPDF, {
            doc: docFactureAvecRetenue,
            entreprise: mockEntreprise,
            client: mockClient,
          })
        );
      });

      const text = conteneur.textContent || "";
      expect(text).toContain("TOTAL TTC");
      expect(text).toContain("1\u202f200,00"); // 1 200,00 € TTC
      expect(text).toContain("Retenue de garantie (5 %)");
      expect(text).toContain("-60,00"); // -60,00 €
      expect(text).toContain("NET À PAYER TTC");
      expect(text).toContain("1\u202f140,00"); // 1 140,00 € net
    });

    it("affiche uniquement le TOTAL TTC standard sans déduction lorsque la retenue est à 0 % ou absente", async () => {
      const docFactureSansRetenue: DocumentData = {
        kind: "facture",
        numero: "FAC-2026-002",
        statut: "emise",
        date_emission: "2026-10-08",
        objet: "Travaux sans retenue",
        adresse_chantier: "15 rue des Lilas",
        type_travaux: "Bardage",
        lignes: [{ designation: "Réparation ponctuelle", qte: 1, unite: "forfait", pu_ht: 500 }],
        tva_pct: 10,
        retenue_garantie_pct: 0,
        montant_retenue_ht: 0,
        montant_retenue_ttc: 0,
        net_a_payer_ttc: 550,
      };

      await act(async () => {
        root.render(
          createElement(DocumentPDF, {
            doc: docFactureSansRetenue,
            entreprise: mockEntreprise,
            client: mockClient,
          })
        );
      });

      const text = conteneur.textContent || "";
      expect(text).toContain("TOTAL TTC");
      expect(text).toContain("550,00");
      expect(text).not.toContain("Retenue de garantie");
      expect(text).not.toContain("NET À PAYER TTC");
    });
  });

  // =========================================================================
  // 2. Composant RetenueGarantieChantier
  // =========================================================================
  describe("2. Composant RetenueGarantieChantier", () => {
    it("affiche l'état de chargement initial", async () => {
      mockFetch.mockReturnValue(new Promise(() => {})); // fetch bloqué

      await act(async () => {
        root.render(createElement(RetenueGarantieChantier, { chantierId: "ch-1" }));
      });

      expect(conteneur.textContent).toContain("Chargement du compte de retenue de garantie");
    });

    it("affiche l'erreur et le bouton Réessayer en cas de rejet API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, error: "Chantier introuvable ou non autorisé" }),
      });

      await act(async () => {
        root.render(createElement(RetenueGarantieChantier, { chantierId: "ch-inconnu" }));
      });
      await act(async () => { await sleep(20); });

      expect(conteneur.textContent).toContain("Erreur de chargement");
      expect(conteneur.textContent).toContain("Chantier introuvable ou non autorisé");
      expect(conteneur.textContent).toContain("Réessayer");
    });

    it("affiche le solde restant et l'alerte 'Réserves en cours' lorsqu'un PV a des réserves", async () => {
      const mockApiResponse = {
        ok: true,
        data: {
          compte: {
            id: "crg-1",
            chantier_id: "ch-1",
            entreprise_id: "ent-1",
            taux_applicable_pct: 5,
            type_garantie: "retenue_financiere",
            montant_retenu_cumule_ht: 500,
            montant_retenu_cumule_ttc: 600,
            montant_libere_cumule_ttc: 0,
            montant_restant_a_liberer_ttc: 600,
            statut: "en_cours",
          },
          liberations: [],
          factures: [
            {
              id: "fac-1",
              numero: "FAC-001",
              date_emission: "2026-10-01",
              statut: "emise",
              tva_pct: 20,
              retenue_garantie_pct: 5,
              montant_retenue_ht: 500,
              montant_retenue_ttc: 600,
              net_a_payer_ttc: 11400,
            },
          ],
          pv_receptions: [
            {
              id: "pv-1",
              numero: "PVR-001",
              date_reception: "2026-10-05",
              statut: "avec_reserves",
              reserves: [{ intitule: "Peinture écaillée", levee: false }],
              observations: "Travaux à reprendre",
            },
          ],
          synthese: {
            montant_retenu_cumule_ttc: 600,
            montant_libere_cumule_ttc: 0,
            montant_restant_a_liberer_ttc: 600,
            statut: "en_cours",
            peut_liberer_reserves: false,
            pv_purges_count: 0,
            pv_avec_reserves_count: 1,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      });

      await act(async () => {
        root.render(createElement(RetenueGarantieChantier, { chantierId: "ch-1" }));
      });
      await act(async () => { await sleep(20); });

      const text = conteneur.textContent || "";
      expect(text).toContain("Retenue de Garantie (5 % BTP)");
      expect(text).toContain("En cours de retenue");
      expect(text).toContain("600,00"); // Solde restant 600 €
      expect(text).toContain("Réserves en cours");
      expect(text).toContain("garantit la reprise des malfaçons jusqu'à leur levée formelle");
      expect(text).toContain("FAC-001");
    });

    it("affiche le badge vert 'Levée des réserves constatée' lorsqu'un PV est sans réserve ou levé", async () => {
      const mockApiResponsePurge = {
        ok: true,
        data: {
          compte: {
            id: "crg-1",
            chantier_id: "ch-1",
            entreprise_id: "ent-1",
            taux_applicable_pct: 5,
            type_garantie: "retenue_financiere",
            montant_retenu_cumule_ht: 500,
            montant_retenu_cumule_ttc: 600,
            montant_libere_cumule_ttc: 0,
            montant_restant_a_liberer_ttc: 600,
            statut: "liberable",
          },
          liberations: [],
          factures: [],
          pv_receptions: [
            {
              id: "pv-purge",
              numero: "PVR-002",
              date_reception: "2026-10-07",
              statut: "reserves_levees",
              reserves: [],
              observations: null,
            },
          ],
          synthese: {
            montant_retenu_cumule_ttc: 600,
            montant_libere_cumule_ttc: 0,
            montant_restant_a_liberer_ttc: 600,
            statut: "liberable",
            peut_liberer_reserves: true,
            pv_purges_count: 1,
            pv_avec_reserves_count: 0,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponsePurge,
      });

      await act(async () => {
        root.render(createElement(RetenueGarantieChantier, { chantierId: "ch-1" }));
      });
      await act(async () => { await sleep(20); });

      const text = conteneur.textContent || "";
      expect(text).toContain("Levée des réserves constatée — La retenue peut être débloquée");
      expect(text).toContain("PVR-002");
    });

    it("ouvre le modal de libération et empêche la soumission sans PV lorsque le motif est levee_reserves", async () => {
      // Chantier avec solde mais aucun PV purgé
      const mockApiSansPvPurge = {
        ok: true,
        data: {
          compte: {
            id: "crg-1",
            chantier_id: "ch-1",
            entreprise_id: "ent-1",
            taux_applicable_pct: 5,
            type_garantie: "retenue_financiere",
            montant_retenu_cumule_ht: 500,
            montant_retenu_cumule_ttc: 600,
            montant_libere_cumule_ttc: 0,
            montant_restant_a_liberer_ttc: 600,
            statut: "en_cours",
          },
          liberations: [],
          factures: [],
          pv_receptions: [
            {
              id: "pv-non-purge",
              numero: "PVR-RESERVES",
              date_reception: "2026-10-01",
              statut: "avec_reserves",
              reserves: [],
              observations: null,
            },
          ],
          synthese: {
            montant_retenu_cumule_ttc: 600,
            montant_libere_cumule_ttc: 0,
            montant_restant_a_liberer_ttc: 600,
            statut: "en_cours",
            peut_liberer_reserves: false,
            pv_purges_count: 0,
            pv_avec_reserves_count: 1,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiSansPvPurge,
      });

      await act(async () => {
        root.render(createElement(RetenueGarantieChantier, { chantierId: "ch-1" }));
      });
      await act(async () => { await sleep(20); });

      // Clic sur "Libérer la retenue"
      const boutonLiberer = Array.from(conteneur.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Libérer la retenue")
      );
      expect(boutonLiberer).toBeTruthy();

      await act(async () => {
        boutonLiberer!.click();
        await sleep(10);
      });

      const modalText = conteneur.textContent || "";
      expect(modalText).toContain("Libérer la Retenue de Garantie");
      expect(modalText).toContain("Aucun PV sans réserve ou avec réserves levées n'est disponible");

      // Le bouton de validation doit être désactivé
      const submitBtn = Array.from(conteneur.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Valider la libération")
      ) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it("affiche l'historique des libérations antérieures et le statut 'Soldée & Libérée' quand le solde est nul", async () => {
      const mockApiResponseSolde = {
        ok: true,
        data: {
          compte: {
            id: "crg-1",
            chantier_id: "ch-1",
            entreprise_id: "ent-1",
            taux_applicable_pct: 5,
            type_garantie: "retenue_financiere",
            montant_retenu_cumule_ht: 500,
            montant_retenu_cumule_ttc: 600,
            montant_libere_cumule_ttc: 600,
            montant_restant_a_liberer_ttc: 0,
            statut: "liberee_totalement",
          },
          liberations: [
            {
              id: "lib-1",
              date_liberation: "2026-10-07",
              montant_libere_ttc: 600,
              montant_libere_ht: 500,
              motif: "levee_reserves" as const,
              document_ref: "VIR-9988",
              observations: "Restitution complète des fonds",
            },
          ],
          factures: [],
          pv_receptions: [],
          synthese: {
            montant_retenu_cumule_ttc: 600,
            montant_libere_cumule_ttc: 600,
            montant_restant_a_liberer_ttc: 0,
            statut: "liberee_totalement",
            peut_liberer_reserves: false,
            pv_purges_count: 1,
            pv_avec_reserves_count: 0,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponseSolde,
      });

      await act(async () => {
        root.render(createElement(RetenueGarantieChantier, { chantierId: "ch-1" }));
      });
      await act(async () => { await sleep(20); });

      const text = conteneur.textContent || "";
      expect(text).toContain("Soldée & Libérée");
      expect(text).toContain("Totalement restitué au titulaire");
      expect(text).toContain("Historique des libérations de retenue");
      expect(text).toContain("+600,00");
      expect(text).toContain("VIR-9988");
      expect(text).toContain("Restitution complète des fonds");
    });
  });
});
