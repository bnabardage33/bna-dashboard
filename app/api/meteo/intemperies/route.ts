import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database, TablesInsert } from "@/types/supabase";
import { adresseVersDepartement } from "@/lib/meteoDepartements";
import { SEUILS_ACCES, SEUILS_MATERIAUX, Acces, Materiau } from "@/lib/meteoAlerte";
import {
  libelleFenetre,
  lireHorairesPose,
  synthetiserPose,
  type HeureHoraires,
} from "@/lib/meteoHoraire";
import type { VigilancePhenomene } from "@/lib/vigilanceMeteoFrance";
import { verifierSession } from "@/lib/auth";
import { resoudreLocalisationMeteo } from "@/lib/meteoLocalisation";
import { dateParis, dateParisDans } from "@/lib/dateParis";
import { SEUIL_GEL_C, SEUIL_PLUIE_MM } from "@/lib/intemperiesSeuils";

type ClientMeteo = SupabaseClient<Database>;

type ContexteMeteo = {
  client: ClientMeteo;
  entrepriseIds: string[];
};

type ResultatContexteMeteo =
  | { ok: true; contexte: ContexteMeteo }
  | { ok: false; reponse: NextResponse };

// La session utilisateur est toujours limitée à son claim JWT. Le cron Vercel
// n'a pas de session : après validation de CRON_SECRET, il reçoit uniquement
// des contextes tenant explicites, puis chaque opération est scopée séparément.
async function resoudreContexteMeteo(
  request: NextRequest
): Promise<ResultatContexteMeteo> {
  const session = await verifierSession();
  if (session.authentifie) {
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();

    if (error || !user) {
      return {
        ok: false,
        reponse: NextResponse.json({ error: "Non autorisé" }, { status: 401 }),
      };
    }

    const claim = (user.app_metadata as { entreprise_id?: unknown } | null | undefined)
      ?.entreprise_id;
    const entrepriseId = typeof claim === "string" ? claim.trim() : "";

    if (!entrepriseId) {
      return {
        ok: false,
        reponse: NextResponse.json(
          { error: "Contexte entreprise introuvable." },
          { status: 403 }
        ),
      };
    }

    return {
      ok: true,
      contexte: { client, entrepriseIds: [entrepriseId] },
    };
  }

  const secret = process.env.CRON_SECRET ?? "";
  const autorisation = request.headers.get("authorization") ?? "";
  if (!secret || autorisation !== `Bearer ${secret}`) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: "Non autorisé" }, { status: 401 }),
    };
  }

  const { data, error } = await supabaseAdmin
    .from("entreprises")
    .select("id")
    .eq("actif", true)
    .order("id");

  if (error) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: "Erreur serveur" }, { status: 500 }),
    };
  }

  return {
    ok: true,
    contexte: {
      client: supabaseAdmin,
      entrepriseIds: (data ?? []).map((entreprise) => entreprise.id),
    },
  };
}

// Note : il n'y a volontairement PAS de FALLBACK_GEOLOC ici. Un chantier dont
// l'adresse n'a pas pu être validée n'a pas de météo attribuée : on le signale
// (`erreurLocalisation`) au lieu de lui attribuer la météo d'un point arbitraire.
const FACADES = ["nord", "sud", "est", "ouest"] as const;
const ETAPES = ["ossature", "isolation", "bardage", "finitions"] as const;

