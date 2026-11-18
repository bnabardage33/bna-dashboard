import type { ResultatCalculTerrasse } from "@/lib/terrasse/types";
import type {
  CategorieQuantitatif,
  LigneQuantitatifExportable,
  QuantitatifExportable,
  UniteQuantitatif,
} from "./types";

export interface AdapterTerrasseOptions {
  chantierId?: string;
  chantierNom?: string;
  clientId?: string;
  tvaPct?: 20 | 10 | 5.5 | 0;
}

function normaliserUnite(u: string): UniteQuantitatif {
  const s = (u || "").toLowerCase();
  if (s === "m²" || s === "m2") return "m²";
  if (s === "ml") return "ml";
  if (s === "h" || s.startsWith("heure")) return "h";
  if (s === "forfait") return "forfait";
  return "u";
}

function normaliserCategorie(cat: string, code: string, unite: UniteQuantitatif): CategorieQuantitatif {
  const c = (cat || "").toLowerCase();
  const k = (code || "").toUpperCase();
  if (unite === "h" || k.startsWith("MO-") || k.startsWith("PREST-") || c.includes("main") || c.includes("pose")) {
    return "main_oeuvre";
  }
  if (c.includes("ossature") || c.includes("lambourde") || c.includes("plot")) {
    return "ossature";
  }
  if (c.includes("accessoire") || c.includes("vis") || c.includes("fixation") || c.includes("quincaillerie")) {
    return "accessoires";
  }
  return "materiaux";
}

export function adapterTerrasseEnQuantitatif(
  resultat: ResultatCalculTerrasse,
  options: AdapterTerrasseOptions = {}
): QuantitatifExportable {
  const tva = options.tvaPct ?? 20;
  const lignes: LigneQuantitatifExportable[] = (resultat.chiffrage?.lignes ?? []).map((l) => {
    const unite = normaliserUnite(l.unite);
    const categorie = normaliserCategorie(l.categorie, l.code, unite);
    return {
      designation: l.designation,
      reference: l.code,
      unite,
      quantite: l.quantite,
      prix_unitaire_ht: l.prixUnitaireHt,
      tva_pct: tva,
      temps_pose_heures: categorie === "main_oeuvre" && unite === "h" ? l.quantite : undefined,
      categorie,
    };
  });

  const objet = `Terrasse ${
    resultat.terrasseMobile?.active ? "& Terrasse Mobile " : ""
  }— ${resultat.surfaceNetteM2} m²`;

  return {
    metier: "terrasse",
    chantier_id: options.chantierId,
    chantier_nom: options.chantierNom,
    client_id: options.clientId,
    objet,
    surface_ou_lineaire: resultat.surfaceNetteM2,
    lignes,
  };
}
