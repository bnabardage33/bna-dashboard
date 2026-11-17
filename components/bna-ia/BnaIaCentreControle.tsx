"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BookmarkPlus,
  Bot,
  CalendarDays,
  Camera,
  CheckCircle2,
  Eye,
  History,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
  Volume2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import {
  type BnaIaAction,
  type BnaIaAlerteProactive,
  type BnaIaContext,
  type BnaIaMessage,
} from "@/lib/bnaIaService";
import {
  estConversationSystemeSeulement,
  formaterDateConversationFr,
  genererTitreConversation,
  getBadgeMetierConversation,
  listerConversationsSauvegardees,
  sauvegarderConversationBnaIa,
  supprimerConversationSauvegardee,
  type BnaIaSavedConversation,
} from "@/lib/bnaIaConversations";

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

function renderInlineMarkdown(text: string): React.ReactNode {
  const tokenRegex = /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g;
  const parts = text.split(tokenRegex);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.startsWith("***") && part.endsWith("***") && part.length > 6) {
      return (
        <strong key={idx} className="font-bold italic">
          {part.slice(3, -3)}
        </strong>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-bold">
          {renderInlineMarkdown(part.slice(2, -2))}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part.replace(/\*/g, "").replace(/\|/g, " · ")}</span>;
  });
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?$/.test(line);
}

function parseMarkdownTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  const pipeCount = (trimmed.match(/\|/g) ?? []).length;
  if (pipeCount < 2 && !(trimmed.startsWith("|") && trimmed.endsWith("|"))) {
    return null;
  }
  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return cells.length > 0 ? cells : null;
}

function renderBnaMessageContent(content: string, isUser: boolean): React.ReactNode {
  const lines = content.replace(/<br\s*\/?>/gi, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  let tableHeaders: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      tableHeaders = null;
      nodes.push(<div key={`sp-${i}`} className="h-1.5" />);
      continue;
    }

    if (isMarkdownTableSeparator(trimmed)) {
      continue;
    }

    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      tableHeaders = null;
      nodes.push(
        <hr
          key={`hr-${i}`}
          className={`my-1.5 ${isUser ? "border-white/25" : "border-[#E5E5E5]"}`}
        />
      );
      continue;
    }

    const tableCells = parseMarkdownTableCells(trimmed);
    if (tableCells) {
      const nextTrimmed = lines[i + 1]?.trim() ?? "";
      if (isMarkdownTableSeparator(nextTrimmed)) {
        tableHeaders = tableCells;
        continue;
      }

      const formattedRow =
        tableHeaders && tableHeaders.length === tableCells.length
          ? tableCells
              .map((cell, idx) => `**${tableHeaders![idx]}** : ${cell}`)
              .join(" · ")
          : tableCells.length >= 2
            ? `**${tableCells[0]}** — ${tableCells.slice(1).join(" · ")}`
            : tableCells[0];

      nodes.push(
        <div key={`tbl-${i}`} className="flex items-start gap-2 pl-1">
          <span
            className={`mt-0.5 font-bold ${
              isUser ? "text-white/90" : "text-[#B85B2B]"
            }`}
          >
            •
          </span>
          <span>{renderInlineMarkdown(formattedRow)}</span>
        </div>
      );
      continue;
    }

    tableHeaders = null;

    const headingMatch =
      trimmed.match(/^#{1,6}\s+(.+)$/) || trimmed.match(/^===\s*(.+?)\s*===$/);
    if (headingMatch) {
      nodes.push(
        <p
          key={`h-${i}`}
          className={`font-bold ${
            isUser ? "text-white" : "text-[#23272B]"
          } ${i > 0 ? "pt-1.5" : ""}`}
        >
          {renderInlineMarkdown(headingMatch[1])}
        </p>
      );
      continue;
    }

    const bulletMatch = trimmed.match(/^(?:•|-|\*)\s+(.+)$/);
    if (bulletMatch) {
      nodes.push(
        <div key={`li-${i}`} className="flex items-start gap-2 pl-1">
          <span
            className={`mt-0.5 font-bold ${
              isUser ? "text-white/90" : "text-[#B85B2B]"
            }`}
          >
            •
          </span>
          <span>{renderInlineMarkdown(bulletMatch[1])}</span>
        </div>
      );
      continue;
    }

    nodes.push(<p key={`p-${i}`}>{renderInlineMarkdown(trimmed)}</p>);
  }

  return <div className="space-y-1 leading-relaxed">{nodes}</div>;
}

