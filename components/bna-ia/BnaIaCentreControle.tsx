"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import {
  type BnaIaAction,
  type BnaIaAlerteProactive,
  type BnaIaContext,
  type BnaIaMessage,
} from "@/lib/bnaIaService";

const CHAT_STORAGE_KEY = "bna_ia_chat_v1";

const QUICK_PROMPTS = [
  {
    label: "📋 Briefing du jour",
    prompt: "Fais-moi le briefing du jour sur mes chantiers Bardage, Terrasse et Clôture.",
  },
  {
    label: "💶 Trésorerie & Marges",
    prompt: "Quel est mon bilan trésorerie, marge brute et factures échues ?",
  },
  {
    label: "🌤️ Météo & Pose DTU",
    prompt: "Vérifie la vigilance météo sur mes chantiers et les conditions de pose DTU.",
  },
  {
    label: "📐 DTU 51.4 / 41.2 / P90-308",
    prompt: "Rappelle-moi les règles DTU 51.4, DTU 41.2 et NF P90-308.",
  },
  {
    label: "🏊 Chiffrage Terrasse Mobile",
    prompt: "Explique les points clés pour chiffrer une Terrasse Mobile motorisée NF P90-308.",
  },
  {
    label: "🧱 Clôture & Poteaux",
    prompt: "Rappelle les règles de pose Clôture, poteaux sans doublon, redans et soubassement.",
  },
  {
    label: "🛡️ PV Réception & SAV",
    prompt: "Quels sont mes tickets SAV ouverts et mes réserves PV à lever ?",
  },
  {
    label: "📦 Commandes en retard",
    prompt: "Quel est l'état de mes commandes fournisseurs et des retards de livraison ?",
  },
];

function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <strong key={idx} className="font-bold">
        {part}
      </strong>
    ) : (
      <span key={idx}>{part}</span>
    )
  );
}

