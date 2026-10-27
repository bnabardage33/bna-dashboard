// API route pour la gestion du sous-onglet métier Terrasse
// GET / POST / PUT : Récupération et persistance découplée du module Bardage

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import {
  accessoireCompatibleAvecLame,
  estPrestationMainOeuvre,
} from "@/lib/terrasse/compatAccessoires";
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  QuantiteAccessoiresTerrasse,
  TarifsCatalogueTerrasse,
} from "@/lib/terrasse/types";
import type { Database, Json } from "@/types/supabase";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLES_QUANTITES_ACCESSOIRES = ["clip", "lambourde", "plot"] as const;
type SlotAccessoire = "clip" | "lambourde" | "plot";

function lireIdCatalogue(value: unknown, champ: string): { id: string | null } | { erreur: string } {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return { id: null };
  }
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    return { erreur: `${champ} doit être un UUID valide` };
  }
  return { id: value.trim() };
}

function normaliserQuantitesAccessoires(value: unknown):
  | { quantites: QuantiteAccessoiresTerrasse }
  | { erreur: string } {
  if (value === null || value === undefined) return { quantites: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { erreur: "quantite_accessoires doit être un objet" };
  }
  const quantites: QuantiteAccessoiresTerrasse = {};
  const source = value as Record<string, unknown>;
  for (const cle of CLES_QUANTITES_ACCESSOIRES) {
    const brut = source[cle];
    if (brut === undefined || brut === null || brut === "") continue;
    const nombre = typeof brut === "number" ? brut : typeof brut === "string" ? Number(brut.trim()) : NaN;
    if (!Number.isFinite(nombre) || nombre < 0) {
      return { erreur: `quantite_accessoires.${cle} doit être un nombre positif ou nul` };
    }
    quantites[cle] = nombre;
  }
  return { quantites };
}

type ClientSupabaseTerrasse = Awaited<ReturnType<typeof createClient>>;

