"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { TablesInsert } from "@/types/supabase";
import { Loader2, CheckCircle2, Circle, ChevronDown, ChevronUp, Mic, Square } from "lucide-react";
import { Surface } from '@/components/ui/Surface';

const FACADES = [
  { id: "nord", label: "Façade Nord" },
  { id: "sud", label: "Façade Sud" },
  { id: "est", label: "Façade Est" },
  { id: "ouest", label: "Façade Ouest" }
] as const;

const ETAPES = [
  { id: "ossature", label: "Pose de l'ossature" },
  { id: "isolation", label: "Pose de l'isolation" },
  { id: "bardage", label: "Pose du bardage" },
  { id: "finitions", label: "Finitions" }
] as const;

type FacadeId = typeof FACADES[number]["id"];
type EtapeId = typeof ETAPES[number]["id"];

type EtatAvancement = Record<FacadeId, Record<EtapeId, boolean>>;

const ETAT_INITIAL: EtatAvancement = {
  nord: { ossature: false, isolation: false, bardage: false, finitions: false },
  sud: { ossature: false, isolation: false, bardage: false, finitions: false },
  est: { ossature: false, isolation: false, bardage: false, finitions: false },
  ouest: { ossature: false, isolation: false, bardage: false, finitions: false }
};

const ETAPES_ORDRE: EtapeId[] = ["ossature", "isolation", "bardage", "finitions"];

type EtatDictee = "inactif" | "enregistrement" | "transcription" | "ia";

type ResultatIA = {
  nord: number | null;
  sud: number | null;
  est: number | null;
  ouest: number | null;
  commentaire_clean: string;
};

function pourcentageVersEtapes(pct: number): Record<EtapeId, boolean> {
  const base: Record<EtapeId, boolean> = { ossature: false, isolation: false, bardage: false, finitions: false };
  const n = Math.round((Math.min(100, Math.max(0, pct)) / 100) * ETAPES_ORDRE.length);
  for (let i = 0; i < n; i++) {
    base[ETAPES_ORDRE[i]] = true;
  }
  return base;
}

