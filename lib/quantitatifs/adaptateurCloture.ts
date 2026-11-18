import type { ResultatChiffrageCloture } from "@/lib/cloture/calculs";
import type {
  CategorieQuantitatif,
  LigneQuantitatifExportable,
  QuantitatifExportable,
  UniteQuantitatif,
} from "./types";

export interface AdapterClotureOptions {
  chantierId?: string;
  chantierNom?: string;
  clientId?: string;
  materiauLabel?: string;
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

function deduireCategorie(designation: string, typeCout: "matiere" | "main_oeuvre"): CategorieQuantitatif {
  if (typeCout === "main_oeuvre") return "main_oeuvre";
  const d = designation.toLowerCase();
  if (d.includes("poteau") || d.includes("soubassement")) return "ossature";
  if (d.includes("platine") || d.includes("béton") || d.includes("beton") || d.includes("vis")) {
    return "accessoires";
  }
  return "materiaux";
}

export function adapterClotureEnQuantitatif(
  chiffrage: ResultatChiffrageCloture,
  options: AdapterClotureOptions = {}
): QuantitatifExportable {
  const tva = options.tvaPct ?? 20;
  const lignesSource =
    chiffrage.lignesDevis.length > 0 ? chiffrage.lignesDevis : chiffrage.lignesFournitures;

  const lignes: LigneQuantitatifExportable[] = lignesSource
    .filter((l) => l.qte > 0)
    .map((l) => {
      const unite = normaliserUnite(l.unite);
      const categorie = deduireCategorie(l.designation, l.type_cout);
      return {
        designation: l.description ? `${l.designation} — ${l.description}` : l.designation,
        unite,
        quantite: l.qte,
        prix_unitaire_ht: l.pu_ht,
        tva_pct: tva,
        temps_pose_heures: categorie === "main_oeuvre" && unite === "h" ? l.qte : undefined,
        categorie,
      };
    });

  const lineaire = Number(chiffrage.calepinage.lineaireTotalM.toFixed(1));
  const matLabel = options.materiauLabel || "Clôture";

  return {
    metier: "cloture",
    chantier_id: options.chantierId,
    chantier_nom: options.chantierNom,
    client_id: options.clientId,
    objet: `${matLabel} — ${lineaire} ml (${chiffrage.calepinage.totalPoteauxComplets} poteaux)`,
    surface_ou_lineaire: lineaire,
    lignes,
  };
}
