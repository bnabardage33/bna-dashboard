// lib/calepinage/modules.ts
//
// Transforme le résultat du moteur (lib/calepinageCalcul.ts) en modules posés,
// groupes de modules identiques et bordereau de débit. Fonction PURE : aucun
// accès base, aucune dépendance Next/Supabase — testable et exécutée côté
// serveur uniquement (route /api/calepinage/calculer).
//
// Le moteur n'est pas modifié ; on lit ses pièces telles qu'il les produit
// (xM / yM / largeurM / hauteurM en mètres, `type`, `repere`).
//
// Limites connues (héritées du moteur) :
//   * pièces de pignon : seule la boîte englobante est conservée (le polygone
//     `points` n'est pas stocké) ; leur surface est donc majorée ;
//   * les ouvertures ne modifient pas le placement des pièces.

import type { PieceCalepinage, ResultatCalepinage } from "@/lib/calepinageCalcul";
import type { CuttingListItem, Treatment } from "@/types/calepinage";

export interface ModuleGenere {
  /** Numéro de pièce du moteur préfixé « P- » (non persisté). */
  repere: string;
  group_number: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  is_cut: boolean;
  is_rotated: boolean;
  is_flipped: boolean;
  treatment: Treatment;
  material: string;
}

export interface GroupeGenere {
  group_number: string;
  width_mm: number;
  height_mm: number;
  is_rotated: boolean;
  is_flipped: boolean;
  treatment: Treatment;
  material: string;
  count: number;
}

export interface ModulesGeneres {
  modules: ModuleGenere[];
  groups: GroupeGenere[];
  cuttingList: CuttingListItem[];
}

const mm = (m: number): number => Math.round(m * 1000);

/** « G-001 », « G-002 »… */
export function numeroGroupe(index: number): string {
  return `G-${String(index).padStart(3, "0")}`;
}

function estCoupe(piece: PieceCalepinage): boolean {
  return piece.type === "coupe" || piece.type === "pignon";
}

/**
 * Convertit les pièces du moteur en modules, puis regroupe les modules
 * identiques (mêmes largeur, hauteur, coupe, traitement, matériau).
 * Les groupes sont numérotés dans l'ordre de première apparition des pièces.
 */
export function genererModules(
  resultat: Pick<ResultatCalepinage, "pieces">,
  materiau: string | null | undefined
): ModulesGeneres {
  const material = materiau && materiau.trim() !== "" ? materiau : "default";
  const treatment: Treatment = "none";

  const numerosParCle = new Map<string, string>();
  const groupes = new Map<string, GroupeGenere>();
  const modules: ModuleGenere[] = [];

  for (const piece of resultat.pieces) {
    const width_mm = mm(piece.largeurM);
    const height_mm = mm(piece.hauteurM);
    const is_cut = estCoupe(piece);
    const is_rotated = false;
    const is_flipped = false;

    const cle = [width_mm, height_mm, is_cut, is_rotated, is_flipped, treatment, material].join("|");

    let numero = numerosParCle.get(cle);
    if (!numero) {
      numero = numeroGroupe(numerosParCle.size + 1);
      numerosParCle.set(cle, numero);
      groupes.set(cle, {
        group_number: numero,
        width_mm,
        height_mm,
        is_rotated,
        is_flipped,
        treatment,
        material,
        count: 0,
      });
    }
    groupes.get(cle)!.count += 1;

    modules.push({
      repere: `P-${piece.repere}`,
      group_number: numero,
      x_mm: mm(piece.xM),
      y_mm: mm(piece.yM),
      width_mm,
      height_mm,
      is_cut,
      is_rotated,
      is_flipped,
      treatment,
      material,
    });
  }

  const groups = [...groupes.values()];
  const cuttingList: CuttingListItem[] = groups.map((g) => ({
    group_number: g.group_number,
    count: g.count,
    width_mm: g.width_mm,
    height_mm: g.height_mm,
    surface_m2: Math.round(((g.width_mm * g.height_mm * g.count) / 1_000_000) * 1000) / 1000,
    treatment: g.treatment,
    material: g.material,
  }));

  return { modules, groups, cuttingList };
}
