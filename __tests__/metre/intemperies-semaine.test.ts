// __tests__/metre/intemperies-semaine.test.ts
//
// Non-régression du RÉSUMÉ HEBDOMADAIRE de vigilance (snapshot client).
//
// Défaut corrigé : le résumé fabriquait un « vert ».
//   • `vitilanceMax` démarrait à "vert" ;
//   • `ligne?.vigilance_officielle ?? "vert"` valorisait un jour sans niveau.
// Une semaine dont TOUS les rapports portaient la sentinelle « indisponible »
// (API Météo-France muette) — ou sans aucun rapport — s'affichait donc comme une
// « vigilance verte confirmée ». Une valeur inattendue était rabattue sur vert.
//
// Invariant : une couleur n'est retenue QUE si elle est explicitement présente ;
// sinon l'état est « indisponible », jamais un vert implicite.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const parTable: Record<string, unknown[]> = {};
  const uniques: Record<string, unknown> = {};

  function from(table: string) {
    const chaine: Record<string, unknown> = {};
    const retour = () => chaine;
    for (const m of ["select", "eq", "neq", "gte", "lte", "lt", "order", "limit"]) {
      chaine[m] = retour;
    }
    // `chantiers` / `clients` sont lus via `.maybeSingle()`.
    chaine.maybeSingle = async () => ({ data: uniques[table] ?? null, error: null });
    // Toutes les autres tables sont attendues directement (chaîne « thenable »).
    chaine.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: parTable[table] ?? [], error: null });
    return chaine;
  }

  return { parTable, uniques, from };
});

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: h.from },
}));

import {
  agregerIntemperiesSemaine,
  estCouleurVigilance,
  normaliserVigilance,
  vigilanceMaxDe,
  type RapportIntemperieSemaine,
} from "@/lib/intemperiesSemaine";
import { EMOJI_VIGILANCE } from "@/lib/rapports-client";
import { construireSnapshot, encadrerSemainePassee } from "@/lib/rapports-client.server";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function rapport(
  jour: string,
  vigilance_officielle: string,
  options: {
    heure?: string;
    jour_arrete?: boolean;
    motif?: string;
    entreprise_id?: string;
  } = {},
): RapportIntemperieSemaine & { entreprise_id?: string } {
  return {
    cree_le: `${jour}T${options.heure ?? "09:00"}:00Z`,
    jour_arrete: options.jour_arrete ?? false,
    motif: options.motif ?? "Motif",
    vigilance_officielle,
    ...(options.entreprise_id ? { entreprise_id: options.entreprise_id } : {}),
  };
}

const LUNDI = "2026-10-12";
const DIMANCHE = "2026-10-18";

// ─── Fonctions pures ─────────────────────────────────────────────────────────

describe("vigilance hebdomadaire — fonctions pures", () => {
  it("reconnaît SEULEMENT les quatre niveaux officiels", () => {
    for (const couleur of ["vert", "jaune", "orange", "rouge"]) {
      expect(estCouleurVigilance(couleur)).toBe(true);
    }
    for (const autre of ["indisponible", "violet", "", "VERT", null, 2, undefined]) {
      expect(estCouleurVigilance(autre)).toBe(false);
    }
  });

  it("normalise toute valeur non reconnue en « indisponible », jamais en vert", () => {
    expect(normaliserVigilance("vert")).toBe("vert");
    expect(normaliserVigilance("indisponible")).toBe("indisponible");
    expect(normaliserVigilance("violet")).toBe("indisponible");
    expect(normaliserVigilance("")).toBe("indisponible");
    expect(normaliserVigilance(null)).toBe("indisponible");
    expect(normaliserVigilance(undefined)).toBe("indisponible");
  });

  it("« vigilanceMaxDe » renvoie « indisponible » quand aucune couleur n'est confirmée", () => {
    expect(vigilanceMaxDe([])).toBe("indisponible");
    expect(vigilanceMaxDe(["indisponible", "indisponible"])).toBe("indisponible");
    expect(vigilanceMaxDe(["violet", undefined, ""])).toBe("indisponible");
  });

  it("retient la plus forte couleur CONFIRMÉE, en ignorant l'indisponible", () => {
    expect(vigilanceMaxDe(["vert", "indisponible"])).toBe("vert");
    expect(vigilanceMaxDe(["vert", "orange", "jaune"])).toBe("orange");
    expect(vigilanceMaxDe(["indisponible", "rouge", "violet"])).toBe("rouge");
  });

  it("l'emoji « indisponible » n'est pas un vert", () => {
    expect(EMOJI_VIGILANCE.indisponible).toBe("⚪");
    expect(EMOJI_VIGILANCE.indisponible).not.toBe(EMOJI_VIGILANCE.vert);
  });
});

// ─── Agrégation d'une semaine ────────────────────────────────────────────────

