// app/api/chantiers/[id]/corbeille/route.ts
// Route sécurisée pour les opérations de Corbeille multi-métiers (Mise en corbeille, Restauration, Suppression définitive)

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import {
  estUuid,
  mettreChantierTerrasseEnCorbeille,
  restaurerChantierTerrasse,
  supprimerDefinitivementChantierTerrasse,
} from "@/lib/terrasse/corbeilleService";
import {
  mettreChantierBardageEnCorbeille,
  restaurerChantierBardage,
  supprimerDefinitivementChantierBardage,
} from "@/lib/bardage/corbeilleService";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteProps) {
  try {
    const { id } = await params;
    if (!estUuid(id)) {
      return NextResponse.json(
        { error: "Identifiant de chantier invalide." },
        { status: 400 }
      );
    }

    const tenant = await resoudreTenant();
    if (!tenant) {
      return NextResponse.json(
        { error: "Non autorisé : tenant introuvable." },
        { status: 401 }
      );
    }

    const supabase = await createClient();
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Déterminer le métier du chantier
    const { data: chantier } = await (supabase.from("chantiers") as any)
      .select("id, metier, checklist, chantier_terrasses(id)")
      .eq("id", id)
      .maybeSingle();

    const chk = (chantier?.checklist && typeof chantier.checklist === "object" ? chantier.checklist : {}) as Record<string, unknown>;
    const hasTerrasse = Array.isArray(chantier?.chantier_terrasses)
      ? chantier.chantier_terrasses.length > 0
      : Boolean(chantier?.chantier_terrasses);
    const isTerrasse = chantier?.metier === "terrasse" || chk.metier === "terrasse" || hasTerrasse;

    if (action === "soft_delete") {
      const res = isTerrasse
        ? await mettreChantierTerrasseEnCorbeille(supabase, id)
        : await mettreChantierBardageEnCorbeille(supabase, id);
      return NextResponse.json(res, { status: 200 });
    }

    if (action === "restore") {
      const res = isTerrasse
        ? await restaurerChantierTerrasse(supabase, id)
        : await restaurerChantierBardage(supabase, id);
      return NextResponse.json(res, { status: 200 });
    }

    return NextResponse.json(
      { error: "Action inconnue. Valeurs attendues : 'soft_delete' ou 'restore'." },
      { status: 400 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteProps) {
  try {
    const { id } = await params;
    if (!estUuid(id)) {
      return NextResponse.json(
        { error: "Identifiant de chantier invalide." },
        { status: 400 }
      );
    }

    const tenant = await resoudreTenant();
    if (!tenant) {
      return NextResponse.json(
        { error: "Non autorisé : tenant introuvable." },
        { status: 401 }
      );
    }

    const supabase = await createClient();

    // Déterminer le métier du chantier
    const { data: chantier } = await (supabase.from("chantiers") as any)
      .select("id, metier, checklist, chantier_terrasses(id)")
      .eq("id", id)
      .maybeSingle();

    const chk = (chantier?.checklist && typeof chantier.checklist === "object" ? chantier.checklist : {}) as Record<string, unknown>;
    const hasTerrasse = Array.isArray(chantier?.chantier_terrasses)
      ? chantier.chantier_terrasses.length > 0
      : Boolean(chantier?.chantier_terrasses);
    const isTerrasse = chantier?.metier === "terrasse" || chk.metier === "terrasse" || hasTerrasse;

    const res = isTerrasse
      ? await supprimerDefinitivementChantierTerrasse(supabase, id)
      : await supprimerDefinitivementChantierBardage(supabase, id);

    return NextResponse.json(res, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