export default function AvancementFacades({ chantierId }: { chantierId: string }) {
  const [etat, setEtat] = useState<EtatAvancement>(ETAT_INITIAL);
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<FacadeId, boolean>>({
    nord: true, sud: false, est: false, ouest: false
  });

  const [etatDictee, setEtatDictee] = useState<EtatDictee>("inactif");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const fetchAvancement = async () => {
      try {
        const { data } = await supabase
          .from("avancements_chantier")
          .select("*")
          .eq("chantier_id", chantierId)
          .order("id", { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          if (data[0].commentaire) {
            setObservations(data[0].commentaire);
          }
          if (data[0].details && typeof data[0].details === "object") {
            const raw = data[0].details as Record<string, unknown>;
            const merged: EtatAvancement = { ...ETAT_INITIAL };
            for (const f of FACADES) {
              const facadeData = raw[f.id];
              if (facadeData && typeof facadeData === "object") {
                merged[f.id] = { ...ETAT_INITIAL[f.id] };
                for (const e of ETAPES) {
                  const val = (facadeData as Record<string, unknown>)[e.id];
                  merged[f.id][e.id] = val === true;
                }
              }
            }
            setEtat(merged);
          }
        }
      } catch (err) {
        console.error("Erreur chargement avancement:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAvancement();
  }, [chantierId]);

  const toggleEtape = (facade: FacadeId, etape: EtapeId) => {
    setEtat(prev => ({
      ...prev,
      [facade]: {
        ...prev[facade],
        [etape]: !prev[facade][etape]
      }
    }));
  };

  const toggleFacade = (facade: FacadeId) => {
    setExpanded(prev => ({ ...prev, [facade]: !prev[facade] }));
  };

  const calculPourcentage = () => {
    let total = 0;
    let checked = 0;
    for (const f of FACADES) {
      for (const e of ETAPES) {
        total++;
        if (etat[f.id][e.id]) checked++;
      }
    }
    return Math.round((checked / total) * 100);
  };

  const pct = calculPourcentage();

  const handleSave = async () => {
    setSaving(true);

    const { error } = await supabase.from("avancements_chantier").insert(({
      chantier_id: chantierId,
      pourcentage: pct,
      date: new Date().toISOString().split('T')[0],
      commentaire: observations,
      details: etat
    } as Omit<TablesInsert<"avancements_chantier">, "entreprise_id">) as TablesInsert<"avancements_chantier">);

    if (error) {
      alert("Erreur lors de l'enregistrement de l'avancement : " + error.message + "\nAssurez-vous d'avoir ajouté la colonne 'details' (jsonb) à la table avancements_chantier !");
    } else {
      alert("Avancement enregistré avec succès !");
    }
    setSaving(false);
  };

  function appliquerResultat(result: ResultatIA) {
    setEtat(prev => {
      const next: EtatAvancement = { ...prev };
      for (const f of FACADES) {
        const pct = result[f.id];
        if (pct !== null && pct !== undefined) {
          next[f.id] = pourcentageVersEtapes(pct);
        }
      }
      return next;
    });
    if (result.commentaire_clean) {
      setObservations(prev => (prev ? prev + "\n" + result.commentaire_clean : result.commentaire_clean));
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
        alert("Aucun texte détecté dans l'enregistrement.");
        return;
      }

      setEtatDictee("ia");
      const resIa = await fetch("/api/ia-avancement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texteBrut }),
      });
      if (!resIa.ok) throw new Error(`Erreur IA (${resIa.status})`);
      const dataIa = await resIa.json();
      if (dataIa.error) throw new Error(dataIa.error);

      appliquerResultat(dataIa);
      setEtatDictee("inactif");
    } catch (err) {
      alert("Erreur lors du traitement : " + (err as Error).message);
      setEtatDictee("inactif");
    }
  }

  async function demarrerDictee() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

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
      alert("Impossible d'accéder au micro : " + (err as Error).message);
      setEtatDictee("inactif");
    }
  }

  function arreterDictee() {
    mediaRecorderRef.current?.stop();
  }

  const dicteeEnTraitement = etatDictee === "transcription" || etatDictee === "ia";

  if (loading) return <div className="text-sm text-gray-400">Chargement de l'avancement...</div>;

  return (
    <Surface className="p-5 shadow-lg max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Avancement du Chantier</h2>
        <div className="flex items-center gap-3 bg-[#121212] px-4 py-2 rounded-lg border border-white/10">
          <span className="text-sm text-gray-400 uppercase tracking-wider font-bold">Global</span>
          <span className={`text-2xl font-black ${pct === 100 ? 'text-emerald-400' : 'text-gray-300'}`}>{pct}%</span>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {FACADES.map((facade) => {
          const isExpanded = expanded[facade.id];
          const etapesCochees = ETAPES.filter(e => etat[facade.id][e.id]).length;

          return (
            <div key={facade.id} className="border border-white/10 rounded-lg overflow-hidden bg-[#121212]/50">
              <button
                onClick={() => toggleFacade(facade.id)}
                className="w-full flex items-center justify-between p-4 bg-[#1E1E1E]/80 hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white">{facade.label}</span>
                  <span className="text-xs px-2 py-1 bg-[#121212] rounded-md text-gray-400 font-medium">
                    {etapesCochees} / 4
                  </span>
                </div>
                {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              </button>

              {isExpanded && (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#121212]/30">
                  {ETAPES.map((etape) => {
                    const isChecked = etat[facade.id][etape.id];
                    return (
                      <button
                        key={etape.id}
                        onClick={() => toggleEtape(facade.id, etape.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                          isChecked
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-[#1E1E1E] border-white/10 text-gray-400 hover:bg-slate-700"
                        }`}
                      >
                        {isChecked ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" /> : <Circle size={18} className="text-gray-500 shrink-0" />}
                        <span className="text-sm font-medium">{etape.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2 mb-6">
        <div className="flex items-center justify-between">
          <label htmlFor="chp-observations-du-jour" className="text-xs font-bold uppercase tracking-wider text-gray-400">Observations du jour</label>
          <button
            type="button"
            onClick={etatDictee === "enregistrement" ? arreterDictee : demarrerDictee}
            disabled={dicteeEnTraitement}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
              etatDictee === "enregistrement"
                ? "bg-red-600 text-white animate-pulse"
                : dicteeEnTraitement
                ? "bg-white/10 text-gray-400 cursor-not-allowed"
                : "bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30"
            }`}
          >
            {etatDictee === "enregistrement" ? (
              <Square size={14} />
            ) : dicteeEnTraitement ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Mic size={14} />
            )}
            {etatDictee === "enregistrement" ? "Arrêter"
              : etatDictee === "transcription" ? "Transcription…"
              : etatDictee === "ia" ? "Analyse IA…"
              : "🎙️ Dicter"}
          </button>
        </div>
        <textarea id="chp-observations-du-jour"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Ex: Tempête de vent, impossible de poser le bardage sur la façade Nord..."
          rows={3}
          className="w-full bg-[#121212] border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-600"
        />
        {etatDictee === "ia" && (
          <p className="text-xs text-gray-500">Remplissage automatique des 16 cases d'avancement en cours…</p>
        )}
        {dicteeEnTraitement && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Traitement de la note vocale…
          </p>
        )}
        {etatDictee === "inactif" && (
          <p className="text-xs text-gray-500">Ex. « Nord 100% fini, Sud 80%, on a eu de la pluie » — les cases se remplissent toutes seules.</p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-red-600 hover:bg-gray-300 disabled:opacity-50 text-white hover:text-slate-900 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-600/20 transition-all"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          Enregistrer l'avancement
        </button>
      </div>
    </Surface>
  );
}