function nettoyerTextePourLectureVocale(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^===\s*(.+?)\s*===$/gm, "$1.")
    .replace(/^[•\-*]\s+/gm, "")
    .replace(/[*`#]/g, "")
    .replace(/[|·]/g, ", ")
    .replace(/\n+/g, ". ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function compresserImageChantier(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const MAX_WIDTH = 1280;
        const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D indisponible."));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Impossible de lire l'image sélectionnée."));
    };
    img.src = objectUrl;
  });
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
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);

  // Sauvegarde, lecture et restauration des conversations
  const [entrepriseId, setEntrepriseId] = useState<string | null>(null);
  const [savedConversations, setSavedConversations] = useState<BnaIaSavedConversation[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [syncSupabase, setSyncSupabase] = useState(true);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [isSavingConv, setIsSavingConv] = useState(false);
  const [viewingConv, setViewingConv] = useState<BnaIaSavedConversation | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const chatSectionRef = useRef<HTMLElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dictée Whisper via /api/transcrire-note
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const chargerHistoriqueSauvegarde = useCallback(async (entId?: string | null) => {
    setLoadingSaved(true);
    try {
      const targetId = entId ?? (await resoudreContexteEntreprise(null)).entreprise_id ?? null;
      if (targetId) setEntrepriseId(targetId);
      const res = await listerConversationsSauvegardees(targetId);
      setSavedConversations(res.conversations);
      setSyncSupabase(res.syncSupabase);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  const afficherToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  useEffect(() => {
    chargerContexte();
    chargerHistoriqueSauvegarde();
  }, [chargerContexte, chargerHistoriqueSauvegarde]);

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
        // Exclure les images base64 du localStorage pour éviter de saturer le quota navigateur
        const sansImages = messages.slice(-30).map((m) => ({
          ...m,
          imageBase64: undefined,
        }));
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(sansImages));
      } catch {
        // Ignorer quota
      }
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleLectureVocale = (messageId: string, content: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    if (speakingId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    const cleanText = nettoyerTextePourLectureVocale(content);
    if (!cleanText) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "fr-FR";
    utterance.rate = 1.02;
    utterance.onend = () => {
      setSpeakingId((cur) => (cur === messageId ? null : cur));
    };
    utterance.onerror = () => {
      setSpeakingId((cur) => (cur === messageId ? null : cur));
    };
    setSpeakingId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMicError(null);
    setIsCompressingImage(true);
    try {
      const compressed = await compresserImageChantier(file);
      setPendingImage(compressed);
    } catch (err) {
      setMicError(
        err instanceof Error
          ? err.message
          : "Impossible de compresser la photo sélectionnée."
      );
    } finally {
      setIsCompressingImage(false);
    }
  };

  const envoyerMessage = async (texteForce?: string) => {
    const texteSaisi = (texteForce ?? input).trim();
    const imageToSend = texteForce ? null : pendingImage;
    const contenu =
      texteSaisi ||
      (imageToSend
        ? "Analyse cette photo de chantier et donne ton diagnostic technique DTU."
        : "");
    if (!contenu || isSending) return;

    const userMsg: BnaIaMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: contenu,
      timestamp: new Date().toISOString(),
      ...(imageToSend ? { imageBase64: imageToSend } : {}),
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!texteForce) {
      setInput("");
      setPendingImage(null);
    }
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
          ...(imageToSend ? { imageBase64: imageToSend } : {}),
        }),
      });

      const contentType = res.headers.get("content-type") || "";

      if (res.ok && contentType.includes("text/event-stream") && res.body) {
        const astId = `ast-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: astId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            tags: ["Groq Live", "BNA-IA Cloud"],
            source: "cloud_llm",
          },
        ]);

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let sseBuffer = "";
        let streamedContent = "";

        const handleSseBlock = (block: string) => {
          const lines = block.split("\n");
          let eventName = "message";
          const dataLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          }
          if (dataLines.length === 0) return;
          const rawJson = dataLines.join("\n");
          let payload: Record<string, unknown> | null = null;
          try {
            payload = JSON.parse(rawJson) as Record<string, unknown>;
          } catch {
            return;
          }

          if (eventName === "delta" && typeof payload.text === "string") {
            streamedContent += payload.text;
            const currentText = streamedContent;
            setMessages((prev) =>
              prev.map((m) => (m.id === astId ? { ...m, content: currentText } : m))
            );
          } else if (eventName === "meta") {
            const tags = Array.isArray(payload.tags)
              ? (payload.tags as string[])
              : undefined;
            const actions = Array.isArray(payload.actions)
              ? (payload.actions as BnaIaAction[])
              : undefined;
            const preTexte =
              typeof payload.preChiffrageTexte === "string" &&
              payload.preChiffrageTexte.trim()
                ? payload.preChiffrageTexte.trim()
                : tags?.includes("Pré-chiffrage Certifié")
                  ? streamedContent
                  : null;
            if (preTexte) {
              setDernierPreChiffrage(preTexte);
              try {
                localStorage.setItem("bna_ia_dernier_prechiffrage_v1", preTexte);
              } catch {
                // Ignorer quota
              }
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === astId
                  ? {
                      ...m,
                      actions,
                      tags,
                      source: "cloud_llm",
                    }
                  : m
              )
            );
          } else if (eventName === "error" && typeof payload.error === "string") {
            const errTxt = payload.error;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === astId
                  ? {
                      ...m,
                      content: streamedContent
                        ? `${streamedContent}\n\n⚠️ ${errTxt}`
                        : `⚠️ **Erreur technique BNA-IA Cloud**\n${errTxt}`,
                      tags: ["Erreur Cloud LLM"],
                    }
                  : m
              )
            );
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const blocks = sseBuffer.split("\n\n");
          sseBuffer = blocks.pop() ?? "";
          for (const block of blocks) {
            if (block.trim()) handleSseBlock(block);
          }
        }
        if (sseBuffer.trim()) {
          handleSseBlock(sseBuffer);
        }
        return;
      }

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
      } else if (action.type === "create_sav_from_photo") {
        if (action.payload.savPrefill) {
          localStorage.setItem(
            "bna_prefill_sav_diagnostic",
            JSON.stringify(action.payload.savPrefill)
          );
        }
        router.push(action.payload.href || "/bureau/sav/nouveau");
        return;
      } else if (action.type === "create_note") {
        const resNote = await fetch("/api/bna-ia", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titre: action.payload.noteTitre || "Note BNA-IA",
            contenu: action.payload.noteContenu || action.description,
            chantier_id: action.payload.chantierId ?? null,
          }),
        });
        if (!resNote.ok) {
          const errJson = await resNote.json().catch(() => null);
          throw new Error(
            errJson?.error || "Impossible d'enregistrer la note chantier."
          );
        }
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

  const nouveauChat = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
    }
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem("bna_ia_dernier_prechiffrage_v1");
    setDernierPreChiffrage(null);
    setPendingImage(null);
    setInput("");
    setMessages([
      {
        id: `reset-${Date.now()}`,
        role: "assistant",
        content: "Nouvelle session prête. Que souhaitez-vous piloter ?",
        timestamp: new Date().toISOString(),
        tags: ["BNA-IA Connecté"],
      },
    ]);
  };

  const ouvrirModaleSauvegarde = () => {
    if (estConversationSystemeSeulement(messages)) {
      afficherToast("Envoyez au moins un message avant de sauvegarder la conversation.");
      return;
    }
    setSaveTitle(genererTitreConversation(messages));
    setSaveModalOpen(true);
  };

  const confirmerSauvegardeConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingConv) return;
    setIsSavingConv(true);
    try {
      const targetId = entrepriseId ?? (await resoudreContexteEntreprise(null)).entreprise_id ?? null;
      const res = await sauvegarderConversationBnaIa({
        entrepriseId: targetId,
        titre: saveTitle,
        messages,
        dernierPreChiffrage,
      });
      setSavedConversations((prev) => [
        res.conversation,
        ...prev.filter((c) => c.id !== res.conversation.id),
      ]);
      setSyncSupabase(res.syncSupabase);
      setSaveModalOpen(false);
      afficherToast("Conversation sauvegardée dans l'historique");
    } finally {
      setIsSavingConv(false);
    }
  };

  const restaurerConversation = (conv: BnaIaSavedConversation) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
    }
    const msgsRestaures =
      conv.messages.length > 0
        ? conv.messages
        : [
            {
              id: `restored-${Date.now()}`,
              role: "assistant" as const,
              content: `Conversation « ${conv.titre} » restaurée.`,
              timestamp: new Date().toISOString(),
            },
          ];
    setMessages(msgsRestaures);
    setDernierPreChiffrage(conv.dernier_prechiffrage ?? null);
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgsRestaures.slice(-30)));
      if (conv.dernier_prechiffrage) {
        localStorage.setItem("bna_ia_dernier_prechiffrage_v1", conv.dernier_prechiffrage);
      } else {
        localStorage.removeItem("bna_ia_dernier_prechiffrage_v1");
      }
    } catch {
      // Ignorer quota
    }
    setViewingConv(null);
    chatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    afficherToast("Conversation restaurée dans le chat");
  };

  const supprimerConversation = async (id: string) => {
    const targetId = entrepriseId ?? (await resoudreContexteEntreprise(null)).entreprise_id ?? null;
    await supprimerConversationSauvegardee({ id, entrepriseId: targetId });
    setSavedConversations((prev) => prev.filter((c) => c.id !== id));
    if (viewingConv?.id === id) setViewingConv(null);
    setConfirmDeleteId(null);
    afficherToast("Conversation supprimée de l'historique");
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2 text-xs font-bold text-[#23272B] hover:bg-white transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-[#B85B2B] ${loadingCtx ? "animate-spin" : ""}`} />
                Actualiser contexte
              </button>
              <button
                type="button"
                onClick={ouvrirModaleSauvegarde}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#B85B2B]/30 bg-[#B85B2B]/10 px-3.5 py-2 text-xs font-bold text-[#B85B2B] hover:bg-[#B85B2B]/15 transition-colors"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                Sauvegarder la conversation
              </button>
              <button
                type="button"
                onClick={nouveauChat}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#9E4B20] transition-colors"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Nouveau chat
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
        <section
          ref={chatSectionRef}
          className="flex flex-col rounded-2xl border border-[#E5E5E5] bg-white shadow-xs overflow-hidden"
        >
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
                  {m.role === "assistant" && (
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap gap-1">
                        {m.tags?.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-[#E5E5E5] bg-white px-2 py-0.5 text-[10px] font-bold text-[#666666]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      {m.content.trim().length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleLectureVocale(m.id, m.content)}
                          title={
                            speakingId === m.id
                              ? "Arrêter la lecture vocale"
                              : "Écouter la réponse en mains libres"
                          }
                          aria-label={
                            speakingId === m.id
                              ? "Arrêter la lecture vocale"
                              : "Écouter la réponse"
                          }
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                            speakingId === m.id
                              ? "border-[#B85B2B] bg-[#B85B2B] text-white"
                              : "border-[#E5E5E5] bg-white text-[#666666] hover:border-[#B85B2B]/50 hover:text-[#B85B2B]"
                          }`}
                        >
                          {speakingId === m.id ? (
                            <>
                              <Square className="h-2.5 w-2.5 fill-current" />
                              Stop
                            </>
                          ) : (
                            <>
                              <Volume2 className="h-3 w-3" />
                              Écouter
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {m.imageBase64 && (
                    <div className="mb-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.imageBase64}
                        alt="Photo chantier jointe"
                        className="max-h-52 w-auto rounded-xl border border-white/25 object-cover"
                      />
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
            {pendingImage && (
              <div className="mb-2.5 flex items-center justify-between gap-2 rounded-xl border border-[#B85B2B]/30 bg-white p-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingImage}
                    alt="Aperçu photo chantier"
                    className="h-14 w-14 shrink-0 rounded-lg border border-[#E5E5E5] object-cover"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#23272B]">
                      Photo chantier prête pour diagnostic
                    </p>
                    <p className="text-[11px] text-[#666666]">
                      Compressée (max 1280 px) · Analyse Vision DTU
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  title="Retirer la photo"
                  aria-label="Retirer la photo"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E5E5E5] text-[#666666] hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressingImage || isSending}
                title="Photo chantier (diagnostic DTU / SAV)"
                aria-label="Photo chantier"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E5E5] bg-white text-[#B85B2B] transition-colors hover:border-[#B85B2B]/50 disabled:opacity-50"
              >
                {isCompressingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>

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
                disabled={(!input.trim() && !pendingImage) || isSending}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#B85B2B] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#9E4B20] disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Envoyer</span>
              </button>
            </div>
          </form>
        </section>

        {/* Bibliothèque « Historique des conversations » */}
        <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-xs">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#23272B]">
              <History className="h-4 w-4 text-[#B85B2B]" />
              Historique des conversations
            </h2>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                  syncSupabase
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {syncSupabase ? "Synchronisé cloud" : "Stockage local"}
              </span>
              <span className="text-xs font-semibold text-[#777777]">
                {savedConversations.length} conversation(s)
              </span>
            </div>
          </div>

          {loadingSaved ? (
            <p className="text-xs text-[#777777]">Chargement de l&apos;historique...</p>
          ) : savedConversations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E5E5E5] bg-[#F8F9FA] px-4 py-5 text-center text-xs text-[#777777]">
              Aucune conversation sauvegardée pour le moment. Utilisez{" "}
              <span className="font-bold text-[#B85B2B]">Sauvegarder la conversation</span>{" "}
              dans l&apos;en-tête pour archiver un échange important.
            </div>
          ) : (
            <div className="space-y-2.5">
              {savedConversations.map((conv) => {
                const badge = getBadgeMetierConversation(conv.metier);
                const isConfirmingDelete = confirmDeleteId === conv.id;
                return (
                  <div
                    key={conv.id}
                    className="flex flex-col gap-3 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-3.5 sm:flex-row sm:items-center sm:justify-between hover:border-[#B85B2B]/40 hover:bg-white transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                        <span className="text-[11px] font-medium text-[#777777]">
                          {formaterDateConversationFr(conv.updated_at)}
                        </span>
                        <span className="rounded-full border border-[#E5E5E5] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#555555]">
                          {conv.nb_messages} message(s)
                        </span>
                      </div>
                      <p className="truncate text-xs sm:text-sm font-bold text-[#23272B]">
                        {conv.titre}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setViewingConv(conv)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#23272B] hover:border-[#B85B2B]/40"
                      >
                        <Eye className="h-3.5 w-3.5 text-[#555555]" />
                        Ouvrir
                      </button>
                      <button
                        type="button"
                        onClick={() => restaurerConversation(conv)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#B85B2B] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#9E4B20]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restaurer
                      </button>

                      {isConfirmingDelete ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => supprimerConversation(conv.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-700"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="inline-flex items-center rounded-lg border border-[#E5E5E5] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#666666]"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(conv.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E5E5E5] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#666666] hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Supprimer
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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

      {/* Modale Sauvegarde de la conversation */}
      {saveModalOpen && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSaveModalOpen(false)}
        >
          <form
            onSubmit={confirmerSauvegardeConversation}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[#E5E5E5] bg-white shadow-2xl overflow-hidden text-[#23272B]"
          >
            <div className="flex items-center justify-between border-b border-[#E5E5E5] bg-[#F8F9FA] px-5 py-4">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="h-4 w-4 text-[#B85B2B]" />
                <h3 className="text-sm font-bold text-[#23272B]">
                  Sauvegarder la conversation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="rounded-lg p-1 text-[#777777] hover:text-[#23272B]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 bg-white">
              <div>
                <label
                  htmlFor="bna-ia-save-title"
                  className="block text-xs font-bold text-[#555555] mb-1"
                >
                  Titre de la conversation
                </label>
                <input
                  id="bna-ia-save-title"
                  type="text"
                  required
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="Ex: Devis bardage claire-voie 45 m²"
                  className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2 text-xs sm:text-sm text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-[#777777]">
                Date : {formaterDateConversationFr(new Date().toISOString())} ·{" "}
                {messages.filter((m) => m.id !== "welcome-bna-ia" && !m.id.startsWith("reset-")).length}{" "}
                message(s) seront archivés{dernierPreChiffrage ? " (avec pré-chiffrage actif)" : ""}.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#E5E5E5] bg-[#F8F9FA] px-5 py-3.5">
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2 text-xs font-semibold text-[#555555] hover:text-[#23272B]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSavingConv || !saveTitle.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] px-4 py-2 text-xs font-bold text-white hover:bg-[#9E4B20] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {isSavingConv ? "Enregistrement..." : "Valider"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modale Lecture intégrale d'une conversation sauvegardée */}
      {viewingConv && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-5"
          onClick={() => setViewingConv(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-[#E5E5E5] bg-white shadow-2xl overflow-hidden text-[#23272B]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#E5E5E5] bg-[#F8F9FA] px-5 py-4 shrink-0">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      getBadgeMetierConversation(viewingConv.metier).className
                    }`}
                  >
                    {getBadgeMetierConversation(viewingConv.metier).label}
                  </span>
                  <span className="text-[11px] font-medium text-[#777777]">
                    {formaterDateConversationFr(viewingConv.updated_at)} · {viewingConv.nb_messages} message(s)
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[#23272B] leading-snug">
                  {viewingConv.titre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingConv(null)}
                className="rounded-lg p-1 text-[#777777] hover:text-[#23272B]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 p-4 sm:p-5 bg-white">
              {viewingConv.messages.map((m, idx) => (
                <div
                  key={`${m.id}-${idx}`}
                  className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#B85B2B]/10 text-[#B85B2B] border border-[#B85B2B]/25">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm ${
                      m.role === "user"
                        ? "bg-[#B85B2B] text-white"
                        : "border border-[#E5E5E5] bg-[#F8F9FA] text-[#23272B]"
                    }`}
                  >
                    {m.role === "user" ? (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <div className="space-y-1">{renderBnaMessageContent(m.content, false)}</div>
                    )}
                  </div>
                  {m.role === "user" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#23272B] text-white">
                      <User className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E5E5] bg-[#F8F9FA] px-5 py-3.5 shrink-0">
              <button
                type="button"
                onClick={() => setViewingConv(null)}
                className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2 text-xs font-semibold text-[#555555] hover:text-[#23272B]"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => restaurerConversation(viewingConv)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] px-4 py-2 text-xs font-bold text-white hover:bg-[#9E4B20]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurer dans le chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de confirmation */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 right-4 z-[220] flex items-center gap-2 rounded-xl border border-[#B85B2B]/30 bg-white px-4 py-2.5 text-xs font-bold text-[#23272B] shadow-xl"
        >
          <CheckCircle2 className="h-4 w-4 text-[#B85B2B]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
