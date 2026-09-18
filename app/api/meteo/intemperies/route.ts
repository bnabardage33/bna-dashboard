import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adresseVersDepartement } from "@/lib/meteoDepartements";
import { SEUILS_ACCES, SEUILS_MATERIAUX, Acces, Materiau } from "@/lib/meteoAlerte";
import { verifierSession } from "@/lib/auth";

// ─── Seuils communs ───────────────────────────────────────────────────────────
const SEUIL_PLUIE_MM = 5;
const SEUIL_GEL_C = 0;

// Autorise à la fois la session (page /bureau/meteo) et le cron Vercel
// (Authorization: Bearer CRON_SECRET, envoyé automatiquement par Vercel
// quand la variable d'env CRON_SECRET est définie).
async function autoriserAccesMeteo(request: NextRequest): Promise<boolean> {
  const session = await verifierSession();
  if (session.authentifie) return true;

  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false;

  const autorisation = request.headers.get("authorization") ?? "";
  return autorisation === `Bearer ${secret}`;
}

const FALLBACK_GEOLOC = { lat: 46.6, lng: 2.4 };
const FACADES = ["nord", "sud", "est", "ouest"] as const;
const ETAPES = ["ossature", "isolation", "bardage", "finitions"] as const;

// Point n°4 : désactiver le cache de la route
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ─── Numérotation sécurisée ───────────────────────────────────────────────────
async function prochainNumeroIntemperie(): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc('generer_prochain_numero_ri' as any);
  if (error || !data) {
    throw new Error(`RPC generer_prochain_numero_ri échouée: ${error?.message || 'pas de data'}`);
  }
  return data as string;
}

// ─── Types ────────────────────────────────────────────────────────────────────
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
  departement: string | null;
  vigilanceOfficielle: string | null;
  moyenAcces: Acces;
  materiau: Materiau;
};

// ─── Date France ──────────────────────────────────────────────────────────────
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

// Point n°2 : seuil vent harmonisé avec lib/meteoAlerte.ts
function seuilVentCritique(materiau: Materiau, acces: Acces): number {
  const sm = SEUILS_MATERIAUX[materiau] ?? SEUILS_MATERIAUX.bois;
  const sa = SEUILS_ACCES[acces] ?? SEUILS_ACCES.echafaudage;
  return Math.min(sm.vent_critique, sa.vent_critique);
}

