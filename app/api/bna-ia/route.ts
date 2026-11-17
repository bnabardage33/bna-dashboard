import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import {
  buildSystemPromptContext,
  calculerAlertesProactives,
  calculerChiffrageDeplacementBna,
  DEPOT_BNA_DEFAUT,
  detectBnaIaActions,
  detecterChantierComplexe,
  evaluerAlertesDtuMeteoJour,
  extraireDestinationLibre,
  extraireVilleMeteoLibre,
  formaterDateFrEuropeParis,
  normaliserMetierBna,
  type BnaIaChantierCtx,
  type BnaIaContext,
  type BnaIaDeplacementCtx,
  type BnaIaHistoryTurn,
  type BnaIaPrevisionJourCtx,
  type BnaIaVigilanceMfCtx,
} from "@/lib/bnaIaService";
import { detecterEtCalculerPreChiffrage } from "@/lib/bnaIaPreChiffrage";
import { normaliserRequeteMetier } from "@/lib/bnaDictionnaireMetier";
import { libelleConditionsWmo } from "@/lib/meteoOpenMeteo";
import { lireTarifCommercial } from "@/lib/deplacement/tenantHelpers";
import { adresseVersDepartements } from "@/lib/meteoDepartements";
import { obtenirTokenMeteoFrance } from "@/lib/meteoFranceToken";
import { extraireDepartement } from "@/lib/vigilanceMeteoFrance";

export const dynamic = "force-dynamic";

const LLM_TIMEOUT_MS = 18_000;
const DEFAULT_GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
];

type LlmCallResult =
  | { ok: true; text: string; modelUsed?: string }
  | { ok: false; error: string };

/**
 * Garantit un historique compatible avec Mistral, Gemini et Groq :
 * - Supprime les messages assistant initiaux (ex: message d'accueil UI) avant le premier tour user
 * - Fusionne les tours consécutifs de même rôle pour respecter l'alternance stricte user/assistant
 */
function sanitizeHistoryForLlm(history: BnaIaHistoryTurn[]): BnaIaHistoryTurn[] {
  const cleaned: BnaIaHistoryTurn[] = [];
  for (const turn of history) {
    if (cleaned.length === 0 && turn.role !== "user") {
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === turn.role) {
      prev.content = `${prev.content}\n\n${turn.content}`;
    } else {
      cleaned.push({ role: turn.role, content: turn.content });
    }
  }
  // Le message utilisateur courant sera ajouté ensuite : éviter deux tours "user" consécutifs
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].role === "user") {
    cleaned.pop();
  }
  return cleaned;
}

async function readHttpErrorSnippet(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    const compact = raw.replace(/\s+/g, " ").trim();
    return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
  } catch {
    return res.statusText || "Erreur HTTP";
  }
}

async function callGeminiLlm(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  history: BnaIaHistoryTurn[] = []
): Promise<LlmCallResult> {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const contents = [
      ...history.map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      { role: "user", parts: [{ text: userMessage }] },
    ];
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const snippet = await readHttpErrorSnippet(res);
      return { ok: false, error: `Gemini (${model}) HTTP ${res.status}: ${snippet}` };
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const text = parts.map((p: { text?: string }) => p.text || "").join("").trim();
      if (text) return { ok: true, text, modelUsed: model };
    }
    const finishReason = data?.candidates?.[0]?.finishReason;
    return {
      ok: false,
      error: `Gemini (${model}) réponse vide${finishReason ? ` (${finishReason})` : ""}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Gemini (${model}) exception: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

async function callGroqLlm(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  history: BnaIaHistoryTurn[] = []
): Promise<LlmCallResult> {
  const modelsToTry = [
    ...(process.env.GROQ_MODEL ? [process.env.GROQ_MODEL.trim()] : []),
    ...DEFAULT_GROQ_MODELS,
  ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

  const modelErrors: string[] = [];

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...history.map((h) => ({ role: h.role, content: h.content })),
            { role: "user", content: userMessage },
          ],
          max_completion_tokens: 4096,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const snippet = await readHttpErrorSnippet(res);
        modelErrors.push(`${model} HTTP ${res.status}: ${snippet}`);
        continue;
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) return { ok: true, text, modelUsed: model };
      modelErrors.push(`${model} réponse vide`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      modelErrors.push(`${model} exception: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: `Groq (${modelErrors.join("; ")})` };
}

