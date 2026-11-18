"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Loader2, Send, Sparkles, X } from "lucide-react";

interface MiniMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const PROMPTS_RAPIDES = [
  {
    label: "Calculer une terrasse",
    prompt: "Calcule les besoins pour une terrasse bois de 30 m² (5m x 6m) sur plots.",
  },
  {
    label: "Aide calepinage façade",
    prompt: "Aide-moi à préparer un calepinage de bardage bois claire-voie sur 45 m².",
  },
  {
    label: "Règles DTU",
    prompt: "Rappelle les points clés DTU 41.2 (bardage bois) et DTU 51.4 (terrasse).",
  },
  {
    label: "Calculer des quantitatifs",
    prompt: "Donne-moi un pré-chiffrage rapide pour une clôture composite de 24 ml hauteur 1,80 m.",
  },
];

export interface BnaCopilotMiniPanelProps {
  onClose?: () => void;
  className?: string;
}

export default function BnaCopilotMiniPanel({
  onClose,
  className = "",
}: BnaCopilotMiniPanelProps) {
  const [messages, setMessages] = useState<MiniMessage[]>([
    {
      id: "init",
      role: "assistant",
      content:
        "Bonjour ! Je suis BNA AI, votre copilote BTP. Posez une question ou choisissez un raccourci ci-dessous.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const envoyer = async (texteForce?: string) => {
    const texte = (texteForce ?? input).trim();
    if (!texte || sending) return;
    if (!texteForce) setInput("");

    const userMsg: MiniMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: texte,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setSending(true);

    try {
      const res = await fetch("/api/bna-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: texte,
          stream: false,
          history: nextHistory
            .filter((m) => m.id !== "init")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      let replyText = "";
      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === "[DONE]") continue;
            try {
              const parsed = JSON.parse(raw) as { token?: string; reply?: string };
              if (parsed.token) replyText += parsed.token;
              if (parsed.reply) replyText = parsed.reply;
            } catch {
              // Ignorer chunk partiel
            }
          }
        }
      } else {
        const data = (await res.json()) as { reply?: string; message?: string };
        replyText = data.reply || data.message || "Réponse reçue.";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: replyText || "Réponse indisponible.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Connexion au copilote BNA-IA momentanément indisponible.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={`flex flex-col rounded-2xl border border-[#D96B27]/25 bg-gradient-to-b from-[#1B1511] to-[#14110F] text-white shadow-2xl overflow-hidden ${className}`}
    >
      {/* En-tête */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3.5 bg-white/[0.03]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#D96B27]/20 border border-[#D96B27]/40 text-[#F59E0B]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate">
              BNA AI <span className="text-[#D96B27]">•</span> Assistant BTP
            </h2>
            <p className="text-[11px] text-amber-100/60 truncate">
              Votre assistant BTP connecté
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href="/terrain/bna-ia"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-white/10"
            title="Ouvrir le Centre de Contrôle BNA-IA"
          >
            Plein écran
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white"
              aria-label="Fermer BNA AI"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Prompts rapides */}
      <div className="shrink-0 grid grid-cols-2 gap-1.5 p-3 border-b border-white/10 bg-black/20">
        {PROMPTS_RAPIDES.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={sending}
            onClick={() => envoyer(p.prompt)}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left text-[11px] font-semibold text-amber-100/90 hover:border-[#D96B27]/50 hover:bg-[#D96B27]/15 transition-colors disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Fil de messages */}
      <div className="flex-1 min-h-[220px] max-h-[380px] overflow-y-auto p-3 space-y-2.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.role === "assistant" && (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#D96B27]/20 text-[#F59E0B] mt-0.5">
                <Bot className="h-3.5 w-3.5" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-[#D96B27] text-white font-medium"
                  : "border border-white/10 bg-white/[0.05] text-gray-200"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-amber-200/70 px-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D96B27]" />
            <span>BNA AI analyse votre demande...</span>
          </div>
        )}
      </div>

      {/* Saisie */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          envoyer();
        }}
        className="shrink-0 flex items-center gap-2 border-t border-white/10 p-3 bg-black/25"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Poser une question BTP..."
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder-gray-400 focus:border-[#D96B27] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#D96B27] text-white hover:bg-[#C25A1A] disabled:opacity-40 transition-colors"
          aria-label="Envoyer à BNA AI"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
