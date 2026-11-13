"use client";

import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { TablesInsert } from "@/types/supabase";
import {
  Loader2,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Mic,
  Square,
  Settings,
  AlertTriangle,
  Save,
  Check,
  Building2,
  Sliders,
} from "lucide-react";
import {
  ETAPES_TECHNIQUES,
  genererFacadesDefaut,
  calculerAvancementGlobal,
  detecterDonneesPerdues,
  initialiserEtatAvancement,
  type FacadeConfig,
  type EtatAvancementFacades,
  type EtapeTechniqueId,
} from "@/lib/bardage/facadesConfig";

const ETAPES_ORDRE: EtapeTechniqueId[] = ["ossature", "isolation", "bardage", "finitions"];

type EtatDictee = "inactif" | "enregistrement" | "transcription" | "ia";

function pourcentageVersEtapes(pct: number): Record<EtapeTechniqueId, boolean> {
  const base: Record<EtapeTechniqueId, boolean> = {
    ossature: false,
    isolation: false,
    bardage: false,
    finitions: false,
  };
  const n = Math.round((Math.min(100, Math.max(0, pct)) / 100) * ETAPES_ORDRE.length);
  for (let i = 0; i < n; i++) {
    base[ETAPES_ORDRE[i]] = true;
  }
  return base;
}

export interface AvancementFacadesProps {
  chantierId: string;
  checklistActuelle?: Record<string, unknown> | null;
  onAvancementMisAJour?: (pct: number, facadesConfig: FacadeConfig[]) => void;
}

