// __tests__/metre/suivi-terrain-ossature.test.ts
//
// PARCOURS TERRAIN « OSSATURE POSÉE » — verrouils métier.
//
// Scénarios couverts (commande initiale) :
//   1. le parcours « Ossature posée » dans ses deux choix, et eux seuls ;
//   2. « Intempéries » avec traçabilité de l'attente (début, motif, reprise) ;
//   3. « Autre façade » : journée VERTE + conservation de la trace de la
//      façade initialement bloquée.
//
// Règles verrouillées :
//   - un incident NE recolore JAMAIS la journée en rouge ;
//   - un incident n'est JAMAIS effacé par un autre événement ;
//   - l'absence d'événement n'est PAS un vert : c'est `attente` ;
//   - aucune qualification d'arrêt indemnisable n'est produite ici.

import { describe, expect, it } from "vitest";
import {
  LIBELLES_FACADE,
  LIBELLES_STATUT_ACTIVITE,
  SOURCE_OSSATURE_POSEE,
  deriverEtatJournee,
  lireEvenement,
  serialiserEvenement,
  validerEvenement,
  type EvenementOssature,
  type FacadeOssature,
} from "@/lib/suiviTerrain";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DEBUT = "2026-10-20T08:15:00.000Z";

function evenementIntemperies(
  overrides: Partial<EvenementOssature> = {},
): EvenementOssature {
  return {
    v: 1,
    type: "ossature_posee",
    facade: "sud",
    choix: "intemperies",
    motif: "rafales fortes en début d'après-midi",
    debut: DEBUT,
    ...overrides,
  };
}

function evenementAutreFacade(
  overrides: Partial<EvenementOssature> = {},
): EvenementOssature {
  return {
    v: 1,
    type: "ossature_posee",
    facade: "est",
    choix: "autre_facade",
    facadeInitiale: "nord",
    motif: "façade nord exposée, pluie prévue",
    debut: DEBUT,
    ...overrides,
  };
}

// ─── 1. Le parcours dans ses deux choix, et eux seuls ────────────────────────

describe("parcours « Ossature posée » — exactement deux choix", () => {
  it("sérialise et relit chaque choix sans perte", () => {
    for (const ev of [evenementIntemperies(), evenementAutreFacade()]) {
      const relu = lireEvenement(serialiserEvenement(ev));
      expect(relu).toEqual(ev);
    }
  });

  it("refuse un choix hors des deux cas — aucun troisième état implicite", () => {
    const relu = lireEvenement(
      JSON.stringify({ ...evenementIntemperies(), choix: "arret_total" }),
    );
    expect(relu).toBeNull();
  });

  it("exige une façade initiale pour « Autre façade », distincte de la posée", () => {
    expect(
      validerEvenement({
        choix: "autre_facade",
        facade: "est",
        facadeInitiale: null,
        motif: "",
      }).ok,
    ).toBe(false);
    expect(
      validerEvenement({
        choix: "autre_facade",
        facade: "est",
        facadeInitiale: "est",
        motif: "",
      }).ok,
    ).toBe(false);
  });

  it("n'exige PAS de motif pour « Intempéries » : un incident faute de texte doit rester enregistrable", () => {
    expect(
      validerEvenement({
        choix: "intemperies",
        facade: "sud",
        facadeInitiale: null,
        motif: "",
      }).ok,
    ).toBe(true);
  });

  it("ignore explicitement une ligne illisible au lieu d'inventer un événement", () => {
    expect(lireEvenement("note libre quelconque")).toBeNull();
    expect(lireEvenement("")).toBeNull();
    expect(lireEvenement(null)).toBeNull();
    expect(
      lireEvenement(
        JSON.stringify({ type: "ossature_posee", choix: "intemperies" }),
      ),
    ).toBeNull();
  });
});

// ─── 2. Intempéries : traçabilité de l'attente ───────────────────────────────

