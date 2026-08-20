// supabase/functions/generer-rapports-intemperies/index.ts
//
// Tourne une fois par jour (via cron, voir cron_rapports_intemperies.sql),
// en fin de journée. Pour chaque chantier actif :
//   1. récupère la météo complète du jour (Visual Crossing)
//   2. récupère la vigilance officielle Météo-France du département
//   3. calcule la décision (jour d'arrêt / à valider / rien)
//   4. génère UN SEUL rapport pour la journée, avec le détail horaire complet
//
// Secrets nécessaires (à ajouter via `supabase secrets set`) :
//   VISUALCROSSING_API_KEY
//   METEOFRANCE_API_KEY
//   SUPABASE_URL (fourni automatiquement par la plateforme)
//   SUPABASE_SERVICE_ROLE_KEY (fourni automatiquement par la plateforme)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VISUALCROSSING_API_KEY = Deno.env.get("VISUALCROSSING_API_KEY")!;
const METEOFRANCE_API_KEY = Deno.env.get("METEOFRANCE_API_KEY")!;

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

type HeureMeteo = { heure: string; temp: number; vent: number; rafales: number; pluie: number };
type NiveauAlerte = "vert" | "jaune" | "orange" | "rouge";
type Materiau = "bois" | "metal" | "composite" | "fibrociment";
type Acces = "echafaudage" | "nacelle";

// ---------------------------------------------------------------------
// Code postal -> département (copié de lib/departement.ts)
// ---------------------------------------------------------------------

function adresseVersDepartement(adresse: string): string | null {
  const match = adresse.match(/\b\d{5}\b/);
  if (!match) return null;
  const cp = match[0];

  if (cp.startsWith("97")) return cp.slice(0, 3);
  if (cp.startsWith("20")) {
    const prefix3 = cp.slice(0, 3);
    return ["200", "201"].includes(prefix3) ? "2A" : "2B";
  }
  return cp.slice(0, 2);
}

// ---------------------------------------------------------------------
// Météo du jour complet (copié/adapté de app/api/meteo/route.ts)
// ---------------------------------------------------------------------

async function fetchMeteoJour(adresse: string): Promise<{
  heures: HeureMeteo[];
  tempMax: number;
  rafalesMax: number;
  pluieCumul: number;
}> {
  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
    adresse
  )}/today?unitGroup=metric&key=${VISUALCROSSING_API_KEY}&contentType=json&include=days,hours&elements=datetime,temp,windspeed,windgust,precip`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur Visual Crossing (${res.status})`);

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

// ---------------------------------------------------------------------
// Vigilance officielle Météo-France (copié/adapté de api/meteo-vigilance)
// ---------------------------------------------------------------------

const COULEUR_PAR_ID: Record<number, NiveauAlerte> = { 1: "vert", 2: "jaune", 3: "orange", 4: "rouge" };
const PHENOMENE_PAR_ID: Record<number, string> = { 1: "vent", 2: "pluie-inondation", 3: "orages" };

async function fetchVigilance(departement: string): Promise<{
  couleurMax: NiveauAlerte;
  phenomenes: { nom: string; couleur: NiveauAlerte }[];
}> {
  const res = await fetch(
    "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours",
    { headers: { apikey: METEOFRANCE_API_KEY } }
  );
  if (!res.ok) throw new Error(`Erreur Vigilance Météo-France (${res.status})`);

  const data = await res.json();
  const periodes = data?.product?.periods ?? [];
  const periodeEnCours = periodes[0];
  const domaines = periodeEnCours?.timelaps?.domain_ids ?? [];
  const domaineArray: any[] = Array.isArray(domaines) ? domaines : Object.values(domaines ?? {});
  const domaineDept = domaineArray.find((d: any) => d?.domain_id === departement);

  if (!domaineDept) return { couleurMax: "vert", phenomenes: [] };

  const couleurMax = COULEUR_PAR_ID[domaineDept.max_color_id] ?? "vert";
  const phenomenesBrut: any[] = domaineDept.phenomenon_items ?? [];
  const phenomenes = phenomenesBrut
    .map((p: any) => {
      const id = p.phenomenon_id;
      const couleurId = p.phenomenon_max_color_id;
      if (!id || !PHENOMENE_PAR_ID[id]) return null;
      return { nom: PHENOMENE_PAR_ID[id], couleur: COULEUR_PAR_ID[couleurId] ?? "vert" };
    })
    .filter(Boolean) as { nom: string; couleur: NiveauAlerte }[];

  return { couleurMax, phenomenes };
}

function couleurPhenomene(
  vigilance: { couleurMax: NiveauAlerte; phenomenes: { nom: string; couleur: NiveauAlerte }[] },
  nom: string
): NiveauAlerte {
  return vigilance.phenomenes.find((p) => p.nom === nom)?.couleur ?? vigilance.couleurMax;
}

