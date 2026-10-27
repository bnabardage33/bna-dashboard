// components/catalogue/useScraping.ts
//
// Extraction FIDÈLE de `handleScrapeUrl` (app/bureau/catalogue/page.tsx).
// Appelle `/api/scrape` (session requise côté route) et mappe la réponse brute
// vers un patch de formulaire adapté au `type` courant. Erreurs réseau/API
// inchangées (mêmes `alert`).

"use client";

import { useCallback, useState } from "react";
import type { CatalogueType, ProductDraftPatch } from "./types";
import { selectionnerPrixMappable, type PrixScrapeCandidat } from "@/lib/scrapePrix";

/** Réponse de `/api/scrape` (route inchangée). */
export interface ScrapedProduct {
  designation?: string;
  fabricant?: string;
  fournisseur?: string;
  /** Candidats qualifiés (devise, base fiscale, unité) fournis par la route. */
  prix_candidats?: PrixScrapeCandidat[];
  /** Ancien format non qualifié : jamais affecté à un champ tarifaire. */
  prix_ttc?: number | null;
  /** Ex. `PAGE_SANS_DONNEES_PRODUIT` : page lue mais sans donnée produit détectée. */
  avertissements?: string[];
  longueur_mm?: number | null;
  largeur_mm?: number | null;
  epaisseur_mm?: number | null;
  description?: string;
  designation_devis?: string;
  code_ral?: string | null;
}

const MESSAGES_ERREUR: Record<string, string> = {
  URL_INVALIDE: "URL invalide ou non autorisée. Vérifiez l'adresse de la page produit.",
  HOTE_INTROUVABLE: "Site introuvable : vérifiez l'adresse (nom de domaine).",
  SITE_REFUSE: "Le site a refusé la lecture automatique de cette page. Saisissez les informations à la main ou utilisez l'extension du navigateur.",
  PAGE_INTROUVABLE: "Page introuvable (404). Vérifiez le lien du produit.",
  SITE_INDISPONIBLE: "Le site fournisseur est momentanément indisponible. Réessayez plus tard.",
  DELAI_DEPASSE: "Le site met trop de temps à répondre. Réessayez plus tard.",
  CONTENU_NON_HTML: "Ce lien ne pointe pas vers une page web (HTML) lisible.",
  TROP_VOLUMINEUX: "La page est trop volumineuse pour être importée.",
  REDIRECTION_INVALIDE: "Le site redirige vers une destination non exploitable.",
  ERREUR_RESEAU: "Connexion au site impossible (erreur réseau). Réessayez plus tard.",
  ERREUR_INTERNE: "Erreur interne lors de la lecture de la page.",
};
const MESSAGE_GENERIQUE = "Impossible de lire cette page. Certains sites bloquent l'accès automatique.";

/** Message utilisateur pour un échec de `/api/scrape` (corps éventuellement non JSON). */
export function messagePourEchec(status: number, corps: unknown): string {
  const code = typeof (corps as { code?: unknown } | null)?.code === "string"
    ? (corps as { code: string }).code
    : null;
  if (code && MESSAGES_ERREUR[code]) return MESSAGES_ERREUR[code];
  if (status === 401) return "Session expirée : reconnectez-vous puis réessayez.";
  return MESSAGE_GENERIQUE;
}

const formatMontant = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * Un prix n'est affecté à un champ métier que si devise, base fiscale et unité
 * sont explicites et compatibles (cf. `selectionnerPrixMappable`). Sinon les
 * champs tarifaires restent vides ("" => non appliqués par le modal).
 */
export function mapScraped(type: CatalogueType, raw: ScrapedProduct): ProductDraftPatch {
  const prix = selectionnerPrixMappable(type, raw.prix_candidats);
  // Règle TVA 20 % identique à la synchronisation HT/TTC du formulaire Bardage,
  // appliquée seulement quand la base fiscale est confirmée.
  const ttcTexte = prix ? formatMontant(prix.baseFiscale === "TTC" ? prix.montant : prix.montant * 1.2) : "";
  const htTexte = prix ? formatMontant(prix.baseFiscale === "HT" ? prix.montant : prix.montant / 1.2) : "";
  const montantTexte = prix ? formatMontant(prix.montant) : "";

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
        prix_m2_ht: montantTexte,
      };
    case "TERRASSE_ACCESSOIRE":
      return {
        kind: "TERRASSE_ACCESSOIRE",
        designation: raw.designation || "",
        description: raw.description || "",
        fournisseur: raw.fournisseur || "",
        prix_conditionnement: montantTexte,
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
      if (!res.ok) {
        let corps: unknown = null;
        try {
          corps = await res.json();
        } catch {
          // Corps non JSON (page d'erreur HTML, etc.) : message générique.
        }
        const message = messagePourEchec(res.status, corps);
        setError(message);
        alert(`❌ ${message}`);
        return;
      }
      let raw: ScrapedProduct;
      try {
        raw = (await res.json()) as ScrapedProduct;
      } catch {
        const message = "Réponse illisible du serveur BNA. Réessayez.";
        setError(message);
        alert(`❌ ${message}`);
        return;
      }
      const patch = mapScraped(type, raw);
      onDataReceived(patch);
      const aPrixTrouve = (raw.prix_candidats?.length ?? 0) > 0 || raw.prix_ttc != null;
      const aPrixApplique = selectionnerPrixMappable(type, raw.prix_candidats) !== null;
      if (raw.avertissements?.includes("PAGE_SANS_DONNEES_PRODUIT")) {
        alert("⚠️ Page lue mais aucune donnée produit détectée (page dynamique ou vérification du site ?). Saisissez les informations à la main ou utilisez l'extension.");
        return;
      }
      alert(
        aPrixTrouve && !aPrixApplique
          ? "✅ Données importées. ⚠️ Prix non appliqué : unité ou base HT/TTC non confirmée, à saisir manuellement."
          : "✅ Données importées ! Vérifiez et ajustez si besoin.",
      );
    } catch (err) {
      console.error(err instanceof Error ? err.name : "Erreur inconnue");
      setError("Connexion au serveur BNA impossible. Vérifiez votre connexion et réessayez.");
      alert("❌ Connexion au serveur BNA impossible. Vérifiez votre connexion et réessayez.");
    } finally {
      setIsScraping(false);
    }
  }, [importUrl, type, onDataReceived]);

  return { importUrl, setImportUrl, isScraping, error, scrape };
}
