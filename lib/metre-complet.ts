// lib/metre-complet.ts
// Construction PURE du payload de GET /api/chantiers/[id]/metre-complet.
//
// Règles absolues :
//   * AUCUN appel Supabase, aucune écriture et aucun moteur de calcul ici.
//   * `metrage`, `pose`, `calepinage`, `entrees`, `version_moteur`, `calcule_le`
//     sont des copies STRICTES de `chantier_zones.resultats_techniques` :
//     un null persisté reste null, une valeur persistée est renvoyée telle quelle.
//   * `totaux` provient UNIQUEMENT des agrégats déjà persistés de `chantiers`
//     (surface_m2, quantite_coupes_ml, singularites_nb). Aucun recalcul.
//   * `zone_vent_rive` n'est JAMAIS déclaré manquant quand il est null : le
//     moteur dispose du comportement Auto.
//   * `configuration_isolant` est complète si type_isolant + epaisseur_isolant_mm
//     + surface_paquet_m2 sont cohérents ; exception : "sans_isolant" avec
//     epaisseur_isolant_mm = 0 est valide.

import type { Zone } from "@/components/ZoneCard";
import { VERSION_MOTEUR, type ResultatMetre } from "@/lib/metre-serialization";

export type StatutCompletude = "complet" | "incomplet" | "non_calculé";

export type ChantierMetreComplet = {
  id: string;
  nom: string | null;
  client_id: string | null;
  adresse_chantier: string | null;
  materiau_structurel: string;
  moyen_acces: string;
  zone_vent: number;
  coef_perte_rendement: number | null;
  type_isolant: string | null;
  epaisseur_isolant_mm: number | null;
  surface_paquet_m2: number | null;
  zone_vent_rive: boolean | null;
  surface_m2: number | null;
  quantite_coupes_ml: number | null;
  singularites_nb: number | null;
};

export type ClientMetreComplet = {
  id: string;
  nom: string;
  societe: string | null;
  email: string | null;
  tel: string | null;
  adresse_facturation: string | null;
  code_postal: string | null;
  ville: string | null;
  siret: string | null;
};

export type ZoneMetreComplet = {
  id: string;
  nom: string;
  type: Zone["type"];
  largeur: number;
  hauteur_mur: number;
  hauteur_faite: number | null;
  materiau: Zone["materiau"];
  famille_pose: Zone["famille_pose"];
  sens_pose: Zone["sens_pose"];
  angle: boolean;
  largeur_lame_mm: number | null;
  plaque_longueur_mm: number | null;
  plaque_largeur_mm: number | null;
  module_largeur_mm: number | null;
  module_hauteur_mm: number | null;
  ouvertures: Zone["ouvertures"];
};

export type EntreeZoneMetreComplet = {
  zone: ZoneMetreComplet;
  version_moteur: string | null;
  calcule_le: string | null;
  entrees: ResultatMetre["entrees"] | null;
  metrage: ResultatMetre["resultat_zone"] | null;
  pose: ResultatMetre["resultat_pose"];
  calepinage: ResultatMetre["resultat_calepinage"];
};

export type PayloadMetreComplet = {
  chantier: {
    id: string;
    nom: string | null;
    client: ClientMetreComplet | null;
    adresse: string | null;
    materiau_structurel: string;
    moyen_acces: string;
    zone_vent: number;
    coef_perte_rendement: number | null;
  };
  configuration_technique: {
    type_isolant: string | null;
    epaisseur_isolant_mm: number | null;
    surface_paquet_m2: number | null;
    zone_vent_rive: boolean | null;
    coef_perte_rendement: number | null;
  };
  zones: EntreeZoneMetreComplet[];
  totaux: {
    surface_m2: number | null;
    quantite_coupes_ml: number | null;
    singularites_nb: number | null;
  };
  meta: {
    version_moteur: string;
    nombre_zones: number;
    zones_calculees: number;
    statut_completude: StatutCompletude;
    manquants: string[];
  };
};

/**
 * Manquants propres à UNE zone (toujours ignorés en statut "non_calculé").
 */
function manquantsPourZone(zone: Zone): string[] {
  const manquants: string[] = [];

  if (!zone.famille_pose) manquants.push("famille_pose");
  if (!zone.sens_pose) manquants.push("sens_pose");

  if (zone.materiau === "lames" && !zone.largeur_lame_mm) {
    manquants.push("largeur_lame_mm");
  }
  if (zone.materiau === "plaques" && (!zone.module_largeur_mm || !zone.module_hauteur_mm)) {
    manquants.push("modules_plaques");
  }

  const rt = zone.resultats_techniques ?? null;
  if (!rt) {
    manquants.push("metrage", "pose");
    if (zone.materiau === "plaques") manquants.push("calepinage");
    return manquants;
  }

  if (!rt.resultat_zone) manquants.push("metrage");
  if (!rt.resultat_pose) manquants.push("pose");
  if (zone.materiau === "plaques" && !rt.resultat_calepinage) manquants.push("calepinage");

  return manquants;
}