async function chargerTarifsCatalogue(
  supabase: ClientSupabaseTerrasse,
  entrepriseId: string,
  ids: { lame: string | null; clip: string | null; lambourde: string | null; plot: string | null },
  statutReferenceInvalide: 400 | 500
): Promise<{ tarifs: TarifsCatalogueTerrasse } | { erreur: string; status: 400 | 500 }> {
  const tarifs: TarifsCatalogueTerrasse = { lame: null, clip: null, lambourde: null, plot: null };
  let lame: { id: string; type_material: string | null } | null = null;

  if (ids.lame) {
    const { data, error } = await supabase.from("catalogue_terrasse_lames")
      .select("id, designation, type_material, prix_unitaire_lame, prix_m2_ht")
      .eq("id", ids.lame).eq("entreprise_id", entrepriseId).maybeSingle();
    if (error) return { erreur: error.message, status: 500 };
    if (!data) return { erreur: "lame_id introuvable ou non autorisé", status: statutReferenceInvalide };
    lame = { id: data.id, type_material: data.type_material };
    tarifs.lame = {
      id: data.id, designation: data.designation,
      prix_unitaire_lame: data.prix_unitaire_lame, prix_m2_ht: data.prix_m2_ht,
    };
  }

  const slots: Array<{ cle: SlotAccessoire; id: string | null; categorie: "CLIP" | "LAMBOURDE" | "PLOT" }> = [
    { cle: "clip", id: ids.clip, categorie: "CLIP" },
    { cle: "lambourde", id: ids.lambourde, categorie: "LAMBOURDE" },
    { cle: "plot", id: ids.plot, categorie: "PLOT" },
  ];
  for (const slot of slots) {
    if (!slot.id) continue;
    const { data, error } = await supabase.from("catalogue_terrasse_accessoires")
      .select("id, categorie, type_cout, designation, conditionnement, prix_conditionnement, unite_mesure, materiel_compatibles")
      .eq("id", slot.id).eq("entreprise_id", entrepriseId).maybeSingle();
    if (error) return { erreur: error.message, status: 500 };
    if (!data) return { erreur: `${slot.cle}_id introuvable ou non autorisé`, status: statutReferenceInvalide };
    if (estPrestationMainOeuvre(data)) {
      return { erreur: `${slot.cle}_id désigne une prestation main_oeuvre, pas un accessoire matériel`, status: 400 };
    }
    if (data.categorie !== slot.categorie) {
      return { erreur: `${slot.cle}_id doit appartenir à la catégorie ${slot.categorie}`, status: 400 };
    }

    // Une valeur JSON non nulle représente une règle configurée. En cas de règle
    // définie, on échoue fermé si la lame manque ou si le lien n'est pas explicite.
    if (data.materiel_compatibles !== null && data.materiel_compatibles !== undefined) {
      if (!Array.isArray(data.materiel_compatibles) || !lame ||
          !accessoireCompatibleAvecLame(data.materiel_compatibles, lame.id, lame.type_material)) {
        return { erreur: `${slot.cle}_id n'est pas compatible avec la lame sélectionnée`, status: 400 };
      }
    }
    tarifs[slot.cle] = {
      id: data.id, designation: data.designation,
      conditionnement: data.conditionnement,
      prix_conditionnement: data.prix_conditionnement,
      unite_mesure: data.unite_mesure,
    };
  }
  return { tarifs };
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
      lame_id: null,
      clip_id: null,
      lambourde_id: null,
      plot_id: null,
      quantite_accessoires: {},
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

  const { data: reservations, error: errReservations } = await supabase
    .from("chantier_terrasse_reservations")
    .select("*")
    .eq("terrasse_id", terrasse.id)
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: true });

  if (errReservations) {
    return NextResponse.json({ error: errReservations.message }, { status: 500 });
  }

  const typedReservations = (reservations || []) as unknown as ChantierTerrasseReservation[];
  const ids = {
    lame: typeof terrasse.lame_id === "string" && terrasse.lame_id.trim() ? terrasse.lame_id.trim() : null,
    clip: typeof terrasse.clip_id === "string" && terrasse.clip_id.trim() ? terrasse.clip_id.trim() : null,
    lambourde: typeof terrasse.lambourde_id === "string" && terrasse.lambourde_id.trim() ? terrasse.lambourde_id.trim() : null,
    plot: typeof terrasse.plot_id === "string" && terrasse.plot_id.trim() ? terrasse.plot_id.trim() : null,
  };
  const catalogue = await chargerTarifsCatalogue(supabase, entrepriseId, ids, 500);
  if ("erreur" in catalogue) {
    return NextResponse.json({ error: catalogue.erreur }, { status: catalogue.status });
  }
  const quantitesAccessoires = normaliserQuantitesAccessoires(terrasse.quantite_accessoires);
  if ("erreur" in quantitesAccessoires) {
    return NextResponse.json({ error: quantitesAccessoires.erreur }, { status: 500 });
  }
  const typedTerrasse: ChantierTerrasseConfig = {
    ...(terrasse as unknown as ChantierTerrasseConfig),
    ...{ lame_id: ids.lame, clip_id: ids.clip, lambourde_id: ids.lambourde, plot_id: ids.plot },
    quantite_accessoires: quantitesAccessoires.quantites,
    tarifs_catalogue: catalogue.tarifs,
  };
  const resultat = calculerTerrasse(typedTerrasse, typedReservations, catalogue.tarifs);

  return NextResponse.json({
    existe: true,
    terrasse: typedTerrasse,
    reservations: typedReservations,
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
  let body: Partial<ChantierTerrasseConfig> & { reservations?: ChantierTerrasseReservation[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const valLame = lireIdCatalogue(body.lame_id, "lame_id");
  if ("erreur" in valLame) return NextResponse.json({ error: valLame.erreur }, { status: 400 });
  const valClip = lireIdCatalogue(body.clip_id, "clip_id");
  if ("erreur" in valClip) return NextResponse.json({ error: valClip.erreur }, { status: 400 });
  const valLambourde = lireIdCatalogue(body.lambourde_id, "lambourde_id");
  if ("erreur" in valLambourde) return NextResponse.json({ error: valLambourde.erreur }, { status: 400 });
  const valPlot = lireIdCatalogue(body.plot_id, "plot_id");
  if ("erreur" in valPlot) return NextResponse.json({ error: valPlot.erreur }, { status: 400 });
  const quantites = normaliserQuantitesAccessoires(body.quantite_accessoires);
  if ("erreur" in quantites) return NextResponse.json({ error: quantites.erreur }, { status: 400 });

  const supabase = await createClient();

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

  const catalogue = await chargerTarifsCatalogue(
    supabase,
    entrepriseId,
    { lame: valLame.id, clip: valClip.id, lambourde: valLambourde.id, plot: valPlot.id },
    400
  );
  if ("erreur" in catalogue) {
    return NextResponse.json({ error: catalogue.erreur }, { status: catalogue.status });
  }

  const configToSave: ChantierTerrasseConfig = {
    chantier_id: chantierId,
    entreprise_id: entrepriseId,
    nom: body.nom || "Terrasse principale",
    systeme_terrasse: body.systeme_terrasse || "bois_vis",
    zone_environnement: body.zone_environnement || "normal",
    fabricant_composite: body.fabricant_composite || null,
    gamme_composite: body.gamme_composite || null,
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
    lame_id: valLame.id,
    clip_id: valClip.id,
    lambourde_id: valLambourde.id,
    plot_id: valPlot.id,
    quantite_accessoires: quantites.quantites,
    tarifs_catalogue: catalogue.tarifs,
  };

  // Calcul du résultat technique et conformité DTU 51.4
  const reservationsPourCalcul = Array.isArray(body.reservations) ? body.reservations : undefined;
  const resultat = calculerTerrasse(configToSave, reservationsPourCalcul, catalogue.tarifs);

  const { tarifs_catalogue: _tarifsCatalogueNonPersistes, ...configPersistable } = configToSave;
  void _tarifsCatalogueNonPersistes;

  const payloadBase: Database["public"]["Tables"]["chantier_terrasses"]["Insert"] = {
    ...configPersistable,
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

  // Persistance des réservations (table dédiée chantier_terrasse_reservations)
  if (Array.isArray(body.reservations) && idEnregistre) {
    const { error: errDeleteReservations } = await supabase
      .from("chantier_terrasse_reservations")
      .delete()
      .eq("terrasse_id", idEnregistre)
      .eq("entreprise_id", entrepriseId);

    if (errDeleteReservations) {
      console.error("Erreur suppression réservations terrasse :", errDeleteReservations.message);
      return NextResponse.json({ error: errDeleteReservations.message }, { status: 500 });
    }

    if (body.reservations.length > 0) {
      const toInsert = body.reservations.map((r) => ({
        terrasse_id: idEnregistre!,
        entreprise_id: entrepriseId,
        type_reservation: r.type_reservation || "trappe",
        nom: r.nom || "Réservation",
        x: Number(r.x) || 0,
        y: Number(r.y) || 0,
        largeur: r.largeur ? Number(r.largeur) : null,
        longueur: r.longueur ? Number(r.longueur) : null,
        diametre: r.diametre ? Number(r.diametre) : null,
        metadata: (r.metadata as Json) || null,
      }));
      const { error: errInsertReservations } = await supabase
        .from("chantier_terrasse_reservations")
        .insert(toInsert);
      if (errInsertReservations) {
        console.error("Erreur insertion réservations terrasse :", errInsertReservations.message);
        return NextResponse.json({ error: errInsertReservations.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    terrasse: { ...configToSave, id: idEnregistre, resultats_techniques: resultat },
    resultat,
  });
}
