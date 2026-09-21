// lib/iaDevisLegacy.ts
// Aides de calcul des quantités sur le chemin IA « legacy » (appel sans
// chantier_id). Seul ce chemin est autorisé à appliquer le moteur de
// calepinage (poseCalcul) : les quantités sont dérivées de la surface nette
// factuelle. Le chemin metre-complet (chantier_id) n'utilise JAMAIS ce module.

import { calculerBesoinsBardage } from "@/lib/poseCalcul";
import { normaliser as normaliserMatching } from "@/lib/catalogueMatching";
import { type CoutType, type LigneDevis } from "@/lib/devisCalcul";

export type CatalogueOuvrage = {
  categorie?: string | null;
  id: string;
  designation: string;
  description: string | null;
  famille_label: string;
  unite: string;
  pu_ht: number;
  pu_revient: number;
  type_cout: string;
};

function estUniteM2(unite: string): boolean {
  const u = unite.toLowerCase().replace(/\s+/g, "");
  return u === "m²" || u === "m2" || u === "m^2" || u === "mq";
}

/** Vrai si la demande contient une quantité EXPLICITE. */
export function quantiteExpliciteDansLaDemande(prompt: string): boolean {
  return /(\d+(?:[.,]\d+)?)\s*(?:m2|mq|m\s?carre|unit\w*|pieces?|heures?|chevrons?|vis|equerres?)/.test(
    normaliserMatching(prompt)
  );
}

export function appliquerQuantitesFactuelles(
  ligne: LigneDevis,
  surface: number | null,
  catalogue: Map<string, CatalogueOuvrage>,
  qteExplicite: boolean
): LigneDevis {
  if (ligne.a_chiffrer || !ligne.catalogue_id) return ligne;

  const ouvrage = catalogue.get(ligne.catalogue_id);
  if (!ouvrage) return ligne;

  // Option B : force la main d'œuvre en m² avec la surface si applicable.
  if (ouvrage.type_cout === "main_oeuvre" && surface && surface > 0) {
    const isBardageOrITE =
      ouvrage.categorie?.toLowerCase().includes("bardage") ||
      ouvrage.categorie?.toLowerCase().includes("isolation") ||
      ouvrage.famille_label?.toLowerCase().includes("pose");

    if (
      isBardageOrITE ||
      ligne.designation.toLowerCase().includes("pose") ||
      ligne.designation.toLowerCase().includes("main d'oeuvre")
    ) {
      ligne.unite = "m²";
      ligne.qte = surface;
      return ligne; // Retour direct pour garantir le verrouillage
    }
  }

  if (qteExplicite) return ligne;

  // Si on a une surface, appliquer le moteur de calepinage.
  if (surface && surface > 0) {
    const besoins = calculerBesoinsBardage(surface);
    const des = (ouvrage.designation + " " + ouvrage.famille_label).toLowerCase();

    if (des.includes("chevron") || ouvrage.famille_label.toLowerCase().includes("ossature")) {
      if (ouvrage.unite === "ml") ligne.qte = besoins.mlChevrons;
      else if (ouvrage.unite === "u" || ouvrage.unite === "unité") ligne.qte = besoins.mlChevrons; // fallback
      else ligne.qte = surface;
      return ligne;
    }
    if (des.includes("équerre") || des.includes("equerre")) {
      ligne.qte = besoins.nbEquerres;
      return ligne;
    }
    if (des.includes("cheville")) {
      ligne.qte = besoins.nbChevilles;
      return ligne;
    }
    if (des.includes("vis")) {
      ligne.qte = besoins.nbVisAutoForeuses;
      return ligne;
    }
    if (estUniteM2(ouvrage.unite)) {
      ligne.qte = surface;
      return ligne;
    }
  }

  return ligne;
}

export function construireLigneLegacy(
  ouvrage: CatalogueOuvrage,
  description: string,
  qte: number | null,
  surface: number | null,
  catalogueMap: Map<string, CatalogueOuvrage>,
  qteExplicite: boolean
): LigneDevis {
  const ligne: LigneDevis = {
    catalogue_id: ouvrage.id,
    designation: ouvrage.designation,
    description,
    qte: qte ?? 0,
    unite: ouvrage.unite,
    pu_ht: ouvrage.pu_ht,
    pu_revient: ouvrage.pu_revient ?? 0,
    type_cout: (ouvrage.type_cout === "main_oeuvre" ? "main_oeuvre" : "matiere") as CoutType,
    a_chiffrer: false,
  };
  return appliquerQuantitesFactuelles(ligne, surface, catalogueMap, qteExplicite);
}