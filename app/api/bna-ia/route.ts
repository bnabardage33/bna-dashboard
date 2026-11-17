import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import {
  buildSystemPromptContext,
  calculerAlertesProactives,
  detecterChantierComplexe,
  evaluerAlertesDtuMeteoJour,
  formaterDateFrEuropeParis,
  generateLocalAssistantResponse,
  normaliserMetierBna,
  type BnaIaChantierCtx,
  type BnaIaContext,
  type BnaIaHistoryTurn,
  type BnaIaPrevisionJourCtx,
} from "@/lib/bnaIaService";
import { detecterEtCalculerPreChiffrage } from "@/lib/bnaIaPreChiffrage";
import { normaliserRequeteMetier } from "@/lib/bnaDictionnaireMetier";
import { libelleConditionsWmo } from "@/lib/meteoOpenMeteo";

export const dynamic = "force-dynamic";

const LLM_TIMEOUT_MS = 18_000;
const DEFAULT_GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
];

async function callGeminiLlm(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  history: BnaIaHistoryTurn[] = []
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey.trim()
    )}`;
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
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      return parts.map((p: { text?: string }) => p.text || "").join("").trim() || null;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callGroqLlm(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  history: BnaIaHistoryTurn[] = []
): Promise<{ text: string; modelUsed: string } | null> {
  const modelsToTry = [
    ...(process.env.GROQ_MODEL ? [process.env.GROQ_MODEL] : []),
    ...DEFAULT_GROQ_MODELS,
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

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
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (text) return { text, modelUsed: model };
    } catch {
      // Essayer modèle suivant
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function isComplexOrConversationalQuery(
  message: string,
  localTags: string[],
  hasFollowUpContext: boolean,
  hasNewPreChiffrage: boolean
): boolean {
  const lower = message.toLowerCase();
  if (!hasNewPreChiffrage && hasFollowUpContext) return true;
  if (localTags.includes("Copilote BNA") || localTags.includes("Suivi Conversationnel")) return true;
  if (
    lower.includes("ça va") ||
    lower.includes("merci") ||
    lower.includes("pourquoi") ||
    lower.includes("explique") ||
    lower.includes("rédige") ||
    lower.includes("redige") ||
    lower.includes("courrier") ||
    message.length > 100
  ) {
    return true;
  }
  return false;
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

    // 2. Prévisions gratuites Open-Meteo 3 jours (zéro quota Visual Crossing)
    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,wind_gusts_10m_max,weather_code` +
      `&timezone=Europe%2FParis&forecast_days=3`;
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

    const previsions: BnaIaPrevisionJourCtx[] = daily.time.slice(0, 3).map((date, idx) => {
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

    const history: BnaIaHistoryTurn[] = Array.isArray(body?.history)
      ? (body.history as Array<{ role?: unknown; content?: unknown }>)
          .filter(
            (h) =>
              (h?.role === "user" || h?.role === "assistant") &&
              typeof h?.content === "string" &&
              h.content.trim().length > 0
          )
          .slice(-10)
          .map((h) => ({
            role: h.role as "user" | "assistant",
            content: (h.content as string).trim(),
          }))
      : [];

    const dernierPreChiffrage =
      typeof body?.dernierPreChiffrage === "string" &&
      body.dernierPreChiffrage.trim().length > 0
        ? body.dernierPreChiffrage.trim()
        : null;

    const normalisation = normaliserRequeteMetier(message);
    const messageNormalise = normalisation.texteNormalise;
    const preChiffrage = detecterEtCalculerPreChiffrage(messageNormalise);
    const escalade = detecterChantierComplexe(messageNormalise, preChiffrage);
    const localResponse = generateLocalAssistantResponse(messageNormalise, context, {
      history,
      dernierPreChiffrage,
    });

    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    const hasAnyLlmKey = Boolean(groqKey || geminiKey);
    const hasFollowUpContext = history.length > 0 || Boolean(dernierPreChiffrage);

    if (
      hasAnyLlmKey &&
      isComplexOrConversationalQuery(
        messageNormalise,
        localResponse.tags,
        hasFollowUpContext,
        Boolean(preChiffrage)
      )
    ) {
      const systemPrompt = buildSystemPromptContext(
        context,
        preChiffrage,
        normalisation,
        escalade,
        dernierPreChiffrage
      );
      let llmText: string | null = null;
      let providerName = "";

      if (groqKey) {
        const groqResult = await callGroqLlm(
          systemPrompt,
          messageNormalise,
          groqKey,
          history
        );
        if (groqResult) {
          llmText = groqResult.text;
          providerName = `Groq (${groqResult.modelUsed})`;
        }
      }
      if (!llmText && geminiKey) {
        llmText = await callGeminiLlm(
          systemPrompt,
          messageNormalise,
          geminiKey,
          history
        );
        if (llmText) providerName = "Gemini 2.5 Flash";
      }

      if (llmText) {
        return NextResponse.json({
          content: llmText,
          actions: localResponse.actions,
          tags: [providerName, "BNA-IA Cloud"],
          source: "cloud_llm",
          preChiffrageTexte: preChiffrage?.syntheseTexte ?? null,
        });
      }
    }

    return NextResponse.json({
      content: localResponse.content,
      actions: localResponse.actions,
      tags: ["Moteur Local BNA", ...localResponse.tags],
      source: "bna_expert_engine",
      preChiffrageTexte: preChiffrage?.syntheseTexte ?? null,
    });
  } catch (err) {
    console.error("Erreur POST /api/bna-ia :", err);
    return NextResponse.json(
      { error: "Erreur lors du traitement de la requête BNA-IA." },
      { status: 500 }
    );
  }
}
