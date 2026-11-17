import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import {
  buildSystemPromptContext,
  calculerAlertesProactives,
  detecterChantierComplexe,
  generateLocalAssistantResponse,
  normaliserMetierBna,
  type BnaIaContext,
} from "@/lib/bnaIaService";
import { detecterEtCalculerPreChiffrage } from "@/lib/bnaIaPreChiffrage";
import { normaliserRequeteMetier } from "@/lib/bnaDictionnaireMetier";

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
  apiKey: string
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey.trim()
    )}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
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
  apiKey: string
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
  localTags: string[]
): boolean {
  const lower = message.toLowerCase();
  if (localTags.includes("Copilote BNA")) return true;
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

async function chargerContexteEntreprise(entrepriseId: string): Promise<BnaIaContext> {
  const supabase = await createClient();
  const currentDateIso = new Date().toISOString().slice(0, 10);

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

  return {
    userName: "Dirigeant BNA",
    currentDateIso,
    chantiers: (chantiersRaw ?? []).map((c) => {
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
    }),
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

    const context: BnaIaContext =
      body?.context && Array.isArray(body.context.chantiers)
        ? (body.context as BnaIaContext)
        : await chargerContexteEntreprise(tenant.entrepriseId);

    const normalisation = normaliserRequeteMetier(message);
    const messageNormalise = normalisation.texteNormalise;
    const preChiffrage = detecterEtCalculerPreChiffrage(messageNormalise);
    const escalade = detecterChantierComplexe(messageNormalise, preChiffrage);
    const localResponse = generateLocalAssistantResponse(messageNormalise, context);

    const groqKey = process.env.GROQ_API_KEY;
    const geminiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    const hasAnyLlmKey = Boolean(groqKey || geminiKey);

    if (
      hasAnyLlmKey &&
      isComplexOrConversationalQuery(messageNormalise, localResponse.tags)
    ) {
      const systemPrompt = buildSystemPromptContext(
        context,
        preChiffrage,
        normalisation,
        escalade
      );
      let llmText: string | null = null;
      let providerName = "";

      if (groqKey) {
        const groqResult = await callGroqLlm(systemPrompt, messageNormalise, groqKey);
        if (groqResult) {
          llmText = groqResult.text;
          providerName = `Groq (${groqResult.modelUsed})`;
        }
      }
      if (!llmText && geminiKey) {
        llmText = await callGeminiLlm(systemPrompt, messageNormalise, geminiKey);
        if (llmText) providerName = "Gemini 2.5 Flash";
      }

      if (llmText) {
        return NextResponse.json({
          content: llmText,
          actions: localResponse.actions,
          tags: [providerName, "BNA-IA Cloud"],
          source: "cloud_llm",
        });
      }
    }

    return NextResponse.json({
      content: localResponse.content,
      actions: localResponse.actions,
      tags: ["Moteur Local BNA", ...localResponse.tags],
      source: "bna_expert_engine",
    });
  } catch (err) {
    console.error("Erreur POST /api/bna-ia :", err);
    return NextResponse.json(
      { error: "Erreur lors du traitement de la requête BNA-IA." },
      { status: 500 }
    );
  }
}