async function callMistralLlm(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  history: BnaIaHistoryTurn[] = []
): Promise<LlmCallResult> {
  const model = process.env.MISTRAL_MODEL?.trim() || "mistral-small-latest";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: userMessage },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const snippet = await readHttpErrorSnippet(res);
      return { ok: false, error: `Mistral (${model}) HTTP ${res.status}: ${snippet}` };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (text) return { ok: true, text, modelUsed: model };
    return { ok: false, error: `Mistral (${model}) réponse vide` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Mistral (${model}) exception: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

const CACHE_METEO_30MIN_MS = 30 * 60 * 1000;
const METEO_TIMEOUT_MS = 2500;
const meteoChantierCache = new Map<
  string,
  { expiresAt: number; data: { previsions: BnaIaPrevisionJourCtx[]; resumeAlerte: string | null } }
>();

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const CACHE_VIGILANCE_10MIN_MS = 10 * 60 * 1000;
let vigilanceCarteCache: { expiresAt: number; data: unknown } | null = null;

async function chargerVigilanceMeteoFrance(
  departements: string[]
): Promise<BnaIaVigilanceMfCtx[]> {
  if (departements.length === 0) return [];
  try {
    const now = Date.now();
    let carteJson: unknown =
      vigilanceCarteCache && vigilanceCarteCache.expiresAt > now
        ? vigilanceCarteCache.data
        : null;

    if (!carteJson) {
      const token = await obtenirTokenMeteoFrance();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), METEO_TIMEOUT_MS);
      try {
        const res = await fetch(
          "https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours",
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: "no-store",
          }
        );
        if (!res.ok) return [];
        carteJson = await res.json();
        vigilanceCarteCache = {
          expiresAt: now + CACHE_VIGILANCE_10MIN_MS,
          data: carteJson,
        };
      } finally {
        clearTimeout(timer);
      }
    }

    const resultats: BnaIaVigilanceMfCtx[] = [];
    for (const dept of departements.slice(0, 3)) {
      const ext = extraireDepartement(carteJson, dept);
      if (ext) {
        resultats.push({
          departement: ext.departement,
          couleur: ext.couleurMax,
          phenomenesActifs: ext.phenomenes
            .filter((p) => p.couleur !== "vert")
            .map((p) => ({ nom: p.nom, couleur: p.couleur })),
        });
      }
    }
    return resultats;
  } catch {
    return [];
  }
}

const DEPOT_GENERAC_COORDS = { lat: 45.1797, lon: -0.5469 };

function distanceHaversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const c =
    2 *
    Math.asin(
      Math.sqrt(
        sinLat * sinLat +
          Math.cos((a.lat * Math.PI) / 180) *
            Math.cos((b.lat * Math.PI) / 180) *
            sinLon * sinLon
      )
    );
  return R * c;
}

async function chargerDeplacementDepuisGenerac(
  destination: string,
  tarifKmHt: number,
  nbJoursChantier: number
): Promise<BnaIaDeplacementCtx | null> {
  try {
    const cleanQuery =
      destination
        .replace(/^\d+\s+(?:rue|avenue|boulevard|allée|impasse|chemin)[^,]*/i, "")
        .trim() || destination.trim();
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      cleanQuery
    )}&count=1&language=fr&format=json`;
    const geoJson = (await fetchJsonWithTimeout(geoUrl, METEO_TIMEOUT_MS)) as {
      results?: Array<{ latitude?: number; longitude?: number; name?: string }>;
    } | null;

    const first = geoJson?.results?.[0];
    if (typeof first?.latitude !== "number" || typeof first?.longitude !== "number") {
      return null;
    }

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${DEPOT_GENERAC_COORDS.lon},${DEPOT_GENERAC_COORDS.lat};${first.longitude},${first.latitude}?overview=false`;
    const osrmJson = (await fetchJsonWithTimeout(osrmUrl, METEO_TIMEOUT_MS)) as {
      code?: string;
      routes?: Array<{ distance?: number; duration?: number }>;
    } | null;

    let distanceAllerKm: number;
    let dureeTrajetAllerMin: number;
    const route = osrmJson?.code === "Ok" ? osrmJson.routes?.[0] : undefined;

    if (typeof route?.distance === "number" && route.distance > 0) {
      distanceAllerKm = route.distance / 1000;
      dureeTrajetAllerMin =
        typeof route.duration === "number" && route.duration > 0
          ? route.duration / 60
          : (distanceAllerKm / 75) * 60;
    } else {
      // Repli routier estimatif (×1.25 sur vol d'oiseau) si OSRM indisponible
      distanceAllerKm =
        distanceHaversineKm(DEPOT_GENERAC_COORDS, {
          lat: first.latitude,
          lon: first.longitude,
        }) * 1.25;
      dureeTrajetAllerMin = (distanceAllerKm / 75) * 60;
    }

    return calculerChiffrageDeplacementBna({
      depart: DEPOT_BNA_DEFAUT,
      destination: first.name || destination,
      distanceAllerKm,
      dureeTrajetAllerMin,
      tarifKmHt,
      nbJoursChantier,
    });
  } catch {
    return null;
  }
}

