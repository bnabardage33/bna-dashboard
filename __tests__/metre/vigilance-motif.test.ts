// __tests__/metre/vigilance-motif.test.ts
//
// Non-régression : quand la vigilance officielle MANQUE (capture indisponible),
// le motif du rapport doit l'énoncer explicitement — jamais laisser entendre
// qu'une vigilance verte a été confirmée.
//
// Le préfixe d'indisponibilité est PARTAGÉ entre la route Next
// (`app/api/rapports-intemperies/generer/route.ts`) et l'Edge Function
// (`supabase/functions/generer-rapports-intemperies/index.ts`) : une seule
// implémentation, dans `lib/vigilanceMeteoFrance.ts`.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MOTIF_VIGILANCE_INDISPONIBLE,
  MOTIF_VIGILANCE_PARTIELLE,
  prefixerMotifVigilance,
} from "@/lib/vigilanceMeteoFrance";
import { evaluerJourChantier } from "@/lib/meteoAlerte";
import type { HeureMeteo } from "@/lib/meteo";

// 36 °C avec un matériau « metal » (temp_maxi 35 °C) → risque technique ORANGE.
// Aucune pluie : le seul signal est thermique.
const METEO_CHAUDE = { rafalesMax: 20, pluieCumul: 0, tempMax: 36 };

const HEURES_SECHES: HeureMeteo[] = [
  { heure: "12:00", temp: 36, vent: 10, rafales: 20, pluie: 0, statut: "ecoulee", nature: "observee" },
  { heure: "13:00", temp: 34, vent: 8, rafales: 15, pluie: 0, statut: "avenir", nature: "prevision" },
];

/** Motif produit par l'évaluateur quand la vigilance officielle vaut « vert ». */
function motifVert(): string {
  return evaluerJourChantier(
    "metal",
    "echafaudage",
    METEO_CHAUDE,
    HEURES_SECHES,
    "vert",
    "vert"
  ).motif;
}

describe("prefixerMotifVigilance — rien ne doit suggérer un vert confirmé si la donnée manque", () => {
  it("les deux demi-journées illisibles → préfixe d'indisponibilité explicite", () => {
    const final = prefixerMotifVigilance(motifVert(), null, null);

    expect(MOTIF_VIGILANCE_INDISPONIBLE).toBe("Vigilance officielle indisponible.");
    expect(final.startsWith(MOTIF_VIGILANCE_INDISPONIBLE)).toBe(true);
  });

  it("une seule demi-journée illisible → préfixe « partiellement indisponible »", () => {
    expect(
      prefixerMotifVigilance(motifVert(), "vert", null).startsWith(
        MOTIF_VIGILANCE_PARTIELLE
      )
    ).toBe(true);
    expect(
      prefixerMotifVigilance(motifVert(), null, "orange").startsWith(
        MOTIF_VIGILANCE_PARTIELLE
      )
    ).toBe(true);
  });

  it("les deux connues → motif strictement inchangé", () => {
    const motif = motifVert();

    expect(prefixerMotifVigilance(motif, "vert", "vert")).toBe(motif);
    expect(prefixerMotifVigilance(motif, "orange", "jaune")).toBe(motif);
  });

  it("une valeur hors des quatre niveaux (ex. « indisponible ») compte comme manquante", () => {
    // Une ancienne capture a pu recopier la sentinelle : elle ne doit PAS être
    // prise pour une vigilance lisible.
    expect(
      prefixerMotifVigilance("x", "indisponible", "indisponible").startsWith(
        MOTIF_VIGILANCE_INDISPONIBLE
      )
    ).toBe(true);
    expect(
      prefixerMotifVigilance("x", "indisponible", "vert").startsWith(
        MOTIF_VIGILANCE_PARTIELLE
      )
    ).toBe(true);
    expect(
      prefixerMotifVigilance("x", 42, undefined).startsWith(
        MOTIF_VIGILANCE_INDISPONIBLE
      )
    ).toBe(true);
  });
});

describe("cas piège réel : vigilance indisponible + dépassement mesuré", () => {
  it("le motif final énonce l'indisponibilité AVANT toute mention de « pas de vigilance »", () => {
    const decision = evaluerJourChantier(
      "metal",
      "echafaudage",
      METEO_CHAUDE,
      HEURES_SECHES,
      null,
      null
    );

    // L'évaluateur seul produit un libellé ambigu…
    expect(decision.motif).toContain("Pas de vigilance officielle");

    // … que le préfixe partagé (route Next = Edge) lève explicitement.
    const final = prefixerMotifVigilance(decision.motif, null, null);
    expect(final).toContain("Vigilance officielle indisponible.");
    expect(final.startsWith("Vigilance officielle indisponible.")).toBe(true);
    expect(final.indexOf("Vigilance officielle indisponible.")).toBeLessThan(
      final.indexOf("Pas de vigilance officielle")
    );
  });
});

describe("les deux implémentations (Next + Edge) utilisent le préfixe partagé", () => {
  const route = readFileSync(
    "app/api/rapports-intemperies/generer/route.ts",
    "utf8"
  );
  const edge = readFileSync(
    "supabase/functions/generer-rapports-intemperies/index.ts",
    "utf8"
  );

  it("la route Next applique prefixerMotifVigilance au motif", () => {
    expect(route).toMatch(/prefixerMotifVigilance/);
    expect(route).toMatch(/motif\s*=\s*prefixerMotifVigilance\(/);
  });

  it("l'Edge Function applique prefixerMotifVigilance au motif écrit en base", () => {
    expect(edge).toMatch(/prefixerMotifVigilance/);
    expect(edge).toMatch(/motif:\s*prefixerMotifVigilance\(/);
  });

  it("ni l'une ni l'autre n'écrit le motif brut de la décision", () => {
    expect(route).not.toMatch(/motif\s*=\s*decision\.motif\s*;/);
    expect(edge).not.toMatch(/motif:\s*decision\.motif\b/);
  });
});