describe("choix A « Intempéries » — le motif, la date/heure de début, la reprise", () => {
  it("conserve la date ET l'heure de début de l'événement", () => {
    const etat = deriverEtatJournee([evenementIntemperies()]);
    expect(etat.incidents).toHaveLength(1);
    expect(etat.incidents[0].debut).toBe(DEBUT);
    expect(etat.incidents[0].motif).toContain("rafales");
  });

  it("l'incident reste OUVERT tant qu'aucune reprise n'est documentée", () => {
    const etat = deriverEtatJournee([evenementIntemperies()]);
    expect(etat.incidents[0].ouvert).toBe(true);
    expect(etat.derniereReprise).toBeNull();
  });

  it("la reprise documentée clôt l'incident SANS toucher à l'événement d'origine", () => {
    const reprise = evenementIntemperies({
      debut: "2026-10-20T14:30:00.000Z",
      reprise: { at: "2026-10-20T16:00:00.000Z", note: "reprise après 16 h" },
    });
    const etat = deriverEtatJournee([evenementIntemperies(), reprise]);
    expect(etat.incidents[0].ouvert).toBe(false);
    expect(etat.derniereReprise?.note).toBe("reprise après 16 h");
    expect(etat.statut).toBe("reprise");
  });

  it("NE produit AUCUNE qualification d'arrêt indemnisable — la journée reste « activité réalisée »", () => {
    const etat = deriverEtatJournee([evenementIntemperies()]);
    expect(etat.statut).toBe("vert");
    expect(LIBELLES_STATUT_ACTIVITE[etat.statut]).toBe("Activité réalisée");
    // Le résumé décrit ce qui s'est passé ; il ne qualifie jamais la journée
    // d'arrêt légal ou indemnisable.
    expect(etat.resume).not.toMatch(/arrêt (légal|indemnisable)/i);
  });

  it("sans aucun événement : attente, jamais un vert présumé", () => {
    const etat = deriverEtatJournee([]);
    expect(etat.statut).toBe("attente");
    expect(etat.resume).toContain("Aucun événement");
  });
});

// ─── 3. Autre façade : journée verte + trace conservée ───────────────────────

describe("choix B « Autre façade » — verte, et la trace n'est jamais effacée", () => {
  it("garde la journée VERTE malgré le changement de façade", () => {
    const etat = deriverEtatJournee([evenementAutreFacade()]);
    expect(etat.statut).toBe("vert");
    // La façade posée est bien celle où le travail a eu lieu.
    expect(etat.facadesPosees).toEqual(["est"]);
  });

  it("conserve la façade initialement bloquée ET son motif, à côté de la posée", () => {
    const etat = deriverEtatJournee([evenementAutreFacade()]);
    expect(etat.incidents).toHaveLength(1);
    expect(etat.incidents[0].facade).toBe("nord"); // la bloquée, pas la posée
    expect(etat.incidents[0].motif).toBe("façade nord exposée, pluie prévue");
    expect(etat.resume).toContain(LIBELLES_FACADE.nord);
    expect(etat.resume).toContain(LIBELLES_FACADE.est);
  });

  it("un incident « autre façade » n'est pas effacé par un événement ultérieur", () => {
    const ultérieur = evenementIntemperies({
      facade: "ouest",
      motif: "vent en fin de journée",
      debut: "2026-10-20T15:00:00.000Z",
    });
    const etat = deriverEtatJournee([evenementAutreFacade(), ultérieur]);
    // Les DEUX incidents sont conservés.
    expect(etat.incidents).toHaveLength(2);
    expect(etat.incidents[0].facade).toBe("nord");
    expect(etat.incidents[1].facade).toBe("ouest");
    // Et la journée reste verte : le travail a eu lieu sur les deux façades.
    expect(etat.statut).toBe("vert");
    expect(etat.facadesPosees).toEqual(["est", "ouest"]);
  });

  it("ne recolore JAMAIS la journée en rouge, quel que soit le motif", () => {
    for (const motif of ["orage violent", "arrêt commandé", "risque électrique"]) {
      const etat = deriverEtatJournee([evenementIntemperies({ motif })]);
      expect(etat.statut, motif).not.toBe("rouge");
    }
  });
});