async function chargerMeteoChantier3Jours(
  adresse: string
): Promise<{ previsions: BnaIaPrevisionJourCtx[]; resumeAlerte: string | null }> {
  const cle = adresse.trim().toLowerCase();
  const now = Date.now();
  const cached = meteoChantierCache.get(cle);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    // 1. Géocodage gratuit Open-Meteo (ville / code postal)
    const cleanQuery = adresse
      .replace(/^\d+\s+(?:rue|avenue|boulevard|allée|impasse|chemin)[^,]*/i, "")
      .trim() || adresse.trim();
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      cleanQuery
    )}&count=1&language=fr&format=json`;
    const geoJson = (await fetchJsonWithTimeout(geoUrl, METEO_TIMEOUT_MS)) as {
      results?: Array<{ latitude?: number; longitude?: number }>;
    } | null;

    const first = geoJson?.results?.[0];
    if (typeof first?.latitude !== "number" || typeof first?.longitude !== "number") {
      return { previsions: [], resumeAlerte: null };
    }

    // 2. Prévisions gratuites Open-Meteo 5 jours (zéro quota Visual Crossing)
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,wind_gusts_10m_max,weather_code` +
      `&timezone=Europe%2FParis&forecast_days=5`;
    const forecastJson = (await fetchJsonWithTimeout(
      forecastUrl,
      METEO_TIMEOUT_MS
    )) as {
      daily?: {
        time?: string[];
        temperature_2m_min?: number[];
        temperature_2m_max?: number[];
        precipitation_sum?: number[];
        wind_gusts_10m_max?: number[];
        weather_code?: number[];
      };
    } | null;

    const daily = forecastJson?.daily;
    if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) {
      return { previsions: [], resumeAlerte: null };
    }

    const previsions: BnaIaPrevisionJourCtx[] = daily.time.slice(0, 5).map((date, idx) => {
      const tempMinC = Math.round(Number(daily.temperature_2m_min?.[idx] ?? 0));
      const tempMaxC = Math.round(Number(daily.temperature_2m_max?.[idx] ?? 0));
      const rafalesKmh = Math.round(Number(daily.wind_gusts_10m_max?.[idx] ?? 0));
      const pluieMm = Math.round(Number(daily.precipitation_sum?.[idx] ?? 0) * 10) / 10;
      const conditions = libelleConditionsWmo(daily.weather_code?.[idx]);
      return {
        date,
        tempMinC,
        tempMaxC,
        rafalesKmh,
        pluieMm,
        conditions,
        alertesDtu: evaluerAlertesDtuMeteoJour({
          tempMinC,
          tempMaxC,
          rafalesKmh,
          pluieMm,
          conditions,
        }),
      };
    });

    const toutesAlertes = Array.from(
      new Set(previsions.flatMap((p) => p.alertesDtu))
    );
    const result = {
      previsions,
      resumeAlerte: toutesAlertes.length > 0 ? toutesAlertes.join(" ") : null,
    };
    meteoChantierCache.set(cle, {
      expiresAt: now + CACHE_METEO_30MIN_MS,
      data: result,
    });
    return result;
  } catch {
    return { previsions: [], resumeAlerte: null };
  }
}

