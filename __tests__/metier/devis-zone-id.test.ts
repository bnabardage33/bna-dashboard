// __tests__/devis-zone-id.test.ts
// ÉTAPE 1 — traçabilité zone_id : la persistance des lignes de devis doit la
// CONSERVER, côté serveur (normaliserLigne) ET côté client (mapping IA→état).
// Aucun moteur de métré ne doit être importé par les bibliothèques devis_ia.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const routeDevis = readFileSync("./app/api/devis/route.ts", "utf8");
const pageDevis = readFileSync("./app/bureau/devis-factures/page.tsx", "utf8");
const libAnalyse = readFileSync("./lib/devisAnalyse.ts", "utf8");
const libHistorique = readFileSync("./lib/devisHistorique.ts", "utf8");

describe("zone_id — préservation au moment de la persistance (serveur)", () => {
  it("extrait zone_id en tête de normaliserLigne", () => {
    expect(routeDevis).toMatch(/const zone_id = texte\(brute\.zone_id\)/);
  });

  it("recopie zone_id dans la ligne manuelle chiffrable", () => {
    const segment = extraire(range(routeDevis, "Ligne manuelle", "catalogue.get"));
    expect(segment).toContain("zone_id,");
  });

  it("recopie zone_id sur toutes les lignes À CHIFFRER (spread additif)", () => {
    const occurrencesSpread = routeDevis.match(/\.\.\.creerLigneAChiffrer\(/g) ?? [];
    const occurrencesZone = routeDevis.match(/\{\s*\.\.\.creerLigneAChiffrer\(/g) ?? [];
    expect(occurrencesSpread.length).toBeGreaterThan(0);
    expect(occurrencesZone.length).toBe(occurrencesSpread.length);
  });

  it("recopie zone_id dans la ligne catalogue chiffrée", () => {
    const segment = extraire(range(routeDevis, "type_cout: CoutType", "function normaliserLigne"));
    expect(segment).toContain("zone_id,");
  });
});

describe("zone_id — préservation côté client (état Ligne)", () => {
  it("déclare le champ optionnel zone_id dans le type Ligne", () => {
    expect(pageDevis).toMatch(/type Ligne = \{/);
    expect(pageDevis).toMatch(/zone_id\?: string \| null;/);
  });

  it("recopie zone_id dans le mapping IA → état Ligne", () => {
    expect(pageDevis).toMatch(
      /zone_id: typeof l\.zone_id === "string" && l\.zone_id \? \(l\.zone_id as string\) : null,/
    );
  });
});

describe("isolation devis_ia — aucun moteur de métré importé", () => {
  for (const [nom, source] of [
    ["lib/devisAnalyse.ts", libAnalyse],
    ["lib/devisHistorique.ts", libHistorique],
  ] as const) {
    it(`${nom} n'importe aucun moteur de métré`, () => {
      expect(source).not.toMatch(/@\/lib\/metreVersPostes/);
      expect(source).not.toMatch(/@\/lib\/iaDevisMetre/);
      expect(source).not.toMatch(/@\/lib\/metre-complet/);
      expect(source).not.toMatch(/calculerZone|calculerPose|calculerCalepinage/);
    });
  }
});

/* Matchers utilitaires (purement locaux) */

function range(source: string, debut: string, fin: string): string {
  const i = source.indexOf(debut);
  const j = source.indexOf(fin, i);
  if (i === -1) return "";
  return source.slice(i, j === -1 ? undefined : j);
}

function extraire(segment: string): string {
  return segment;
}