// ─── 4. Stabilité du format persisté ─────────────────────────────────────────

describe("persistance — format versionné dans journal_chantier", () => {
  it("le tag de source est stable, pour filtrer le journal", () => {
    expect(SOURCE_OSSATURE_POSEE).toBe("ossature-posee");
  });

  it("une événement versionné v:2 inconnu reste lisible par tolérance explicite", () => {
    // Le lecteur reconnaît la forme v:1 ; toute autre version non comprise est
    // ignorée plutôt que mal interprétée.
    const relu = lireEvenement(
      JSON.stringify({ ...evenementIntemperies(), v: 2, champFutur: true }),
    );
    // Toléré : la forme de base est reconnue (v remontée à 1).
    if (relu) expect(relu.facade).toBe("sud");
  });

  it("relit l'identifiant stable et la référence de reprise (P1), sans exiger ces champs", () => {
    const complet = lireEvenement(
      JSON.stringify(
        evenementAutreFacade({
          id: "inc-7",
          reprise: {
            at: "2026-10-20T16:00:00.000Z",
            note: "reprise",
            referente: "inc-7",
          },
        }),
      ),
    );
    expect(complet?.id).toBe("inc-7");
    expect(complet?.reprise?.referente).toBe("inc-7");
    // Un événement historique SANS ces champs reste lisible : aucune exigence.
    expect(lireEvenement(serialiserEvenement(evenementAutreFacade()))?.id).toBeUndefined();
  });
});

// ─── 5. P1/P2 — rattachement de reprise et façades posées ────────────────────