function renderBnaMessageContent(content: string, isUser: boolean): React.ReactNode {
  const lines = content.split("\n");
  return (
    <div className="space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={i} className="h-1.5" />;
        }
        const headingMatch =
          trimmed.match(/^#{1,3}\s+(.+)$/) || trimmed.match(/^===\s*(.+?)\s*===$/);
        if (headingMatch) {
          return (
            <p
              key={i}
              className={`font-bold ${
                isUser ? "text-white" : "text-[#23272B]"
              } ${i > 0 ? "pt-1.5" : ""}`}
            >
              {renderInlineBold(headingMatch[1])}
            </p>
          );
        }
        return <p key={i}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

export default function BnaIaCentreControle() {
  const router = useRouter();
  const [context, setContext] = useState<BnaIaContext | null>(null);
  const [alertes, setAlertes] = useState<BnaIaAlerteProactive[]>([]);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [messages, setMessages] = useState<BnaIaMessage[]>([]);
  const [dernierPreChiffrage, setDernierPreChiffrage] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);

  // Dictée Whisper via /api/transcrire-note
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chargerContexte = useCallback(async () => {
    setLoadingCtx(true);
    try {
      const res = await fetch("/api/bna-ia", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json?.context) setContext(json.context);
        if (Array.isArray(json?.alertes)) setAlertes(json.alertes);
      }
    } finally {
      setLoadingCtx(false);
    }
  }, []);

  useEffect(() => {
    chargerContexte();
  }, [chargerContexte]);

  useEffect(() => {
    try {
      const savedPre = localStorage.getItem("bna_ia_dernier_prechiffrage_v1");
      if (savedPre) setDernierPreChiffrage(savedPre);
    } catch {
      // Ignorer localStorage invalide
    }
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as BnaIaMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
      // Ignorer localStorage invalide
    }
    setMessages([
      {
        id: "welcome-bna-ia",
        role: "assistant",
        content:
          "Bonjour ! Je suis **BNA-IA**, votre copilote connecté aux 3 métiers (**Bardage**, **Terrasse & Mobile**, **Clôture**), au planning, aux commandes fournisseurs et au suivi financier. Utilisez un raccourci ci-dessus ou dictez votre demande au micro.",
        timestamp: new Date().toISOString(),
        tags: ["BNA-IA Connecté"],
      },
    ]);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
      } catch {
        // Ignorer quota
      }
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const envoyerMessage = async (texteForce?: string) => {
    const contenu = (texteForce ?? input).trim();
    if (!contenu || isSending) return;

    const userMsg: BnaIaMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: contenu,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!texteForce) setInput("");
    setIsSending(true);

    try {
      const historyPayload = messages
        .filter(
          (m) =>
            m.id !== "welcome-bna-ia" &&
            !m.tags?.includes("Erreur Cloud LLM") &&
            m.content.trim().length > 0
        )
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));
      const res = await fetch("/api/bna-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: contenu,
          context,
          history: historyPayload,
          dernierPreChiffrage,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.content) {
        const preTexte =
          typeof data.preChiffrageTexte === "string" && data.preChiffrageTexte.trim()
            ? data.preChiffrageTexte.trim()
            : Array.isArray(data.tags) && data.tags.includes("Pré-chiffrage Certifié")
              ? data.content
              : null;
        if (preTexte) {
          setDernierPreChiffrage(preTexte);
          try {
            localStorage.setItem("bna_ia_dernier_prechiffrage_v1", preTexte);
          } catch {
            // Ignorer quota
          }
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `ast-${Date.now()}`,
            role: "assistant",
            content: data.content,
            timestamp: new Date().toISOString(),
            actions: data.actions,
            tags: data.tags,
            source: data.source,
          },
        ]);
      } else {
        const errMessage =
          typeof data?.error === "string" && data.error.trim()
            ? data.error.trim()
            : `Erreur HTTP ${res.status} lors de l'appel au Cloud LLM (/api/bna-ia).`;
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `⚠️ **Erreur technique BNA-IA Cloud**\n${errMessage}`,
            timestamp: new Date().toISOString(),
            tags: ["Erreur Cloud LLM"],
          },
        ]);
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ **Erreur réseau BNA-IA Cloud**\n${errMessage}`,
          timestamp: new Date().toISOString(),
          tags: ["Erreur Cloud LLM"],
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const executerAction = async (messageId: string, action: BnaIaAction) => {
    if (action.executed || executingId) return;
    setExecutingId(action.id);
    try {
      if (action.type === "create_devis" && action.payload.devisPrefill) {
        localStorage.setItem(
          "bna_prefill_devis_terrasse",
          JSON.stringify(action.payload.devisPrefill)
        );
        router.push("/bureau/devis-factures");
        return;
      }

      if (action.type === "open_calepineur_3d") {
        if (action.payload.calepineurPrefill) {
          localStorage.setItem(
            "bna_prefill_calepineur_3d",
            JSON.stringify(action.payload.calepineurPrefill)
          );
        }
        router.push(action.payload.href || "/terrain/chantier");
        return;
      }

      if (
        action.type === "open_hub" ||
        action.type === "open_planning" ||
        action.type === "open_devis" ||
        action.type === "open_commandes" ||
        action.type === "open_sav" ||
        action.type === "open_fin_chantier"
      ) {
        if (action.payload.href) router.push(action.payload.href);
        return;
      }

      if (action.type === "update_avancement" && action.payload.chantierId) {
        const pct = action.payload.nouvelAvancement ?? 50;
        const { data: chRow } = await supabase
          .from("chantiers")
          .select("checklist")
          .eq("id", action.payload.chantierId)
          .maybeSingle();
        const clActuelle =
          chRow?.checklist && typeof chRow.checklist === "object"
            ? (chRow.checklist as Record<string, unknown>)
            : {};
        const nouveauStatut = pct >= 100 ? "termine" : pct > 0 ? "en_cours" : "prevu";
        const { error } = await supabase
          .from("chantiers")
          .update({
            statut: nouveauStatut,
            checklist: { ...clActuelle, avancement_manuel: pct },
          })
          .eq("id", action.payload.chantierId);
        if (error) throw error;
        await chargerContexte();
      } else if (action.type === "shift_planning" && action.payload.chantierId) {
        const decalage = action.payload.decalageJours ?? 1;
        const ch = context?.chantiers.find((c) => c.id === action.payload.chantierId);
        const baseDebut = ch?.date_debut
          ? new Date(`${ch.date_debut}T12:00:00`)
          : new Date();
        const baseFin = ch?.date_fin
          ? new Date(`${ch.date_fin}T12:00:00`)
          : new Date(baseDebut.getTime());
        baseDebut.setDate(baseDebut.getDate() + decalage);
        baseFin.setDate(baseFin.getDate() + decalage);

        const { error } = await supabase
          .from("chantiers")
          .update({
            date_debut: baseDebut.toISOString().slice(0, 10),
            date_fin: baseFin.toISOString().slice(0, 10),
          })
          .eq("id", action.payload.chantierId);
        if (error) throw error;
        await chargerContexte();
      } else if (action.type === "create_note") {
        const { entreprise_id } = await resoudreContexteEntreprise(null);
        if (!entreprise_id) {
          throw new Error("Contexte entreprise introuvable.");
        }
        const { error } = await supabase.from("notes_patron").insert({
          entreprise_id,
          titre: action.payload.noteTitre || "Note BNA-IA",
          contenu: action.payload.noteContenu || action.description,
        });
        if (error) throw error;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                actions: m.actions?.map((a) =>
                  a.id === action.id ? { ...a, executed: true } : a
                ),
              }
            : m
        )
      );
    } catch (err) {
      alert("Impossible d'exécuter l'action : " + ((err as Error)?.message || "Erreur"));
    } finally {
      setExecutingId(null);
    }
  };

  const toggleDictaphone = async () => {
    setMicError(null);
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, "bna-ia.webm");
          const res = await fetch("/api/transcrire-note", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (!res.ok || !data?.texteBrut) {
            setMicError("Transcription indisponible pour cet enregistrement.");
            return;
          }
          setInput((prev) => (prev ? `${prev} ${data.texteBrut}` : data.texteBrut));
        } catch {
          setMicError("Erreur réseau pendant la transcription Whisper.");
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setMicError("Autorisez l'accès au microphone pour dicter votre demande.");
    }
  };

  const viderHistorique = () => {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    setMessages([
      {
        id: `reset-${Date.now()}`,
        role: "assistant",
        content: "Conversation réinitialisée. Que souhaitez-vous piloter ?",
        timestamp: new Date().toISOString(),
        tags: ["BNA-IA Connecté"],
      },
    ]);
  };

  return (
    <div className="min-h-screen bg-[#F3F3F1] pb-24 text-[#23272B]">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
        {/* En-tête blanc unifié */}
        <header className="rounded-2xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#B85B2B]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#B85B2B]">
                <Sparkles className="h-3.5 w-3.5" />
                BNA Pilotage BTP · BNA-IA Centre de Contrôle
              </div>
              <h1 className="mt-2 text-xl font-bold text-[#23272B] sm:text-2xl">
                BNA-IA · Copilote Chantiers &amp; Gestion
              </h1>
              <p className="mt-0.5 text-xs sm:text-sm text-[#666666]">
                Connecté en direct à vos chantiers Bardage, Terrasse &amp; Mobile, Clôture, Planning, Devis, Commandes et SAV.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={chargerContexte}
                disabled={loadingCtx}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2 text-xs font-bold text-[#23272B] hover:bg-white"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-[#B85B2B] ${loadingCtx ? "animate-spin" : ""}`} />
                Actualiser contexte
              </button>
              <button
                type="button"
                onClick={viderHistorique}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2 text-xs font-bold text-[#666666] hover:bg-white hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Nouvelle session
              </button>
            </div>
          </div>

          {context && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#F0F0F0] pt-3 text-xs text-[#666666]">
              <span className="rounded-full border border-[#E5E5E5] bg-[#F8F9FA] px-2.5 py-1 font-semibold text-[#23272B]">
                {context.chantiers.length} chantier(s)
              </span>
              <span className="rounded-full border border-[#E5E5E5] bg-[#F8F9FA] px-2.5 py-1 font-semibold text-[#23272B]">
                {context.commandes.length} commande(s)
              </span>
              <span className="rounded-full border border-[#E5E5E5] bg-[#F8F9FA] px-2.5 py-1 font-semibold text-[#23272B]">
                {context.devis.length} devis · {context.factures.length} facture(s)
              </span>
              <span className="rounded-full border border-[#E5E5E5] bg-[#F8F9FA] px-2.5 py-1 font-semibold text-[#23272B]">
                {context.ticketsSav.length} ticket(s) SAV
              </span>
            </div>
          )}
        </header>

        {/* Bandeau d'Alertes Proactives */}
        <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#23272B]">
              <AlertTriangle className="h-4 w-4 text-[#B85B2B]" />
              Alertes proactives détectées
            </h2>
            <span className="text-xs font-semibold text-[#777777]">
              {alertes.length} alerte(s)
            </span>
          </div>

          {loadingCtx ? (
            <p className="text-xs text-[#777777]">Analyse des données entreprise en cours...</p>
          ) : alertes.length === 0 ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
              Aucune alerte critique : commandes, factures échues, SAV et réserves PV sont sous contrôle.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {alertes.map((a) => (
                <div
                  key={a.id}
                  className={`flex flex-col justify-between gap-2 rounded-xl border p-3 ${
                    a.severite === "haute"
                      ? "border-red-200 bg-red-50/60"
                      : "border-amber-200 bg-amber-50/60"
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-[#23272B]">{a.titre}</p>
                    <p className="mt-0.5 text-[11px] text-[#555555]">{a.detail}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => envoyerMessage(a.promptIA)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#B85B2B] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#9E4B20]"
                    >
                      <Sparkles className="h-3 w-3" />
                      Analyser avec BNA-IA
                    </button>
                    <Link
                      href={a.href}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#23272B] hover:border-[#B85B2B]/40"
                    >
                      Ouvrir le dossier
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Grille des 8 raccourcis intelligents */}
        <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-xs">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-[#777777]">
            Raccourcis intelligents
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp.label}
                type="button"
                onClick={() => envoyerMessage(qp.prompt)}
                className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-left text-xs font-semibold text-[#23272B] transition-colors hover:border-[#B85B2B]/50 hover:bg-white"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </section>

        {/* Zone de conversation */}
        <section className="flex flex-col rounded-2xl border border-[#E5E5E5] bg-white shadow-xs overflow-hidden">
          <div className="min-h-[380px] max-h-[65vh] space-y-4 overflow-y-auto p-4 sm:p-5">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#B85B2B]/10 text-[#B85B2B] border border-[#B85B2B]/25">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] space-y-2 rounded-2xl p-3.5 text-xs sm:text-sm ${
                    m.role === "user"
                      ? "bg-[#B85B2B] text-white"
                      : "border border-[#E5E5E5] bg-[#F8F9FA] text-[#23272B]"
                  }`}
                >
                  {m.tags && m.tags.length > 0 && m.role === "assistant" && (
                    <div className="flex flex-wrap gap-1">
                      {m.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-[#E5E5E5] bg-white px-2 py-0.5 text-[10px] font-bold text-[#666666]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}

                  {renderBnaMessageContent(m.content, m.role === "user")}

                  {m.actions && m.actions.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-[#E5E5E5]">
                      {m.actions.map((act) => (
                        <div
                          key={act.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E5E5E5] bg-white p-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#23272B]">{act.title}</p>
                            <p className="text-[11px] text-[#666666]">{act.description}</p>
                          </div>
                          <button
                            type="button"
                            disabled={act.executed || executingId === act.id}
                            onClick={() => executerAction(m.id, act)}
                            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                              act.executed
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "bg-[#B85B2B] text-white hover:bg-[#9E4B20]"
                            }`}
                          >
                            {act.executed ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Exécutée
                              </>
                            ) : executingId === act.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                En cours...
                              </>
                            ) : (
                              <>
                                Exécuter
                                <ArrowRight className="h-3.5 w-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {m.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#23272B] text-white">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            {isSending && (
              <div className="flex items-center gap-2 text-xs text-[#777777]">
                <Loader2 className="h-4 w-4 animate-spin text-[#B85B2B]" />
                <span>BNA-IA analyse votre demande...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Barre de saisie + Micro Whisper */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              envoyerMessage();
            }}
            className="border-t border-[#E5E5E5] bg-[#F8F9FA] p-3 sm:p-4"
          >
            {micError && (
              <p className="mb-2 text-xs font-medium text-red-600">{micError}</p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleDictaphone}
                disabled={isTranscribing}
                title="Dicter votre demande via Whisper"
                aria-label={isRecording ? "Arrêter la dictée" : "Dicter au micro"}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                  isRecording
                    ? "border-red-300 bg-red-600 text-white animate-pulse"
                    : "border-[#E5E5E5] bg-white text-[#B85B2B] hover:border-[#B85B2B]/50"
                }`}
              >
                {isTranscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isRecording
                    ? "Écoute en cours... Appuyez à nouveau pour transcrire"
                    : "Posez une question (briefing, DTU, avancement, planning, commandes...)"
                }
                className="flex-1 rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2.5 text-xs sm:text-sm text-[#23272B] placeholder-[#999999] focus:border-[#B85B2B] focus:outline-none"
              />

              <button
                type="submit"
                disabled={!input.trim() || isSending}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#B85B2B] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#9E4B20] disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Envoyer</span>
              </button>
            </div>
          </form>
        </section>

        {/* Pied rapide vers Planning */}
        <div className="flex justify-end">
          <Link
            href="/terrain"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B85B2B] hover:underline"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Voir le Planning Général Multi-Métiers
          </Link>
        </div>
      </div>
    </div>
  );
}
