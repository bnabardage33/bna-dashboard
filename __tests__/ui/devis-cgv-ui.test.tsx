// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import DocumentPDF, { DocumentData, Entreprise, Client } from "@/components/DocumentPDF";
import SignatureModal from "@/components/SignatureModal";

// @ts-expect-error React act testing environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.clearAllMocks();

  vi.stubGlobal("fetch", async (url: string) => {
    if (url.endsWith("/send-otp")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, expiresInSecondes: 600 }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    };
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  conteneur.remove();
  vi.unstubAllGlobals();
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
  nom: "Jean Dupont",
  societe: "SCI Les Peupliers",
  adresse_facturation: "12 avenue de la Gare",
  code_postal: "69000",
  ville: "Lyon",
  tel: "04 78 00 11 22",
  email: "gestion@peupliers.fr",
};

/** Helper simulant la saisie clavier dans un input React contrôlé */
async function saisir(c: HTMLElement, label: RegExp, valeur: string): Promise<void> {
  const champ = [...c.querySelectorAll("input")].find((i) =>
    label.test(`${i.getAttribute("aria-label") ?? ""} ${i.getAttribute("placeholder") ?? ""}`)
  );
  if (!champ) throw new Error(`Champ introuvable : ${label}`);
  await act(async () => {
    const poser = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    poser?.call(champ, valeur);
    champ.dispatchEvent(new Event("input", { bubbles: true }));
    champ.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Helper simulant le clic sur un bouton par son libellé */
async function cliquer(c: HTMLElement, texte: RegExp): Promise<void> {
  const cible = [...c.querySelectorAll("button")].find((b) => texte.test(b.textContent ?? ""));
  if (!cible) {
    throw new Error(`Bouton introuvable : ${texte}`);
  }
  await act(async () => {
    cible.click();
  });
}

describe("UI — DEVIS, CGV & PARCOURS DE SIGNATURE (LOI N° 71-584)", () => {
  // =========================================================================
  // 1. Rendu DocumentPDF — Mention Page 1 Devis
  // =========================================================================
  describe("1. DocumentPDF — Mention contractuelle Page 1", () => {
    it("affiche la mention dynamique Loi n° 71-584 sur le devis avec retenue à 5 %", () => {
      const devisData: DocumentData = {
        kind: "devis",
        numero: "DEV-2026-001",
        date_emission: "2026-10-08",
        statut: "brouillon",
        objet: null,
        adresse_chantier: null,
        type_travaux: null,
        validite_jours: 30,
        delai_jours: 15,
        acompte_pct: 30,
        tva_pct: 10,
        retenue_garantie_pct: 5,
        lignes: [
          { designation: "Bardage métallique", qte: 1, unite: "forfait", pu_ht: 10000 },
        ],
      };

      act(() => {
        root.render(
          createElement(DocumentPDF, {
            doc: devisData,
            entreprise: mockEntreprise,
            client: mockClient,
          })
        );
      });

      const texte = conteneur.textContent || "";
      expect(texte).toContain("Conditions contractuelles & Retenue de garantie");
      expect(texte).toContain("loi n° 71-584 du 16 juillet 1971");
      expect(texte).toContain("5 %");
      expect(texte).toContain("garantir la levée des réserves");
    });

    it("affiche la mention sans retenue sur le devis quand retenue_garantie_pct est 0 % ou omis", () => {
      const devisSansRetenue: DocumentData = {
        kind: "devis",
        numero: "DEV-2026-002",
        date_emission: "2026-10-08",
        statut: "brouillon",
        objet: null,
        adresse_chantier: null,
        type_travaux: null,
        validite_jours: 30,
        delai_jours: 15,
        acompte_pct: 30,
        tva_pct: 10,
        retenue_garantie_pct: 0,
        lignes: [
          { designation: "Travaux d'isolation", qte: 1, unite: "forfait", pu_ht: 5000 },
        ],
      };

      act(() => {
        root.render(
          createElement(DocumentPDF, {
            doc: devisSansRetenue,
            entreprise: mockEntreprise,
            client: mockClient,
          })
        );
      });

      const texte = conteneur.textContent || "";
      expect(texte).toContain("Conditions contractuelles :");
      expect(texte).toContain("Aucune retenue de garantie contractuelle n'est convenue");
      expect(texte).not.toContain("loi n° 71-584 du 16 juillet 1971 et selon accord exprès");
    });
  });

  // =========================================================================
  // 2. Rendu DocumentPDF — Page 2 Conditions Générales de Vente (CGV)
  // =========================================================================
  describe("2. DocumentPDF — Page 2 Conditions Générales de Vente (CGV)", () => {
    it("intègre l'Article 7 dédié à la Retenue de garantie Loi n° 71-584 avec toutes les garanties légales", () => {
      const devisData: DocumentData = {
        kind: "devis",
        numero: "DEV-2026-001",
        date_emission: "2026-10-08",
        statut: "brouillon",
        objet: null,
        adresse_chantier: null,
        type_travaux: null,
        validite_jours: 30,
        delai_jours: 15,
        acompte_pct: 30,
        tva_pct: 10,
        retenue_garantie_pct: 5,
        lignes: [{ designation: "Bardage", qte: 1, unite: "forfait", pu_ht: 8000 }],
      };

      act(() => {
        root.render(
          createElement(DocumentPDF, {
            doc: devisData,
            entreprise: mockEntreprise,
            client: mockClient,
          })
        );
      });

      const texte = conteneur.textContent || "";

      // En-tête CGV
      expect(texte).toContain("Conditions Générales de Vente");

      // Article 7 obligatoire
      expect(texte).toContain("Article 7 — Retenue de garantie légale & Consignation (Loi n° 71-584)");
      expect(texte).toContain("loi n° 71-584 du 16 juillet 1971");
      expect(texte).toContain("égale au plus à 5 %");
      expect(texte).toContain("expressément convenue");
      expect(texte).toContain("garantir contractuellement la bonne exécution des travaux");
      expect(texte).toContain("répondre, le cas échéant, aux réserves");
      expect(texte).toContain("tiers consignataire");
      expect(texte).toContain("caution personnelle et solidaire");
      expect(texte).toContain("délai d'un an à compter de la date de réception");
      expect(texte).toContain("opposition motivée notifiée par LRAR");

      // Articles suivants renumérotés
      expect(texte).toContain("Article 8 — Assurances & Garantie Décennale");
      expect(texte).toContain("Article 9 — Médiation de la consommation & Litiges");
    });
  });

  // =========================================================================
  // 3. SignatureModal — Consentement & Consultation des CGV
  // =========================================================================
  describe("3. SignatureModal — Consentement contractuel & Accès aux CGV", () => {
    it("affiche le consentement avec mention explicite du taux de 5 % pour un devis avec retenue", async () => {
      await act(async () => {
        root.render(
          createElement(SignatureModal, {
            codeAcces: "CODE-XYZ",
            devisId: "d-uuid-1",
            numero: "DEV-2026-001",
            retenueGarantiePct: 5,
            onClose: vi.fn(),
            onSuccess: vi.fn(),
          })
        );
      });

      // Cliquer sur "Recevoir le code par SMS" pour passer à l'étape OTP
      await cliquer(conteneur, /Recevoir le code par SMS/);

      // Saisir les 6 chiffres
      await saisir(conteneur, /Code de signature/, "123456");

      // Cliquer sur "Tracer ma signature"
      await cliquer(conteneur, /Tracer ma signature/);

      // Vérifier le texte du consentement
      const texte = conteneur.textContent || "";
      expect(texte).toContain("retenue de garantie contractuelle de 5 % (Loi n° 71-584)");
      expect(texte).toContain("Consulter les Conditions Générales de Vente (CGV BTP — 9 articles)");
    });

    it("affiche le consentement sans retenue de garantie pour un devis à 0 %", async () => {
      await act(async () => {
        root.render(
          createElement(SignatureModal, {
            codeAcces: "CODE-XYZ",
            devisId: "d-uuid-2",
            numero: "DEV-2026-002",
            retenueGarantiePct: 0,
            onClose: vi.fn(),
            onSuccess: vi.fn(),
          })
        );
      });

      await cliquer(conteneur, /Recevoir le code par SMS/);
      await saisir(conteneur, /Code de signature/, "123456");
      await cliquer(conteneur, /Tracer ma signature/);

      const texte = conteneur.textContent || "";
      expect(texte).toContain("sans retenue de garantie");
      expect(texte).not.toContain("Loi n° 71-584");
    });

    it("permet d'ouvrir et consulter les CGV directement depuis la modale de signature", async () => {
      await act(async () => {
        root.render(
          createElement(SignatureModal, {
            codeAcces: "CODE-XYZ",
            devisId: "d-uuid-1",
            numero: "DEV-2026-001",
            retenueGarantiePct: 5,
            onClose: vi.fn(),
            onSuccess: vi.fn(),
          })
        );
      });

      await cliquer(conteneur, /Recevoir le code par SMS/);
      await saisir(conteneur, /Code de signature/, "123456");
      await cliquer(conteneur, /Tracer ma signature/);

      // Cliquer sur "Consulter les Conditions Générales de Vente"
      await cliquer(conteneur, /Consulter les Conditions Générales de Vente/);

      // Vérifier l'affichage de l'overlay CGV avec l'intégralité des 9 articles
      const texteModal = conteneur.textContent || "";
      expect(texteModal).toContain("Conditions Générales de Vente (CGV BTP)");
      expect(texteModal).toContain("Article 1 — Objet & Champ d'application");
      expect(texteModal).toContain("Article 7 — Retenue de garantie légale & Consignation (Loi n° 71-584)");
      expect(texteModal).toContain("retenue de garantie égale au plus à 5 %");
      expect(texteModal).toContain("tiers consignataire");
      expect(texteModal).toContain("Article 9 — Médiation de la consommation & Litiges");
    });
  });
});
