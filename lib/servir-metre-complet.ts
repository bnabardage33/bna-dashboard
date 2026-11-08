// lib/servir-metre-complet.ts
// SOURCE DE VÉRITÉ SERVEUR — construction du payload metre-complet à partir des
// données PERSISTÉES de Supabase.
//
// Cette fonction UNIQUE est réutilisée par :
//   * GET  /api/chantiers/[id]/metre-complet
//   * POST /api/ia-devis                       (consommation des quantités)
//
// RÈGLES ABSOLUES :
//   * Aucun recalcul, aucune estimation, aucune invention : le payload est
//     constitué des agrégaats déjà persistés (chantiers) et des copies strictes
//     du JSONB `chantier_zones.resultats_techniques`.
//   * L'authentification reste la responsabilité de CHAQUE route : cette
//     fonction ne fait aucune session.
//   * Chantier inexistant → `ChantierIntrouvableError` (les routes décident le
//     404 / le repli).
//
// L'HTTP est INTERDIT entre routes : on appelle cette fonction directement,
// jamais un auto-appel HTTP.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  construirePayload,
  type ChantierMetreComplet,
  type ClientMetreComplet,
  type PayloadMetreComplet,
} from "@/lib/metre-complet";
import type { ResultatMetre } from "@/lib/metre-serialization";
import type { Zone } from "@/components/ZoneCard";

export class ChantierIntrouvableError extends Error {
  constructor(chantierId: string) {
    super(`Chantier introuvable : ${chantierId}`);
    this.name = "ChantierIntrouvableError";
  }
}

export async function servirPayloadMetreComplet(chantierId: string, entrepriseId: string): Promise<PayloadMetreComplet> {
  const requeteChantier = await supabaseAdmin
    .from("chantiers")
    .select(
      "id, entreprise_id, nom, client_id, adresse_chantier, materiau_structurel, moyen_acces, " +
        "zone_vent, coef_perte_rendement, type_isolant, epaisseur_isolant_mm, " +
        "surface_paquet_m2, zone_vent_rive, surface_m2, quantite_coupes_ml, singularites_nb, " +
        "clients(id, entreprise_id, nom, societe, email, tel, adresse_facturation, code_postal, ville, siret)",
    )
    .eq("id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (requeteChantier.error) throw requeteChantier.error;
  const chantier = requeteChantier.data as
    | (ChantierMetreComplet & { clients: ClientMetreComplet | null })
    | null;
  if (!chantier) throw new ChantierIntrouvableError(chantierId);
  const contexteChantier = chantier as typeof chantier & {
    entreprise_id: string;
    clients: (ClientMetreComplet & { entreprise_id?: string }) | null;
  };
  if (contexteChantier.entreprise_id !== entrepriseId ||
      (chantier.client_id && (!contexteChantier.clients || contexteChantier.clients.id !== chantier.client_id || contexteChantier.clients.entreprise_id !== entrepriseId))) {
    throw new ChantierIntrouvableError(chantierId);
  }

  const requeteZones = await supabaseAdmin
    .from("chantier_zones")
    .select(
      "id, chantier_id, entreprise_id, nom, type, largeur, hauteur_mur, hauteur_faite, materiau, " +
        "famille_pose, sens_pose, angle, largeur_lame_mm, plaque_longueur_mm, plaque_largeur_mm, " +
        "module_largeur_mm, module_hauteur_mm, ouvertures, resultats_techniques",
    )
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: true });

  if (requeteZones.error) throw requeteZones.error;
  // Le type Supabase inféré pour cette projection peut être GenericStringError.
  // On passe par unknown avant de borner le résultat à la forme minimale
  // nécessaire au contrôle de tenant et à la normalisation ci-dessous.
  const zonesBrutes = (requeteZones.data ?? []) as unknown as Array<
    Record<string, unknown> & {
      chantier_id: unknown;
      entreprise_id: unknown;
    }
  >;
  if (zonesBrutes.some((z) => z.chantier_id !== chantierId || z.entreprise_id !== entrepriseId)) {
    throw new ChantierIntrouvableError(chantierId);
  }

  // Normalisation JSONB (null / objet mal formé).
  const zonesNormalisees = zonesBrutes.map((z) => ({
    ...z,
    ouvertures: z.ouvertures || [],
    resultats_techniques:
      z.resultats_techniques && typeof z.resultats_techniques === "object"
        ? (z.resultats_techniques as unknown as ResultatMetre)
        : null,
  }));

  const client = (chantier.clients as ClientMetreComplet | null) ?? null;
  return construirePayload({
    chantier,
    client,
    zones: zonesNormalisees as unknown as Zone[],
  });
}
