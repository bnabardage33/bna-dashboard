// components/catalogue/useScraping.ts
//
// Extraction FIDÈLE de `handleScrapeUrl` (app/bureau/catalogue/page.tsx).
// Appelle `/api/scrape` (session requise côté route) et mappe la réponse brute
// vers un patch de formulaire adapté au `type` courant. Erreurs réseau/API
// inchangées (mêmes `alert`).

"use client";

import { useCallback, useState } from "react";
import type { CatalogueType, ProductDraftPatch } from "./types";

/** Réponse de `/api/scrape` (route inchangée). */
export interface ScrapedProduct {
  designation?: string;
  fabricant?: string;
  fournisseur?: string;
  prix_ttc?: number | null;
  longueur_mm?: number | null;
  largeur_mm?: number | null;
  epaisseur_mm?: number | null;
  description?: string;
  designation_devis?: string;
  code_ral?: string | null;
}

function mapScraped(type: CatalogueType, raw: ScrapedProduct): ProductDraftPatch {
  const ttc = raw.prix_ttc ?? null;
  const ttcTexte = ttc != null ? String(ttc).replace(".", ",") : "";
  const htTexte = ttc != null ? (ttc / 1.2).toFixed(2).replace(".", ",") : "";

  switch (type) {
    case "BARDAGE": {
      const aDims = raw.longueur_mm != null || raw.largeur_mm != null || raw.epaisseur_mm != null;
      return {
        kind: "BARDAGE",
        designation: raw.designation || "",
        description: raw.description || "",
        designation_devis: raw.designation_devis || "",
        code_ral: raw.code_ral || "",
        fabricant: raw.fabricant || "",
        fournisseur: raw.fournisseur || "",
        prix_ttc: ttcTexte,
        pu_ht: htTexte,
        dimensions_disponibles: aDims
          ? [{
              longueur_mm: raw.longueur_mm ?? null,
              largeur_mm: raw.largeur_mm ?? null,
              epaisseur_mm: raw.epaisseur_mm ?? null,
            }]
          : [],
      };
    }
    case "TERRASSE_LAME":
      return {
        kind: "TERRASSE_LAME",
        designation: raw.designation || "",
        description: raw.description || "",
        fournisseur: raw.fournisseur || "",
        longueur_mm: raw.longueur_mm ?? null,
        largeur_utile_mm: raw.largeur_mm ?? null,
        epaisseur_mm: raw.epaisseur_mm ?? null,
        prix_m2_ht: ttcTexte,
      };
    case "TERRASSE_ACCESSOIRE":
      return {
        kind: "TERRASSE_ACCESSOIRE",
        designation: raw.designation || "",
        description: raw.description || "",
        fournisseur: raw.fournisseur || "",
        prix_conditionnement: ttcTexte,
      };
  }
}

export function useScraping(
  type: CatalogueType,
  onDataReceived: (data: ProductDraftPatch) => void
) {
  const [importUrl, setImportUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrape = useCallback(async () => {
    if (!importUrl) return;
    setIsScraping(true);
    setError(null);
    try {
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(importUrl)}`);
      if (!res.ok) throw new Error("Erreur de scraping");
      const raw = (await res.json()) as ScrapedProduct;
      onDataReceived(mapScraped(type, raw));
      alert("✅ Données importées ! Vérifiez et ajustez si besoin.");
    } catch (err) {
      console.error(err);
      setError("Impossible de lire cette page. Certains sites bloquent l'accès automatique.");
      alert("❌ Impossible de lire cette page. Certains sites bloquent l'accès automatique.");
    } finally {
      setIsScraping(false);
    }
  }, [importUrl, type, onDataReceived]);

  return { importUrl, setImportUrl, isScraping, error, scrape };
}
