// __tests__/metre/meteo-vigilance-extraction.test.ts
//
// Non-régression de la lecture de la Vigilance Météo-France officielle
// (`lib/vigilanceMeteoFrance.ts`), qui remplace trois copies divergentes.
//
// Les cas visés sont ceux qui produisaient un résultat FAUX en production :
//   • `phenomenon_max_color_id` sous forme d'objet `{ color_id }` que
//     `Number(…)` transformait en NaN → couleur lue « vert » ;
//   • `periods[0]` supposé être « aujourd'hui » alors que l'ordre n'est pas
//     garanti ;
//   • une date « aujourd'hui » construite en UTC.

import { describe, it, expect } from "vitest";
import {
  extraireDepartement,
  choisirPeriode,
  lireColorId,
  couleurDepuisId,
  couleurLaPlusForte,
  couleurPourPhenomene,
} from "@/lib/vigilanceMeteoFrance";

// ─── Fixtures ────────────────────────────────────────────────────────────────

// Journée du 1er janvier 2026 en Europe/Paris (UTC+1).
const MAINTENANT = new Date("2026-01-01T12:00:00Z");

const BORNES_J = {
  begin_validity_time: "2026-01-01T06:00:00+01:00",
  end_validity_time: "2026-01-02T06:00:00+01:00",
};
const BORNES_J1 = {
  begin_validity_time: "2026-01-02T06:00:00+01:00",
  end_validity_time: "2026-01-03T06:00:00+01:00",
};

function domaine(departement: string, maxColorId: unknown, phenomenes: unknown[] = []) {
  return { domain_id: departement, max_color_id: maxColorId, phenomenon_items: phenomenes };
}

// ─── `phenomenon_max_color_id` : ne plus lire NaN ────────────────────────────

describe("lireColorId — lire la couleur quelle que soit la forme", () => {
  it("lit l'id d'un objet imbriqué { phenomenon_id, color_id }", () => {
    // C'est LA forme réelle de l'API, et c'est exactement celle que
    // `Number(phenomenon_max_color_id)` transformait en NaN → « vert ».
    expect(lireColorId({ phenomenon_max_color_id: { phenomenon_id: 3, color_id: 3 } })).toBe(3);
    expect(lireColorId({ phenomenon_max_color_id: { color_id: "4" } })).toBe(4);
  });

  it("lit un id scalaire (forme dégradée)", () => {
    expect(lireColorId({ phenomenon_max_color_id: 2 })).toBe(2);
    expect(lireColorId({ color_id: "2" })).toBe(2);
    expect(lireColorId({ color_id: 2 })).toBe(2);
  });

  it("renvoie null quand rien n'est exploitable, jamais 0", () => {
    expect(lireColorId({})).toBeNull();
    expect(lireColorId({ color_id: "" })).toBeNull();
    expect(lireColorId({ phenomenon_max_color_id: {} })).toBeNull();
    expect(lireColorId(3)).toBeNull();
    expect(lireColorId(null)).toBeNull();
  });

  it("couleurDepuisId : id 1..4, repli vert sur l'illisible", () => {
    expect(couleurDepuisId(1)).toBe("vert");
    expect(couleurDepuisId("3")).toBe("orange");
    expect(couleurDepuisId(4)).toBe("rouge");
    expect(couleurDepuisId(99)).toBe("vert");
    expect(couleurDepuisId(undefined)).toBe("vert");
  });
});

// ─── Extraction de bout en bout ──────────────────────────────────────────────

