// API route pour la gestion du sous-onglet métier Terrasse
// GET / POST / PUT : Récupération et persistance découplée du module Bardage

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import type { ChantierTerrasseConfig } from "@/lib/terrasse/types";
import type { Database, Json } from "@/types/supabase";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  const tenantRes = await resoudreTenant();
  if (!tenantRes.ok) return tenantRes.reponse;
  const { entrepriseId } = tenantRes;

  const { id: chantierId } = await params;
  const supabase = await createClient();

  // Vérification de l'appartenance du chantier
  const { data: chantier, error: errChantier } = await supabase
    .from("chantiers")
    .select("id, nom, clients(nom)")
    .eq("id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .single();

  if (errChantier || !chantier) {
    return NextResponse.json({ error: "Chantier introuvable ou non autorisé" }, { status: 404 });
  }

  // Lecture de la terrasse
  const { data: terrasse, error: errTerrasse } = await supabase
    .from("chantier_terrasses")
    .select("*")
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (errTerrasse) {
    return NextResponse.json({ error: errTerrasse.message }, { status: 500 });
  }

  // Si aucune terrasse enregistrée, on renvoie une config par défaut (non encore persistée)
  if (!terrasse) {
    const defaultConfig: ChantierTerrasseConfig = {
      chantier_id: chantierId,
      entreprise_id: entrepriseId,
      nom: "Terrasse principale",
      longueur_m: 6.0,
      largeur_m: 4.0,
      hauteur_sol_cm: 15.0,
      type_sol: "dalle_beton",
      pente_pct: 1.5,
      essence_bois: "pin_cl4",
      type_pose: "parallele",
      largeur_lame_mm: 145,
      epaisseur_lame_mm: 21,
      longueur_lame_m: 4.0,
      espacement_lames_mm: 5,
      type_fixation: "vis_inox",
      type_lambourde: "bois_cl4",
      section_largeur_mm: 45,
      section_hauteur_mm: 70,
      longueur_lambourde_m: 4.0,
      entraxe_lambourdes_cm: 40,
      double_lambourdage_aboutage: true,
      bande_etancheite_epdm: true,
      cales_isolation: true,
      type_plots: "reglables",
      entraxe_plots_cm: 60,
      hauteur_reglage_plots: "40_60",
      geotextile: true,
      presence_escalier: false,
      escalier_nb_marches: 2,
      escalier_largeur_m: 2.0,
      escalier_giron_cm: 28.0,
      escalier_hauteur_marche_cm: 16.0,
      presence_garde_corps: false,
      garde_corps_longueur_ml: 0.0,
      garde_corps_type: "bois_cables",
      garde_corps_hauteur_cm: 100,
      coef_perte_lames: 1.10,
      coef_perte_lambourdes: 1.08,
    };

    const resultat = calculerTerrasse(defaultConfig);
    return NextResponse.json({
      existe: false,
      terrasse: defaultConfig,
      resultat,
      chantierNom: chantier.nom,
      clientNom: (chantier.clients as unknown as { nom: string })?.nom,
    });
  }

  const typedTerrasse = terrasse as unknown as ChantierTerrasseConfig;
  const resultat = calculerTerrasse(typedTerrasse);

  return NextResponse.json({
    existe: true,
    terrasse: typedTerrasse,
    resultat,
    chantierNom: chantier.nom,
    clientNom: (chantier.clients as unknown as { nom: string })?.nom,
  });
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const tenantRes = await resoudreTenant();
  if (!tenantRes.ok) return tenantRes.reponse;
  const { entrepriseId } = tenantRes;

  const { id: chantierId } = await params;
  const supabase = await createClient();

  let body: Partial<ChantierTerrasseConfig>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  // Vérification appartenance chantier
  const { data: chantier, error: errChantier } = await supabase
    .from("chantiers")
    .select("id, nom")
    .eq("id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .single();

  if (errChantier || !chantier) {
    return NextResponse.json({ error: "Chantier introuvable ou non autorisé" }, { status: 404 });
  }

  const configToSave: ChantierTerrasseConfig = {
    chantier_id: chantierId,
    entreprise_id: entrepriseId,
    nom: body.nom || "Terrasse principale",
    longueur_m: Number(body.longueur_m) || 6.0,
    largeur_m: Number(body.largeur_m) || 4.0,
    hauteur_sol_cm: Number(body.hauteur_sol_cm) || 15.0,
    type_sol: body.type_sol || "dalle_beton",
    pente_pct: Number(body.pente_pct) || 1.5,
    essence_bois: body.essence_bois || "pin_cl4",
    type_pose: body.type_pose || "parallele",
    largeur_lame_mm: Number(body.largeur_lame_mm) || 145,
    epaisseur_lame_mm: Number(body.epaisseur_lame_mm) || 21,
    longueur_lame_m: Number(body.longueur_lame_m) || 4.0,
    espacement_lames_mm: Number(body.espacement_lames_mm) || 5,
    type_fixation: body.type_fixation || "vis_inox",
    type_lambourde: body.type_lambourde || "bois_cl4",
    section_largeur_mm: Number(body.section_largeur_mm) || 45,
    section_hauteur_mm: Number(body.section_hauteur_mm) || 70,
    longueur_lambourde_m: Number(body.longueur_lambourde_m) || 4.0,
    entraxe_lambourdes_cm: Number(body.entraxe_lambourdes_cm) || 40,
    double_lambourdage_aboutage: body.double_lambourdage_aboutage ?? true,
    bande_etancheite_epdm: body.bande_etancheite_epdm ?? true,
    cales_isolation: body.cales_isolation ?? true,
    type_plots: body.type_plots || "reglables",
    entraxe_plots_cm: Number(body.entraxe_plots_cm) || 60,
    hauteur_reglage_plots: body.hauteur_reglage_plots || "40_60",
    geotextile: body.geotextile ?? true,
    presence_escalier: body.presence_escalier ?? false,
    escalier_nb_marches: Number(body.escalier_nb_marches) || 2,
    escalier_largeur_m: Number(body.escalier_largeur_m) || 2.0,
    escalier_giron_cm: Number(body.escalier_giron_cm) || 28.0,
    escalier_hauteur_marche_cm: Number(body.escalier_hauteur_marche_cm) || 16.0,
    presence_garde_corps: body.presence_garde_corps ?? false,
    garde_corps_longueur_ml: Number(body.garde_corps_longueur_ml) || 0.0,
    garde_corps_type: body.garde_corps_type || "bois_cables",
    garde_corps_hauteur_cm: Number(body.garde_corps_hauteur_cm) || 100,
    coef_perte_lames: Number(body.coef_perte_lames) || 1.10,
    coef_perte_lambourdes: Number(body.coef_perte_lambourdes) || 1.08,
  };

  // Calcul du résultat technique et conformité DTU 51.4
  const resultat = calculerTerrasse(configToSave);

  const payloadBase: Database["public"]["Tables"]["chantier_terrasses"]["Insert"] = {
    ...configToSave,
    entreprise_id: entrepriseId,
    resultats_techniques: resultat as unknown as Json,
    updated_at: new Date().toISOString(),
  };

  // Vérifier si une terrasse existe déjà pour ce chantier
  const { data: existante } = await supabase
    .from("chantier_terrasses")
    .select("id")
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  let idEnregistre = existante?.id;

  if (existante) {
    const { error: errUpdate } = await supabase
      .from("chantier_terrasses")
      .update(payloadBase)
      .eq("id", existante.id)
      .eq("entreprise_id", entrepriseId);

    if (errUpdate) {
      return NextResponse.json({ error: errUpdate.message }, { status: 500 });
    }
  } else {
    const { data: ins, error: errInsert } = await supabase
      .from("chantier_terrasses")
      .insert({
        ...payloadBase,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (errInsert || !ins) {
      return NextResponse.json({ error: errInsert?.message || "Erreur insertion" }, { status: 500 });
    }
    idEnregistre = ins.id;
  }

  return NextResponse.json({
    ok: true,
    terrasse: { ...configToSave, id: idEnregistre },
    resultat,
  });
}