export default function AvancementFacades({
  chantierId,
  checklistActuelle,
  onAvancementMisAJour,
}: AvancementFacadesProps) {
  // 1. Configuration des façades (1 à 4)
  const [facades, setFacades] = useState<FacadeConfig[]>(genererFacadesDefaut(4));
  const [etat, setEtat] = useState<EtatAvancementFacades>({});
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // État de la vue de configuration
  const [configOuverte, setConfigOuverte] = useState(false);
  const [nbFacadesChoisi, setNbFacadesChoisi] = useState<number>(4);
  const [nomsTemporaires, setNomsTemporaires] = useState<string[]>([]);
  const [avertissementReduction, setAvertissementReduction] = useState<{
    ouvert: boolean;
    nouveauNb: number;
    facadesImpactees: string[];
  }>({ ouvert: false, nouveauNb: 4, facadesImpactees: [] });

  // Accordéon des façades
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // 2. Dictée vocale IA
  const [etatDictee, setEtatDictee] = useState<EtatDictee>("inactif");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Charger la configuration et l'avancement depuis Supabase
  useEffect(() => {
    let isMounted = true;

    async function chargerAvancement() {
      try {
        setLoading(true);

        // A. Vérifier la configuration enregistrée dans le chantier (checklist.facades_config)
        let configChantier: FacadeConfig[] | null = null;
        if (checklistActuelle && typeof checklistActuelle === "object") {
          const chk = checklistActuelle as { facades_config?: FacadeConfig[] };
          if (Array.isArray(chk.facades_config) && chk.facades_config.length > 0) {
            configChantier = chk.facades_config;
          }
        }

        // Si non présent dans props, interroger la table chantiers
        if (!configChantier) {
          const { data: chantierData } = await supabase
            .from("chantiers")
            .select("checklist")
            .eq("id", chantierId)
            .maybeSingle();

          if (chantierData?.checklist && typeof chantierData.checklist === "object") {
            const chk = chantierData.checklist as { facades_config?: FacadeConfig[] };
            if (Array.isArray(chk.facades_config) && chk.facades_config.length > 0) {
              configChantier = chk.facades_config;
            }
          }
        }

        // B. Charger le dernier avancement enregistré dans avancements_chantier
        const { data: avancements } = await supabase
          .from("avancements_chantier")
          .select("*")
          .eq("chantier_id", chantierId)
          .order("created_at", { ascending: false })
          .limit(1);

        const dernierAvancement = avancements && avancements.length > 0 ? avancements[0] : null;

        // Déterminer la configuration finale
        let configFinale: FacadeConfig[] = configChantier || genererFacadesDefaut(4);

        if (dernierAvancement?.details && typeof dernierAvancement.details === "object") {
          const raw = dernierAvancement.details as Record<string, unknown>;
          if (Array.isArray(raw.facades_config) && raw.facades_config.length > 0 && !configChantier) {
            configFinale = raw.facades_config as FacadeConfig[];
          }
        }

        if (!isMounted) return;

        // Initialiser les états
        setFacades(configFinale);
        setNbFacadesChoisi(configFinale.length);
        setNomsTemporaires(configFinale.map((f) => f.label));

        // Développer par défaut la première façade
        const exp: Record<string, boolean> = {};
        configFinale.forEach((f, idx) => {
          exp[f.id] = idx === 0;
        });
        setExpanded(exp);

        if (dernierAvancement) {
          if (dernierAvancement.commentaire) {
            setObservations(dernierAvancement.commentaire);
          }
          const rawDetails = dernierAvancement.details as Record<string, unknown> | null;
          const merged = initialiserEtatAvancement(configFinale, rawDetails);
          setEtat(merged);
        } else {
          setEtat(initialiserEtatAvancement(configFinale, null));
        }
      } catch (err) {
        console.error("Erreur chargement avancement:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    chargerAvancement();

    return () => {
      isMounted = false;
    };
  }, [chantierId, checklistActuelle]);

  // Actions de modification des étapes
  const toggleEtape = (facadeId: string, etapeId: EtapeTechniqueId) => {
    setEtat((prev) => {
      const currentFacade = prev[facadeId] || {
        ossature: false,
        isolation: false,
        bardage: false,
        finitions: false,
      };
      return {
        ...prev,
        [facadeId]: {
          ...currentFacade,
          [etapeId]: !currentFacade[etapeId],
        },
      };
    });
  };

  const toggleExpandFacade = (facadeId: string) => {
    setExpanded((prev) => ({ ...prev, [facadeId]: !prev[facadeId] }));
  };

  // Calcul du % global selon les seules façades actives
  const { pourcentage, etapesValidees, totalEtapes } = calculerAvancementGlobal(facades, etat);

  // Configuration : changer le nombre de façades avec contrôle de données
  const handleChangerNombreFacades = (nouveauNb: number) => {
    if (nouveauNb === nbFacadesChoisi) return;

    // Construire la liste prospective de façades
    const slots = ["nord", "sud", "est", "ouest"];
    const nouvelles: FacadeConfig[] = [];
    const defaults = genererFacadesDefaut(nouveauNb);

    for (let i = 0; i < nouveauNb; i++) {
      const slotId = slots[i];
      const existingName = nomsTemporaires[i] || facades.find((f) => f.id === slotId)?.label;
      nouvelles.push({
        id: slotId,
        label: existingName || defaults[i]?.label || `Façade ${i + 1}`,
      });
    }

    // Détecter si des étapes déjà validées sur les façades supprimées existent
    const checkPerte = detecterDonneesPerdues(facades, nouvelles, etat);
    if (checkPerte.aDesDonnees) {
      setAvertissementReduction({
        ouvert: true,
        nouveauNb,
        facadesImpactees: checkPerte.facadesImpactees,
      });
      return;
    }

    // Pas de perte : appliquer directement
    appliquerNouveauNombre(nouveauNb, nouvelles);
  };

  const appliquerNouveauNombre = (nouveauNb: number, nouvellesFacades: FacadeConfig[]) => {
    setNbFacadesChoisi(nouveauNb);
    setNomsTemporaires(nouvellesFacades.map((f) => f.label));
    setFacades(nouvellesFacades);

    // Initialiser les façades manquantes dans l'état sans écraser l'existant
    setEtat((prev) => initialiserEtatAvancement(nouvellesFacades, prev as unknown as Record<string, unknown>));

    setAvertissementReduction({ ouvert: false, nouveauNb, facadesImpactees: [] });
  };

  const handleConfirmerReduction = () => {
    const nouveauNb = avertissementReduction.nouveauNb;
    const slots = ["nord", "sud", "est", "ouest"];
    const nouvelles: FacadeConfig[] = [];
    const defaults = genererFacadesDefaut(nouveauNb);

    for (let i = 0; i < nouveauNb; i++) {
      const slotId = slots[i];
      const existingName = nomsTemporaires[i] || facades.find((f) => f.id === slotId)?.label;
      nouvelles.push({
        id: slotId,
        label: existingName || defaults[i]?.label || `Façade ${i + 1}`,
      });
    }

    appliquerNouveauNombre(nouveauNb, nouvelles);
  };

  const handleChangerNomFacade = (index: number, nom: string) => {
    setNomsTemporaires((prev) => {
      const copy = [...prev];
      copy[index] = nom;
      return copy;
    });

    setFacades((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], label: nom };
      }
      return copy;
    });
  };

  // Enregistrement complet (Avancement + Configuration)
  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      // 1. Préparer le payload avec façades configurées et état technique
      const detailsPayload: Record<string, unknown> = {
        facades_config: facades,
        ...etat,
      };

      // 2. Insérer dans avancements_chantier
      const { error: avError } = await supabase.from("avancements_chantier").insert(({
        chantier_id: chantierId,
        pourcentage,
        date: new Date().toISOString().split("T")[0],
        commentaire: observations,
        details: detailsPayload,
      } as Omit<TablesInsert<"avancements_chantier">, "entreprise_id">) as TablesInsert<"avancements_chantier">);

      if (avError) throw new Error(avError.message);

      // 3. Mettre à jour chantiers.checklist.facades_config de façon atomique
      const { data: chData } = await supabase
        .from("chantiers")
        .select("checklist")
        .eq("id", chantierId)
        .maybeSingle();

      const existingChecklist = (chData?.checklist && typeof chData.checklist === "object"
        ? chData.checklist
        : {}) as Record<string, unknown>;

      const updatedChecklist = {
        ...existingChecklist,
        facades_config: facades,
      };

      await supabase
        .from("chantiers")
        .update({ checklist: updatedChecklist as unknown as import("@/types/supabase").Json })
        .eq("id", chantierId);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onAvancementMisAJour?.(pourcentage, facades);
    } catch (err) {
      alert("Erreur lors de l'enregistrement de l'avancement : " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // 3. Gestion de la Dictée Vocale IA
  function appliquerResultatIA(result: Record<string, unknown>) {
    setEtat((prev) => {
      const next: EtatAvancementFacades = { ...prev };
      for (const f of facades) {
        const pct = result[f.id];
        if (typeof pct === "number" && !Number.isNaN(pct)) {
          next[f.id] = pourcentageVersEtapes(pct);
        }
      }
      return next;
    });

    if (result.commentaire_clean && typeof result.commentaire_clean === "string") {
      setObservations((prev) =>
        prev ? `${prev}\n${result.commentaire_clean}` : (result.commentaire_clean as string)
      );
    }
  }

  async function traiterAudio(audioBlob: Blob) {
    setEtatDictee("transcription");
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "note.webm");

      const resTranscription = await fetch("/api/transcrire-note", {
        method: "POST",
        body: formData,
      });
      if (!resTranscription.ok) throw new Error(`Erreur transcription (${resTranscription.status})`);
      const dataTranscription = await resTranscription.json();
      const texteBrut = dataTranscription.texteBrut?.trim();
      if (!texteBrut) {
        setEtatDictee("inactif");
        alert("Aucun texte détecté dans l'enregistrement vocal.");
        return;
      }

      setEtatDictee("ia");
      const resIa = await fetch("/api/ia-avancement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texteBrut,
          facades: facades.map((f) => ({ id: f.id, label: f.label })),
        }),
      });
      if (!resIa.ok) throw new Error(`Erreur IA (${resIa.status})`);
      const dataIa = await resIa.json();
      if (dataIa.error) throw new Error(dataIa.error);

      appliquerResultatIA(dataIa);
      setEtatDictee("inactif");
    } catch (err) {
      alert("Erreur lors du traitement audio : " + (err as Error).message);
      setEtatDictee("inactif");
    }
  }

  async function demarrerDictee() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        if (audioBlob.size < 1000) {
          setEtatDictee("inactif");
          return;
        }
        await traiterAudio(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setEtatDictee("enregistrement");
    } catch (err) {
      alert("Impossible d'accéder au microphone : " + (err as Error).message);
      setEtatDictee("inactif");
    }
  }

  function arreterDictee() {
    mediaRecorderRef.current?.stop();
  }

  const dicteeEnTraitement = etatDictee === "transcription" || etatDictee === "ia";

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-xs font-semibold text-[#777777]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#B85B2B]" /> Chargement de l&apos;avancement du chantier...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. En-tête Général du Suivi d'Avancement (Thème clair BNA) */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#F0F0F0] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#23272B]">
                Avancement du Chantier &amp; Suivi des Façades
              </h2>
              <p className="text-xs text-[#777777]">
                Configuration personnalisée ({facades.length} façade{facades.length > 1 ? "s" : ""}) · {totalEtapes} étapes techniques totales
              </p>
            </div>
          </div>

          {/* Indicateurs de synthèse en haut à droite */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-3 rounded-xl bg-[#F8F9FA] px-3.5 py-1.5 border border-[#E5E5E5]">
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">
                  Avancement Global
                </p>
                <p
                  className={`text-base sm:text-lg font-black ${
                    pourcentage === 100 ? "text-emerald-600" : "text-[#B85B2B]"
                  }`}
                >
                  {pourcentage}%
                </p>
              </div>
              <div className="h-7 w-px bg-gray-200" />
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">
                  Étapes Validées
                </p>
                <p className="text-xs sm:text-sm font-bold text-[#23272B]">
                  {etapesValidees} / {totalEtapes}
                </p>
              </div>
            </div>

            {/* Bouton de configuration */}
            <button
              type="button"
              onClick={() => setConfigOuverte((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                configOuverte
                  ? "border-[#B85B2B] bg-[#B85B2B]/10 text-[#B85B2B]"
                  : "border-[#E5E5E5] bg-[#F8F9FA] text-[#23272B] hover:border-[#B85B2B]"
              }`}
              title="Configurer le nombre et les noms des façades"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Configuration</span>
            </button>
          </div>
        </div>

        {/* 2. Panneau de Configuration du Nombre et Noms de Façades (Phase 2 & 3) */}
        {configOuverte && (
          <div className="mt-4 rounded-2xl border border-[#B85B2B]/20 bg-[#FDFBF9] p-4 sm:p-5 space-y-4 animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#B85B2B]/10 pb-3">
              <div className="flex items-center gap-2 text-[#B85B2B]">
                <Sliders className="h-4 w-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  Configuration des Façades du Chantier
                </h3>
              </div>
              <p className="text-2xs text-[#777777]">
                Adapter le nombre de façades (1 à 4) et saisir les noms réels du chantier.
              </p>
            </div>

            {/* Sélecteur du nombre de façades (1, 2, 3 ou 4) */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-[#777777] mb-2">
                Nombre de façades à traiter
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((nb) => {
                  const estSelectionne = nb === nbFacadesChoisi;
                  return (
                    <button
                      key={nb}
                      type="button"
                      onClick={() => handleChangerNombreFacades(nb)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2.5 sm:p-3 transition text-center ${
                        estSelectionne
                          ? "border-[#B85B2B] bg-[#B85B2B] text-white shadow-sm"
                          : "border-[#E5E5E5] bg-white text-[#23272B] hover:border-[#B85B2B]/50"
                      }`}
                    >
                      <span className="text-sm sm:text-base font-black">
                        {nb} façade{nb > 1 ? "s" : ""}
                      </span>
                      <span
                        className={`text-3xs mt-0.5 ${
                          estSelectionne ? "text-white/80" : "text-[#777777]"
                        }`}
                      >
                        {nb * 4} étapes totales
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Saisie des noms personnalisés de chaque façade */}
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-[#777777] mb-2">
                Noms des façades actives
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {facades.map((f, idx) => (
                  <div key={f.id} className="space-y-1">
                    <label className="text-3xs font-semibold text-[#777777]">
                      Façade n°{idx + 1} ({f.id})
                    </label>
                    <input
                      type="text"
                      value={f.label}
                      onChange={(e) => handleChangerNomFacade(idx, e.target.value)}
                      placeholder={`Ex: Façade ${idx + 1}, Façade rue, Pignon...`}
                      className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Modal / Avertissement de confirmation de réduction si des données existent (Phase 6) */}
            {avertissementReduction.ouvert && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 animate-in fade-in space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>Confirmation de réduction du nombre de façades</span>
                </div>
                <p>
                  Attention : les façades suivantes comportent déjà des étapes techniques validées :
                </p>
                <ul className="list-disc pl-5 font-semibold">
                  {avertissementReduction.facadesImpactees.map((nom, i) => (
                    <li key={i}>{nom}</li>
                  ))}
                </ul>
                <p className="text-2xs text-amber-800">
                  Réduire le nombre à {avertissementReduction.nouveauNb} façade{avertissementReduction.nouveauNb > 1 ? "s" : ""} masquera ces données du calcul d&apos;avancement, mais les données historiques resteront préservées en base.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAvertissementReduction({ ouvert: false, nouveauNb: nbFacadesChoisi, facadesImpactees: [] })
                    }
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmerReduction}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 shadow-sm"
                  >
                    Confirmer la réduction
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setConfigOuverte(false)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#23272B] hover:bg-[#B85B2B] px-4 py-2 text-xs font-bold text-white transition shadow-sm"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Terminer la configuration</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Cartes des Façades Actives et de leurs 4 Étapes Métier (Phase 4) */}
      <div className="space-y-4">
        {facades.map((facade, index) => {
          const isExpanded = expanded[facade.id] ?? true;
          const etapesCochees = ETAPES_TECHNIQUES.filter((e) => etat[facade.id]?.[e.id]).length;
          const facadeComplete = etapesCochees === 4;

          return (
            <div
              key={facade.id}
              className="rounded-2xl border border-[#E5E5E5] bg-white overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all"
            >
              {/* En-tête de la façade */}
              <button
                type="button"
                onClick={() => toggleExpandFacade(facade.id)}
                className="w-full flex items-center justify-between p-4 bg-[#F8F9FA]/80 hover:bg-[#F0F0F0]/80 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                      facadeComplete
                        ? "bg-emerald-500 text-white"
                        : "bg-[#23272B] text-white"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <span className="font-bold text-sm text-[#23272B]">
                      {facade.label}
                    </span>
                    <span className="text-3xs text-[#777777] block sm:inline sm:ml-2">
                      (Façade active {index + 1}/{facades.length})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                      facadeComplete
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-white text-[#777777] border-[#E5E5E5]"
                    }`}
                  >
                    {etapesCochees} / 4 étapes
                  </span>
                  {isExpanded ? (
                    <ChevronUp size={18} className="text-[#777777]" />
                  ) : (
                    <ChevronDown size={18} className="text-[#777777]" />
                  )}
                </div>
              </button>

              {/* Corps de la façade avec les 4 étapes techniques indépendantes */}
              {isExpanded && (
                <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white">
                  {ETAPES_TECHNIQUES.map((etape, etapeIdx) => {
                    const isChecked = etat[facade.id]?.[etape.id] ?? false;

                    return (
                      <button
                        key={etape.id}
                        type="button"
                        onClick={() => toggleEtape(facade.id, etape.id)}
                        className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all active:scale-[0.99] min-h-[52px] ${
                          isChecked
                            ? "bg-emerald-50/80 border-emerald-300 text-emerald-900 shadow-xs"
                            : "bg-[#F8F9FA] border-[#E5E5E5] text-[#23272B] hover:border-[#B85B2B]/40 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {isChecked ? (
                            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                          ) : (
                            <Circle size={20} className="text-gray-400 shrink-0" />
                          )}
                          <div>
                            <span className="text-xs font-bold block">
                              {etapeIdx + 1}. {etape.label}
                            </span>
                            <span className="text-3xs text-gray-500">
                              {isChecked ? "Étape validée sur cette façade" : "À réaliser"}
                            </span>
                          </div>
                        </div>

                        {isChecked && (
                          <span className="text-3xs font-black text-emerald-700 uppercase tracking-wider bg-emerald-100/60 px-1.5 py-0.5 rounded">
                            Fait
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Observations du jour & Dictée Vocale IA */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F0F0] pb-3">
          <label
            htmlFor="chp-observations-du-jour"
            className="text-xs font-bold uppercase tracking-wider text-[#23272B]"
          >
            Observations du jour &amp; Journal de Chantier
          </label>

          {/* Bouton Micro Dictée Vocale IA */}
          <button
            type="button"
            onClick={etatDictee === "enregistrement" ? arreterDictee : demarrerDictee}
            disabled={dicteeEnTraitement}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-xs ${
              etatDictee === "enregistrement"
                ? "bg-red-600 text-white animate-pulse"
                : dicteeEnTraitement
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-[#B85B2B]/10 text-[#B85B2B] hover:bg-[#B85B2B]/20 border border-[#B85B2B]/30"
            }`}
          >
            {etatDictee === "enregistrement" ? (
              <Square size={14} />
            ) : dicteeEnTraitement ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Mic size={14} />
            )}
            {etatDictee === "enregistrement"
              ? "Arrêter l'enregistrement"
              : etatDictee === "transcription"
              ? "Transcription en cours…"
              : etatDictee === "ia"
              ? "Analyse IA des façades…"
              : "🎙️ Dictée vocale IA"}
          </button>
        </div>

        <textarea
          id="chp-observations-du-jour"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Ex: Vent modéré, pose du bardage terminée sur la façade principale, début de l'isolation sur la façade arrière..."
          rows={3}
          className="w-full bg-[#F8F9FA] border border-[#E5E5E5] rounded-xl p-3 text-xs font-medium text-[#23272B] placeholder-gray-400 focus:outline-none focus:border-[#B85B2B] focus:bg-white transition"
        />

        {etatDictee === "ia" && (
          <p className="text-2xs text-[#B85B2B] font-semibold">
            Remplissage automatique des étapes d&apos;avancement selon votre note vocale…
          </p>
        )}
        {etatDictee === "inactif" && (
          <p className="text-3xs text-[#777777]">
            Exemple de dictée : « {facades[0]?.label || "Façade 1"} terminée à 100%, {facades[1]?.label || "Façade 2"} à 50%, conditions météo favorables. »
          </p>
        )}

        {/* Action d'enregistrement de l'avancement */}
        <div className="pt-3 border-t border-[#F0F0F0] flex flex-wrap items-center justify-between gap-3">
          <div>
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 animate-in fade-in">
                <Check className="h-4 w-4" /> Avancement et configuration enregistrés avec succès
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#B85B2B] hover:bg-[#D97732] active:scale-[0.98] disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            <span>{saving ? "Enregistrement..." : "Enregistrer l'avancement"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
