import { supabase } from "@/lib/supabase";
import type { BnaIaMessage } from "@/lib/bnaIaService";
import type { Json } from "@/types/supabase";

export type MetierConversationBna = "bardage" | "terrasse" | "cloture" | "general";

export interface BnaIaSavedConversation {
  id: string;
  entreprise_id?: string | null;
  titre: string;
  metier: MetierConversationBna;
  messages: BnaIaMessage[];
  dernier_prechiffrage: string | null;
  nb_messages: number;
  created_at: string;
  updated_at: string;
  source?: "supabase" | "local";
}

const LOCAL_STORAGE_PREFIX = "bna_ia_saved_conversations_v1";

function getLocalStorageKey(entrepriseId?: string | null): string {
  const scope = entrepriseId && entrepriseId.trim() ? entrepriseId.trim() : "default";
  return `${LOCAL_STORAGE_PREFIX}_${scope}`;
}

export function estConversationSystemeSeulement(messages: BnaIaMessage[]): boolean {
  return !messages.some(
    (m) =>
      m.id !== "welcome-bna-ia" &&
      !m.id.startsWith("reset-") &&
      m.content.trim().length > 0
  );
}

export function preparerMessagesPourSauvegarde(messages: BnaIaMessage[]): BnaIaMessage[] {
  const utiles = messages.filter(
    (m) =>
      m.id !== "welcome-bna-ia" &&
      !m.id.startsWith("reset-") &&
      m.content.trim().length > 0
  );
  const source = utiles.length > 0 ? utiles : messages;
  return source.map((m) => ({
    ...m,
    imageBase64: undefined,
  }));
}

