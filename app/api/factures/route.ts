import { NextRequest, NextResponse } from "next/server";
import { resoudreTenant } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculerRetenueFacture,
  type LigneFacturation,
} from "@/lib/retenueCalculs";
import type { TablesInsert, Json } from "@/types/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/factures
 *
 * Liste les factures de l'entreprise courante avec support des filtres :
 * ?chantier_id=... &client_id=... &statut=...
 */
export async function GET(req: NextRequest) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  try {
    const { searchParams } = new URL(req.url);
    const chantierId = searchParams.get("chantier_id");
    const clientId = searchParams.get("client_id");
    const statut = searchParams.get("statut");

    const supabase = await createClient();
    let query = supabase
      .from("factures")
      .select("*")
      .eq("entreprise_id", tenant.entrepriseId);

    if (chantierId) {
      query = query.eq("chantier_id", chantierId);
    }
    if (clientId) {
      query = query.eq("client_id", clientId);
    }
    if (statut) {
      query = query.eq("statut", statut);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur GET /api/factures:", error);
      return NextResponse.json(
        { ok: false, error: "Erreur lors de la récupération des factures." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data ?? [] }, { status: 200 });
  } catch (error) {
    console.error("Erreur interne GET /api/factures:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne serveur." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/factures
 *
 * Émet ou enregistre une nouvelle facture avec calcul financier officiel côté serveur :
 *   - Plafond légal de retenue de garantie (<= 5.00 %)
 *   - Ventilation multi-taux de TVA
 *   - Consolidations HT, TVA, TTC, retenue HT/TTC, net à payer
 *   - Déclenchement automatique du trigger de consolidation du chantier
 */
export async function POST(req: NextRequest) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Corps de requête JSON invalide." },
        { status: 400 }
      );
    }

    const numero = typeof body.numero === "string" ? body.numero.trim() : "";
    const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
    const chantierId =
      typeof body.chantier_id === "string" && body.chantier_id.trim()
        ? body.chantier_id.trim()
        : null;
    const devisId =
      typeof body.devis_id === "string" && body.devis_id.trim()
        ? body.devis_id.trim()
        : null;
    const objet = typeof body.objet === "string" ? body.objet.trim() : null;
    const adresseChantier =
      typeof body.adresse_chantier === "string" ? body.adresse_chantier.trim() : null;
    const typeTravaux =
      typeof body.type_travaux === "string" ? body.type_travaux.trim() : null;
    const typeFacture =
      typeof body.type_facture === "string" ? body.type_facture.trim() : "totale";
    const statut =
      typeof body.statut === "string" ? body.statut.trim() : "brouillon";
    const echeance =
      typeof body.echeance === "string" ? body.echeance.trim() : null;
    const dateEmission =
      typeof body.date_emission === "string" ? body.date_emission.trim() : null;

    if (!numero) {
      return NextResponse.json(
        { ok: false, error: "Le numéro de facture est obligatoire." },
        { status: 400 }
      );
    }
    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "Le client est obligatoire." },
        { status: 400 }
      );
    }

    const lignesBrutes = Array.isArray(body.lignes) ? body.lignes : [];
    if (lignesBrutes.length === 0) {
      return NextResponse.json(
        { ok: false, error: "La facture doit contenir au moins une ligne." },
        { status: 400 }
      );
    }

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, entreprise_id")
      .eq("id", clientId)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();
    if (!client) {
      return NextResponse.json(
        { ok: false, error: "Client introuvable ou non rattaché à votre entreprise." },
        { status: 404 }
      );
    }

    // Contrôle d'appartenance du chantier au tenant
    if (chantierId) {
      const { data: chantier } = await supabaseAdmin
        .from("chantiers")
        .select("id, entreprise_id, client_id")
        .eq("id", chantierId)
        .eq("entreprise_id", tenant.entrepriseId)
        .maybeSingle();

      if (!chantier) {
        return NextResponse.json(
          { ok: false, error: "Chantier introuvable ou non rattaché à votre entreprise." },
          { status: 404 }
        );
      }
      if (chantier.client_id && chantier.client_id !== clientId) {
        return NextResponse.json(
          { ok: false, error: "Le client de la facture ne correspond pas au client du chantier." },
          { status: 400 }
        );
      }
    }

    // Contrôle d'appartenance du devis au tenant (si fourni)
    let tauxRetenue = body.retenue_garantie_pct;
    if (devisId) {
      const { data: devis } = await supabaseAdmin
        .from("devis")
        .select("id, entreprise_id, client_id, chantier_id, retenue_garantie_pct")
        .eq("id", devisId)
        .eq("entreprise_id", tenant.entrepriseId)
        .maybeSingle();

      if (!devis) {
        return NextResponse.json(
          { ok: false, error: "Devis introuvable ou non rattaché à votre entreprise." },
          { status: 404 }
        );
      }
      if (devis.client_id !== clientId || (chantierId && devis.chantier_id && devis.chantier_id !== chantierId)) {
        return NextResponse.json(
          { ok: false, error: "Le devis ne correspond pas au client ou au chantier de la facture." },
          { status: 400 }
        );
      }
      if (typeof devis.retenue_garantie_pct === "number") {
        tauxRetenue = devis.retenue_garantie_pct;
      }
    }

    // 1) Calcul officiel côté serveur via `lib/retenueCalculs.ts`
    let calcul;
    try {
      calcul = calculerRetenueFacture({
        lignes: lignesBrutes as LigneFacturation[],
        retenue_garantie_pct: tauxRetenue,
        tva_defaut_pct: body.tva_defaut_pct,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur de calcul de la facture.";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    // 2) Unicité du numéro de facture au sein du tenant
    const { data: existant } = await supabaseAdmin
      .from("factures")
      .select("id")
      .eq("numero", numero)
      .eq("entreprise_id", tenant.entrepriseId)
      .maybeSingle();

    if (existant) {
      return NextResponse.json(
        { ok: false, error: `Le numéro de facture '${numero}' existe déjà.` },
        { status: 409 }
      );
    }

    // 3) Préparation du payload d'insertion
    const tvaPrincipale = calcul.tranches[0]?.taux_tva ?? (Number(body.tva_defaut_pct) || 20);

    const payload: TablesInsert<"factures"> = {
      numero,
      entreprise_id: tenant.entrepriseId,
      client_id: clientId,
      chantier_id: chantierId,
      devis_id: devisId,
      objet,
      adresse_chantier: adresseChantier,
      type_travaux: typeTravaux,
      type_facture: typeFacture,
      statut,
      echeance,
      date_emission: dateEmission ?? new Date().toISOString().split("T")[0],
      tva_pct: tvaPrincipale,
      lignes: lignesBrutes as unknown as Json,
      retenue_garantie_pct: calcul.retenue_garantie_pct,
      montant_retenue_ht: calcul.montant_retenue_ht,
      montant_retenue_ttc: calcul.montant_retenue_ttc,
      net_a_payer_ttc: calcul.net_a_payer_ttc,
    };

    const supabase = await createClient();
    const { data: factureCreee, error: insertErr } = await supabase
      .from("factures")
      .insert(payload)
      .select()
      .single();

    if (insertErr) {
      console.error("Erreur insertion facture:", insertErr);
      return NextResponse.json(
        { ok: false, error: "Échec de l'enregistrement de la facture en base." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: factureCreee,
        calcul,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur interne POST /api/factures:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne serveur." },
      { status: 500 }
    );
  }
}
