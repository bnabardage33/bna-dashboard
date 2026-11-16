import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import {
  calculateFenceLayout,
  type FenceConfig,
  type SegmentId,
} from "@/lib/cloture/calepinageCloture";
import { calculerChiffrageCloture } from "@/lib/cloture/calculs";
import type { Json } from "@/types/supabase";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

async function verifierChantierCloture(chantierId: string, entrepriseId: string) {
  const supabase = await createClient();
  const { data: chantier, error } = await supabase
    .from("chantiers")
    .select("id, nom, metier, entreprise_id")
    .eq("id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (error || !chantier) {
    return {
      ok: false as const,
      reponse: NextResponse.json(
        { ok: false, error: "Chantier introuvable ou non autorisé." },
        { status: 404 }
      ),
    };
  }

  if (chantier.metier !== "cloture") {
    return {
      ok: false as const,
      reponse: NextResponse.json(
        {
          ok: false,
          error: `Incohérence métier : ce chantier est de type '${chantier.metier}', pas 'cloture'.`,
        },
        { status: 409 }
      ),
    };
  }

  return { ok: true as const, supabase, chantier };
}

export async function GET(_req: NextRequest, { params }: RouteProps) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id } = await params;
  const check = await verifierChantierCloture(id, tenant.entrepriseId);
  if (!check.ok) return check.reponse;

  const { data: cloture } = await check.supabase
    .from("chantier_clotures")
    .select("*")
    .eq("chantier_id", id)
    .eq("entreprise_id", tenant.entrepriseId)
    .maybeSingle();

  const { data: troncons } = await check.supabase
    .from("chantier_cloture_troncons")
    .select("*")
    .eq("chantier_id", id)
    .eq("entreprise_id", tenant.entrepriseId)
    .order("ordre", { ascending: true });

  return NextResponse.json({
    ok: true,
    data: {
      chantier: check.chantier,
      cloture: cloture ?? null,
      troncons: troncons ?? [],
    },
  });
}

async function sauvegarderCloture(req: NextRequest, { params }: RouteProps) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id } = await params;
  const check = await verifierChantierCloture(id, tenant.entrepriseId);
  if (!check.ok) return check.reponse;

  const body = await req.json().catch(() => null);
  const config = (body?.config ?? body) as FenceConfig | null;
  if (!config || !config.forme || !config.segments) {
    return NextResponse.json(
      { ok: false, error: "Configuration clôture invalide." },
      { status: 400 }
    );
  }

  const calepinage = calculateFenceLayout(config);
  const chiffrage = calculerChiffrageCloture(config, { inclureMainOeuvre: true });

  const { data: clotureUpserted, error: errUpsert } = await check.supabase
    .from("chantier_clotures")
    .upsert(
      {
        chantier_id: id,
        entreprise_id: tenant.entrepriseId,
        nom: check.chantier.nom || "Clôture principale",
        forme: calepinage.config.forme,
        materiau: calepinage.config.materiau,
        hauteur_utile_m: calepinage.config.hauteurUtile,
        longueur_lame_brute_m: calepinage.config.longueurLameBrute,
        hauteur_lame_m: calepinage.config.hauteurLame,
        extremites: calepinage.config.extremites,
        type_pose_sol: calepinage.config.typePoseSol,
        presence_soubassement: calepinage.config.presenceSoubassement,
        hauteur_soubassement_m: calepinage.hauteurSoubassementRetenueM,
        gestion_pente: calepinage.config.gestionPente,
        resultats_techniques: chiffrage as unknown as Json,
      },
      { onConflict: "chantier_id" }
    )
    .select("*")
    .single();

  if (errUpsert || !clotureUpserted) {
    return NextResponse.json(
      { ok: false, error: errUpsert?.message || "Échec sauvegarde clôture" },
      { status: 500 }
    );
  }

  // Remplacer les tronçons du chantier
  await check.supabase
    .from("chantier_cloture_troncons")
    .delete()
    .eq("cloture_id", clotureUpserted.id)
    .eq("entreprise_id", tenant.entrepriseId);

  const portillons = calepinage.config.portillons ?? [];
  const rowsTroncons = calepinage.segmentsActifs.map((seg, idx) => {
    const p = portillons.find((item) => item.segment === (seg.id as SegmentId));
    return {
      cloture_id: clotureUpserted.id,
      chantier_id: id,
      entreprise_id: tenant.entrepriseId,
      code_segment: seg.id,
      ordre: idx + 1,
      longueur_m: seg.longueurSegment,
      hauteur_utile_m: calepinage.config.hauteurUtile,
      denivele_m: seg.deniveleM,
      nb_redans: seg.nbRedansSegment,
      presence_portillon: seg.nbPortillonsSegment > 0,
      largeur_portillon_m: p?.largeurM ?? null,
      position_portillon_m: p?.positionM ?? null,
      type_depart: seg.departType,
      type_arrivee: seg.arriveeType,
    };
  });

  if (rowsTroncons.length > 0) {
    await check.supabase.from("chantier_cloture_troncons").insert(rowsTroncons);
  }

  return NextResponse.json({
    ok: true,
    data: {
      cloture: clotureUpserted,
      chiffrage,
    },
  });
}

export async function POST(req: NextRequest, ctx: RouteProps) {
  return sauvegarderCloture(req, ctx);
}

export async function PUT(req: NextRequest, ctx: RouteProps) {
  return sauvegarderCloture(req, ctx);
}
