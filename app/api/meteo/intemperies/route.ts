import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SEUIL_PLUIE_MM = 10;
const SEUIL_VENT_KMH = 50;
const SEUIL_GEL_C = 0;
const FALLBACK_GEOLOC = { lat: 46.6, lng: 2.4 };
const FACADES = ["nord", "sud", "est", "ouest"] as const;
const ETAPES = ["ossature", "isolation", "bardage", "finitions"] as const;

async function prochainNumeroIntemperie(): Promise<string> {
  const annee = new Date().getFullYear();
  const { data, error } = await supabaseAdmin
    .from("rapports_intemperies")
    .select("numero")
    .ilike("numero", `RI-${annee}-%`);

  if (error) {
    console.error("Impossible de numéroter le rapport intempérie:", error.message);
    return `RI-${annee}-001`;
  }

  const numeros = (data ?? [])
    .map((ligne: { numero: string | null }) => {
      const morceaux = String(ligne.numero ?? "").split("-");
      return Number.parseInt(morceaux[2] ?? "", 10);
    })
    .filter((num: number) => Number.isFinite(num));

  const prochain = numeros.length > 0 ? Math.max(...numeros) + 1 : 1;
  return `RI-${annee}-${String(prochain).padStart(3, "0")}`;
}

type JourIntemperie = {
  date: string;
  pluie: number;
  vent: number;
  tempMin: number;
  intemperie: boolean;
  raisons: string[];
};

type ChantierMeteo = {
  id: string;
  nom: string;
  location: string;
  lat: number;
  lng: number;
  geocoded: boolean;
  jours: JourIntemperie[];
  intemperieAujourdhui: boolean;
  intemperiesProchainesJours: boolean;
  emailClient: string | null;
};

function dateParis(): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalize(v: string | null | undefined): string {
  return (v ?? "").trim();
}

async function geocoder(ville: string, codePostal: string | null): Promise<{ lat: number; lng: number } | null> {
  const q = normalize(`${ville} ${codePostal ?? ""}`);
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=${encodeURIComponent(q + ", France")}`,
      { headers: { "User-Agent": "BNA-Dashboard/1.0", Accept: "application/json" }, next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchOpenMeteo(lat: number, lng: number): Promise<JourIntemperie[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum,wind_speed_10m_max,temperature_2m_min&timezone=Europe/Paris&forecast_days=4`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error("Erreur Open-Meteo");
  const data = await res.json();
  const d = data.daily;
  if (!d || !Array.isArray(d.time)) throw new Error("Données Open-Meteo invalides");

  return d.time.map((date: string, i: number): JourIntemperie => {
    const pluie = Math.round((d.precipitation_sum?.[i] ?? 0) * 10) / 10;
    const vent = Math.round(d.wind_speed_10m_max?.[i] ?? 0);
    const tempMin = Math.round(d.temperature_2m_min?.[i] ?? 0);
    const raisons: string[] = [];
    if (pluie > SEUIL_PLUIE_MM) raisons.push(`Pluie ${pluie}mm`);
    if (vent > SEUIL_VENT_KMH) raisons.push(`Vent ${vent}km/h`);
    if (tempMin < SEUIL_GEL_C) raisons.push(`Gel ${tempMin}°C`);
    return { date, pluie, vent, tempMin, intemperie: raisons.length > 0, raisons };
  });
}

async function chargerChantiers() {
  const { data, error } = await supabaseAdmin
    .from("chantiers")
    .select("id, nom, adresse_chantier, client_nom, clients(ville, code_postal, email, societe, nom)")
    .eq("statut", "en_cours");
  if (error) throw new Error("Erreur chargement chantiers : " + error.message);
  return data ?? [];
}

