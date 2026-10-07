import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import { calculerCalepinage, type SensPose } from "@/lib/calepinageCalcul";
import { genererModules } from "@/lib/calepinage/modules";
import { genererPercagesPourModules } from "@/lib/calepinage/percages";
import type {
  CalepinageCalculerResponse,
  Module,
  ModuleCalcule,
  ModuleGroup,
  Percage,
} from "@/types/calepinage";

// POST /api/calepinage/calculer  { zone_id }
//
// Calcule le calepinage d'une zone CÔTÉ SERVEUR (moteur lib/calepinageCalcul.ts,
// inchangé), remplace les modules / groupes persistés de la zone et renvoie le
// résultat. Le client ne fait qu'envoyer le zone_id et afficher la réponse.

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Erreur = { error: string };

const reponseErreur = (message: string, status: 400 | 404 | 500) =>
  NextResponse.json<Erreur>({ error: message }, { status });

function arrondi(valeur: number, decimales = 2): number {
  const f = 10 ** decimales;
  return Math.round(valeur * f) / f;
}

function nombrePositif(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

export async function POST(request: NextRequest) {
  // 1. AUTHENTIFICATION / TENANT
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;
  const { entrepriseId } = tenant;

  try {
    // 2. VALIDATION DU CORPS
    let corps: unknown;
    try {
      corps = await request.json();
    } catch {
      return reponseErreur("Corps JSON invalide.", 400);
    }
    const zoneId =
      corps && typeof corps === "object" && "zone_id" in corps
        ? (corps as { zone_id: unknown }).zone_id
        : undefined;
    if (typeof zoneId !== "string" || !UUID_RE.test(zoneId)) {
      return reponseErreur("zone_id manquant ou invalide (UUID attendu).", 400);
    }

    // 3. RÉCUPÉRATION DE LA ZONE (client de session : RLS + prédicat tenant)
    const supabase = await createClient();
    const { data: zone, error: erreurZone } = await supabase
      .from("chantier_zones")
      .select("*")
      .eq("id", zoneId)
      .eq("entreprise_id", entrepriseId)
      .maybeSingle();

    if (erreurZone) {
      console.error("[calepinage/calculer] lecture zone :", erreurZone);
      return reponseErreur("Erreur serveur lors de la lecture de la zone.", 500);
    }
    if (!zone) return reponseErreur("Zone introuvable.", 404);

    const largeurM = nombrePositif(zone.largeur);
    const hauteurMurM = nombrePositif(zone.hauteur_mur);
    if (largeurM === null || hauteurMurM === null) {
      return reponseErreur(
        "Dimensions de la zone invalides : largeur et hauteur doivent être > 0.",
        400
      );
    }

    // 4. APPEL DU MOTEUR
    // Pour un pignon, le moteur attend la hauteur du MUR en `zoneHauteurM` et la
    // hauteur au faîtage en `hauteurFaiteM` (comme ZoneCard) : il calcule lui-même
    // la géométrie du pignon à partir des deux.
    const estPignon = zone.type === "pignon";
    const sensPose: SensPose =
      (zone.sens_pose ?? "horizontal").toString().toLowerCase() === "vertical"
        ? "vertical"
        : "horizontal";

    const resultat = calculerCalepinage({
      zoneLargeurM: largeurM,
      zoneHauteurM: hauteurMurM,
      plaqueLongueurMm: zone.plaque_longueur_mm || 3050,
      plaqueLargeurMm: zone.plaque_largeur_mm || 1300,
      moduleLargeurMm: zone.module_largeur_mm || 1000,
      moduleHauteurMm: zone.module_hauteur_mm || 600,
      sensPose,
      estPignon,
      hauteurFaiteM: zone.hauteur_faite,
      traitDeScieMm: 0,
      autoriserRotation: true,
    });

    // 5. TRANSFORMATION EN MODULES / GROUPES
    const { modules, groups, cuttingList } = genererModules(resultat, zone.materiau);

    // 6. PERSISTANCE ATOMIQUE (RPC upsert_calepinage_zone avec perçages)
    const idsModules = modules.map(() => crypto.randomUUID());
    const modulesAvecIds = modules.map((m, i) => ({
      id: idsModules[i],
      zone_id: zoneId,
      entreprise_id: entrepriseId,
      group_number: m.group_number,
      x_mm: m.x_mm,
      y_mm: m.y_mm,
      width_mm: m.width_mm,
      height_mm: m.height_mm,
      is_cut: m.is_cut,
    }));

    const percagesGeneres = genererPercagesPourModules(modulesAvecIds, {
      modeFixation: zone.famille_pose,
    });

    const p_groups = groups.map((g) => ({
      group_number: g.group_number,
      width_mm: g.width_mm,
      height_mm: g.height_mm,
      is_rotated: g.is_rotated,
      is_flipped: g.is_flipped,
      treatment: g.treatment,
      material: g.material,
      count: g.count,
    }));
    const p_modules = modules.map((m, i) => ({
      id: idsModules[i],
      group_number: m.group_number,
      x_mm: m.x_mm,
      y_mm: m.y_mm,
      width_mm: m.width_mm,
      height_mm: m.height_mm,
      is_cut: m.is_cut,
      is_rotated: m.is_rotated,
      is_flipped: m.is_flipped,
      treatment: m.treatment,
      material: m.material,
    }));
    const p_percages = percagesGeneres.map((p) => ({
      module_id: p.module_id,
      x_mm: p.x_mm,
      y_mm: p.y_mm,
      diameter_mm: p.diameter_mm,
      type: p.type,
      depth_mm: p.depth_mm ?? null,
    }));

    const { error: rpcError } = await supabase.rpc("upsert_calepinage_zone", {
      p_zone_id: zoneId,
      p_entreprise_id: entrepriseId,
      p_groups,
      p_modules,
      p_percages,
    });
    if (rpcError) {
      console.error("[calepinage/calculer] rpc upsert_calepinage_zone :", rpcError);
      return reponseErreur("Erreur serveur lors de l'enregistrement du calepinage.", 500);
    }

    // Relecture des lignes persistées (ids générés, created_at) pour la réponse.
    const [modulesBdd, groupesBdd, percagesBdd] = await Promise.all([
      supabase.from("chantier_zones_modules").select("*").eq("zone_id", zoneId),
      supabase
        .from("chantier_zones_module_groups")
        .select("*")
        .eq("zone_id", zoneId)
        .order("group_number", { ascending: true }),
      supabase.from("chantier_zones_percages").select("*").eq("zone_id", zoneId),
    ]);
    if (modulesBdd.error || groupesBdd.error || percagesBdd.error) {
      throw new Error(
        `relecture : ${(modulesBdd.error ?? groupesBdd.error ?? percagesBdd.error)?.message}`
      );
    }

    const reperesParPosition = new Map(
      modules.map((m) => [`${m.x_mm}:${m.y_mm}`, m.repere]),
    );
    const modulesReponse: ModuleCalcule[] = ((modulesBdd.data ?? []) as Module[])
      .map((m) => ({
        ...m,
        repere: reperesParPosition.get(`${m.x_mm}:${m.y_mm}`) ?? "",
      }))
      .sort((a, b) => a.y_mm - b.y_mm || a.x_mm - b.x_mm);

    // 7. RÉPONSE
    const reponse: CalepinageCalculerResponse = {
      success: true,
      modules: modulesReponse,
      groups: (groupesBdd.data ?? []) as ModuleGroup[],
      cuttingList,
      stats: {
        nombrePlaques: resultat.nbPlaquesNecessaires,
        tauxChuteBrut: arrondi(resultat.tauxChuteBrutePct),
        tauxChuteNet: arrondi(resultat.tauxChuteNettePct),
        joints: resultat.nbJoints,
        entraxeReelMm: arrondi(resultat.entraxeReelMm),
      },
      percages: (percagesBdd.data ?? []) as Percage[],
    };
    return NextResponse.json(reponse);
  } catch (err) {
    console.error("[calepinage/calculer] erreur inattendue :", err);
    return reponseErreur("Erreur serveur lors du calcul du calepinage.", 500);
  }
}