/**
 * Configuration d'isolant du chantier complète et cohérente.
 * - "sans_isolant" avec epaisseur_isolant_mm === 0 est toujours valide.
 * - sinon : type_isolant + epaisseur_isolant_mm + surface_paquet_m2 renseignés.
 * zone_vent_rive n'est jamais vérifié (comportement Auto du moteur).
 */
function configurationIsolantValide(chantier: ChantierMetreComplet): boolean {
  if (chantier.type_isolant === "sans_isolant") {
    return chantier.epaisseur_isolant_mm === 0;
  }
  return (
    !!chantier.type_isolant &&
    chantier.epaisseur_isolant_mm !== null &&
    chantier.surface_paquet_m2 !== null
  );
}

export function construirePayload(args: {
  chantier: ChantierMetreComplet;
  client: ClientMetreComplet | null;
  zones: Zone[];
}): PayloadMetreComplet {
  const { chantier, client, zones } = args;

  const zonesCalculees = zones.filter((z) => !!z.resultats_techniques);
  const aucuneZoneCalculee = zones.length === 0 || zonesCalculees.length === 0;

  let statut: StatutCompletude = "complet";
  let manquants: string[] = [];

  if (aucuneZoneCalculee) {
    statut = "non_calculé";
  } else {
    for (const z of zones) manquants.push(...manquantsPourZone(z));
    if (!configurationIsolantValide(chantier)) manquants.push("configuration_isolant");
    manquants = [...new Set(manquants)];
    if (manquants.length > 0) statut = "incomplet";
  }

  const zonesPayload: EntreeZoneMetreComplet[] = zones.map((z) => {
    const zone: ZoneMetreComplet = {
      id: z.id,
      nom: z.nom,
      type: z.type,
      largeur: z.largeur,
      hauteur_mur: z.hauteur_mur,
      hauteur_faite: z.hauteur_faite ?? null,
      materiau: z.materiau,
      famille_pose: z.famille_pose ?? null,
      sens_pose: z.sens_pose ?? null,
      angle: z.angle,
      largeur_lame_mm: z.largeur_lame_mm ?? null,
      plaque_longueur_mm: z.plaque_longueur_mm ?? null,
      plaque_largeur_mm: z.plaque_largeur_mm ?? null,
      module_largeur_mm: z.module_largeur_mm ?? null,
      module_hauteur_mm: z.module_hauteur_mm ?? null,
      ouvertures: z.ouvertures ?? [],
    };

    const rt = z.resultats_techniques ?? null;

    return {
      zone,
      version_moteur: rt?.version_moteur ?? null,
      calcule_le: rt?.calcule_le ?? null,
      entrees: rt?.entrees ?? null,
      metrage: rt?.resultat_zone ?? null,
      pose: rt?.resultat_pose ?? null,
      calepinage: rt?.resultat_calepinage ?? null,
    };
  });

  return {
    chantier: {
      id: chantier.id,
      nom: chantier.nom ?? null,
      client: client ?? null,
      adresse: chantier.adresse_chantier ?? null,
      materiau_structurel: chantier.materiau_structurel,
      moyen_acces: chantier.moyen_acces,
      zone_vent: chantier.zone_vent,
      coef_perte_rendement: chantier.coef_perte_rendement ?? null,
    },
    configuration_technique: {
      type_isolant: chantier.type_isolant ?? null,
      epaisseur_isolant_mm: chantier.epaisseur_isolant_mm ?? null,
      surface_paquet_m2: chantier.surface_paquet_m2 ?? null,
      zone_vent_rive: chantier.zone_vent_rive ?? null,
      coef_perte_rendement: chantier.coef_perte_rendement ?? null,
    },
    zones: zonesPayload,
    totaux: {
      surface_m2: chantier.surface_m2 ?? null,
      quantite_coupes_ml: chantier.quantite_coupes_ml ?? null,
      singularites_nb: chantier.singularites_nb ?? null,
    },
    meta: {
      version_moteur: VERSION_MOTEUR,
      nombre_zones: zones.length,
      zones_calculees: zonesCalculees.length,
      statut_completude: statut,
      manquants,
    },
  };
}