// app/api/rapports-intemperies/generer/route.ts
// Route API serveur pour analyser la météo et générer les rapports d'intempéries
// pour un chantier spécifique ou tous les chantiers actifs.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { adresseVersDepartement } from "@/lib/meteoDepartements";
import { Materiau, Acces, evaluerAlerteChantier, pleutTouteLaJournee, NiveauAlerte } from "@/lib/meteoAlerte";

const URL_VIGILANCE = "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours";

const COULEUR_PAR_ID: Record<number, NiveauAlerte> = {
  1: "vert",
  2: "jaune",
  3: "orange",
  4: "rouge",
};

const PHENOMENE_PAR_ID: Record<number, string> = {
  1: "vent",
  2: "pluie-inondation",
  3: "orages",
  4: "inondation",
  5: "neige-verglas",
  6: "canicule",
  7: "grand-froid",
  8: "avalanches",
  9: "vagues-submersion",
};

type HeureMeteo = { heure: string; temp: number; vent: number; rafales: number; pluie: number };
type VigilanceInfo = { couleurMax: NiveauAlerte; phenomenes: { nom: string; couleur: NiveauAlerte }[] };

const ORDRE: Record<NiveauAlerte, number> = { vert: 0, jaune: 1, orange: 2, rouge: 3 };
function plusForte(a: NiveauAlerte, b: NiveauAlerte): NiveauAlerte {
  return ORDRE[a] >= ORDRE[b] ? a : b;
}

/**
 * Récupère les données météo réelles du jour via Visual Crossing.
 */
async function fetchMeteoVisualCrossing(adresse: string, apiKey: string): Promise<{
  heures: HeureMeteo[];
  tempMax: number;
  rafalesMax: number;
  pluieCumul: number;
}> {
  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
    adresse
  )}/today?unitGroup=metric&key=${apiKey}&contentType=json&include=days,hours&elements=datetime,temp,windspeed,windgust,precip`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Erreur Visual Crossing (${res.status}) pour l'adresse '${adresse}'`);

  const data = await res.json();
  const today = data.days?.[0];
  if (!today) throw new Error("Pas de données météo pour cette adresse");

  const heures: HeureMeteo[] = (today.hours || []).map((h: any) => ({
    heure: h.datetime.slice(0, 5),
    temp: Math.round(h.temp),
    vent: Math.round(h.windspeed),
    rafales: Math.round(h.windgust ?? h.windspeed),
    pluie: h.precip ?? 0,
  }));

  const tempMax = heures.length ? Math.max(...heures.map((h) => h.temp)) : 0;
  const rafalesMax = heures.length ? Math.max(...heures.map((h) => h.rafales)) : 0;
  const pluieCumul = heures.reduce((s, h) => s + h.pluie, 0);

  return { heures, tempMax, rafalesMax, pluieCumul };
}

/**
 * Récupère la vigilance officielle Météo-France pour le département.
 */