async function chargerContexteEntreprise(entrepriseId: string): Promise<BnaIaContext> {
  const supabase = await createClient();
  const maintenant = formaterDateFrEuropeParis();
  const currentDateIso = maintenant.dateIso;

  const [
    { data: chantiersRaw },
    { data: commandesRaw },
    { data: devisRaw },
    { data: facturesRaw },
    { data: reglementsRaw },
    { data: pvsRaw },
    { data: savRaw },
  ] = await Promise.all([
    supabase
      .from("chantiers")
      .select("id, nom, adresse_chantier, metier, statut, checklist, date_debut, date_fin")
      .eq("entreprise_id", entrepriseId)
      .neq("statut", "corbeille")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("commandes")
      .select("id, designation, chantier_id, statut, date_livraison_prevue, montant_ht, fournisseurs(nom), chantiers(nom)")
      .eq("entreprise_id", entrepriseId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("devis")
      .select("id, numero, chantier_id, statut, total_ht, marge_ht, marge_pct")
      .eq("entreprise_id", entrepriseId)
      .limit(60),
    supabase
      .from("factures")
      .select("id, numero, chantier_id, statut, net_a_payer_ttc, echeance")
      .eq("entreprise_id", entrepriseId)
      .limit(60),
    supabase
      .from("reglements_factures")
      .select("facture_id, montant_ttc")
      .eq("entreprise_id", entrepriseId),
    supabase
      .from("pv_receptions")
      .select("id, numero, chantier_id, statut, reserves")
      .eq("entreprise_id", entrepriseId)
      .limit(40),
    supabase
      .from("tickets_sav")
      .select("id, description, metier, statut, type_garantie")
      .eq("entreprise_id", entrepriseId)
      .limit(40),
  ]);

  const payeParFacture = new Map<string, number>();
  for (const r of reglementsRaw ?? []) {
    payeParFacture.set(
      r.facture_id,
      (payeParFacture.get(r.facture_id) ?? 0) + Number(r.montant_ttc ?? 0)
    );
  }

  const chantiersBase: BnaIaChantierCtx[] = (chantiersRaw ?? []).map((c) => {
    const cl = (c.checklist && typeof c.checklist === "object" ? c.checklist : {}) as Record<string, unknown>;
    const avancementPct =
      typeof cl.avancement_manuel === "number"
        ? cl.avancement_manuel
        : c.statut === "termine"
          ? 100
          : c.statut === "en_cours"
            ? 50
            : 0;
    return {
      id: c.id,
      nom: c.nom || "Chantier BNA",
      ville: c.adresse_chantier,
      metier: normaliserMetierBna(c.metier),
      statut: c.statut || "prevu",
      avancement: avancementPct,
      date_debut: c.date_debut,
      date_fin: c.date_fin,
    };
  });

  // Enrichissement météo 3 jours en parallèle pour les chantiers actifs (en_cours / prevu)
  const actifsAEnrichir = chantiersBase
    .filter(
      (c) =>
        (c.statut === "en_cours" || c.statut === "prevu") &&
        Boolean(c.ville && c.ville.trim().length > 0)
    )
    .slice(0, 6);

  if (actifsAEnrichir.length > 0) {
    const resultatsMeteo = await Promise.all(
      actifsAEnrichir.map(async (c) => ({
        id: c.id,
        meteo: await chargerMeteoChantier3Jours(c.ville!.trim()),
      }))
    );
    const mapMeteo = new Map(resultatsMeteo.map((r) => [r.id, r.meteo]));
    for (const ch of chantiersBase) {
      const m = mapMeteo.get(ch.id);
      if (m && m.previsions.length > 0) {
        ch.previsionsMeteo3J = m.previsions;
        if (m.resumeAlerte) ch.alerte_meteo = m.resumeAlerte;
      }
    }
  }

  return {
    userName: "Dirigeant BNA",
    currentDateIso,
    currentDateFr: maintenant.dateFr,
    currentTimeParis: maintenant.heureParis,
    chantiers: chantiersBase,
    commandes: (commandesRaw ?? []).map((cmd) => {
      const f = cmd.fournisseurs as unknown as { nom?: string } | null;
      const ch = cmd.chantiers as unknown as { nom?: string } | null;
      return {
        id: cmd.id,
        designation: cmd.designation,
        fournisseur_nom: f?.nom ?? null,
        chantier_id: cmd.chantier_id,
        chantier_nom: ch?.nom ?? null,
        statut: cmd.statut,
        date_livraison_prevue: cmd.date_livraison_prevue,
        montant_ht: cmd.montant_ht,
      };
    }),
    devis: (devisRaw ?? []).map((d) => ({
      id: d.id,
      numero: d.numero,
      chantier_id: d.chantier_id,
      statut: d.statut,
      total_ht: Number(d.total_ht ?? 0),
      marge_ht: Number(d.marge_ht ?? 0),
      marge_pct: Number(d.marge_pct ?? 0),
    })),
    factures: (facturesRaw ?? []).map((f) => {
      const total = Number(f.net_a_payer_ttc ?? 0);
      const paye =
        f.statut === "payee" ? total : payeParFacture.get(f.id) ?? 0;
      return {
        id: f.id,
        numero: f.numero,
        chantier_id: f.chantier_id,
        statut: f.statut,
        total_ttc: total,
        montant_paye_ttc: paye,
        date_echeance: f.echeance,
      };
    }),
    pvs: (pvsRaw ?? []).map((p) => {
      const resArr = Array.isArray(p.reserves) ? p.reserves : [];
      return {
        id: p.id,
        numero: p.numero,
        chantier_id: p.chantier_id,
        statut: p.statut,
        reserves_nb: resArr.length,
      };
    }),
    ticketsSav: (savRaw ?? []).map((t) => ({
      id: t.id,
      numero: t.id.slice(0, 8).toUpperCase(),
      titre: t.description || "Intervention SAV",
      metier: normaliserMetierBna(t.metier),
      statut: t.statut || "ouvert",
      priorite: t.type_garantie || "standard",
    })),
  };
}

export async function GET() {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  try {
    const context = await chargerContexteEntreprise(tenant.entrepriseId);
    const alertes = calculerAlertesProactives(context);
    return NextResponse.json({ ok: true, context, alertes });
  } catch (err) {
    console.error("Erreur GET /api/bna-ia :", err);
    return NextResponse.json(
      { ok: false, error: "Impossible de charger le contexte BNA-IA." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return tenant.reponse;

  try {
    const body = await req.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json(
        { error: "Message manquant." },
        { status: 400 }
      );
    }

    const maintenant = formaterDateFrEuropeParis();
    const rawContext: BnaIaContext =
      body?.context && Array.isArray(body.context.chantiers)
        ? (body.context as BnaIaContext)
        : await chargerContexteEntreprise(tenant.entrepriseId);

    const context: BnaIaContext = {
      ...rawContext,
      currentDateIso: maintenant.dateIso,
      currentDateFr: maintenant.dateFr,
      currentTimeParis: maintenant.heureParis,
    };

    const rawHistory: BnaIaHistoryTurn[] = Array.isArray(body?.history)
      ? (body.history as Array<{ role?: unknown; content?: unknown }>)
          .filter(
            (h) =>
              (h?.role === "user" || h?.role === "assistant") &&
              typeof h?.content === "string" &&
              h.content.trim().length > 0
          )
          .slice(-50)
          .map((h) => ({
            role: h.role as "user" | "assistant",
            content: (h.content as string).trim(),
          }))
      : [];
    const history = sanitizeHistoryForLlm(rawHistory);

    const dernierPreChiffrage =
      typeof body?.dernierPreChiffrage === "string" &&
      body.dernierPreChiffrage.trim().length > 0
        ? body.dernierPreChiffrage.trim()
        : null;

    const normalisation = normaliserRequeteMetier(message);
    const messageNormalise = normalisation.texteNormalise;
    const preChiffrage = detecterEtCalculerPreChiffrage(messageNormalise);
    const nbJoursEstime = preChiffrage
      ? Math.max(1, Math.ceil(preChiffrage.heuresPoseTotal / 7))
      : 1;

    // Météo Open-Meteo (5 jours) + Déplacement depuis Générac (33920) en parallèle sur toute ville libre
    // (« à / sur / vers / pour + Ville »), y compris reprise depuis l'historique pour les questions de suivi
    const villeDansMessage =
      extraireVilleMeteoLibre(messageNormalise) ||
      extraireDestinationLibre(messageNormalise);
    const villeDansHistorique = !villeDansMessage
      ? [...history]
          .reverse()
          .filter((h) => h.role === "user")
          .map(
            (h) =>
              extraireVilleMeteoLibre(h.content) ||
              extraireDestinationLibre(h.content)
          )
          .find((v): v is string => Boolean(v)) ?? null
      : null;
    const destinationLibre = villeDansMessage || villeDansHistorique;

    if (destinationLibre) {
      const dejaDansChantier = context.chantiers.some(
        (c) =>
          c.previsionsMeteo3J &&
          c.previsionsMeteo3J.length > 0 &&
          c.ville?.toLowerCase().includes(destinationLibre.toLowerCase())
      );
      const deptsFrance = adresseVersDepartements(destinationLibre);
      const tarifKm = await lireTarifCommercial(tenant.entrepriseId).catch(() => 1.0);

      const [meteoLibre, depLibre, vigLibre] = await Promise.all([
        !dejaDansChantier
          ? chargerMeteoChantier3Jours(destinationLibre)
          : Promise.resolve(null),
        chargerDeplacementDepuisGenerac(destinationLibre, tarifKm, nbJoursEstime),
        deptsFrance.length > 0
          ? chargerVigilanceMeteoFrance(deptsFrance)
          : Promise.resolve([]),
      ]);

      if (
        (meteoLibre && meteoLibre.previsions.length > 0) ||
        vigLibre.length > 0
      ) {
        context.meteoVilleLibre = {
          ville: destinationLibre,
          previsions: meteoLibre?.previsions ?? [],
          vigilanceMf: vigLibre.length > 0 ? vigLibre : undefined,
        };
      }
      if (depLibre) {
        context.deplacementVilleLibre = depLibre;
      }
    }

    const escalade = detecterChantierComplexe(messageNormalise, preChiffrage);
    const actions = detectBnaIaActions(messageNormalise, context);

    const groqKey = process.env.GROQ_API_KEY?.trim() || "";
    const geminiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      "";
    const mistralKey = process.env.MISTRAL_API_KEY?.trim() || "";

    if (!groqKey && !geminiKey && !mistralKey) {
      return NextResponse.json(
        {
          error:
            "Aucune clé Cloud LLM configurée sur le serveur (GROQ_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY, MISTRAL_API_KEY).",
        },
        { status: 503 }
      );
    }

    const systemPrompt = buildSystemPromptContext(
      context,
      preChiffrage,
      normalisation,
      escalade,
      dernierPreChiffrage
    );

    const llmErrors: string[] = [];
    let llmText: string | null = null;
    let providerName = "";

    // Chaîne Cloud LLM : Groq (#1) -> Gemini (#2) -> Mistral (#3)
    if (groqKey) {
      const groqRes = await callGroqLlm(
        systemPrompt,
        messageNormalise,
        groqKey,
        history
      );
      if (groqRes.ok) {
        llmText = groqRes.text;
        providerName = `Groq (${groqRes.modelUsed || "openai/gpt-oss-120b"})`;
      } else {
        llmErrors.push(groqRes.error);
      }
    }

    if (!llmText && geminiKey) {
      const geminiRes = await callGeminiLlm(
        systemPrompt,
        messageNormalise,
        geminiKey,
        history
      );
      if (geminiRes.ok) {
        llmText = geminiRes.text;
        providerName = `Gemini (${geminiRes.modelUsed || "gemini-2.5-flash"})`;
      } else {
        llmErrors.push(geminiRes.error);
      }
    }

    if (!llmText && mistralKey) {
      const mistralRes = await callMistralLlm(
        systemPrompt,
        messageNormalise,
        mistralKey,
        history
      );
      if (mistralRes.ok) {
        llmText = mistralRes.text;
        providerName = `Mistral (${mistralRes.modelUsed || "mistral-small-latest"})`;
      } else {
        llmErrors.push(mistralRes.error);
      }
    }

    if (llmText) {
      return NextResponse.json({
        content: llmText,
        actions,
        tags: [
          providerName,
          "BNA-IA Cloud",
          ...(preChiffrage ? ["Pré-chiffrage Certifié"] : []),
        ],
        source: "cloud_llm",
        preChiffrageTexte: preChiffrage?.syntheseTexte ?? null,
      });
    }

    const technicalError = `Tous les fournisseurs Cloud LLM ont échoué : ${llmErrors.join(" | ")}`;
    console.error("Erreur Cloud LLM POST /api/bna-ia :", technicalError);
    return NextResponse.json(
      {
        error: technicalError,
        details: llmErrors,
      },
      { status: 502 }
    );
  } catch (err) {
    console.error("Erreur POST /api/bna-ia :", err);
    return NextResponse.json(
      { error: "Erreur lors du traitement de la requête BNA-IA." },
      { status: 500 }
    );
  }
}