// Point n°4 : désactiver le cache de la route
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ─── Numérotation sécurisée ───────────────────────────────────────────────────
// La RPC est réservée à service_role. Sa variante UUID impose explicitement le
// tenant de numérotation ; elle n'est jamais appelée sans entrepriseId.
async function prochainNumeroIntemperie(entrepriseId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("generer_prochain_numero_ri", {
    p_entreprise_id: entrepriseId,
  });
  if (error || !data) {
    throw new Error(`RPC generer_prochain_numero_ri échouée: ${error?.message || "pas de data"}`);
  }
  return data;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type JourIntemperie = {
  date: string;
  /**
   * Cumul journalier de précipitations, en mm.
   *
   * P5 : `null` vaut « inconnu / indisponible » — une valeur absente de
   * `precipitation_sum` n'est JAMAIS convertie en 0 (0 mm se lirait comme une
   * garantie de temps sec). L'interface l'affiche « — ».
   */
  pluie: number | null;
  vent: number;
  tempMin: number;
  intemperie: boolean;
  raisons: string[];
  /**
   * Cumul de pluie pendant les HORAIRES DE POSE, quand ils sont connus.
   * `null` : horaires non configurés (on retombe alors sur le cumul journalier,
   * en le disant explicitement dans les raisons).
   */
  pluiePose: number | null;
  /** État de la lecture des horaires, pour que l'appelant puisse l'afficher. */
  horairesStatut: "configuree" | "non_configuree" | "illisible";
};

type ChantierMeteo = {
  id: string;
  nom: string;
  location: string;
  lat: number;
  lng: number;
  geocoded: boolean;
  /**
   * Message expliquant pourquoi la commune n'a pas pu être validée par le code
   * postal. `null` quand la localisation est validée. L'interface s'en sert
   * pour signaler une localisation à corriger au lieu d'afficher une météo
   * venue d'ailleurs.
   */
  erreurLocalisation: string | null;
  /** Lieu réellement utilisé (commune issue du code postal), pour audit. */
  localisationValidee: {
    lat: number;
    lon: number;
    libelle: string;
    codePostal: string | null;
  } | null;
  jours: JourIntemperie[];
  intemperieAujourdhui: boolean;
  intemperiesProchainesJours: boolean;
  emailClient: string | null;
  departement: string | null;
  vigilanceOfficielle: string;
  moyenAcces: Acces;
  materiau: Materiau;
};

// La date « française » vit dans `lib/dateParis.ts` : la même règle sert ici,
// à `/api/meteo` et au Générateur de rapports. Ne pas la réimplémenter.

function normalize(v: string | null | undefined): string {
  return (v ?? "").trim();
}

// Point n°2 : seuil vent harmonisé avec lib/meteoAlerte.ts
function seuilVentCritique(materiau: Materiau, acces: Acces): number {
  const sm = SEUILS_MATERIAUX[materiau] ?? SEUILS_MATERIAUX.bois;
  const sa = SEUILS_ACCES[acces] ?? SEUILS_ACCES.echafaudage;
  return Math.min(sm.vent_critique, sa.vent_critique);
}

// Le géocodage est centralisé dans `lib/meteoLocalisation.ts` : code postal
// exact, refus de l'ambiguïté, et coordonnées partagées avec VisualCrossing.
// On ne reprend PAS ici de repli « premier résultat » ni de point par défaut
// (voir `FALLBACK_GEOLOC`, supprimé) : un chantier mal localisé doit le dire.

// Open-Meteo avec seuil vent dynamique.
//
// Depuis la refonte, la requête demande AUSSI `hourly=precipitation` : sans les
// heures, on ne peut pas distinguer une pluie qui tombe PENDANT la pose d'une
// pluie nocturne qui n'empêche rien. C'est la même requête, élargie — pas un
// second appel réseau.
//
// `horaires` est le texte libre du chantier. Quand il est lisible, seule la
// pluie tombée PENDANT la fenêtre de pose compte comme intempérie de pluie ;
// quand il ne l'est pas, on retombe sur le cumul journalier, et la raison
// affichée le DIT explicitement — jamais une conclusion silencieuse.
async function fetchOpenMeteo(
  lat: number,
  lng: number,
  ventCritique: number,
  horaires: string | null
): Promise<JourIntemperie[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=precipitation_sum,wind_speed_10m_max,temperature_2m_min` +
    `&hourly=precipitation&timezone=Europe/Paris&forecast_days=4`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error("Erreur Open-Meteo");
  const data = await res.json();
  const d = data.daily;
  if (!d || !Array.isArray(d.time)) throw new Error("Données Open-Meteo invalides");

  const lecture = lireHorairesPose(horaires);

  // Index des heures par date locale : `hourly.time` est déjà en Europe/Paris
  // (paramètre `timezone`), donc `slice(0, 10)` est la date locale — pas UTC.
  const heuresParDate = new Map<string, HeureHoraires[]>();
  const hourly = data.hourly;
  if (hourly && Array.isArray(hourly.time)) {
    for (let i = 0; i < hourly.time.length; i++) {
      const t = hourly.time[i] as string;
      if (typeof t !== "string" || t.length < 13) continue;
      const date = t.slice(0, 10);
      const heure = t.slice(11, 16);
      const brut = hourly.precipitation?.[i];
      // `valeurOuNull` : une précipitation absente reste `null`, elle ne
      // devient JAMAIS 0 (0 mm se lirait comme une garantie de temps sec).
      const pluie =
        typeof brut === "number" && Number.isFinite(brut) ? Math.round(brut * 10) / 10 : null;
      const liste = heuresParDate.get(date) ?? [];
      liste.push({ heure, pluie, vent: null, rafales: null, temp: null });
      heuresParDate.set(date, liste);
    }
  }

  return d.time.map((date: string, i: number): JourIntemperie => {
    // P5 : une précipitation journalière absente reste `null` — jamais 0.
    const brutPluie = d.precipitation_sum?.[i];
    const pluie =
      typeof brutPluie === "number" && Number.isFinite(brutPluie)
        ? Math.round(brutPluie * 10) / 10
        : null;
    const vent = Math.round(d.wind_speed_10m_max?.[i] ?? 0);
    const tempMin = Math.round(d.temperature_2m_min?.[i] ?? 0);
    const raisons: string[] = [];

    // Pluie : on privilégie la fenêtre de POSE quand les horaires sont lisibles.
    const synthese = synthetiserPose(heuresParDate.get(date) ?? [], lecture);
    const pluiePose = synthese.pluiePendantPose;
    const horairesStatut = lecture.statut;

    if (lecture.statut === "configuree" && typeof pluiePose === "number") {
      if (pluiePose > SEUIL_PLUIE_MM) {
        raisons.push(
          `Pluie ${pluiePose}mm pendant les horaires de pose (${libelleFenetre(lecture.fenetre)})`,
        );
      } else if (typeof pluie === "number" && pluie > SEUIL_PLUIE_MM) {
        // Une pluie journalière forte MAIS hors pose n'est PAS une intempérie de
        // pose : elle est signalée comme information, sans déclencher le jour.
        raisons.push(
          `Pluie ${pluie}mm sur la journée, hors horaires de pose (${libelleFenetre(lecture.fenetre)})`,
        );
      }
    } else if (typeof pluie === "number" && pluie > SEUIL_PLUIE_MM) {
      // Horaires non lisibles : on ne peut pas dater la pluie. On retombe sur le
      // cumul journalier, en le disant, plutôt que de conclure en silence.
      const precision =
        lecture.statut === "non_configuree"
          ? "horaires de pose non configurés"
          : lecture.statut === "illisible"
            ? "horaires de pose illisibles"
            : "données horaires indisponibles";
      raisons.push(`Pluie ${pluie}mm (journée, ${precision})`);
    }

    if (vent > ventCritique) raisons.push(`Vent ${vent}km/h (seuil ${ventCritique}km/h)`);
    if (tempMin < SEUIL_GEL_C) raisons.push(`Gel ${tempMin}°C`);

    // Une raison purement INFORMATIONNELLE (« pluie hors pose ») ne déclenche
    // pas d'intempérie : c'est la correction d'audit. Une pluie qui tombe quand
    // personne ne pose ne bloque pas la pose.
    const raisonsBloquantes = raisons.filter((r) => !r.includes("hors horaires de pose"));

    return {
      date,
      pluie,
      vent,
      tempMin,
      intemperie: raisonsBloquantes.length > 0,
      raisons,
      pluiePose,
      horairesStatut,
    };
  });
}

// Point n°3 : vigilance officielle Météo-France
const PHENOMENES_CRITIQUES = ["vent", "pluie-inondation", "grand-froid", "orages"];

async function fetchVigilanceDepartement(departement: string): Promise<{ niveau: string; phenomenes: string[] } | null> {
  // Pas de `departement` : rien à interroger, on le dit par `null`.
  if (!departement) return null;
  try {
    const { obtenirTokenMeteoFrance } = await import("@/lib/meteoFranceToken");
    // `obtenirTokenMeteoFrance` lit elle-même METEOFRANCE_APPLICATION_ID. Si la
    // clé manque, elle lève : le catch ci-dessous renvoie `null` (indisponible).
    const token = await obtenirTokenMeteoFrance();
    if (!token) return null;

    // Endpoint officiel DPVigilance v1. L'ancien chemin « vigimeteo » n'existe
    // pas dans ce produit : il renvoyait une erreur, donc TOUTE vigilance était
    // perdue. L'authentification est le token OAuth2 en `Authorization: Bearer`
    // (documenté pour DPVigilance v1) — PAS le header `apikey`.
    const res = await fetch(
      "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours",
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) return null;
    const json = await res.json();

    const { extraireDepartement } = await import("@/lib/vigilanceMeteoFrance");
    const resultat = extraireDepartement(json, departement);
    if (!resultat) return null;

    const phenomenesCritiques = resultat.phenomenes
      .filter((p: VigilancePhenomene) =>
        PHENOMENES_CRITIQUES.some((nom) => p.nom.toLowerCase().includes(nom)) &&
        ["orange", "rouge"].includes(p.couleur)
      )
      .map((p: VigilancePhenomene) => `${p.nom} ${p.couleur}`);

    return { niveau: resultat.couleurMax, phenomenes: phenomenesCritiques };
  } catch {
    return null;
  }
}

// Chargement des chantiers avec adresse chantier + moyen_acces + materiau.
// Les clients sont lus dans une requête séparée, filtrée par tenant et par les
// seuls client_id des chantiers déjà scopés. Un chantier sans client reste
// analysé, mais aucun email d'un autre tenant ne peut être lu ou exposé.
async function chargerChantiers(supabase: ClientMeteo, entrepriseId: string) {
  const { data: chantiers, error } = await supabase
    .from("chantiers")
    .select(
      "id, client_id, entreprise_id, nom, adresse_chantier, client_nom, moyen_acces, materiau_structurel, horaires"
    )
    .eq("entreprise_id", entrepriseId)
    .eq("statut", "en_cours");
  if (error) throw new Error("Erreur chargement chantiers : " + error.message);

  const clientIds = [...new Set(
    (chantiers ?? [])
      .map((chantier) => chantier.client_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  )];
  const clientsParId = new Map<string, {
    id: string;
    entreprise_id: string;
    email: string | null;
    societe: string | null;
    nom: string;
  }>();

  if (clientIds.length > 0) {
    const { data: clients, error: clientError } = await supabase
      .from("clients")
      .select("id, entreprise_id, email, societe, nom")
      .eq("entreprise_id", entrepriseId)
      .in("id", clientIds);
    if (clientError) {
      throw new Error("Erreur chargement clients : " + clientError.message);
    }

    for (const client of clients ?? []) {
      if (client.entreprise_id !== entrepriseId) {
        throw new Error("Client hors entreprise");
      }
      clientsParId.set(client.id, client);
    }
  }

  return (chantiers ?? []).map((chantier) => ({
    ...chantier,
    clients: chantier.client_id
      ? clientsParId.get(chantier.client_id) ?? null
      : null,
  }));
}

async function analyserChantiers(
  supabase: ClientMeteo,
  entrepriseId: string
): Promise<ChantierMeteo[]> {
  const chantiers = await chargerChantiers(supabase, entrepriseId);
  const resultats: ChantierMeteo[] = [];

  for (const ch of chantiers) {
    if (ch.entreprise_id !== entrepriseId) {
      throw new Error("Chantier hors entreprise");
    }

    const client = (Array.isArray(ch.clients) ? ch.clients[0] : ch.clients ?? null) as {
      entreprise_id?: string;
      email?: string | null;
      societe?: string | null;
      nom?: string | null;
    } | null;
    if (client && client.entreprise_id !== entrepriseId) {
      throw new Error("Client hors entreprise");
    }

    const emailClient = client?.email ?? null;
    const nomClient = (client as { societe?: string; nom?: string } | null)?.societe
      || (client as { nom?: string } | null)?.nom
      || ch.client_nom;

    const materiau: Materiau = (ch.materiau_structurel as Materiau) ?? "bois";
    const moyenAcces: Acces = (ch.moyen_acces as Acces) ?? "echafaudage";
    const ventCritique = seuilVentCritique(materiau, moyenAcces);

    // Point n°1 : adresse du CHANTIER.
    // Coordonnées validées une seule fois, utilisées ensuite telles quelles.
    // Aucun point de repli : sans lieu validé, on le signale au lieu d'afficher
    // une météo inventée.
    const adresseChantier = normalize(ch.adresse_chantier);
    const localisation = await resoudreLocalisationMeteo(adresseChantier);
    const geocoded = localisation.ok;
    const erreurLocalisation = localisation.ok ? null : localisation.erreur;
    const coordonnees = localisation.ok
      ? { lat: localisation.data.lat, lng: localisation.data.lon }
      : null;

    const departement = adresseVersDepartement(adresseChantier);

    let jours: JourIntemperie[] = [];
    let erreur = false;
    const horaires = (ch as { horaires?: string | null }).horaires ?? null;
    if (coordonnees) {
      try {
        jours = await fetchOpenMeteo(coordonnees.lat, coordonnees.lng, ventCritique, horaires);
      } catch {
        erreur = true;
      }
    }

    if (jours.length === 0) {
      // Sans coordonnées validées, ce n'est PAS une intempérie : on le signale
      // sans le transformer en alerte. Sinon une adresse mal localisée ferait
      // apparaître un « chantier impraticable » inventé.
      const message = coordonnees
        ? (erreur ? "Données météo indisponibles" : "")
        : (erreurLocalisation ?? "Localisation non validée");
      const lectureHoraires = lireHorairesPose(horaires);
      jours = [0, 1, 2, 3].map((i) => {
        // `dateParisDans` : date FRANÇAISE, jamais la date UTC (voir lib/dateParis.ts).
        const date = dateParisDans(i);
        return {
          date,
          // P5 : sans données, la pluie est INCONNUE — pas 0. L'interface
          // affiche « — » plutôt qu'un faux « 0 mm » qui se lirait comme un
          // temps sec garanti. (La raison de vigilance signale le cas ci-dessous.)
          pluie: null,
          vent: 0,
          tempMin: 0,
          // Un jour sans données n'est PAS un jour sans intempérie : on le
          // signale (`erreur`) au lieu de conclure, comme avant.
          intemperie: coordonnees ? erreur : false,
          raisons: message ? [message] : [],
          pluiePose: null,
          horairesStatut: lectureHoraires.statut,
        };
      });
    }

    // Point n°3 : vigilance officielle Météo-France.
    //
    // « indisponible » est un ÉTAT, pas une couleur : la vigilance officielle
    // peut être absente (clé/API en panne, département inconnu). On ne la
    // remplace jamais par un « vert » inventé — sinon un rapport pourrait
    // afficher « pas de vigilance » alors qu'on n'en sait rien.
    let vigilanceOfficielle = "indisponible";
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
      lat: coordonnees?.lat ?? 0, lng: coordonnees?.lng ?? 0, geocoded,
      localisationValidee: localisation.ok ? localisation.data : null,
      erreurLocalisation,
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
  const resultatContexte = await resoudreContexteMeteo(request);
  if (!resultatContexte.ok) return resultatContexte.reponse;

  try {
    const chantiers: ChantierMeteo[] = [];
    for (const entrepriseId of resultatContexte.contexte.entrepriseIds) {
      chantiers.push(
        ...(await analyserChantiers(resultatContexte.contexte.client, entrepriseId))
      );
    }

    return NextResponse.json(
      { jourAujourdhui: dateParis(), chantiers, nbIntemperies: chantiers.filter((c) => c.intemperieAujourdhui).length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const resultatContexte = await resoudreContexteMeteo(request);
  if (!resultatContexte.ok) return resultatContexte.reponse;

  try {
    const today = dateParis();
    const rapportes: string[] = [];
    const intemperies: Array<{
      chantier: string;
      departement: string | null;
      vigilance: string | null;
      raisons: string[];
    }> = [];
    let dejaExistant = 0;

    for (const entrepriseId of resultatContexte.contexte.entrepriseIds) {
      const chantiers = await analyserChantiers(resultatContexte.contexte.client, entrepriseId);
      const intemp = chantiers.filter((c) => c.intemperieAujourdhui);

      intemperies.push(
        ...intemp.map((c) => ({
          chantier: c.nom,
          departement: c.departement,
          vigilance: c.vigilanceOfficielle,
          raisons: c.jours[0].raisons,
        }))
      );

      for (const ch of intemp) {
        const { data: deja } = await resultatContexte.contexte.client
          .from("avancements_chantier")
          .select("id")
          .eq("entreprise_id", entrepriseId)
          .eq("chantier_id", ch.id)
          .eq("date", today)
          .ilike("commentaire", "%Intempérie détectée auto%");

        if (deja && deja.length > 0) { dejaExistant++; continue; }

        const { data: prev } = await resultatContexte.contexte.client
          .from("avancements_chantier")
          .select("pourcentage, details")
          .eq("entreprise_id", entrepriseId)
          .eq("chantier_id", ch.id)
          .order("id", { ascending: false })
          .limit(1);

        const ancienPct = prev && prev.length > 0 ? (prev[0].pourcentage ?? 0) : 0;
        const details = prev && prev.length > 0 && prev[0].details && typeof prev[0].details === "object"
          ? prev[0].details : detailsVierges();

        const jour = ch.jours[0];
        const sourceVigilance = ch.vigilanceOfficielle && ["orange", "rouge"].includes(ch.vigilanceOfficielle)
          ? `Vigilance MétéoFrance ${ch.vigilanceOfficielle.toUpperCase()} + Open-Meteo`
          : "Open-Meteo";

        const { error } = await resultatContexte.contexte.client
          .from("avancements_chantier")
          .insert({
            entreprise_id: entrepriseId,
            chantier_id: ch.id,
            date: today,
            commentaire: `🌧️ Intempérie détectée auto : ${jour.raisons.join(" / ")} (${sourceVigilance})`,
            pourcentage: ancienPct,
            details,
          } as TablesInsert<"avancements_chantier">);

        if (error) console.error("Erreur insert avancement:", error.message);
        else rapportes.push(ch.nom);

        // `pluie_cumul` porte la pluie PENDANT les horaires de pose quand elle
        // est connue : c'est elle qui a motivé le rapport. On retombe sur le
        // cumul journalier uniquement quand les horaires ne sont pas lisibles, et
        // `pluie_continue` reflète alors honnêtement le périmètre utilisé. P5 :
        // une pluie inconnue (`null`) n'est JAMAIS retenue comme cumul 0.
        const pluieRetenue = jour.pluiePose ?? jour.pluie;
        const pluieContinue =
          jour.horairesStatut === "configuree"
            ? (jour.pluiePose ?? 0) > 0
            : typeof jour.pluie === "number" && jour.pluie > 0;

        await resultatContexte.contexte.client
          .from("rapports_intemperies")
          .insert({
            entreprise_id: entrepriseId,
            numero: await prochainNumeroIntemperie(entrepriseId),
            chantier_id: ch.id,
            a_valider: true,
            ampleur_impact: ch.vigilanceOfficielle === "rouge" ? "totale" : "partielle",
            cree_par: "auto",
            departement: ch.departement,
            // `jour_arrete` reste `true` : ce champ est une PROPOSITION soumise à
            // validation humaine (`a_valider`), pas une qualification automatique.
            // La refonte n'a pas changé cette règle métier.
            jour_arrete: true,
            pluie_continue: pluieContinue,
            pluie_cumul: typeof pluieRetenue === "number" && pluieRetenue > 0 ? pluieRetenue : null,
            rafales_max: jour.vent > 0 ? jour.vent : null,
            temp_max: null,
            motif: `${jour.raisons.join(" / ")} — accès: ${ch.moyenAcces}, matériau: ${ch.materiau}`,
            vigilance_officielle: ch.vigilanceOfficielle,
          } as TablesInsert<"rapports_intemperies">);
      }
    }

    return NextResponse.json(
      { jourAujourdhui: today, intemperies, rapportes, dejaExistant },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
