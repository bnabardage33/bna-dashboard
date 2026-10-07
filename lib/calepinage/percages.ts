// lib/calepinage/percages.ts
//
// Moteur de génération automatique des perçages des panneaux (version Pro).
// Fonction pure : aucun accès base, testable unitairement et exécutée côté serveur.
//
// Règles de fixation (DTU / guide technique panneaux bardage) :
//  - Fixation fixe : 4 coins avec marge de rive (50 mm par défaut).
//  - Fixation coulissante : perçages du haut fixes (maintien du panneau),
//    perçages du bas coulissants (jeu de dilatation thermique).
//  - Panneaux coupés : perçages générés sur les bords complets si le module
//    offre l'espace suffisant (largeur et hauteur >= 2 * marge), sinon à percer manuellement.

import type { Percage, PercageType } from "@/types/calepinage";

export interface ModulePourPercage {
  id: string;
  zone_id: string;
  entreprise_id: string;
  group_number: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  is_cut: boolean;
}

export interface OptionsPercages {
  /** Marge par rapport au bord du module en mm (défaut : 50 mm) */
  margeBordMm?: number;
  /** Diamètre nominal de perçage en mm (défaut : 6 mm) */
  diameterMm?: number;
  /** Mode de fixation souhaité ('fixe' | 'coulissante' | 'invisible') */
  modeFixation?: "fixe" | "coulissante" | "invisible" | string | null;
}

export const MARGE_BORD_DEFAUT_MM = 50;
export const DIAMETRE_PERCAGE_DEFAUT_MM = 6;

/** Détermine si le mode de fixation est coulissant */
export function resoudreTypeFixation(famillePose?: string | null): "fixe" | "coulissante" | "invisible" {
  if (!famillePose) return "fixe";
  const pose = famillePose.toLowerCase().trim();
  if (pose === "coulissante" || pose === "coulissant") return "coulissante";
  if (pose === "invisible") return "invisible";
  return "fixe";
}

/**
 * Génère l'ensemble des perçages d'une liste de modules.
 */
export function genererPercagesPourModules(
  modules: ModulePourPercage[],
  options: OptionsPercages = {}
): Percage[] {
  const marge = options.margeBordMm ?? MARGE_BORD_DEFAUT_MM;
  const diametre = options.diameterMm ?? DIAMETRE_PERCAGE_DEFAUT_MM;
  const mode = resoudreTypeFixation(options.modeFixation);

  const percages: Percage[] = [];

  for (const m of modules) {
    // Si le panneau est trop petit pour respecter la marge de rive des 2 côtés,
    // on ne génère pas de perçage automatique (marquage manuel chantier).
    if (m.width_mm < 2 * marge || m.height_mm < 2 * marge) {
      continue;
    }

    const xGauche = marge;
    const xDroite = m.width_mm - marge;
    const yHaut = marge;
    const yBas = m.height_mm - marge;

    // Type pour les perçages hauts et bas
    const typeHaut: PercageType = mode === "invisible" ? "invisible" : "fixe";
    const typeBas: PercageType = mode === "coulissante" ? "coulissante" : typeHaut;

    if (!m.is_cut) {
      // 4 perçages complets aux coins
      percages.push(
        {
          id: crypto.randomUUID(),
          module_id: m.id,
          zone_id: m.zone_id,
          entreprise_id: m.entreprise_id,
          x_mm: xGauche,
          y_mm: yHaut,
          diameter_mm: diametre,
          type: typeHaut,
          created_at: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          module_id: m.id,
          zone_id: m.zone_id,
          entreprise_id: m.entreprise_id,
          x_mm: xDroite,
          y_mm: yHaut,
          diameter_mm: diametre,
          type: typeHaut,
          created_at: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          module_id: m.id,
          zone_id: m.zone_id,
          entreprise_id: m.entreprise_id,
          x_mm: xGauche,
          y_mm: yBas,
          diameter_mm: diametre,
          type: typeBas,
          created_at: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          module_id: m.id,
          zone_id: m.zone_id,
          entreprise_id: m.entreprise_id,
          x_mm: xDroite,
          y_mm: yBas,
          diameter_mm: diametre,
          type: typeBas,
          created_at: new Date().toISOString(),
        }
      );
    } else {
      // Module coupé avec dimensions suffisantes (au moins 2 bords complets) :
      // On place les 4 perçages adaptés à la dimension résiduelle du panneau.
      percages.push(
        {
          id: crypto.randomUUID(),
          module_id: m.id,
          zone_id: m.zone_id,
          entreprise_id: m.entreprise_id,
          x_mm: xGauche,
          y_mm: yHaut,
          diameter_mm: diametre,
          type: typeHaut,
          created_at: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          module_id: m.id,
          zone_id: m.zone_id,
          entreprise_id: m.entreprise_id,
          x_mm: xDroite,
          y_mm: yHaut,
          diameter_mm: diametre,
          type: typeHaut,
          created_at: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          module_id: m.id,
          zone_id: m.zone_id,
          entreprise_id: m.entreprise_id,
          x_mm: xGauche,
          y_mm: yBas,
          diameter_mm: diametre,
          type: typeBas,
          created_at: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          module_id: m.id,
          zone_id: m.zone_id,
          entreprise_id: m.entreprise_id,
          x_mm: xDroite,
          y_mm: yBas,
          diameter_mm: diametre,
          type: typeBas,
          created_at: new Date().toISOString(),
        }
      );
    }
  }

  return percages;
}