describe("agregerIntemperiesSemaine — une couleur n'est jamais inventée", () => {
  it("tous les rapports « indisponible » => « indisponible », pas « vert »", () => {
    const resume = agregerIntemperiesSemaine(
      [rapport("2026-10-13", "indisponible"), rapport("2026-10-14", "indisponible")],
      LUNDI,
      DIMANCHE,
    );

    expect(resume.vigilanceMax).toBe("indisponible");
    expect(resume.details.map((d) => d.vigilance)).toEqual([
      "indisponible",
      "indisponible",
    ]);
  });

  it("aucun rapport => « indisponible » (pas de vert implicite)", () => {
    const resume = agregerIntemperiesSemaine([], LUNDI, DIMANCHE);
    expect(resume.vigilanceMax).toBe("indisponible");
    expect(resume.details).toEqual([]);
    expect(resume.joursArretTotal).toBe(0);
  });

  it("valeur inattendue (« violet ») => « indisponible », pas « vert »", () => {
    const resume = agregerIntemperiesSemaine(
      [rapport("2026-10-13", "violet")],
      LUNDI,
      DIMANCHE,
    );
    expect(resume.vigilanceMax).toBe("indisponible");
    expect(resume.details[0].vigilance).toBe("indisponible");
  });

  it("une semaine VERTE confirmée reste verte", () => {
    const resume = agregerIntemperiesSemaine(
      [rapport("2026-10-13", "vert"), rapport("2026-10-15", "vert")],
      LUNDI,
      DIMANCHE,
    );

    expect(resume.vigilanceMax).toBe("vert");
  });

  it("retient la plus forte couleur confirmée de la semaine", () => {
    const resume = agregerIntemperiesSemaine(
      [rapport("2026-10-13", "vert"), rapport("2026-10-14", "orange")],
      LUNDI,
      DIMANCHE,
    );

    expect(resume.vigilanceMax).toBe("orange");
  });

  it("un jour indisponible n'abaisse ni n'élève un vert confirmé", () => {
    const resume = agregerIntemperiesSemaine(
      [rapport("2026-10-13", "vert"), rapport("2026-10-14", "indisponible")],
      LUNDI,
      DIMANCHE,
    );

    expect(resume.vigilanceMax).toBe("vert");
  });

  it("une valeur inconnue ne masque pas une couleur réellement confirmée", () => {
    const resume = agregerIntemperiesSemaine(
      [rapport("2026-10-13", "violet"), rapport("2026-10-14", "jaune")],
      LUNDI,
      DIMANCHE,
    );

    expect(resume.vigilanceMax).toBe("jaune");
  });

  it("ne garde qu'un jour par date, le plus récent", () => {
    const resume = agregerIntemperiesSemaine(
      [
        rapport("2026-10-14", "vert", { heure: "08:00" }),
        rapport("2026-10-14", "orange", { heure: "15:00" }),
      ],
      LUNDI,
      DIMANCHE,
    );

    expect(resume.details).toHaveLength(1);
    expect(resume.details[0].vigilance).toBe("orange");
  });

  it("ignore les rapports hors de la semaine et compte les jours d'arrêt", () => {
    const resume = agregerIntemperiesSemaine(
      [
        rapport("2026-10-11", "rouge"), // dimanche précédent : hors semaine
        rapport("2026-10-13", "vert", { jour_arrete: true }),
        rapport("2026-10-19", "rouge"), // lundi suivant : hors semaine
      ],
      LUNDI,
      DIMANCHE,
    );

    expect(resume.details.map((d) => d.date)).toEqual(["2026-10-13"]);
    expect(resume.joursArretTotal).toBe(1);
    expect(resume.vigilanceMax).toBe("vert");
  });

  it("une semaine sans rapport reste « indisponible » (jamais vert)", () => {
    const resume = agregerIntemperiesSemaine([], LUNDI, DIMANCHE);

    expect(resume.joursArretTotal).toBe(0);
    expect(resume.details).toEqual([]);
    expect(resume.vigilanceMax).toBe("indisponible");
  });
});

// ─── Intégration : le snapshot complet porte bien l'état ─────────────────────

describe("construireSnapshot — vigilance_max reflète la semaine réelle", () => {
  const ENTREPRISE = "11111111-1111-4111-8111-111111111111";
  const CHANTIER = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    h.parTable.rapports_intemperies = [];
    h.parTable.avancements_chantier = [];
    h.parTable.photos = [];
    h.parTable.pointages_globaux = [];
    h.uniques.chantiers = {
      id: CHANTIER,
      nom: "Chantier Test",
      client_id: null,
      date_fin: null,
      adresse_chantier: "1 Rue Test, 33000 Bordeaux",
      entreprise_id: ENTREPRISE,
    };
  });

  afterEach(() => {
    delete h.uniques.chantiers;
  });

  it("une semaine sans rapport produit « indisponible », pas « vert »", async () => {
    const snapshot = await construireSnapshot(CHANTIER, ENTREPRISE);

    expect(snapshot.intemperies.vigilance_max).toBe("indisponible");
  });

  it("une semaine verte confirmée reste « vert »", async () => {
    const { lundiISO } = encadrerSemainePassee(new Date());
    h.parTable.rapports_intemperies = [
      rapport(lundiISO, "vert", { entreprise_id: ENTREPRISE }),
    ];

    const snapshot = await construireSnapshot(CHANTIER, ENTREPRISE);

    expect(snapshot.intemperies.vigilance_max).toBe("vert");
  });

  it("des rapports « indisponible » ne fabriquent pas un « vert »", async () => {
    const { lundiISO } = encadrerSemainePassee(new Date());
    h.parTable.rapports_intemperies = [
      rapport(lundiISO, "indisponible", { entreprise_id: ENTREPRISE }),
    ];

    const snapshot = await construireSnapshot(CHANTIER, ENTREPRISE);

    expect(snapshot.intemperies.vigilance_max).toBe("indisponible");
  });
});
