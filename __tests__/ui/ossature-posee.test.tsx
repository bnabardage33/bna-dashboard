// __tests__/ui/ossature-posee.test.tsx
//
// PARCOURS TERRAIN « OSSATURE POSÉE » — rendu et écriture.
//
// Les règles MÉTIER du parcours sont verrouillées par
// `__tests__/metre/suivi-terrain-ossature.test.ts`. Ce test verrouille le
// COMPOSANT terrain : les deux choix proposés (et eux seuls), le refus
// d'enregistrer un choix non pris, l'exigence de façade initiale pour le
// choix B, l'écriture tracée dans `journal_chantier` (tag `ossature-posee`),
// et le fait que la journée affichée reste VERTE après un incident.
//
// Corrégis d'audit (P1, P3, P4, P6) : clôture effective de la reprise de
// choix B, filtre du jour au calendrier Europe/Paris (limites de minuit,
// été comme hiver), échec de sauvegarde conservant la saisie, garde
// synchrone contre les doubles soumissions, heures affichées en Europe/Paris.
//
// PAS de `@testing-library/react` (incompatible React 19 ici) : harnais
// `createRoot` + `act`.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

// --- Mock Supabase (journal_chantier uniquement) ---------------------------

type LigneJournal = {
  chantier_id: string;
  contenu: string;
  source: string;
  created_at: string;
};

