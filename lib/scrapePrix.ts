import type { CheerioAPI } from "cheerio";

export type BaseFiscalePrix = "HT" | "TTC" | "inconnue";
export type UnitePrixScrape = "m²" | "ml" | "lame" | "pièce" | "paquet" | "inconnue";
export type SourcePrixScrape =
  | "jsonld_price_specification"
  | "jsonld_offer"
  | "meta_product_price"
  | "meta_itemprop_price"
  | "html_price_heuristique"
  | "legacy_prix_ttc_non_qualifie";

export interface PrixScrapeCandidat {
  montant: number;
  devise: string | null;
  baseFiscale: BaseFiscalePrix;
  uniteVente: UnitePrixScrape;
  conditionnement: string | null;
  sources: SourcePrixScrape[];
}

type Objet = Record<string, unknown>;

function objets(value: unknown): Objet[] {
  if (Array.isArray(value)) return value.filter(estObjet);
  return estObjet(value) ? [value] : [];
}

function estObjet(value: unknown): value is Objet {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function montantValide(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const texte = String(value).trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(texte)) return null;
  const montant = Number(texte.replace(",", "."));
  return Number.isFinite(montant) && montant >= 0 ? montant : null;
}

function uniteExplicite(...values: unknown[]): UnitePrixScrape {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const texte = value.trim().toLocaleLowerCase("fr-FR");
    const code = texte.replace(/[^a-z0-9]/g, "");
    if (/m²|m2|metre(s)? carre(s)?|square metre/.test(texte) || code === "mtk") return "m²";
    if (/\bml\b|metre(s)? lineaire(s)?/.test(texte) || code === "mtr") return "ml";
    if (/\blame(s)?\b|planche(s)?/.test(texte)) return "lame";
    if (/piece(s)?|pièce(s)?|unite(s)?|unité(s)?/.test(texte) || code === "c62") return "pièce";
    if (/paquet(s)?|lot(s)?|pack(s)?|colis/.test(texte) || code === "xpk") return "paquet";
  }
  return "inconnue";
}

function ajouterCandidat(
  destination: PrixScrapeCandidat[],
  candidat: PrixScrapeCandidat,
): void {
  const existant = destination.find((item) =>
    item.montant === candidat.montant &&
    item.devise === candidat.devise &&
    item.baseFiscale === candidat.baseFiscale &&
    item.uniteVente === candidat.uniteVente &&
    item.conditionnement === candidat.conditionnement
  );
  if (existant) {
    existant.sources = [...new Set([...existant.sources, ...candidat.sources])];
  } else {
    destination.push(candidat);
  }
}

function parcourirProduits(node: unknown, resultat: Objet[], profondeur = 0): void {
  if (profondeur > 12) return;
  if (Array.isArray(node)) {
    for (const item of node) parcourirProduits(item, resultat, profondeur + 1);
    return;
  }
  if (!estObjet(node)) return;

  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (types.includes("Product")) resultat.push(node);
  for (const valeur of Object.values(node)) {
    if (typeof valeur === "object" && valeur !== null) {
      parcourirProduits(valeur, resultat, profondeur + 1);
    }
  }
}

function prixJsonLd($: CheerioAPI): PrixScrapeCandidat[] {
  const produits: Objet[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      parcourirProduits(JSON.parse($(element).html() || "null"), produits);
    } catch {
      // Une balise JSON-LD mal formée n'empêche pas les autres sources.
    }
  });

  const resultat: PrixScrapeCandidat[] = [];
  for (const produit of produits) {
    for (const offre of objets(produit.offers)) {
      const specifications = objets(offre.priceSpecification);
      const specificationsAvecPrix = specifications.filter((spec) => montantValide(spec.price) !== null);

      if (specificationsAvecPrix.length > 0) {
        for (const specification of specificationsAvecPrix) {
          const montant = montantValide(specification.price);
          if (montant === null) continue;
          const reference = estObjet(specification.referenceQuantity)
            ? specification.referenceQuantity
            : {};
          const inclus = specification.valueAddedTaxIncluded;
          ajouterCandidat(resultat, {
            montant,
            devise: typeof specification.priceCurrency === "string"
              ? specification.priceCurrency
              : typeof offre.priceCurrency === "string" ? offre.priceCurrency : null,
            baseFiscale: inclus === false ? "HT" : inclus === true ? "TTC" : "inconnue",
            uniteVente: uniteExplicite(
              reference.unitText,
              reference.unitCode,
              specification.unitText,
              specification.unitCode,
            ),
            conditionnement: null,
            sources: ["jsonld_price_specification"],
          });
        }
        continue;
      }

      const montant = montantValide(offre.price);
      if (montant !== null) {
        ajouterCandidat(resultat, {
          montant,
          devise: typeof offre.priceCurrency === "string" ? offre.priceCurrency : null,
          baseFiscale: "inconnue",
          uniteVente: "inconnue",
          conditionnement: null,
          sources: ["jsonld_offer"],
        });
      }

      // AggregateOffer.lowPrice/highPrice décrivent une fourchette, pas un prix unique.
      for (const key of ["lowPrice", "highPrice"] as const) {
        const aggregate = montantValide(offre[key]);
        if (aggregate !== null) {
          ajouterCandidat(resultat, {
            montant: aggregate,
            devise: typeof offre.priceCurrency === "string" ? offre.priceCurrency : null,
            baseFiscale: "inconnue",
            uniteVente: "inconnue",
            conditionnement: null,
            sources: ["jsonld_offer"],
          });
        }
      }
    }
  }
  return resultat;
}

