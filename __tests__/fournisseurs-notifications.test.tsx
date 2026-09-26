// __tests__/fournisseurs-notifications.test.tsx
// O3-B6 / N9 — Producteur de notifications « Livraison en retard »
// ============================================================================
//
// POURQUOI CE TEST
//
// `app/bureau/fournisseurs/page.tsx` insère des notifications depuis le
// navigateur. La migration d'isolation du 2026-09-22 a rendu
// `notifications.entreprise_id` NOT NULL ; le producteur (écrit le 2026-09-10,
// commit 8af91a1) n'a jamais été mis à jour. L'insert échouait (23502, ou à
// défaut le `with check` de la policy `notifications_ent_insert`) et l'alerte
// « Livraison en retard » ne partait PLUS — en silence, car l'erreur n'était ni
// déstructurée ni loguée.
//
// Preuve en base que la régression est bien de cette nature : les 2 lignes
// `commande_retard` existantes portent un `created_at` IDENTIQUE à la
// microseconde (2026-09-11T05:51:00.764455+00:00) — `now()` étant
// l'horodatage de transaction, cela signe un INSERT multi-lignes — et leur
// `entreprise_id` est renseigné : l'insertion fonctionnait AVANT la migration.
//
// Ce test vérifie le comportement CORRIGÉ, en faisant tourner le VRAI
// `lib/contexteEntreprise.ts` par-dessus un `supabase` stubbé : on teste donc
// la chaîne complète page → résolveur → claim `app_metadata.entreprise_id`,
// pas un double.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const BNA = "11111111-1111-4111-8111-111111111111";
const TEST = "22222222-2222-4222-8222-222222222222";

// --- Mocks ------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));
vi.mock("@/components/BonCommandePDF", () => ({ default: () => null }));
vi.mock("@/components/SignaturePad", () => ({ default: () => null }));

type Journal = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  filtres: Record<string, unknown>;
  payload: unknown;
};

let journal: Journal[] = [];
let claim: { entreprise_id?: string } | undefined = { entreprise_id: BNA };
type Commande = Record<string, unknown>;
let commandesLues: Commande[] = [];
let notificationsExistantes: Array<{ lien: string | null }> = [];
let erreurInsert: { message: string } | null = null;
let erreurSelectNotif: { message: string } | null = null;

function reponsePour(j: Journal) {
  switch (j.table) {
    case "fournisseurs":
      return [];
    case "chantiers":
      return [];
    case "commandes":
      return commandesLues;
    case "entreprise_settings":
      return { id: 1, raison_sociale: "BNA" };
    case "notifications":
      return notificationsExistantes;
    default:
      return [];
  }
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { app_metadata: claim } }, error: null }),
    },
    from(table: string) {
      const etat = {
        table,
        op: "select" as Journal["op"],
        filtres: {} as Record<string, unknown>,
        payload: null as unknown,
      };
      const api = {
        select: () => api,
        order: () => api,
        limit: () => api,
        single: () => api,
        eq: (c: string, v: unknown) => {
          etat.filtres[c] = v;
          return api;
        },
        gte: (c: string, v: unknown) => {
          etat.filtres[`gte:${c}`] = v;
          return api;
        },
        in: () => api,
        insert: (p: unknown) => {
          etat.op = "insert";
          etat.payload = p;
          journal.push({ ...etat });
          return Promise.resolve({ data: null, error: erreurInsert });
        },
        update: (p: unknown) => {
          etat.op = "update";
          etat.payload = p;
          journal.push({ ...etat });
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => {
          etat.op = "delete";
          journal.push({ ...etat });
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve: (v: unknown) => unknown) => {
          journal.push({ ...etat });
          if (table === "notifications" && erreurSelectNotif) {
            return resolve({ data: null, error: erreurSelectNotif });
          }
          return resolve({ data: reponsePour(etat), error: null });
        },
      };
      return api;
    },
  },
}));

import FournisseursPage from "@/app/bureau/fournisseurs/page";

// --- Harnais ----------------------------------------------------------------

let conteneur: HTMLDivElement;
let root: Root;
let spyError: MockInstance<typeof console.error>;

function commandeEnRetard(suffixe: string, jours: number): Commande {
  const prevue = new Date();
  prevue.setDate(prevue.getDate() - jours);
  const iso = prevue.toISOString().slice(0, 10);
  return {
    id: `00000000-0000-4000-8000-${suffixe}`,
    fournisseur_id: "f1",
    chantier_id: null,
    designation: "Panneau sandwich",
    quantite: 10,
    unite: "m²",
    montant_ht: 1000,
    statut: "commandee",
    date_livraison_prevue: iso,
    date_livraison_reelle: null,
    date_commande: iso,
    created_at: new Date().toISOString(),
    fournisseurs: { nom: "Leroy Merlin" },
    chantiers: null,
  };
}

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  journal = [];
  claim = { entreprise_id: BNA };
  commandesLues = [commandeEnRetard("000000000001", 3)];
  notificationsExistantes = [];
  erreurInsert = null;
  erreurSelectNotif = null;
  spyError = vi.spyOn(console, "error").mockImplementation(() => {});
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  conteneur.remove();
  spyError.mockRestore();
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

