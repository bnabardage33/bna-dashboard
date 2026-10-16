// app/api/catalogue-terrasse/route.ts
//
// Lecture du catalogue Terrasse pour le module Terrasse (lames + accessoires).
//
// Pourquoi cette route existe : le hook client `useCatalogueTerrasse` importait
// `lib/supabase/server.ts`, qui dépend de `next/headers` — interdit dans un
// Client Component (erreur de build Next.js). La récupération est donc déplacée
// ici, côté serveur ; le client ne consomme plus que du JSON via `fetch`.
//
// Isolation tenant : identique aux autres routes du dépôt (`resoudreTenant`,
// échec fermé), puis `entreprise_id` porté explicitement dans le prédicat.
// Le client est le client `anon` + cookies de session (RLS évaluée en plus).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import { filtrerAccessoiresCompatibles } from "@/lib/terrasse/compatAccessoires";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;
  const { entrepriseId } = tenant;

  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const compatibleWith = params.get("compatibleWith");

  if (type !== null && type !== "lames" && type !== "accessoires") {
    return NextResponse.json(
      { error: 'type doit valoir "lames" ou "accessoires"' },
      { status: 400 }
    );
  }
  if (compatibleWith !== null && !UUID_RE.test(compatibleWith)) {
    return NextResponse.json(
      { error: "compatibleWith doit être un identifiant valide" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const reponse: {
    lames?: unknown[];
    accessoires?: unknown[];
  } = {};

  if (type === null || type === "lames") {
    const { data, error } = await supabase
      .from("catalogue_terrasse_lames")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .order("essence", { ascending: true })
      .order("longueur_mm", { ascending: true })
      .order("largeur_utile_mm", { ascending: true });

    if (error) {
      console.error("[catalogue-terrasse] SELECT lames:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    reponse.lames = data ?? [];
  }

  if (type === null || type === "accessoires") {
    const { data, error } = await supabase
      .from("catalogue_terrasse_accessoires")
      .select("*")
      .eq("entreprise_id", entrepriseId);

    if (error) {
      console.error("[catalogue-terrasse] SELECT accessoires:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let accessoires = data ?? [];

    // Filtre JSONB côté serveur : on résout d'abord la lame (scopée tenant)
    // pour connaître son `type_material`, puis on ne garde que les accessoires
    // dont `materiel_compatibles` la désigne. Lame absente du tenant ⇒ liste
    // vide (échec fermé, aucune fuite inter-tenant).
    if (compatibleWith !== null) {
      const { data: lame, error: errLame } = await supabase
        .from("catalogue_terrasse_lames")
        .select("id, type_material")
        .eq("id", compatibleWith)
        .eq("entreprise_id", entrepriseId)
        .maybeSingle();

      if (errLame) {
        console.error("[catalogue-terrasse] SELECT lame pour compatibleWith:", errLame.message);
        return NextResponse.json({ error: errLame.message }, { status: 500 });
      }
      accessoires = lame
        ? filtrerAccessoiresCompatibles(accessoires, lame.id, lame.type_material)
        : [];
    }

    reponse.accessoires = accessoires;
  }

  return NextResponse.json(reponse);
}
