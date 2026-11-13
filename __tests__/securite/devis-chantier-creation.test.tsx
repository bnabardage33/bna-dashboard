// O3-B8 — Test comportemental « transformer un devis en chantier »
// ============================================================================
//
// Couvre le SECOND point d'entrée de B8 : `transformerEnChantier`
// (app/bureau/devis-factures/page.tsx). Même approche que
// `chantier-creation.test.tsx` : on exécute le vrai handler sur un DOM réel et
// on inspecte les écritures réellement tentées.
//
// Ce chemin a une exigence supplémentaire : la conversion ne doit marquer le
// devis `accepte` QUE si le chantier a bien été créé. Une régression ici
// laisserait un devis « accepté » sans chantier, invisible pour l'utilisateur.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createElement } from "react";

const BNA = "11111111-1111-4111-8111-111111111111";
const TEST = "22222222-2222-4222-8222-222222222222";
const DEVIS_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const CLIENT_ID = "66084d5c-0000-4000-8000-000000000001";

/** Forme de la résolution d'une requête PostgREST simulée. */
type Resolution = {
  data: unknown[] | null;
  error: { message: string } | null;
};

let inserts: Record<string, unknown>[] = [];
let updates: Record<string, unknown>[] = [];
/** Erreur renvoyée par le prochain insert chantiers (null = succès). */
let erreurInsertChantier: { message: string } | null = null;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: session.user }, error: null }),
    },
    from: (table: string) => {
      const etat: Record<string, unknown> = {
        insert: (payload: Record<string, unknown>) => {
          inserts.push({ __table: table, ...payload });
          return Promise.resolve({
            data: null,
            error: table === "chantiers" ? erreurInsertChantier : null,
          });
        },
        update: (payload: Record<string, unknown>) => {
          updates.push({ __table: table, ...payload });
          // Chaînable ET thenable : le code de la page fait
          // `.update({…}).eq("id", …)` puis await. Sans `.eq` chaînable, le
          // mock bruite la sortie avec un TypeError sans rapport avec B8.
          const chaine: Record<string, unknown> = {};
          chaine.eq = () => chaine;
          chaine.select = () => chaine;
          chaine.then = (r: (v: Resolution) => unknown) => r({ data: [], error: null });
          return chaine;
        },
        delete: () => Promise.resolve({ data: null, error: null }),
        eq: () => etat,
      };
      etat.select = () => etat;
      etat.order = () => etat;
      etat.limit = () => etat;
      etat.single = async () => ({ data: null, error: null });
      etat.maybeSingle = async () => ({ data: null, error: null });
      etat.then = (r: (v: Resolution) => unknown) => r({ data: jeuDeDonnees(table), error: null });
      return etat;
    },
  },
}));

let session: { user: { app_metadata: Record<string, unknown> } };

/** Jeu de données minimal pour faire apparaître la ligne de devis. */
function jeuDeDonnees(table: string): unknown[] {
  if (table === "devis") {
    return [
      {
        id: DEVIS_ID,
        numero: "DEV-2026-TEST",
        objet: "Bardage Clin Bois",
        type_travaux: "Bardage",
        statut: "envoye",
        client_id: CLIENT_ID,
        entreprise_id: BNA,
        adresse_chantier: "14 Route des Plages",
        total_ht: 12000,
        surface_m2: 180,
        lignes: [],
        clients: { nom: "Client Test", societe: "SCI TEST" },
      },
    ];
  }
  if (table === "clients") return [{ id: CLIENT_ID, nom: "Client Test", societe: "SCI TEST" }];
  return [];
}

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

vi.mock("@/components/DocumentPDF", () => ({ default: () => null }));
vi.mock("@/components/SignaturePad", () => ({ default: () => null }));

let conteneur: HTMLDivElement;
let root: Root;
let alertes: string[] = [];
let logsErreur: string[] = [];

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  inserts = [];
  updates = [];
  erreurInsertChantier = null;
  alertes = [];
  logsErreur = [];
  session = { user: { app_metadata: { entreprise_id: BNA } } };
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.stubGlobal("alert", (m: unknown) => {
    alertes.push(String(m));
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    logsErreur.push(a.map(String).join(" "));
  });
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function insertChantiers(): Record<string, unknown>[] {
  return inserts.filter((i) => i.__table === "chantiers");
}
function updateDevis(): Record<string, unknown>[] {
  return updates.filter((u) => u.__table === "devis");
}

