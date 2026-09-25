// app/api/rapports-client/generer/route.ts
//
// Génération du rapport hebdomadaire client.
// ------------------------------------------------------------
// Le rapport fige un "snapshot" de la semaine passée (lundi 00:00 ->
// dimanche 23:59, fuseau Europe/Paris) dans la colonne `contenu` (JSONB).
// L'agrégation vit dans lib/rapports-client.server.ts (partagée avec la
// route /auto). Ici : authentification, contrôle de doublon, insertion.
// ------------------------------------------------------------
//
// ISOLATION MULTI-ENTREPRISE (O3-B3)
// Le `chantier_id` venait du body sans contrôle d'appartenance : un compte
// TEST pouvait faire agréger et s'insérer le snapshot d'un chantier BNA.
// Ordre de contrôle, fail-closed :
//   401 session absente → 403 claim entreprise absent/invalide
//   → 400 chantier_id mal formé → 404 chantier inexistant OU autre tenant
//   (le 404 précède le contrôle de doublon : sinon un 409 révélerait
//   l'existence d'un chantier étranger) → 409 doublon.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TablesInsert } from "@/types/supabase";
import {
  construireSnapshot,
  encadrerSemainePassee,
} from "@/lib/rapports-client.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Réponse 404 volontairement identique pour « inexistant » et « autre tenant ». */
function chantierIntrouvable(): NextResponse {
  return NextResponse.json(
    { success: false, error: "Chantier introuvable" },
    { status: 404 }
  );
}

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

    // Tenant de la session : même source que `entreprise_courante()` côté
    // PostgREST (claim app_metadata). Absent ou invalide ⇒ on refuse tout.
    const entrepriseId =
      (user.app_metadata as { entreprise_id?: unknown } | null | undefined)
        ?.entreprise_id;

    if (
      typeof entrepriseId !== "string" ||
      !estUuid(entrepriseId)
    ) {
      return NextResponse.json(
        { success: false, error: "Contexte entreprise introuvable" },
        { status: 403 }
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

    if (!estUuid(chantierId)) {
      return NextResponse.json(
        { success: false, error: "chantier_id invalide" },
        { status: 400 }
      );
    }

    // --- Appartenance du chantier (AVANT doublon et AVANT snapshot) ---------
    // Un chantier qui n'existe pas et un chantier d'un autre tenant rendent la
    // MÊME réponse : on ne divulgue pas l'existence du chantier étranger.

    const { data: chantier, error: erreurChantier } = await supabaseAdmin
      .from("chantiers")
      .select("id, entreprise_id")
      .eq("id", chantierId)
      .eq("entreprise_id", entrepriseId)
      .maybeSingle();

    if (erreurChantier) {
      console.error(
        `Rapport client generer : erreur vérification chantier ${chantierId}`,
        erreurChantier
      );
      return NextResponse.json(
        { success: false, error: "Erreur serveur" },
        { status: 500 }
      );
    }

    if (!chantier || chantier.entreprise_id !== entrepriseId) {
      return chantierIntrouvable();
    }

    // --- Bornes de la semaine passée (Europe/Paris) -------------------------

    const { lundiISO, dimancheISO } = encadrerSemainePassee(new Date());

    // --- Doublon : rapport déjà généré pour ce chantier + cette période -----
    //
    // Client RLS de session (droits `authenticated` sur `rapports_client`
    // vérifiés) : la RLS filtre déjà par `entreprise_courante()`, le filtre
    // `entreprise_id` ci-dessous est une seconde barrière explicite.

    const { data: existant, error: erreurExistant } = await supabaseAuth
      .from("rapports_client")
      .select("id, semaine_label, statut, entreprise_id, chantier_id")
      .eq("entreprise_id", entrepriseId)
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
      if (
        existant.entreprise_id !== entrepriseId ||
        existant.chantier_id !== chantierId
      ) {
        return chantierIntrouvable();
      }

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

    // --- Snapshot figé (agrégation partagée, scopée par entreprise) --------

    const contenu = await construireSnapshot(chantierId, entrepriseId);

    // --- Insertion du snapshot (statut brouillon) ----------------------------
    //
    // `entreprise_id` explicite : la colonne est NOT NULL, on ne dépend plus
    // du seul trigger `tg_set_entreprise_par_chantier`. (Écriture en
    // service_role : le droit d'INSERT du rôle `authenticated` n'est pas
    // vérifiable en lecture seule, cf. rapport O3-B3.)

    const donneesInsertion: TablesInsert<"rapports_client"> = {
      entreprise_id: entrepriseId,
      chantier_id: chantierId,
      semaine_label: contenu.periode.semaine,
      date_debut: lundiISO,
      date_fin: dimancheISO,
      contenu,
      statut: "brouillon",
    };

    const { data: rapportCree, error: erreurInsertion } = await supabaseAdmin
      .from("rapports_client")
      .insert(donneesInsertion)
      .select("id, entreprise_id, chantier_id, statut")
      .single();

    if (
      erreurInsertion ||
      !rapportCree ||
      rapportCree.entreprise_id !== entrepriseId ||
      rapportCree.chantier_id !== chantierId
    ) {
      if (rapportCree) {
        console.error(
          `Rapport client generer : rapport créé hors entreprise pour ${chantierId}`
        );
      }

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