let journal: LigneJournal[] = [];
let erreurInsert: { message: string } | null = null;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "journal_chantier") {
        throw new Error(`Table inattendue dans le test : ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [...journal], error: null }),
              }),
            }),
          }),
        }),
        insert: (ligne: Omit<LigneJournal, "created_at">) => {
          if (erreurInsert) return Promise.resolve({ error: erreurInsert });
          journal = [...journal, { ...ligne, created_at: new Date().toISOString() }];
          return Promise.resolve({ error: null });
        },
      };
    },
  },
}));

import OssaturePosee from "@/components/OssaturePosee";
import { SOURCE_OSSATURE_POSEE, lireEvenement } from "@/lib/suiviTerrain";

// --- Harnais ----------------------------------------------------------------

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  journal = [];
  erreurInsert = null;
  // Journée figée : le composant filtre le journal sur le jour, et timestamp
  // ses événements avec l'heure courante.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T10:00:00.000Z"));
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  conteneur.remove();
  vi.useRealTimers();
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT;
});

async function monter(jour = "2026-10-20") {
  // Remontage À NEUF : réutiliser le même root avec des props inchangées ne
  // relance pas le chargement (`charger` est mémoïsé sur [chantierId, jour]).
  // Pour rejouer le filtre du jour, on démonte puis on remonte.
  await act(async () => {
    root.unmount();
  });
  conteneur.remove();
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  await act(async () => {
    root.render(<OssaturePosee chantierId="ch-1" jour={jour} />);
  });
}

function bouton(contenu: string): HTMLButtonElement {
  const b = [...conteneur.querySelectorAll("button")].find((x) =>
    (x.textContent ?? "").includes(contenu),
  );
  if (!b) throw new Error(`Bouton contenant « ${contenu} » introuvable`);
  return b;
}

async function cliquer(contenu: string) {
  await act(async () => {
    clic(bouton(contenu));
  });
}

function clic(ele: Element) {
  ele.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function saisir(textarea: HTMLTextAreaElement, valeur: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, valeur);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

// --- 1. Le bouton et les DEUX choix ----------------------------------------

describe("rendu du parcours", () => {
  it("affiche le panneau « Ossature posée ? » dans l'onglet Avancement", async () => {
    await monter();
    expect(conteneur.textContent).toContain("Ossature posée ?");
  });

  it("propose EXACTEMENT deux choix — Intempéries et Autre façade", async () => {
    await monter();
    const titres = [...conteneur.querySelectorAll("button")]
      .map((b) => (b.textContent ?? "").trim())
      .filter((t) => t.startsWith("Intempéries") || t.startsWith("Autre façade"));
    // Deux boutons de choix, pas trois, pas un.
    expect(titres).toHaveLength(2);
    expect(titres[0]).toContain("Intempéries");
    expect(titres[1]).toContain("Autre façade");
  });

  it("n'affiche AUCUNE qualification d'arrêt indemnisable", async () => {
    await monter();
    expect(conteneur.textContent).not.toMatch(/arrêt (légal|indemnisable)/i);
  });
});

// --- 2. Validation de la saisie ---------------------------------------------

describe("validation", () => {
  it("refuse un enregistrement sans façade, avec une explication", async () => {
    await monter();
    // Le bouton n'apparaît qu'APRÈS un choix explicite : aucun choix n'est
    // jamais présélectionné.
    await cliquer("Intempéries");
    await cliquer("Enregistrer l'ossature posée");
    expect(conteneur.textContent).toContain("Indiquez la façade concernée.");
    expect(journal).toHaveLength(0);
  });

  it("le choix « Autre façade » exige la façade initiale bloquée", async () => {
    await monter();
    await cliquer("Autre façade");
    // Le sélecteur de façade initiale apparaît — et le rappel qu'elle est
    // conservée.
    expect(conteneur.textContent).toContain("Façade initialement prévue");
    expect(conteneur.textContent).toContain("n'est jamais effacé");

    await cliquer("Façade Est"); // façade posée seulement
    await cliquer("Enregistrer l'ossature posée");
    expect(conteneur.textContent).toContain("Indiquez la façade qui reste bloquée.");
    expect(journal).toHaveLength(0);
  });
});

// --- 3. Enregistrement du choix A : journee verte + tracé -------------------

describe("choix A « Intempéries »", () => {
  it("écrit un événement tracé dans journal_chantier, et la journée reste verte", async () => {
    await monter();
    await cliquer("Intempéries");
    await cliquer("Façade Sud");

    const textarea = conteneur.querySelector(
      "#motif-ossature",
    ) as HTMLTextAreaElement;
    await act(async () => {
      saisir(textarea, "rafales en après-midi");
    });
    await cliquer("Enregistrer l'ossature posée");

    // La ligne est bien écrite, avec le tag stable.
    expect(journal).toHaveLength(1);
    expect(journal[0].source).toBe(SOURCE_OSSATURE_POSEE);
    expect(journal[0].chantier_id).toBe("ch-1");

    // L'événement relu contient le motif, la façade, ET la date/heure de début.
    const ev = lireEvenement(journal[0].contenu);
    expect(ev).not.toBeNull();
    expect(ev?.choix).toBe("intemperies");
    expect(ev?.facade).toBe("sud");
    expect(ev?.motif).toBe("rafales en après-midi");
    expect(ev?.debut).toMatch(/^2026-10-20T10:00/); // date ET heure

    // La journée est réaffichée comme activité réalisée — PAS comme arrêt.
    expect(conteneur.textContent).toContain("Activité réalisée");
    expect(conteneur.textContent).toContain("Gêne signalée");
    expect(conteneur.textContent).toContain("[ouvert]");
  });

  it("propose de documenter la reprise sur l'incident ouvert", async () => {
    journal = [
      {
        chantier_id: "ch-1",
        source: SOURCE_OSSATURE_POSEE,
        created_at: "2026-10-20T08:15:00.000Z",
        contenu: JSON.stringify({
          v: 1,
          type: "ossature_posee",
          facade: "sud",
          choix: "intemperies",
          motif: "vent fort",
          debut: "2026-10-20T08:15:00.000Z",
        }),
      },
    ];
    await monter();

    expect(conteneur.textContent).toContain("Incident ouvert");
    await cliquer("+ Documenter la reprise");
    const textarea = conteneur.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      saisir(textarea, "reprise à 14 h");
    });
    await cliquer("Documenter la reprise");

    // Un SECOND événement est écrit, rattaché au cas : l'original n'est pas
    // modifié (donc pas effacé).
    expect(journal).toHaveLength(2);
    const reprise = lireEvenement(journal[1].contenu);
    expect(reprise?.reprise?.note).toBe("reprise à 14 h");
    expect(lireEvenement(journal[0].contenu)?.motif).toBe("vent fort");

    expect(conteneur.textContent).toContain("Reprise documentée");
  });
});

// --- 4. Choix B : conservation de la trace ----------------------------------

describe("choix B « Autre façade »", () => {
  it("conserve façade posée ET façade bloquée, la journée reste verte", async () => {
    journal = [
      {
        chantier_id: "ch-1",
        source: SOURCE_OSSATURE_POSEE,
        created_at: "2026-10-20T09:00:00.000Z",
        contenu: JSON.stringify({
          v: 1,
          type: "ossature_posee",
          facade: "est",
          choix: "autre_facade",
          facadeInitiale: "nord",
          motif: "façade nord exposée",
          debut: "2026-10-20T09:00:00.000Z",
        }),
      },
    ];
    await monter();

    expect(conteneur.textContent).toContain("Activité réalisée");
    expect(conteneur.textContent).toContain("Façade Est");
    expect(conteneur.textContent).toContain("Façade Nord"); // la bloquée, conservée
    expect(conteneur.textContent).toContain("Façade bloquée");
    expect(conteneur.textContent).toContain("[ouvert]");
  });
});

// --- 5. P1 — reprise du choix B : clôture effective ---------------------------

function incidentAutreFacade(id?: string) {
  return {
    chantier_id: "ch-1",
    source: SOURCE_OSSATURE_POSEE,
    created_at: "2026-10-20T09:00:00.000Z",
    contenu: JSON.stringify({
      v: 1,
      type: "ossature_posee",
      ...(id ? { id } : {}),
      facade: "est",
      choix: "autre_facade",
      facadeInitiale: "nord",
      motif: "façade nord exposée",
      debut: "2026-10-20T09:00:00.000Z",
    }),
  };
}

describe("reprise du choix B (P1) — clôture effective, sans doublon", () => {
  it("documenter la reprise clôture l'incident « autre façade » et rattrape la bonne façade", async () => {
    journal = [incidentAutreFacade("inc-1")];
    await monter();
    expect(conteneur.textContent).toContain("[ouvert]");

    await cliquer("+ Documenter la reprise");
    const textarea = conteneur.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      saisir(textarea, "reprise sur est à 16 h");
    });
    await cliquer("Documenter la reprise");

    // L'événement de reprise porte l'identité COMPLÈTE de l'incident :
    // façade POSÉE, façade initiale BLOQUÉE, et la référence `referente`.
    expect(journal).toHaveLength(2);
    const reprise = lireEvenement(journal[1].contenu);
    expect(reprise?.facade).toBe("est"); // la posée, PAS la bloquée
    expect(reprise?.facadeInitiale).toBe("nord");
    expect(reprise?.reprise?.referente).toBe("inc-1");
    expect(reprise?.reprise?.note).toBe("reprise sur est à 16 h");

    // L'incident est CLÔTURÉ : plus d'« ouvert », l'historique reste affiché.
    expect(conteneur.textContent).toContain("[documenté]");
    expect(conteneur.textContent).not.toContain("[ouvert]");
    expect(conteneur.textContent).not.toContain("Incident ouvert");

    // P2 : la façade bloquée n'apparaît plus comme « posée ».
    expect(conteneur.textContent).toContain("Ossature posée : Façade Est.");

    // Sans incident ouvert, plus rien ne se documente : aucune reprise
    // dupliquée possible.
    const boutonsReprise = [...conteneur.querySelectorAll("button")].filter((b) =>
      (b.textContent ?? "").includes("Documenter la reprise"),
    );
    expect(boutonsReprise).toHaveLength(0);
  });

  it("une reprise de choix B écrit l'événement AVEC son identifiant stable", async () => {
    journal = [incidentAutreFacade("inc-9")];
    await monter();
    await cliquer("+ Documenter la reprise");
    const textarea = conteneur.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      saisir(textarea, "reprise");
    });
    await cliquer("Documenter la reprise");

    const ev = lireEvenement(journal[1].contenu);
    expect(ev?.id).toBeDefined(); // son propre identifiant
    expect(ev?.id).not.toBe("inc-9"); // distinct de celui de l'incident
    expect(ev?.reprise?.referente).toBe("inc-9");
  });
});

// --- 6. P4/P6 — échec de sauvegarde et doubles soumissions --------------------

describe("robustesse de l'enregistrement (P4/P6)", () => {
  it("un échec de sauvegarde affiche l'erreur, conserve la saisie, n'écrit rien", async () => {
    await monter();
    await cliquer("Intempéries");
    await cliquer("Façade Sud");
    const textarea = conteneur.querySelector("#motif-ossature") as HTMLTextAreaElement;
    await act(async () => {
      saisir(textarea, "rafales en après-midi");
    });

    erreurInsert = { message: "réseau coupé" };
    await cliquer("Enregistrer l'ossature posée");

    expect(conteneur.textContent).toContain("Enregistrement impossible : réseau coupé");
    expect(journal).toHaveLength(0); // RIEN n'a été écrit
    // Le formulaire et le motif saisi sont CONSERVÉS : rien n'est perdu.
    expect(
      (conteneur.querySelector("#motif-ossature") as HTMLTextAreaElement).value,
    ).toContain("rafales en après-midi");

    // La re-tentative après l'échec réussit.
    erreurInsert = null;
    await cliquer("Enregistrer l'ossature posée");
    expect(journal).toHaveLength(1);
    expect(conteneur.textContent).not.toContain("réseau coupé");
  });

  it("deux clics rapprochés n'écrivent QU'UNE seule ligne (garde synchrone)", async () => {
    await monter();
    await cliquer("Intempéries");
    await cliquer("Façade Sud");
    const textarea = conteneur.querySelector("#motif-ossature") as HTMLTextAreaElement;
    await act(async () => {
      saisir(textarea, "essai de double soumission");
    });

    // Deux clics consécutifs dans le MÊME act : aucun rendu entre les deux.
    await act(async () => {
      clic(bouton("Enregistrer l'ossature posée"));
      clic(bouton("Enregistrer l'ossature posée"));
    });

    expect(journal).toHaveLength(1);
  });
});

// --- 7. P3/P6 — jour et heures au calendrier Europe/Paris --------------------

function ligneJour(debut: string): LigneJournal {
  return {
    chantier_id: "ch-1",
    source: SOURCE_OSSATURE_POSEE,
    created_at: debut,
    contenu: JSON.stringify({
      v: 1,
      type: "ossature_posee",
      facade: "sud",
      choix: "intemperies",
      motif: "test fuseau",
      debut,
    }),
  };
}

describe("filtre du jour et affichage des heures — Europe/Paris (P3/P6)", () => {
  it("HEURE D'ÉTÉ — 00 h 30 heure de Paris (UTC+2) appartient au lendemain", async () => {
    journal = [ligneJour("2026-07-20T22:30:00.000Z")]; // = 21/07 00:30 Paris
    await monter("2026-07-21");
    expect(conteneur.textContent).toContain("Gêne signalée"); // visible

    await monter("2026-07-20");
    expect(conteneur.textContent).toContain("Rien enregistré"); // pas au 20
  });

  it("HEURE D'ÉTÉ — limites exactes de minuit (21:59:59Z / 22:00:00Z)", async () => {
    journal = [ligneJour("2026-07-20T21:59:59.000Z")]; // 23:59:59 Paris 20/07
    await monter("2026-07-20");
    expect(conteneur.textContent).toContain("Gêne signalée");
    await monter("2026-07-21");
    expect(conteneur.textContent).toContain("Rien enregistré");

    journal = [ligneJour("2026-07-20T22:00:00.000Z")]; // 00:00:00 Paris 21/07
    await monter("2026-07-21");
    expect(conteneur.textContent).toContain("Gêne signalée");
    await monter("2026-07-20");
    expect(conteneur.textContent).toContain("Rien enregistré");
  });

  it("HEURE D'HIVER — 00 h 30 heure de Paris (UTC+1) appartient au lendemain", async () => {
    journal = [ligneJour("2026-01-20T23:30:00.000Z")]; // = 21/01 00:30 Paris
    await monter("2026-01-21");
    expect(conteneur.textContent).toContain("Gêne signalée");

    await monter("2026-01-20");
    expect(conteneur.textContent).toContain("Rien enregistré");
  });

  it("HEURE D'HIVER — limites exactes de minuit (22:59:59Z / 23:00:00Z)", async () => {
    journal = [ligneJour("2026-01-20T22:59:59.000Z")]; // 23:59:59 Paris 20/01
    await monter("2026-01-20");
    expect(conteneur.textContent).toContain("Gêne signalée");
    await monter("2026-01-21");
    expect(conteneur.textContent).toContain("Rien enregistré");

    journal = [ligneJour("2026-01-20T23:00:00.000Z")]; // 00:00:00 Paris 21/01
    await monter("2026-01-21");
    expect(conteneur.textContent).toContain("Gêne signalée");
    await monter("2026-01-20");
    expect(conteneur.textContent).toContain("Rien enregistré");
  });

  it("l'heure affichée est en Europe/Paris, quel que soit le fuseau du poste (P6)", async () => {
    journal = [ligneJour("2026-07-20T22:30:00.000Z")]; // = 21/07 00:30 Paris
    await monter("2026-07-21");
    // L'incident affiche son début : 21/07 à 00 h 30, heure de PARIS — jamais
    // l'heure UTC (22:30) ni celle d'un téléphone mal réglé.
    expect(conteneur.textContent).toMatch(/21\/07[^0-9]*00:30/);
    expect(conteneur.textContent).not.toMatch(/20\/07[^0-9]*22:30/);
  });
});