/** Rend la page, puis clique sur « Valider et transformer en chantier ». */
async function cliquerTransformer(): Promise<boolean> {
  const { default: Page } = await import("@/app/bureau/devis-factures/page");
  await act(async () => {
    root.render(createElement(Page));
  });
  const bouton = conteneur.querySelector(
    'button[title="Valider et transformer en chantier"]',
  ) as HTMLButtonElement | null;
  if (!bouton) return false;
  await act(async () => {
    bouton.click();
  });
  const boutonConfirmer = conteneur.querySelector(
    'button[data-testid="confirmer-conversion-chantier"]',
  ) as HTMLButtonElement | null;
  if (boutonConfirmer) {
    await act(async () => {
      boutonConfirmer.click();
    });
  }
  return true;
}

describe("O3-B8 — transformation devis → chantier", () => {
  it("le bouton de transformation est bien atteignable (garde du test)", async () => {
    const clique = await cliquerTransformer();
    expect(clique, "le bouton doit exister pour un devis non accepté").toBe(true);
  });

  it("insère le chantier avec l'entreprise du claim, puis passe le devis à 'accepte'", async () => {
    await cliquerTransformer();

    const ch = insertChantiers();
    expect(ch).toHaveLength(1);
    expect(ch[0].entreprise_id).toBe(BNA);
    // Le devis devient 'accepte' APRÈS la création du chantier.
    const dv = updateDevis();
    expect(dv).toHaveLength(1);
    expect(dv[0].statut).toBe("accepte");
    expect(alertes.filter((a) => /accepter/i.test(a))).toHaveLength(0);
  });

  it("reprend les données du devis (nom, client, montants) — non-régression métier", async () => {
    await cliquerTransformer();
    const ch = insertChantiers()[0];
    expect(ch.client_id).toBe(CLIENT_ID);
    expect(ch.adresse_chantier).toBe("14 Route des Plages");
    expect(ch.prix_vente_ht).toBe(12000);
    expect(ch.surface_m2).toBe(180);
    expect(ch.statut).toBe("prevu");
    expect(ch.code_acces).toMatch(/^BNA-[A-Z0-9]{6}$/);
    // Colonnes NOT NULL documentées par lib/chantierDefaults.ts.
    expect(ch.materiau_structurel).toBe("Bois / Mélèze");
    expect(ch.moyen_acces).toBe("echafaudage");
    expect(ch.zone_vent).toBe(1);
  });

  it("contexte ABSENT → aucune écriture ET le devis n'est PAS marqué accepté", async () => {
    session = { user: { app_metadata: {} } };
    await cliquerTransformer();

    expect(inserts, "aucune table ne doit être écrite").toHaveLength(0);
    expect(updateDevis(), "le devis doit rester à son statut d'origine").toHaveLength(0);
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toMatch(/entreprise/i);
  });

  it("contexte MALFORMÉ → aucune écriture, devis inchangé", async () => {
    session = { user: { app_metadata: { entreprise_id: "2222-pas-un-uuid" } } };
    await cliquerTransformer();
    expect(inserts).toHaveLength(0);
    expect(updateDevis()).toHaveLength(0);
  });

  it("si l'INSERT chantier échoue en base, le devis n'est PAS marqué accepté", async () => {
    // Non-régression : c'est le piège classique de cette fonction. L'update
    // statut ne doit être atteint qu'après un insert sans erreur.
    erreurInsertChantier = { message: "boom" };
    await cliquerTransformer();

    expect(insertChantiers()).toHaveLength(1);
    expect(updateDevis(), "aucun passage à 'accepte' après un échec d'insert").toHaveLength(0);
    expect(alertes[0]).toMatch(/boom/);
  });

  it("isolation : sous TEST, le chantier porte l'identifiant TEST", async () => {
    session = { user: { app_metadata: { entreprise_id: TEST } } };
    await cliquerTransformer();
    const ch = insertChantiers();
    expect(ch).toHaveLength(1);
    expect(ch[0].entreprise_id).toBe(TEST);
    expect(ch[0].entreprise_id).not.toBe(BNA);
  });

  it("le refus est journalisé (trace exploitable en production)", async () => {
    session = { user: { app_metadata: {} } };
    await cliquerTransformer();
    expect(logsErreur.some((l) => /entreprise/i.test(l))).toBe(true);
  });
});