async function fetchVigilanceMeteoFrance(departement: string, apiKey?: string): Promise<VigilanceInfo> {
  if (!apiKey) {
    return { couleurMax: "vert", phenomenes: [] };
  }

  try {
    const res = await fetch(URL_VIGILANCE, {
      headers: { apikey: apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(`API Vigilance non disponible (${res.status})`);
      return { couleurMax: "vert", phenomenes: [] };
    }

    const data = await res.json();
    const periodes = data?.product?.periods ?? data?.periods ?? [];
    const periodeEnCours = periodes[0];
    const domaines = periodeEnCours?.timelaps?.domain_ids ?? periodeEnCours?.domain_ids ?? [];
    const domaineArray: any[] = Array.isArray(domaines) ? domaines : Object.values(domaines ?? {});

    const deptNormalized = departement.trim().toUpperCase();
    const domaineDept = domaineArray.find((d: any) => {
      const dId = d?.domain_id?.toString().trim().toUpperCase();
      if (!dId) return false;
      if (dId === deptNormalized) return true;
      if (deptNormalized === "2A" && (dId === "20A" || dId === "2A" || dId === "200" || dId === "201")) return true;
      if (deptNormalized === "2B" && (dId === "20B" || dId === "2B" || dId === "202")) return true;
      return false;
    });

    if (!domaineDept) return { couleurMax: "vert", phenomenes: [] };

    const couleurMax = COULEUR_PAR_ID[domaineDept.max_color_id] ?? "vert";
    const phenomenesBrut: any[] = domaineDept.phenomenon_items ?? domaineDept.phenomenon_max_colors ?? [];
    const phenomenes = phenomenesBrut
      .map((p: any) => {
        const id = p.phenomenon_id ?? p.phenomenon_max_color_id?.phenomenon_id;
        const couleurId = p.phenomenon_max_color_id ?? p.color_id ?? p.max_color_id;
        if (!id || !PHENOMENE_PAR_ID[id]) return null;
        return {
          nom: PHENOMENE_PAR_ID[id],
          couleur: COULEUR_PAR_ID[couleurId] ?? "vert",
        };
      })
      .filter(Boolean) as { nom: string; couleur: NiveauAlerte }[];

    return { couleurMax, phenomenes };
  } catch (err) {
    console.error("Erreur lecture vigilance Météo-France:", err);
    return { couleurMax: "vert", phenomenes: [] };
  }
}

/**
 * Calcule le prochain numéro officiel RI-YYYY-XXX.
 */
async function prochainNumero(): Promise<string> {
  const annee = new Date().getFullYear();
  const { data } = await supabase
    .from("rapports_intemperies")
    .select("numero")
    .ilike("numero", `RI-${annee}-%`);

  const nums = (data ?? []).map((d: any) => {
    const parts = (d.numero || "").split("-");
    return parseInt(parts[2], 10) || 0;
  });

  const suivant = (nums.length ? Math.max(...nums) : 0) + 1;
  return `RI-${annee}-${String(suivant).padStart(3, "0")}`;
}

export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const chantierId = body.chantierId as string | undefined;
  const force = body.force !== false; // Par défaut true sur appel manuel

  const visualCrossingKey = process.env.VISUALCROSSING_API_KEY;
  const meteoFranceKey = process.env.METEOFRANCE_API_KEY;

  if (!visualCrossingKey) {
    return NextResponse.json(
      { error: "Clé VISUALCROSSING_API_KEY non configurée dans .env.local" },
      { status: 500 }
    );
  }

  // 1. Récupération des chantiers cibles
  let query = supabase
    .from("chantiers")
    .select("id, nom, adresse_chantier, materiau_structurel, moyen_acces, zone_vent, statut");

  if (chantierId) {
    query = query.eq("id", chantierId);
  } else {
    query = query.neq("statut", "termine");
  }

  const { data: chantiers, error: errChantiers } = await query;
  if (errChantiers || !chantiers || chantiers.length === 0) {
    return NextResponse.json(
      { error: chantierId ? "Chantier introuvable" : "Aucun chantier actif trouvé" },
      { status: 404 }
    );
  }

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);

  const resultats: any[] = [];

  for (const ch of chantiers) {
    const adresse = (ch.adresse_chantier as string | null) || ch.nom || "Ajaccio, Corse";

    try {
      // Vérifier si un rapport existe déjà aujourd'hui pour ce chantier
      const { data: existant } = await supabase
        .from("rapports_intemperies")
        .select("id, numero")
        .eq("chantier_id", ch.id)
        .gte("cree_le", debutJour.toISOString())
        .maybeSingle();

      if (existant && !force) {
        resultats.push({
          chantierId: ch.id,
          nom: ch.nom,
          statut: `Rapport déjà existant (${existant.numero})`,
          rapportId: existant.id,
        });
        continue;
      }

      // Résolution du département
      const departement = adresseVersDepartement(adresse) || "2A";

      // Relevé météo réel & Vigilance Météo-France
      const meteoJour = await fetchMeteoVisualCrossing(adresse, visualCrossingKey);
      const vigilance = await fetchVigilanceMeteoFrance(departement, meteoFranceKey);

      // Risque technique maison
      const mat = (ch.materiau_structurel as Materiau) || "bois";
      const acc = (ch.moyen_acces as Acces) || "echafaudage";
      const risqueTechnique = evaluerAlerteChantier(mat, acc, {
        rafalesMax: meteoJour.rafalesMax,
        pluieCumul: meteoJour.pluieCumul,
        tempMax: meteoJour.tempMax,
      });

      const pluieContinue = pleutTouteLaJournee(meteoJour.heures);

      // Détermination de la vigilance officielle
      const phenomeneMax = vigilance.phenomenes.find((p) => p.couleur === vigilance.couleurMax);
      const nomPhenomene = phenomeneMax?.nom || "conditions météo";

      let vigilanceOfficielle: NiveauAlerte = vigilance.couleurMax;

      // Si Visual Crossing constate des rafales > 60 km/h ou pluie > 10 mm, on élève la vigilance
      if (meteoJour.rafalesMax >= 60 || (meteoJour.pluieCumul >= 10 && pluieContinue)) {
        vigilanceOfficielle = plusForte(vigilanceOfficielle, "orange");
      } else if (meteoJour.rafalesMax >= 40 || meteoJour.pluieCumul >= 4) {
        vigilanceOfficielle = plusForte(vigilanceOfficielle, "jaune");
      }

      // Décision du rapport
      let jourArrete = false;
      let aValider = false;
      let ampleurImpact: "complete" | "partielle" | null = null;
      let motif = "";

      if (vigilanceOfficielle === "rouge") {
        jourArrete = true;
        ampleurImpact = "complete";
        motif = `Vigilance ROUGE Météo-France (${nomPhenomene}) — Arrêt total des travaux de bardage sur le chantier.`;
      } else if (vigilanceOfficielle === "orange") {
        aValider = true;
        ampleurImpact = "partielle";
        motif = `Vigilance ORANGE Météo-France (${nomPhenomene} - Rafales ${meteoJour.rafalesMax} km/h, Pluie ${meteoJour.pluieCumul.toFixed(1)} mm) — Arrêt partiel ou complet à valider par le chef de chantier.`;
      } else if (vigilanceOfficielle === "jaune") {
        aValider = true;
        ampleurImpact = "partielle";
        motif = `Vigilance JAUNE Météo-France (${nomPhenomene} - Rafales ${meteoJour.rafalesMax} km/h, Pluie ${meteoJour.pluieCumul.toFixed(1)} mm) — Conditions dégradées constatées sur zone.`;
      } else if (pluieContinue) {
        jourArrete = true;
        ampleurImpact = "complete";
        motif = `Pluie continue constatée sur la journée (${meteoJour.pluieCumul.toFixed(1)} mm) — Impossibilité de poser le pare-pluie / isolant.`;
      } else {
        motif = `Relevé météorologique du jour — Conditions de travail constatées (Rafales max ${meteoJour.rafalesMax} km/h, Temp. max ${meteoJour.tempMax}°C).`;
      }

      // Génération du numéro séquentiel
      const numero = await prochainNumero();

      // Insertion dans la base de données
      const { data: rapportCree, error: errInsert } = await supabase
        .from("rapports_intemperies")
        .insert({
          numero,
          chantier_id: ch.id,
          vigilance_officielle: vigilanceOfficielle,
          jour_arrete: jourArrete,
          a_valider: aValider,
          ampleur_impact: ampleurImpact,
          pluie_continue: pluieContinue,
          motif,
          risque_technique_niveau: risqueTechnique.niveau,
          risque_technique_motif: risqueTechnique.motif,
          temp_max: meteoJour.tempMax,
          rafales_max: meteoJour.rafalesMax,
          pluie_cumul: meteoJour.pluieCumul,
          materiau: mat,
          acces: acc,
          departement,
          releve_horaire: meteoJour.heures,
          cree_par: "manuel",
        })
        .select()
        .single();

      if (errInsert) throw errInsert;

      resultats.push({
        chantierId: ch.id,
        nom: ch.nom,
        numero,
        vigilance: vigilanceOfficielle,
        rapportId: rapportCree.id,
        statut: "Rapport généré avec succès",
      });
    } catch (err: any) {
      console.error(`Erreur génération pour chantier ${ch.id}:`, err);
      resultats.push({
        chantierId: ch.id,
        nom: ch.nom,
        statut: `Erreur : ${err.message || err}`,
      });
    }
  }

  return NextResponse.json({
    success: true,
    total: resultats.length,
    resultats,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
