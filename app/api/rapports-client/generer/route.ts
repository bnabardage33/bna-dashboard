// app/api/rapports-client/generer/route.ts
//
// Génération du rapport hebdomadaire client.
// ------------------------------------------------------------
// Le rapport fige un "snapshot" de la semaine passée (lundi 00:00 ->
// dimanche 23:59, fuseau Europe/Paris) dans la colonne `contenu` (JSONB).
// L'agrégation vit dans lib/rapports-client.server.ts (partagée avec la
// route /auto). Ici : authentification, contrôle de doublon, insertion.
// ------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import type { TablesInsert } from "@/types/supabase";
import {
  construireSnapshot,
  encadrerSemainePassee,
} from "@/lib/rapports-client.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    // Auth obligatoire : le middleware protège déjà la route, mais on
    // double la vérification pour renvoyer une erreur JSON propre.
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentification requise" },
        { status: 401 }
      );
    }

    let body: { chantier_id?: unknown } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const chantierId =
      typeof body.chantier_id === "string" && body.chantier_id.trim() !== ""
        ? body.chantier_id.trim()
        : null;

    if (!chantierId) {
      return NextResponse.json(
        { success: false, error: "chantier_id est requis" },
        { status: 400 }
      );
    }

    // --- Bornes de la semaine passée (Europe/Paris) -------------------------

    const { lundiISO, dimancheISO } = encadrerSemainePassee(new Date());

    // --- Doublon : rapport déjà généré pour ce chantier + cette période -----

    const { data: existant, error: erreurExistant } = await supabase
      .from("rapports_client")
      .select("id, semaine_label, statut")
      .eq("chantier_id", chantierId)
      .eq("date_debut", lundiISO)
      .eq("date_fin", dimancheISO)
      .maybeSingle();

    if (erreurExistant) {
      return NextResponse.json(
        { success: false, error: `Erreur vérification rapport existant : ${erreurExistant.message}` },
        { status: 500 }
      );
    }

    if (existant) {
      const tonRapport = new Date().toISOString().replace("T", " ").slice(0, 19);
      console.warn(
        `Rapport client déjà existant (${lundiISO} → ${dimancheISO}) pour le chantier ${chantierId} — refusé à ${tonRapport}`
      );

      return NextResponse.json(
        {
          success: false,
          error: `Un rapport existe déjà pour cette semaine (${lundiISO} → ${dimancheISO})`,
          rapport: existant,
        },
        { status: 409 }
      );
    }

    // --- Snapshot figé (agrégation partagée) --------------------------------

    const contenu = await construireSnapshot(chantierId);

    // --- Insertion du snapshot (statut brouillon) ----------------------------

    const { data: rapportCree, error: erreurInsertion } = await supabase
      .from("rapports_client")
      .insert(({
        chantier_id: chantierId,
        semaine_label: contenu.periode.semaine,
        date_debut: lundiISO,
        date_fin: dimancheISO,
        contenu,
        statut: "brouillon",
      } as Omit<TablesInsert<"rapports_client">, "entreprise_id">) as TablesInsert<"rapports_client">)
      .select()
      .single();

    if (erreurInsertion || !rapportCree) {
      return NextResponse.json(
        {
          success: false,
          error: erreurInsertion?.message ?? "Impossible de créer le rapport",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, rapport: rapportCree });
  } catch (globale: unknown) {
    const message = globale instanceof Error ? globale.message : String(globale);
    console.error("Erreur globale génération rapport client :", globale);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}