const ORDRE: Record<NiveauAlerte, number> = { vert: 0, jaune: 1, orange: 2, rouge: 3 };
function plusForte(a: NiveauAlerte, b: NiveauAlerte): NiveauAlerte {
  return ORDRE[a] >= ORDRE[b] ? a : b;
}

// ---------------------------------------------------------------------
// Risque technique maison (copié de lib/meteoAlerte.ts)
// ---------------------------------------------------------------------

const SEUILS_MATERIAUX: Record<Materiau, { vent_vigilance: number; vent_critique: number; pluie_critique: number; temp_mini: number; temp_maxi: number }> = {
  bois: { vent_vigilance: 30, vent_critique: 60, pluie_critique: 1.0, temp_mini: 0.0, temp_maxi: 30.0 },
  metal: { vent_vigilance: 25, vent_critique: 45, pluie_critique: 1.0, temp_mini: 0.0, temp_maxi: 35.0 },
  composite: { vent_vigilance: 30, vent_critique: 60, pluie_critique: 1.0, temp_mini: 1.0, temp_maxi: 30.0 },
  fibrociment: { vent_vigilance: 30, vent_critique: 60, pluie_critique: 2.0, temp_mini: 0.0, temp_maxi: 30.0 },
};
const SEUILS_ACCES: Record<Acces, { vent_vigilance: number; vent_critique: number }> = {
  echafaudage: { vent_vigilance: 45, vent_critique: 60 },
  nacelle: { vent_vigilance: 35, vent_critique: 45 },
};

function evaluerRisqueTechnique(materiau: Materiau, acces: Acces, meteo: { rafalesMax: number; pluieCumul: number; tempMax: number }) {
  const sm = SEUILS_MATERIAUX[materiau] ?? SEUILS_MATERIAUX.bois;
  const sa = SEUILS_ACCES[acces] ?? SEUILS_ACCES.echafaudage;
  const ventCritique = Math.min(sm.vent_critique, sa.vent_critique);
  const ventVigilance = Math.min(sm.vent_vigilance, sa.vent_vigilance);

  if (meteo.rafalesMax >= ventCritique)
    return { niveau: "rouge" as NiveauAlerte, motif: `Vent critique (${meteo.rafalesMax} km/h ≥ seuil ${ventCritique} km/h)` };
  if (meteo.pluieCumul >= sm.pluie_critique && meteo.pluieCumul >= 8)
    return { niveau: "rouge" as NiveauAlerte, motif: `Pluie critique (${meteo.pluieCumul.toFixed(1)} mm)` };
  if (meteo.tempMax <= sm.temp_mini || meteo.tempMax >= sm.temp_maxi)
    return { niveau: "orange" as NiveauAlerte, motif: `Température limite (${meteo.tempMax}°C) pour ${materiau}` };
  if (meteo.rafalesMax >= ventVigilance)
    return { niveau: "jaune" as NiveauAlerte, motif: `Vent de vigilance (${meteo.rafalesMax} km/h)` };
  return { niveau: "vert" as NiveauAlerte, motif: "Conditions optimales de pose" };
}

// ---------------------------------------------------------------------
// Décision jour d'arrêt (copié de evaluerJourChantier)
// ---------------------------------------------------------------------

function pleutTouteLaJournee(heures: HeureMeteo[]): boolean {
  if (!heures.length) return false;
  const pluvieuses = heures.filter((h) => h.pluie >= 0.2).length;
  return pluvieuses / heures.length >= 0.75;
}

function evaluerJour(
  materiau: Materiau,
  acces: Acces,
  meteoJour: { rafalesMax: number; pluieCumul: number; tempMax: number },
  heures: HeureMeteo[],
  vigilance: { couleurMax: NiveauAlerte; phenomenes: { nom: string; couleur: NiveauAlerte }[] }
) {
  const risqueTechnique = evaluerRisqueTechnique(materiau, acces, meteoJour);
  const vigilanceOfficielle = plusForte(couleurPhenomene(vigilance, "vent"), couleurPhenomene(vigilance, "pluie-inondation"));
  const pluieContinue = pleutTouteLaJournee(heures);

  if (vigilanceOfficielle === "rouge")
    return { vigilanceOfficielle, risqueTechnique, pluieContinue, jourArrete: true, aValider: false, motif: "Vigilance rouge Météo-France — arrêt de chantier" };

  if (vigilanceOfficielle === "orange")
    return { vigilanceOfficielle, risqueTechnique, pluieContinue, jourArrete: false, aValider: true, motif: "Vigilance orange Météo-France — arrêt à confirmer" };

  if (vigilanceOfficielle === "jaune" && pluieContinue)
    return { vigilanceOfficielle, risqueTechnique, pluieContinue, jourArrete: true, aValider: false, motif: "Vigilance jaune + pluie continue toute la journée — arrêt de chantier" };

  if (vigilanceOfficielle === "vert" && pluieContinue)
    return { vigilanceOfficielle, risqueTechnique, pluieContinue, jourArrete: true, aValider: false, motif: "Pluie continue constatée toute la journée (hors vigilance officielle)" };

  return { vigilanceOfficielle, risqueTechnique, pluieContinue, jourArrete: false, aValider: false, motif: "Conditions normales — pas d'intempérie constatée" };
}