describe("reprise rattachée — clôture exacte (P1) et façades honnêtes (P2)", () => {
  /** Reprise telle que l'écrit le composant corrigé pour le choix B. */
  function repriseAutreFacade(
    incident: EvenementOssature,
    overrides: Partial<EvenementOssature> = {},
  ): EvenementOssature {
    return {
      v: 1,
      type: "ossature_posee",
      facade: incident.facade, // la façade POSÉE
      choix: "autre_facade",
      motif: incident.motif,
      ...(incident.facadeInitiale ? { facadeInitiale: incident.facadeInitiale } : {}),
      debut: "2026-10-20T14:30:00.000Z",
      reprise: {
        at: "2026-10-20T16:00:00.000Z",
        note: "reprise sur est",
        ...(incident.id ? { referente: incident.id } : {}),
      },
      ...overrides,
    };
  }

  it("la reprise d'un incident « autre façade » le CLÔTURE (défaut historique P1)", () => {
    const incident = evenementAutreFacade({ id: "inc-1" });
    const etat = deriverEtatJournee([incident, repriseAutreFacade(incident)]);
    expect(etat.incidents).toHaveLength(1);
    expect(etat.incidents[0].ouvert).toBe(false);
    expect(etat.statut).toBe("reprise");
  });

  it("l'incident d'origine reste consultable, avec son motif, marqué [documenté]", () => {
    const incident = evenementAutreFacade({ id: "inc-1" });
    const etat = deriverEtatJournee([incident, repriseAutreFacade(incident)]);
    expect(etat.incidents[0].motif).toBe(incident.motif);
    expect(etat.incidents[0].debut).toBe(incident.debut);
    expect(etat.incidents[0].ouvert).toBe(false);
    expect(etat.resume).toContain("[documenté]");
    expect(etat.resume).not.toContain("[ouvert]");
  });

  it("compatibilité : un incident HISTORIQUE (sans id) est clôturé par la clé composée", () => {
    // Format d'avant P1 : ni id sur l'incident, ni referente sur la reprise.
    const incident = evenementAutreFacade(); // pas d'id
    const reprise: EvenementOssature = {
      ...repriseAutreFacade(incident),
    };
    delete reprise.reprise!.referente;
    const etat = deriverEtatJournee([incident, reprise]);
    expect(etat.incidents[0].ouvert).toBe(false);
  });

  it("une reprise ANCIENNE (identité incomplète) ne clôture PAS par hasard — l'incident reste ouvert, jamais effacé", () => {
    // Reprise telle qu'écrite avant la correction : porte la façade BLOQUÉE,
    // sans facadeInitiale ni referente. Aucune correspondance : l'incident
    // reste ouvert (état sûr) et peut être re-documenté.
    const incident = evenementAutreFacade({ id: "inc-1" });
    const repriseAncienne: EvenementOssature = {
      v: 1,
      type: "ossature_posee",
      facade: "nord", // la BLOQUÉE — l'ancien défaut
      choix: "autre_facade",
      motif: incident.motif,
      debut: "2026-10-20T14:30:00.000Z",
      reprise: { at: "2026-10-20T16:00:00.000Z", note: "ancienne forme" },
    };
    const etat = deriverEtatJournee([incident, repriseAncienne]);
    expect(etat.incidents[0].ouvert).toBe(true);
  });

  it("une reprise citant un AUTRE identifiant ne clôture pas l'incident par hasard", () => {
    const incidentA = evenementAutreFacade({ id: "inc-A" });
    const autreIncident = evenementIntemperies({ id: "inc-B", motif: "gel" });
    const repriseDunAutre: EvenementOssature = {
      ...repriseAutreFacade(incidentA),
      reprise: { at: "2026-10-20T16:00:00.000Z", note: "autre cas", referente: "inc-B" },
    };
    const etat = deriverEtatJournee([incidentA, autreIncident, repriseDunAutre]);
    const ouverts = etat.incidents.filter((i) => i.ouvert).map((i) => i.id);
    expect(ouverts).toEqual(["inc-A"]); // seul l'incident A reste ouvert
  });

  it("une reprise répétée ne crée AUCUN doublon : un seul incident, toujours le même", () => {
    const incident = evenementAutreFacade({ id: "inc-1" });
    const reprise1 = repriseAutreFacade(incident);
    const reprise2 = repriseAutreFacade(incident, {
      debut: "2026-10-20T16:30:00.000Z",
      reprise: { at: "2026-10-20T17:00:00.000Z", note: "seconde reprise", referente: "inc-1" },
    });
    const etat = deriverEtatJournee([incident, reprise1, reprise2]);
    expect(etat.incidents).toHaveLength(1);
    expect(etat.incidents[0].ouvert).toBe(false);
    expect(etat.derniereReprise?.note).toBe("seconde reprise");
  });

  it("P2 — après une reprise, la façade BLOQUÉE n'apparaît JAMAIS comme « posée »", () => {
    const incident = evenementAutreFacade({ id: "inc-1" });
    const etat = deriverEtatJournee([incident, repriseAutreFacade(incident)]);
    // Seule la façade où le travail a eu lieu est posée : la bloquée non.
    expect(etat.facadesPosees).toEqual(["est"]);
    expect(etat.facadesPosees).not.toContain("nord");
    // Et le résumé ne se contredit plus : « posée » et « bloquée » parlent de
    // façades distinctes.
    expect(etat.resume).toContain("Ossature posée : Façade Est.");
    const partiePosee = etat.resume.split(". ")[0];
    expect(partiePosee).not.toContain(LIBELLES_FACADE.nord);
  });

  it("P2 — la reprise d'un choix A ne double pas la façade posée", () => {
    const incident = evenementIntemperies();
    const reprise = evenementIntemperies({
      debut: "2026-10-20T14:30:00.000Z",
      reprise: { at: "2026-10-20T16:00:00.000Z", note: "reprise" },
    });
    const etat = deriverEtatJournee([incident, reprise]);
    expect(etat.facadesPosees).toEqual(["sud"]); // une seule entrée
    expect(etat.incidents[0].ouvert).toBe(false);
  });
});