// Point n°1 : géocodage depuis l'adresse du chantier (cache 6h)
async function geocoderAdresse(adresse: string): Promise<{ lat: number; lng: number } | null> {
  const q = normalize(adresse);
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=fr&q=${encodeURIComponent(q + ", France")}`,
      {
        headers: { "User-Agent": "BNA-Dashboard/1.0", Accept: "application/json" },
        next: { revalidate: 21600 },
      }
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

// Open-Meteo avec seuil vent dynamique
async function fetchOpenMeteo(lat: number, lng: number, ventCritique: number): Promise<JourIntemperie[]> {
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
    if (vent > ventCritique) raisons.push(`Vent ${vent}km/h (seuil ${ventCritique}km/h)`);
    if (tempMin < SEUIL_GEL_C) raisons.push(`Gel ${tempMin}°C`);
    return { date, pluie, vent, tempMin, intemperie: raisons.length > 0, raisons };
  });
}

// Point n°3 : vigilance officielle Météo-France
const PHENOMENES_CRITIQUES = ["vent", "pluie-inondation", "grand-froid", "orages"];

async function fetchVigilanceDepartement(departement: string): Promise<{ niveau: string; phenomenes: string[] } | null> {
  const applicationId = process.env.METEOFRANCE_APPLICATION_ID;
  if (!applicationId || !departement) return null;
  try {
    const { obtenirTokenMeteoFrance } = await import("@/lib/meteoFranceToken");
    const token = await obtenirTokenMeteoFrance();
    if (!token) return null;

    const res = await fetch(
      "https://public-api.meteofrance.fr/public/DPVigilance/v1/vigimeteo?domain=metropolitaine",
      {
        headers: { Authorization: `Bearer ${token}`, apikey: applicationId },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) return null;
    const json = await res.json();

    const { extraireDepartement } = await import("@/lib/meteoVigilance");
    const resultat = extraireDepartement(json, departement);
    if (!resultat) return null;

    const phenomenesCritiques = resultat.phenomenes
      .filter((p: any) =>
        PHENOMENES_CRITIQUES.some((nom) => p.nom.toLowerCase().includes(nom)) &&
        ["orange", "rouge"].includes(p.couleur)
      )
      .map((p: any) => `${p.nom} ${p.couleur}`);

    return { niveau: resultat.couleurMax, phenomenes: phenomenesCritiques };
  } catch {
    return null;
  }
}

// Chargement des chantiers avec adresse chantier + moyen_acces + materiau
async function chargerChantiers() {
  const { data, error } = await supabaseAdmin
    .from("chantiers")
    .select("id, nom, adresse_chantier, client_nom, moyen_acces, materiau_structurel, clients(email, societe, nom)")
    .eq("statut", "en_cours");
  if (error) throw new Error("Erreur chargement chantiers : " + error.message);
  return data ?? [];
}

async function analyserChantiers(): Promise<ChantierMeteo[]> {
  const chantiers = await chargerChantiers();
  const resultats: ChantierMeteo[] = [];

  for (const ch of chantiers) {
    const client = Array.isArray(ch.clients) ? ch.clients[0] : ch.clients ?? null;
    const emailClient = client?.email ?? null;
    const nomClient = (client as { societe?: string; nom?: string } | null)?.societe
      || (client as { nom?: string } | null)?.nom
      || ch.client_nom;

    const materiau: Materiau = (ch.materiau_structurel as Materiau) ?? "bois";
    const moyenAcces: Acces = (ch.moyen_acces as Acces) ?? "echafaudage";
    const ventCritique = seuilVentCritique(materiau, moyenAcces);

    // Point n°1 : adresse du CHANTIER
    const adresseChantier = normalize(ch.adresse_chantier);
    let geoloc = adresseChantier ? await geocoderAdresse(adresseChantier) : null;
    const geocoded = geoloc !== null;
    if (!geoloc) geoloc = { ...FALLBACK_GEOLOC };

    const departement = adresseVersDepartement(adresseChantier);

    let jours: JourIntemperie[] = [];
    let erreur = false;
    try {
      jours = await fetchOpenMeteo(geoloc.lat, geoloc.lng, ventCritique);
    } catch {
      erreur = true;
    }

    if (jours.length === 0) {
      jours = [0, 1, 2, 3].map((i) => {
        const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
        return { date, pluie: 0, vent: 0, tempMin: 0, intemperie: erreur, raisons: erreur ? ["Données météo indisponibles"] : [] };
      });
    }

    // Point n°3 : vigilance Météo-France
    let vigilanceOfficielle: string | null = null;
    if (departement) {
      const vigil = await fetchVigilanceDepartement(departement);
      if (vigil) {
        vigilanceOfficielle = vigil.niveau;
        if (vigil.phenomenes.length > 0 && jours[0]) {
          const raison = `⚠️ Vigilance MétéoFrance ${vigil.niveau.toUpperCase()} : ${vigil.phenomenes.join(", ")}`;
          jours[0] = { ...jours[0], intemperie: true, raisons: [...jours[0].raisons, raison] };
        }
      }
    }

    const nom = normalize(ch.nom) || normalize(nomClient ?? "") || "Chantier";

    resultats.push({
      id: ch.id, nom,
      location: adresseChantier || nomClient || "France",
      lat: geoloc.lat, lng: geoloc.lng, geocoded,
      jours,
      intemperieAujourdhui: jours[0]?.intemperie ?? false,
      intemperiesProchainesJours: jours.slice(1).some((j) => j.intemperie),
      emailClient, departement, vigilanceOfficielle, moyenAcces, materiau,
    });
  }

  return resultats;
}

function detailsVierges() {
  const zero: Record<string, Record<string, boolean>> = {};
  for (const f of FACADES) { zero[f] = {}; for (const e of ETAPES) zero[f][e] = false; }
  return zero;
}

export async function GET(request: NextRequest) {
  if (!(await autoriserAccesMeteo(request))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const chantiers = await analyserChantiers();
    return NextResponse.json(
      { jourAujourdhui: dateParis(), chantiers, nbIntemperies: chantiers.filter((c) => c.intemperieAujourdhui).length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await autoriserAccesMeteo(request))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const chantiers = await analyserChantiers();
    const intemp = chantiers.filter((c) => c.intemperieAujourdhui);
    const today = dateParis();
    const rapportes: string[] = [];
    let dejaExistant = 0;

    for (const ch of intemp) {
      const { data: deja } = await supabaseAdmin.from("avancements_chantier").select("id")
        .eq("chantier_id", ch.id).eq("date", today).ilike("commentaire", "%Intempérie détectée auto%");

      if (deja && deja.length > 0) { dejaExistant++; continue; }

      const { data: prev } = await supabaseAdmin.from("avancements_chantier").select("pourcentage, details")
        .eq("chantier_id", ch.id).order("id", { ascending: false }).limit(1);

      const ancienPct = prev && prev.length > 0 ? (prev[0].pourcentage ?? 0) : 0;
      const details = prev && prev.length > 0 && prev[0].details && typeof prev[0].details === "object"
        ? prev[0].details : detailsVierges();

      const jour = ch.jours[0];
      const sourceVigilance = ch.vigilanceOfficielle && ["orange", "rouge"].includes(ch.vigilanceOfficielle)
        ? `Vigilance MétéoFrance ${ch.vigilanceOfficielle.toUpperCase()} + Open-Meteo`
        : "Open-Meteo";

      const { error } = await supabaseAdmin.from("avancements_chantier").insert({
        chantier_id: ch.id, date: today,
        commentaire: `🌧️ Intempérie détectée auto : ${jour.raisons.join(" / ")} (${sourceVigilance})`,
        pourcentage: ancienPct, details,
      });

      if (error) console.error("Erreur insert avancement:", error.message);
      else rapportes.push(ch.nom);

      await supabaseAdmin.from("rapports_intemperies").insert({
        numero: await prochainNumeroIntemperie(),
        chantier_id: ch.id,
        a_valider: true,
        ampleur_impact: ch.vigilanceOfficielle === "rouge" ? "totale" : "partielle",
        cree_par: "auto",
        departement: ch.departement,
        jour_arrete: true,
        pluie_continue: jour.pluie > 0,
        pluie_cumul: jour.pluie > 0 ? jour.pluie : null,
        rafales_max: jour.vent > 0 ? jour.vent : null,
        temp_max: null,
        motif: `${jour.raisons.join(" / ")} — accès: ${ch.moyenAcces}, matériau: ${ch.materiau}`,
        vigilance_officielle: ch.vigilanceOfficielle ?? "vert",
      });
    }

    return NextResponse.json(
      { jourAujourdhui: today, intemperies: intemp.map((c) => ({ chantier: c.nom, departement: c.departement, vigilance: c.vigilanceOfficielle, raisons: c.jours[0].raisons })), rapportes, dejaExistant },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