// ---------------------------------------------------------------------
// Numérotation
// ---------------------------------------------------------------------

async function prochainNumero(): Promise<string> {
  const annee = new Date().getFullYear();
  const { data } = await supabase
    .from("rapports_intemperies")
    .select("numero")
    .ilike("numero", `RI-${annee}-%`);

  const nums = (data ?? []).map((d: any) => parseInt(d.numero.split("-")[2]) || 0);
  const suivant = (nums.length ? Math.max(...nums) : 0) + 1;
  return `RI-${annee}-${String(suivant).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------

Deno.serve(async (req) => {
  let force = false;
  try {
    const body = await req.json();
    force = body?.force === true;
  } catch {
    // pas de body ou body invalide, on ignore
  }
  const resultats: { chantier: string; statut: string }[] = [];

  const { data: chantiers, error } = await supabase
    .from("chantiers")
    .select("id, nom, adresse_chantier, materiau_structurel, moyen_acces")
    .neq("statut", "termine");

    if (error || !chantiers) {
    console.error("Erreur listage chantiers:", JSON.stringify(error));
    return new Response(JSON.stringify({ error: "Impossible de lister les chantiers", detail: error }), { status: 500 });
  }
    
  

  for (const ch of chantiers) {
    const adresse = ch.adresse_chantier as string | null;
    if (!adresse) {
      resultats.push({ chantier: ch.nom ?? ch.id, statut: "ignoré (pas d'adresse)" });
      continue;
    }

    try {
      // Déjà un rapport aujourd'hui pour ce chantier ? On ne double pas.
      const debutJour = new Date();
      debutJour.setHours(0, 0, 0, 0);

      const { data: existant } = await supabase
        .from("rapports_intemperies")
        .select("id")
        .eq("chantier_id", ch.id)
        .gte("cree_le", debutJour.toISOString())
        .maybeSingle();

      if (existant) {
        resultats.push({ chantier: ch.nom ?? ch.id, statut: "déjà généré aujourd'hui" });
        continue;
      }

      const meteoJour = await fetchMeteoJour(adresse);
      const departement = adresseVersDepartement(adresse);

      const vigilance = departement
        ? await fetchVigilance(departement)
        : { couleurMax: "vert" as NiveauAlerte, phenomenes: [] };

      const decision = evaluerJour(
        ch.materiau_structurel,
        ch.moyen_acces,
        { rafalesMax: meteoJour.rafalesMax, tempMax: meteoJour.tempMax, pluieCumul: meteoJour.pluieCumul },
        meteoJour.heures,
        vigilance
      );

      // On ne génère un rapport que si la journée est réellement impactée
      // (arrêt effectif ou à valider). Une journée normale ne produit rien,
      // sauf en mode "force" (test manuel).
      if (!decision.jourArrete && !decision.aValider && !force) {
        resultats.push({ chantier: ch.nom ?? ch.id, statut: "conditions normales, pas de rapport" });
        continue;
      }
      
      
        
        
      

      const numero = await prochainNumero();

      const { error: errInsert } = await supabase.from("rapports_intemperies").insert({
        numero,
        chantier_id: ch.id,
        vigilance_officielle: decision.vigilanceOfficielle,
        jour_arrete: decision.jourArrete,
        a_valider: decision.aValider,
        pluie_continue: decision.pluieContinue,
        motif: decision.motif,
        risque_technique_niveau: decision.risqueTechnique.niveau,
        risque_technique_motif: decision.risqueTechnique.motif,
        temp_max: meteoJour.tempMax,
        rafales_max: meteoJour.rafalesMax,
        pluie_cumul: meteoJour.pluieCumul,
        materiau: ch.materiau_structurel,
        acces: ch.moyen_acces,
        departement,
        releve_horaire: meteoJour.heures,
        cree_par: "auto",
      });

      if (errInsert) throw errInsert;

      resultats.push({ chantier: ch.nom ?? ch.id, statut: `rapport ${numero} généré` });
    } catch (err) {
      console.error(`Erreur chantier ${ch.id}:`, err);
      resultats.push({ chantier: ch.nom ?? ch.id, statut: `erreur : ${(err as Error).message}` });
    }
  }

  return new Response(JSON.stringify({ resultats }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
// déclenche le premier déploiement
          