async function analyserChantiers(): Promise<ChantierMeteo[]> {
  const chantiers = await chargerChantiers();
  const resultats: ChantierMeteo[] = [];

  for (const ch of chantiers) {
    const client = Array.isArray(ch.clients) ? ch.clients[0] : ch.clients ?? null;
    const societe = client?.societe || ch.client_nom;
    const ville = normalize(client?.ville) || normalize(ch.adresse_chantier);
    const emission: string[] = [];
    if (client?.ville) emission.push(client.ville);
    if (client?.code_postal) emission.push(client.code_postal);
    const location = emission.join(" ");

    let geoloc = await geocoder(location, client?.code_postal ?? null);
    let geocoded = geoloc !== null;
    if (!geoloc) geoloc = { ...FALLBACK_GEOLOC };

    let jours: JourIntemperie[] = [];
    let erreur = false;
    if (geoloc) {
      try {
        jours = await fetchOpenMeteo(geoloc.lat, geoloc.lng);
      } catch {
        erreur = true;
      }
    }

    if (jours.length === 0) {
      jours = [0, 1, 2, 3].map((i) => {
        const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
        return { date, pluie: 0, vent: 0, tempMin: 0, intemperie: erreur, raisons: erreur ? ["Données météo indisponibles"] : [] };
      });
    }

    const nom = normalize(ch.nom) || normalize(societe) || "Chantier";

    resultats.push({
      id: ch.id,
      nom,
      location: location || ville.split(",")[0], 
      lat: geoloc?.lat ?? FALLBACK_GEOLOC.lat,
      lng: geoloc?.lng ?? FALLBACK_GEOLOC.lng,
      geocoded,
      jours,
      intemperieAujourdhui: jours[0]?.intemperie ?? false,
      intemperiesProchainesJours: jours.slice(1).some((j) => j.intemperie),
      emailClient: client?.email ?? null,
    });
  }

  return resultats;
}

function detailsVierges() {
  const zero: Record<string, Record<string, boolean>> = {};
  for (const f of FACADES) {
    zero[f] = {};
    for (const e of ETAPES) zero[f][e] = false;
  }
  return zero;
}

export async function GET() {
  try {
    const chantiers = await analyserChantiers();
    return NextResponse.json({
      jourAujourdhui: dateParis(),
      chantiers,
      nbIntemperies: chantiers.filter((c) => c.intemperieAujourdhui).length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const chantiers = await analyserChantiers();
    const intemp = chantiers.filter((c) => c.intemperieAujourdhui);
    const today = dateParis();
    const rapportes: string[] = [];
    let dejaExistant = 0;

    for (const ch of intemp) {
      const { data: deja } = await supabaseAdmin
        .from("avancements_chantier")
        .select("id")
        .eq("chantier_id", ch.id)
        .eq("date", today)
        .ilike("commentaire", "%Intempérie détectée auto%");

      if (deja && deja.length > 0) {
        dejaExistant++;
        continue;
      }

      const { data: prev } = await supabaseAdmin
        .from("avancements_chantier")
        .select("pourcentage, details")
        .eq("chantier_id", ch.id)
        .order("id", { ascending: false })
        .limit(1);

      const ancienPct = prev && prev.length > 0 ? (prev[0].pourcentage ?? 0) : 0;
      const details = prev && prev.length > 0 && prev[0].details && typeof prev[0].details === "object"
        ? prev[0].details
        : detailsVierges();

      const jour = ch.jours[0];
      const observations = `🌧️ Intempérie détectée auto : ${jour.raisons.join(" / ")} - Chantier impraticable (source Open-Meteo)`;

      const { error } = await supabaseAdmin.from("avancements_chantier").insert({
        chantier_id: ch.id,
        date: today,
        commentaire: observations,
        pourcentage: ancienPct,
        details,
      });

      if (error) {
        console.error("Erreur insert avancement intempérie:", error.message);
      } else {
        rapportes.push(ch.nom);
      }

      const pluieCumul = jour.pluie > 0 ? jour.pluie : null;
      const rafalesMax = jour.vent > 0 ? jour.vent : null;

      await supabaseAdmin.from("rapports_intemperies").insert({
        numero: await prochainNumeroIntemperie(),
        chantier_id: ch.id,
        a_valider: true,
        ampleur_impact: "partielle",
        cree_par: "auto",
        departement: null,
        jour_arrete: true,
        pluie_continue: pluieCumul !== null,
        pluie_cumul: pluieCumul,
        rafales_max: rafalesMax,
        temp_max: null,
        motif: `Intempérie météo : ${jour.raisons.join(" / ")} — source Open-Meteo`,
        vigilance_officielle: "jaune",
      });
    }

    return NextResponse.json({
      jourAujourdhui: today,
      intemperies: intemp.map((c) => ({ chantier: c.nom, raisons: c.jours[0].raisons })),
      rapportes,
      dejaExistant,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}