/** Extrait des candidats avec leur provenance; les sources faibles restent non qualifiées. */
export function extrairePrixCandidats($: CheerioAPI): PrixScrapeCandidat[] {
  const structure = prixJsonLd($);
  if (structure.length > 0) return structure;

  const deviseMeta = $("meta[property='product:price:currency']").attr("content")?.trim() || null;
  const metas: PrixScrapeCandidat[] = [];
  for (const [selector, source] of [
    ["meta[property='product:price:amount']", "meta_product_price"],
    ["meta[itemprop='price']", "meta_itemprop_price"],
  ] as const) {
    $(selector).each((_, element) => {
      const montant = montantValide($(element).attr("content"));
      if (montant !== null) {
        ajouterCandidat(metas, {
          montant,
          devise: deviseMeta,
          baseFiscale: "inconnue",
          uniteVente: "inconnue",
          conditionnement: null,
          sources: [source],
        });
      }
    });
  }
  if (metas.length > 0) return metas;

  const heuristiques: PrixScrapeCandidat[] = [];
  $("[class*='price'], [class*='prix'], [data-price]").each((_, element) => {
    const textes = [$(element).attr("data-price"), $(element).text()].filter(
      (texte): texte is string => Boolean(texte?.trim()),
    );
    for (const texte of textes) {
      const regex = /(\d+)\s*[.,€]\s*(\d{2})/g;
      for (const match of texte.matchAll(regex)) {
        const montant = montantValide(`${match[1]}.${match[2]}`);
        if (montant !== null) {
          ajouterCandidat(heuristiques, {
            montant,
            devise: texte.includes("€") ? "EUR" : null,
            baseFiscale: "inconnue",
            uniteVente: "inconnue",
            conditionnement: null,
            sources: ["html_price_heuristique"],
          });
        }
      }
    }
  });
  return heuristiques;
}

export type TypeCatalogueScrape = "BARDAGE" | "TERRASSE_LAME" | "TERRASSE_ACCESSOIRE";

export interface PrixMappable {
  /** Montant brut tel que lu sur la source (aucune conversion appliquée). */
  montant: number;
  baseFiscale: "HT" | "TTC";
  uniteVente: UnitePrixScrape;
}

function estEuro(candidat: PrixScrapeCandidat): boolean {
  return candidat.devise?.trim().toUpperCase() === "EUR";
}

function compatible(type: TypeCatalogueScrape, candidat: PrixScrapeCandidat): boolean {
  if (!estEuro(candidat) || candidat.baseFiscale === "inconnue") return false;
  switch (type) {
    // Bardage : unité de vente de matériau explicite (jamais lame/paquet/inconnue).
    case "BARDAGE":
      return ["m²", "ml", "pièce"].includes(candidat.uniteVente);
    // Prix au m² HT : uniquement HT + m² explicites.
    case "TERRASSE_LAME":
      return candidat.baseFiscale === "HT" && candidat.uniteVente === "m²";
    // Prix de conditionnement HT : uniquement HT + paquet explicites.
    case "TERRASSE_ACCESSOIRE":
      return candidat.baseFiscale === "HT" && candidat.uniteVente === "paquet";
  }
}

/**
 * Retourne l'unique prix mappable vers le champ métier du type demandé, ou null.
 * Aucun choix arbitraire : plusieurs montants compatibles différents => null.
 */
export function selectionnerPrixMappable(
  type: TypeCatalogueScrape,
  candidats: readonly PrixScrapeCandidat[] | null | undefined,
): PrixMappable | null {
  const eligibles = (candidats ?? []).filter((c) => compatible(type, c));
  if (eligibles.length === 0) return null;
  const distincts = new Set(eligibles.map((c) => `${c.montant}|${c.baseFiscale}|${c.uniteVente}`));
  if (distincts.size !== 1) return null;
  const c = eligibles[0];
  return {
    montant: c.montant,
    baseFiscale: c.baseFiscale as "HT" | "TTC",
    uniteVente: c.uniteVente,
  };
}