export function genererTitreConversation(
  messages: BnaIaMessage[],
  now: Date = new Date()
): string {
  const firstUser = messages.find(
    (m) =>
      m.role === "user" &&
      m.id !== "welcome-bna-ia" &&
      !m.id.startsWith("reset-") &&
      m.content.trim().length > 0
  );

  if (!firstUser) {
    const dateStr = now.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    return `Conversation BNA-IA du ${dateStr}`;
  }

  const nettoye = firstUser.content
    .replace(/\*\*/g, "")
    .replace(/[*_`#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (nettoye.length <= 64) {
    return nettoye;
  }

  const coupe = nettoye.slice(0, 64);
  const dernierEspace = coupe.lastIndexOf(" ");
  const finalCoupe = dernierEspace >= 36 ? coupe.slice(0, dernierEspace) : coupe;
  return `${finalCoupe.trim()}…`;
}

export function detecterMetierConversation(
  messages: BnaIaMessage[],
  dernierPreChiffrage?: string | null
): MetierConversationBna {
  const texte = [
    ...messages
      .filter((m) => m.id !== "welcome-bna-ia" && !m.id.startsWith("reset-"))
      .map((m) => m.content),
    dernierPreChiffrage || "",
  ]
    .join(" ")
    .toLowerCase();

  if (!texte.trim()) return "general";

  const scores: Record<Exclude<MetierConversationBna, "general">, number> = {
    bardage: 0,
    terrasse: 0,
    cloture: 0,
  };

  if (/\bbardage\b|\bclaire[- ]voie\b|\bfibre[- ]ciment\b|\bhpl\b|\btresse\b|\bdtu\s*41\.2\b|\bdtu\s*45\.4\b/.test(texte)) {
    scores.bardage += 2;
  }
  if (/\bterrasse\b|\blambourde\b|\bplot\b|\bpiscine\s+mobile\b|\bdtu\s*51\.4\b|\bnf\s*p90[- ]308\b/.test(texte)) {
    scores.terrasse += 2;
  }
  if (/\bcl[oô]ture\b|\bportillon\b|\bpoteau\b|\boccultant\b|\bpann?eau\b/.test(texte)) {
    scores.cloture += 2;
  }

  const entries = Object.entries(scores) as Array<[Exclude<MetierConversationBna, "general">, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : "general";
}

export function getBadgeMetierConversation(metier: MetierConversationBna): {
  label: string;
  className: string;
} {
  switch (metier) {
    case "bardage":
      return {
        label: "Bardage",
        className: "border-[#B85B2B]/30 bg-[#B85B2B]/10 text-[#B85B2B]",
      };
    case "terrasse":
      return {
        label: "Terrasse",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    case "cloture":
      return {
        label: "Clôture",
        className: "border-sky-200 bg-sky-50 text-sky-800",
      };
    default:
      return {
        label: "Général",
        className: "border-[#E5E5E5] bg-[#F8F9FA] text-[#555555]",
      };
  }
}

export function normaliserMetierConversation(raw: unknown): MetierConversationBna {
  if (raw === "bardage" || raw === "terrasse" || raw === "cloture" || raw === "general") {
    return raw;
  }
  return "general";
}

export function formaterDateConversationFr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function lireConversationsLocales(
  entrepriseId?: string | null
): BnaIaSavedConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getLocalStorageKey(entrepriseId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BnaIaSavedConversation[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.id === "string" && Array.isArray(c.messages))
      .map((c) => ({
        ...c,
        metier: normaliserMetierConversation(c.metier),
        nb_messages: typeof c.nb_messages === "number" ? c.nb_messages : c.messages.length,
        dernier_prechiffrage:
          typeof c.dernier_prechiffrage === "string" ? c.dernier_prechiffrage : null,
      }));
  } catch {
    return [];
  }
}

export function ecrireConversationsLocales(
  conversations: BnaIaSavedConversation[],
  entrepriseId?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      getLocalStorageKey(entrepriseId),
      JSON.stringify(conversations.slice(0, 50))
    );
  } catch {
    // Ignorer erreur de quota navigateur
  }
}

export function fusionnerConversations(
  remote: BnaIaSavedConversation[],
  local: BnaIaSavedConversation[]
): BnaIaSavedConversation[] {
  const map = new Map<string, BnaIaSavedConversation>();
  for (const item of local) {
    map.set(item.id, item);
  }
  for (const item of remote) {
    map.set(item.id, item);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

function parserMessagesJson(raw: Json): BnaIaMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is { [key: string]: Json | undefined } =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item)
    )
    .map((item, idx) => ({
      id: typeof item.id === "string" ? item.id : `restored-${idx}`,
      role: item.role === "user" ? "user" : "assistant",
      content: typeof item.content === "string" ? item.content : "",
      timestamp:
        typeof item.timestamp === "string"
          ? item.timestamp
          : new Date().toISOString(),
      tags: Array.isArray(item.tags)
        ? item.tags.filter((t): t is string => typeof t === "string")
        : undefined,
      actions: Array.isArray(item.actions)
        ? (item.actions as unknown as BnaIaMessage["actions"])
        : undefined,
      provider: typeof item.provider === "string" ? item.provider : undefined,
    }));
}

function genererUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listerConversationsSauvegardees(
  entrepriseId?: string | null
): Promise<{
  conversations: BnaIaSavedConversation[];
  syncSupabase: boolean;
}> {
  const locales = lireConversationsLocales(entrepriseId);

  if (!entrepriseId) {
    return {
      conversations: fusionnerConversations([], locales),
      syncSupabase: false,
    };
  }

  try {
    const { data, error } = await supabase
      .from("bna_ia_conversations")
      .select(
        "id, entreprise_id, titre, metier, messages, dernier_prechiffrage, nb_messages, created_at, updated_at"
      )
      .eq("entreprise_id", entrepriseId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error || !data) {
      return {
        conversations: fusionnerConversations([], locales),
        syncSupabase: false,
      };
    }

    const distantes: BnaIaSavedConversation[] = data.map((row) => {
      const msgs = parserMessagesJson(row.messages);
      return {
        id: row.id,
        entreprise_id: row.entreprise_id,
        titre: row.titre,
        metier: normaliserMetierConversation(row.metier),
        messages: msgs,
        dernier_prechiffrage: row.dernier_prechiffrage,
        nb_messages: row.nb_messages ?? msgs.length,
        created_at: row.created_at,
        updated_at: row.updated_at,
        source: "supabase",
      };
    });

    const localesSeulement = locales.filter(
      (l) => l.source === "local" && !distantes.some((d) => d.id === l.id)
    );
    const fusion = fusionnerConversations(distantes, localesSeulement);
    ecrireConversationsLocales(fusion, entrepriseId);

    return {
      conversations: fusion,
      syncSupabase: true,
    };
  } catch {
    return {
      conversations: fusionnerConversations([], locales),
      syncSupabase: false,
    };
  }
}

export async function sauvegarderConversationBnaIa(params: {
  entrepriseId?: string | null;
  titre: string;
  messages: BnaIaMessage[];
  dernierPreChiffrage: string | null;
}): Promise<{
  conversation: BnaIaSavedConversation;
  syncSupabase: boolean;
}> {
  const nowIso = new Date().toISOString();
  const messagesNettoyes = preparerMessagesPourSauvegarde(params.messages);
  const titreFinal =
    params.titre.trim() || genererTitreConversation(messagesNettoyes);
  const metier = detecterMetierConversation(
    messagesNettoyes,
    params.dernierPreChiffrage
  );

  const fallbackLocal: BnaIaSavedConversation = {
    id: genererUuid(),
    entreprise_id: params.entrepriseId ?? null,
    titre: titreFinal,
    metier,
    messages: messagesNettoyes,
    dernier_prechiffrage: params.dernierPreChiffrage,
    nb_messages: messagesNettoyes.length,
    created_at: nowIso,
    updated_at: nowIso,
    source: "local",
  };

  if (params.entrepriseId) {
    try {
      const { data, error } = await supabase
        .from("bna_ia_conversations")
        .insert({
          id: fallbackLocal.id,
          entreprise_id: params.entrepriseId,
          titre: titreFinal,
          metier,
          messages: messagesNettoyes as unknown as Json,
          dernier_prechiffrage: params.dernierPreChiffrage,
          nb_messages: messagesNettoyes.length,
        })
        .select(
          "id, entreprise_id, titre, metier, messages, dernier_prechiffrage, nb_messages, created_at, updated_at"
        )
        .single();

      if (!error && data) {
        const saved: BnaIaSavedConversation = {
          id: data.id,
          entreprise_id: data.entreprise_id,
          titre: data.titre,
          metier: normaliserMetierConversation(data.metier),
          messages: parserMessagesJson(data.messages),
          dernier_prechiffrage: data.dernier_prechiffrage,
          nb_messages: data.nb_messages,
          created_at: data.created_at,
          updated_at: data.updated_at,
          source: "supabase",
        };
        const actuelles = lireConversationsLocales(params.entrepriseId);
        ecrireConversationsLocales(
          fusionnerConversations([saved], actuelles),
          params.entrepriseId
        );
        return { conversation: saved, syncSupabase: true };
      }
    } catch {
      // Bascule silencieuse sur localStorage si table non appliquée ou hors-ligne
    }
  }

  const actuelles = lireConversationsLocales(params.entrepriseId);
  ecrireConversationsLocales(
    fusionnerConversations([], [fallbackLocal, ...actuelles]),
    params.entrepriseId
  );
  return { conversation: fallbackLocal, syncSupabase: false };
}

export async function supprimerConversationSauvegardee(params: {
  id: string;
  entrepriseId?: string | null;
}): Promise<{ syncSupabase: boolean }> {
  const actuelles = lireConversationsLocales(params.entrepriseId).filter(
    (c) => c.id !== params.id
  );
  ecrireConversationsLocales(actuelles, params.entrepriseId);

  if (!params.entrepriseId) {
    return { syncSupabase: false };
  }

  try {
    const { error } = await supabase
      .from("bna_ia_conversations")
      .delete()
      .eq("id", params.id)
      .eq("entreprise_id", params.entrepriseId);

    return { syncSupabase: !error };
  } catch {
    return { syncSupabase: false };
  }
}
