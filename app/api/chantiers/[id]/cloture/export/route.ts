import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import { calculerChiffrageCloture } from "@/lib/cloture/calculs";
import type { FenceConfig } from "@/lib/cloture/calepinageCloture";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteProps) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") || "csv";
  const supabase = await createClient();

  const { data: chantier } = await supabase
    .from("chantiers")
    .select("id, nom, metier")
    .eq("id", id)
    .eq("entreprise_id", tenant.entrepriseId)
    .maybeSingle();

  if (!chantier || chantier.metier !== "cloture") {
    return NextResponse.json(
      { ok: false, error: "Chantier Clôture introuvable." },
      { status: 404 }
    );
  }

  const { data: cloture } = await supabase
    .from("chantier_clotures")
    .select("*")
    .eq("chantier_id", id)
    .eq("entreprise_id", tenant.entrepriseId)
    .maybeSingle();

  const { data: troncons } = await supabase
    .from("chantier_cloture_troncons")
    .select("*")
    .eq("chantier_id", id)
    .eq("entreprise_id", tenant.entrepriseId)
    .order("ordre", { ascending: true });

  const segs: Record<string, number> = { A: 12, B: 8, C: 12, D: 8 };
  const deniveles: Record<string, number> = {};
  const portillons: Array<{ segment: "A" | "B" | "C" | "D"; largeurM: number }> = [];

  for (const t of troncons ?? []) {
    segs[t.code_segment] = Number(t.longueur_m);
    if (t.denivele_m) deniveles[t.code_segment] = Number(t.denivele_m);
    if (t.presence_portillon && t.largeur_portillon_m) {
      portillons.push({
        segment: t.code_segment as "A" | "B" | "C" | "D",
        largeurM: Number(t.largeur_portillon_m),
      });
    }
  }

  const config: FenceConfig = {
    forme: (cloture?.forme as FenceConfig["forme"]) || "DROITE",
    segments: { A: segs.A, B: segs.B, C: segs.C, D: segs.D },
    hauteurUtile: Number(cloture?.hauteur_utile_m ?? 1.8),
    materiau: (cloture?.materiau as FenceConfig["materiau"]) || "COMPOSITE",
    longueurLameBrute: Number(cloture?.longueur_lame_brute_m ?? 1.8),
    hauteurLame: Number(cloture?.hauteur_lame_m ?? 0.15),
    extremites: (cloture?.extremites as FenceConfig["extremites"]) || "LIBRE",
    typePoseSol: (cloture?.type_pose_sol as FenceConfig["typePoseSol"]) || "DIRECT_SOL",
    presenceSoubassement: Boolean(cloture?.presence_soubassement),
    hauteurSoubassementM: Number(cloture?.hauteur_soubassement_m ?? 0.25),
    gestionPente: (cloture?.gestion_pente as FenceConfig["gestionPente"]) || "PLAT",
    denivelesSegments: deniveles,
    portillons,
  };

  const chiffrage = calculerChiffrageCloture(config, { inclureMainOeuvre: true });

  if (format === "json") {
    return NextResponse.json({ ok: true, chantier, chiffrage });
  }

  const BOM = "\uFEFF";
  const header = "Type;Désignation;Quantité;Unité;PU HT (€);Total HT (€)";
  const rows = chiffrage.lignesDevis.map((l) => {
    const total = (l.qte * l.pu_ht).toFixed(2).replace(".", ",");
    const pu = l.pu_ht.toFixed(2).replace(".", ",");
    const qte = String(l.qte).replace(".", ",");
    const des = `"${l.designation.replace(/"/g, '""')}"`;
    return `${l.type_cout};${des};${qte};${l.unite};${pu};${total}`;
  });
  const csv = BOM + [header, ...rows].join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quantitatif-cloture-${id.slice(0, 8)}.csv"`,
    },
  });
}