async function monter() {
  await act(async () => {
    root.render(<FournisseursPage />);
  });
}

const insertsNotifications = () => journal.filter((j) => j.table === "notifications" && j.op === "insert");
const selectNotifications = () => journal.filter((j) => j.table === "notifications" && j.op === "select");
const lignesInserees = () => {
  const j = insertsNotifications()[0];
  return Array.isArray(j?.payload) ? (j.payload as Record<string, unknown>[]) : [];
};

// ============================================================================

describe("O3-B6/N9 — le producteur porte bien entreprise_id", () => {
  it("insère une notification par commande en retard, scopée sur le claim", async () => {
    await monter();
    const lignes = lignesInserees();
    expect(lignes).toHaveLength(1);
    expect(lignes[0].entreprise_id).toBe(BNA);
    expect(lignes[0].type).toBe("commande_retard");
    expect(lignes[0].titre).toBe("Livraison en retard");
    expect(lignes[0].lu).toBe(false);
    expect(lignes[0].lien).toBe(`/bureau/fournisseurs?retard=${commandesLues[0].id}`);
  });

  it("Suit le claim du tenant, sans constante en dur (tenant TEST)", async () => {
    claim = { entreprise_id: TEST };
    await monter();
    expect(lignesInserees()[0].entreprise_id).toBe(TEST);
    expect(lignesInserees()[0].entreprise_id).not.toBe(BNA);
  });

  it("ne pose JAMAIS de destinataire_id (modèle collectif O3-B6/N1)", async () => {
    await monter();
    expect(lignesInserees()[0]).not.toHaveProperty("destinataire_id");
  });

  it("insère une ligne par commande, toutes scopées", async () => {
    commandesLues = [commandeEnRetard("000000000001", 3), commandeEnRetard("000000000002", 5)];
    await monter();
    const lignes = lignesInserees();
    expect(lignes).toHaveLength(2);
    expect(lignes.every((l) => l.entreprise_id === BNA)).toBe(true);
  });

  it("ignore les commandes livrées, annulées ou non en retard", async () => {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    commandesLues = [
      { ...commandeEnRetard("000000000001", 3), statut: "livree" },
      { ...commandeEnRetard("000000000002", 3), statut: "annulee" },
      { ...commandeEnRetard("000000000003", 3), date_livraison_prevue: demain },
      { ...commandeEnRetard("000000000004", 3), date_livraison_prevue: aujourdhui },
    ];
    await monter();
    expect(insertsNotifications()).toHaveLength(0);
  });
});

describe("O3-B6/N9 — fail-closed sans contexte entreprise", () => {
  it("n'insère RIEN et journalise si le claim est absent", async () => {
    claim = {};
    await monter();
    expect(insertsNotifications()).toHaveLength(0);
    expect(spyError).toHaveBeenCalled();
    expect(String(spyError.mock.calls[0][0])).toContain("alerte de retard NON émise");
  });

  it("n'insère RIEN si le claim est un UUID malformé", async () => {
    claim = { entreprise_id: "pas-un-uuid" };
    await monter();
    expect(insertsNotifications()).toHaveLength(0);
    expect(spyError).toHaveBeenCalled();
  });

  it("n'insère RIEN et journalise si la lecture de déduplication échoue", async () => {
    erreurSelectNotif = { message: "boom" };
    await monter();
    expect(insertsNotifications()).toHaveLength(0);
    expect(String(spyError.mock.calls[0][0])).toContain("lecture des notifications de retard");
  });
});

describe("O3-B6/N9 — la déduplication est scopée sur le même tenant", () => {
  it("filtre la lecture par .eq('entreprise_id', claim)", async () => {
    await monter();
    const lecture = selectNotifications()[0];
    expect(lecture.filtres.entreprise_id).toBe(BNA);
    expect(lecture.filtres.type).toBe("commande_retard");
    expect(lecture.filtres["gte:created_at"]).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00$/);
  });

  it("n'insère pas une notification déjà émise cette semaine", async () => {
    notificationsExistantes = [{ lien: `/bureau/fournisseurs?retard=${commandesLues[0].id}` }];
    await monter();
    expect(insertsNotifications()).toHaveLength(0);
  });
});

describe("O3-B6/N9 — l'erreur d'insert est gérée explicitement", () => {
  it("ne propage PAS l'échec et journalise l'erreur", async () => {
    erreurInsert = { message: "23502 null value in column entreprise_id" };
    await expect(monter()).resolves.toBeUndefined();
    expect(spyError).toHaveBeenCalled();
    const messages = spyError.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("alerte de retard NON émise"))).toBe(true);
  });

  it("reste silencieux en cas de succès", async () => {
    await monter();
    expect(insertsNotifications()).toHaveLength(1);
    expect(spyError).not.toHaveBeenCalled();
  });
});
