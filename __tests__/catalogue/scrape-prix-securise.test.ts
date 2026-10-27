import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { extrairePrixCandidats, type PrixScrapeCandidat } from "@/lib/scrapePrix";
import { mapScraped } from "@/components/catalogue/useScraping";

const c = (p: Partial<PrixScrapeCandidat>): PrixScrapeCandidat => ({
  montant: 10, devise: "EUR", baseFiscale: "inconnue", uniteVente: "inconnue",
  conditionnement: null, sources: ["jsonld_price_specification"], ...p,
});
const jsonld = (offers: unknown) =>
  cheerio.load(`<script type="application/ld+json">${JSON.stringify({ "@type": "Product", offers })}</script>`);

describe("extraction prix scrape", () => {
  it("prix JSON-LD sans unité ni base : non qualifié", () => {
    const r = extrairePrixCandidats(jsonld({ price: "2.95", priceCurrency: "EUR" }));
    expect(r[0]).toMatchObject({ montant: 2.95, baseFiscale: "inconnue", uniteVente: "inconnue" });
  });
  it("priceSpecification explicite HT/m²", () => {
    const r = extrairePrixCandidats(jsonld({ priceSpecification: { price: "39.9", priceCurrency: "EUR", valueAddedTaxIncluded: false, referenceQuantity: { unitText: "m²" } } }));
    expect(r[0]).toMatchObject({ montant: 39.9, baseFiscale: "HT", uniteVente: "m²" });
  });
  it("aucun prix : liste vide", () => {
    expect(extrairePrixCandidats(cheerio.load("<html></html>"))).toEqual([]);
  });
});

describe("mapScraped — prix", () => {
  const lame = (cands?: PrixScrapeCandidat[]) =>
    mapScraped("TERRASSE_LAME", { designation: "Lame", prix_candidats: cands }) as { prix_m2_ht: string };

  it("1. sans unité : pas de prix_m2_ht", () => {
    expect(lame([c({ baseFiscale: "HT" })]).prix_m2_ht).toBe("");
  });
  it("2. sans base fiscale : pas de prix HT confirmé", () => {
    expect(lame([c({ uniteVente: "m²" })]).prix_m2_ht).toBe("");
    const b = mapScraped("BARDAGE", { prix_candidats: [c({ uniteVente: "m²" })] }) as { pu_ht: string; prix_ttc: string };
    expect(b.pu_ht).toBe(""); expect(b.prix_ttc).toBe("");
  });
  it("3. HT/m² explicite : mappé sans conversion", () => {
    expect(lame([c({ montant: 39.9, baseFiscale: "HT", uniteVente: "m²" })]).prix_m2_ht).toBe("39,90");
  });
  it("3b. TTC/m² : pas affecté à un champ HT", () => {
    expect(lame([c({ baseFiscale: "TTC", uniteVente: "m²" })]).prix_m2_ht).toBe("");
  });
  it("4. HT/lame : pas converti en m²", () => {
    expect(lame([c({ baseFiscale: "HT", uniteVente: "lame" })]).prix_m2_ht).toBe("");
  });
  it("4b. HT/paquet n'est pas un prix pièce (bardage)", () => {
    const b = mapScraped("BARDAGE", { prix_candidats: [c({ baseFiscale: "HT", uniteVente: "paquet" })] }) as { pu_ht: string };
    expect(b.pu_ht).toBe("");
  });
  it("5. plusieurs prix HT/m² concurrents : aucun choix", () => {
    expect(lame([
      c({ montant: 30, baseFiscale: "HT", uniteVente: "m²" }),
      c({ montant: 45, baseFiscale: "HT", uniteVente: "m²" }),
    ]).prix_m2_ht).toBe("");
  });
  it("5b. devise inconnue : aucun mapping", () => {
    expect(lame([c({ devise: null, baseFiscale: "HT", uniteVente: "m²" })]).prix_m2_ht).toBe("");
  });
  it("6. prix absent / ancien prix_ttc brut : aucune valeur inventée", () => {
    expect(lame(undefined).prix_m2_ht).toBe("");
    expect((mapScraped("TERRASSE_LAME", { prix_ttc: 2.95 }) as { prix_m2_ht: string }).prix_m2_ht).toBe("");
    expect((mapScraped("TERRASSE_ACCESSOIRE", { prix_ttc: 2.95 }) as { prix_conditionnement: string }).prix_conditionnement).toBe("");
  });
  it("7. Bardage TTC/m² confirmé : mapping historique (HT = TTC/1,2)", () => {
    const b = mapScraped("BARDAGE", { designation: "Bac", prix_candidats: [c({ montant: 24, baseFiscale: "TTC", uniteVente: "m²" })] }) as { pu_ht: string; prix_ttc: string; designation: string };
    expect(b).toMatchObject({ designation: "Bac", prix_ttc: "24,00", pu_ht: "20,00" });
  });
  it("8. autres mappings Terrasse intacts", () => {
    const l = mapScraped("TERRASSE_LAME", { designation: "L", fournisseur: "F", longueur_mm: 3000, largeur_mm: 140, epaisseur_mm: 21 });
    expect(l).toMatchObject({ kind: "TERRASSE_LAME", longueur_mm: 3000, largeur_utile_mm: 140, epaisseur_mm: 21, fournisseur: "F" });
    const a = mapScraped("TERRASSE_ACCESSOIRE", { prix_candidats: [c({ montant: 12.5, baseFiscale: "HT", uniteVente: "paquet" })] }) as { prix_conditionnement: string };
    expect(a.prix_conditionnement).toBe("12,50");
  });
});