describe("extraireDepartement — couleur du département", () => {
  it("lit une vigilance orange depuis phenomenon_max_color_id OBJET", () => {
    // Avant correction : `Number({...})` = NaN → couleur « vert ».
    // Aujourd'hui la couleur vient de `color_id` et vaut bien « orange ».
    const reponse = {
      product: {
        update_time: "2026-01-01T10:00:00Z",
        periods: [
          {
            echeance: "J",
            ...BORNES_J,
            timelaps: {
              domain_ids: [
                domaine("33", undefined, [
                  { phenomenon_id: 3, phenomenon_max_color_id: { phenomenon_id: 3, color_id: 3 } },
                ]),
              ],
            },
          },
        ],
      },
    };

    const resultat = extraireDepartement(reponse, "33", false, MAINTENANT);
    expect(resultat).not.toBeNull();
    expect(resultat?.couleurMax).toBe("orange");
    expect(resultat?.phenomenes).toEqual([{ id: 3, nom: "orages", couleur: "orange" }]);
    expect(resultat?.misAJourLe).toBe("2026-01-01T10:00:00Z");
  });

  it("déduit la couleur maximale des phénomènes quand max_color_id manque", () => {
    const reponse = {
      product: {
        periods: [
          {
            ...BORNES_J,
            timelaps: {
              domain_ids: [
                domaine("33", undefined, [
                  { phenomenon_id: 1, phenomenon_max_color_id: { color_id: 2 } },
                  { phenomenon_id: 3, phenomenon_max_color_id: { color_id: 4 } },
                ]),
              ],
            },
          },
        ],
      },
    };

    const resultat = extraireDepartement(reponse, "33", false, MAINTENANT);
    expect(resultat?.couleurMax).toBe("rouge");
  });

  it("renvoie null si le département est absent — jamais un faux « vert »", () => {
    const reponse = {
      product: { periods: [{ ...BORNES_J, timelaps: { domain_ids: [domaine("33", 2)] } }] },
    };
    expect(extraireDepartement(reponse, "75", false, MAINTENANT)).toBeNull();
  });

  it("renvoie null si aucune période n'est exploitable", () => {
    expect(extraireDepartement({}, "33", false, MAINTENANT)).toBeNull();
    expect(extraireDepartement({ product: { periods: [] } }, "33", false, MAINTENANT)).toBeNull();
  });

  it("accepte un domain_id numérique et la Corse 2A/2B", () => {
    const numerique = {
      product: { periods: [{ ...BORNES_J, timelaps: { domain_ids: [domaine("33", 3)] } }] },
    };
    expect(extraireDepartement(numerique, "33", false, MAINTENANT)?.couleurMax).toBe("orange");

    const corse = {
      product: {
        periods: [{ ...BORNES_J, timelaps: { domain_ids: [domaine("2A", 4), domaine("2B", 1)] } }],
      },
    };
    expect(extraireDepartement(corse, "2a", false, MAINTENANT)?.couleurMax).toBe("rouge");
    expect(extraireDepartement(corse, "2B", false, MAINTENANT)?.couleurMax).toBe("vert");
  });
});

// ─── Sélection de période ────────────────────────────────────────────────────

describe("choisirPeriode — la bonne journée, pas l'index 0", () => {
  const pasDeBornes = { timelaps: { domain_ids: [] } };

  it("sélectionne par BORNES même quand J+1 est en tête de liste", () => {
    const reponse = {
      product: {
        periods: [
          { echeance: "J+1", ...BORNES_J1, timelaps: { domain_ids: [domaine("33", 4)] } },
          { echeance: "J", ...BORNES_J, timelaps: { domain_ids: [domaine("33", 1)] } },
        ],
      },
    };

    // Aujourd'hui → période « J » (index 1), malgré `periods[0]` = J+1.
    expect(extraireDepartement(reponse, "33", false, MAINTENANT)?.couleurMax).toBe("vert");
    // Demain → période « J+1 » (index 0).
    expect(extraireDepartement(reponse, "33", true, MAINTENANT)?.couleurMax).toBe("rouge");
  });

  it("retombe sur l'échéance textuelle quand les bornes manquent", () => {
    const j1 = { echeance: "J+1", ...pasDeBornes };
    const j = { echeance: "J", ...pasDeBornes };
    expect(choisirPeriode([j1, j], false, MAINTENANT)).toBe(j);
    expect(choisirPeriode([j1, j], true, MAINTENANT)).toBe(j1);
  });

  it("retombe sur l'ordre historique seulement sans borne ni échéance", () => {
    const a = { ...pasDeBornes };
    const b = { ...pasDeBornes };
    expect(choisirPeriode([a, b], false, MAINTENANT)).toBe(a);
    expect(choisirPeriode([a, b], true, MAINTENANT)).toBe(b);
    expect(choisirPeriode([], false, MAINTENANT)).toBeNull();
  });

  it("les bornes priment sur une échéance contradictoire", () => {
    const periode = {
      echeance: "J+1",
      ...BORNES_J,
      timelaps: { domain_ids: [domaine("33", 3)] },
    };
    // La cible « aujourd'hui » tombe dans les bornes : on la prend, même si
    // l'échéance texte prétend le contraire (source de vérité = bornes).
    expect(choisirPeriode([periode], false, MAINTENANT)).toBe(periode);
  });
});

// ─── Aides couleur partagées ─────────────────────────────────────────────────

describe("couleurs partagées", () => {
  it("couleurPourPhenomene lit le phénomène, sinon la couleur max", () => {
    const vigilance = {
      departement: "33",
      couleurMax: "orange" as const,
      phenomenes: [
        { id: 3, nom: "orages", couleur: "rouge" as const },
        { id: 1, nom: "vent", couleur: "jaune" as const },
      ],
      misAJourLe: null,
    };
    expect(couleurPourPhenomene(vigilance, "orages")).toBe("rouge");
    expect(couleurPourPhenomene(vigilance, "ORAGES")).toBe("rouge");
    expect(couleurPourPhenomene(vigilance, "pluie-inondation")).toBe("orange");
    expect(couleurPourPhenomene(null, "vent")).toBe("vert");
  });

  it("couleurLaPlusForte ignore l'absent", () => {
    expect(couleurLaPlusForte("vert", "jaune", "orange")).toBe("orange");
    expect(couleurLaPlusForte(undefined, null, "rouge")).toBe("rouge");
    expect(couleurLaPlusForte()).toBe("vert");
  });
});
