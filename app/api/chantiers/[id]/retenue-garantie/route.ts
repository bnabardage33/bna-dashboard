import { NextRequest, NextResponse } from "next/server";
import { resoudreTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/chantiers/[id]/retenue-garantie
 *
 * Retourne l'état complet du compte de retenue de garantie pour un chantier donné :
 *   1. Synthèse du compte financier (cumul retenu, cumul libéré, solde restant, statut)
 *   2. Historique des libérations (retenues_liberations)
 *   3. Factures ayant alimenté la retenue
 *   4. État des PV de réception et levée des réserves associées
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  const { id: chantierId } = await params;

  try {
    const supabase = await createClient();

    // 1) Contrôle d'existence et d'appartenance du chantier
    const { data: chantier, error: chantierErr } = await supabase
      .from("chantiers")
      .select("id, nom, code_acces, entreprise_id, client_id, statut")
      .eq("id", chantierId)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();

    if (chantierErr || !chantier) {
      return NextResponse.json(
        { ok: false, error: "Chantier introuvable ou non autorisé." },
        { status: 404 }
      );
    }

    // 2) Lecture du compte de retenue de garantie (chantier_retenues_garantie)
    const { data: compte, error: compteErr } = await supabase
      .from("chantier_retenues_garantie")
      .select("*")
      .eq("chantier_id", chantierId)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();

    if (compteErr) {
      console.error("Erreur lecture chantier_retenues_garantie:", compteErr);
    }

    // 3) Historique immuable des libérations
    const { data: liberations, error: libErr } = await supabase
      .from("retenues_liberations")
      .select("*")
      .eq("chantier_id", chantierId)
      .eq("entreprise_id", tenant.entrepriseId)
      .order("date_liberation", { ascending: false });

    if (libErr) {
      console.error("Erreur lecture retenues_liberations:", libErr);
    }

    // 4) Factures actives ayant constitué de la retenue (exclut les annulées)
    const { data: factures, error: facErr } = await supabase
      .from("factures")
      .select(
        "id, numero, date_emission, statut, tva_pct, retenue_garantie_pct, montant_retenue_ht, montant_retenue_ttc, net_a_payer_ttc"
      )
      .eq("chantier_id", chantierId)
      .eq("entreprise_id", tenant.entrepriseId)
      .neq("statut", "annulee")
      .gt("montant_retenue_ttc", 0)
      .order("date_emission", { ascending: true });

    if (facErr) {
      console.error("Erreur lecture factures:", facErr);
    }

    // 5) PV de réception du chantier (source de vérité technique pour les réserves)
    const { data: pvReceptions, error: pvErr } = await supabase
      .from("pv_receptions")
      .select("id, numero, date_reception, statut, reserves, observations")
      .eq("chantier_id", chantierId)
      .eq("entreprise_id", tenant.entrepriseId)
      .order("date_reception", { ascending: false });

    if (pvErr) {
      console.error("Erreur lecture pv_receptions:", pvErr);
    }

    // 6) Synthèse et indicateurs d'éligibilité à la libération
    const montantRetenuCumuleTtc = compte?.montant_retenu_cumule_ttc ?? 0;
    const montantLibereCumuleTtc = compte?.montant_libere_cumule_ttc ?? 0;
    const montantRestantALibererTtc = compte?.montant_restant_a_liberer_ttc ?? 0;
    const statutCompte = compte?.statut ?? "non_constituee";

    const pvs = pvReceptions ?? [];
    const pvPurges = pvs.filter(
      (p) => p.statut === "sans_reserve" || p.statut === "reserves_levees"
    );
    const pvAvecReserves = pvs.filter((p) => p.statut === "avec_reserves");

    const peutLibererReserves =
      montantRestantALibererTtc > 0 && pvPurges.length > 0;

    return NextResponse.json(
      {
        ok: true,
        data: {
          chantier,
          compte: compte ?? {
            id: null,
            chantier_id: chantierId,
            entreprise_id: tenant.entrepriseId,
            taux_applicable_pct: 5.0,
            type_garantie: "retenue_financiere",
            montant_retenu_cumule_ht: 0,
            montant_retenu_cumule_ttc: 0,
            montant_libere_cumule_ttc: 0,
            montant_restant_a_liberer_ttc: 0,
            statut: "non_constituee",
          },
          liberations: liberations ?? [],
          factures: factures ?? [],
          pv_receptions: pvs,
          synthese: {
            montant_retenu_cumule_ttc: montantRetenuCumuleTtc,
            montant_libere_cumule_ttc: montantLibereCumuleTtc,
            montant_restant_a_liberer_ttc: montantRestantALibererTtc,
            statut: statutCompte,
            peut_liberer_reserves: peutLibererReserves,
            pv_purges_count: pvPurges.length,
            pv_avec_reserves_count: pvAvecReserves.length,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erreur interne GET /api/chantiers/[id]/retenue-garantie:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne serveur." },
      { status: 500 }
    );
  }
}
