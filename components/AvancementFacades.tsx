"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";

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

export default function AvancementFacades({ chantierId }: { chantierId: string }) {
  const [etat, setEtat] = useState<EtatAvancement>(ETAT_INITIAL);
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<FacadeId, boolean>>({
    nord: true, sud: false, est: false, ouest: false
  });

  useEffect(() => {
    const fetchAvancement = async () => {
      try {
        const { data } = await supabase
          .from("avancements_chantier")
          .select("*")
          .eq("chantier_id", chantierId)
          .order("id", { ascending: false })
          .limit(1);

        if (data && data.length > 0 && data[0].details && typeof data[0].details === "object") {
          const raw = data[0].details as Record<string, unknown>;
          // Merge defensif : on ne prend que les valeurs connues, en fallback sur ETAT_INITIAL
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
    
    // Save to avancements_chantier with details column
    const { error } = await supabase.from("avancements_chantier").insert({
      chantier_id: chantierId,
      pourcentage: pct,
      date: new Date().toISOString().split('T')[0],
      commentaire: observations,
      details: etat
    });

    if (error) {
      alert("Erreur lors de l'enregistrement de l'avancement : " + error.message + "\nAssurez-vous d'avoir ajouté la colonne 'details' (jsonb) à la table avancements_chantier !");
    } else {
      alert("Avancement enregistré avec succès !");
      setObservations("");
    }
    setSaving(false);
  };

  if (loading) return <div className="text-sm text-slate-400">Chargement de l'avancement...</div>;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Avancement du Chantier</h2>
        <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-lg border border-slate-700">
          <span className="text-sm text-slate-400 uppercase tracking-wider font-bold">Global</span>
          <span className={`text-2xl font-black ${pct === 100 ? 'text-emerald-400' : 'text-sky-400'}`}>{pct}%</span>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {FACADES.map((facade) => {
          const isExpanded = expanded[facade.id];
          const etapesCochees = ETAPES.filter(e => etat[facade.id][e.id]).length;
          
          return (
            <div key={facade.id} className="border border-slate-700 rounded-lg overflow-hidden bg-slate-900/50">
              <button 
                onClick={() => toggleFacade(facade.id)}
                className="w-full flex items-center justify-between p-4 bg-slate-800/80 hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-200">{facade.label}</span>
                  <span className="text-xs px-2 py-1 bg-slate-900 rounded-md text-slate-400 font-medium">
                    {etapesCochees} / 4
                  </span>
                </div>
                {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
              </button>
              
              {isExpanded && (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/30">
                  {ETAPES.map((etape) => {
                    const isChecked = etat[facade.id][etape.id];
                    return (
                      <button
                        key={etape.id}
                        onClick={() => toggleEtape(facade.id, etape.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                          isChecked 
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" 
                            : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        {isChecked ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" /> : <Circle size={18} className="text-slate-500 shrink-0" />}
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
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Observations du jour</label>
        <textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Ex: Tempête de vent, impossible de poser le bardage sur la façade Nord..."
          rows={3}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-900 px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-sky-500/20 transition-all"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          Enregistrer l'avancement
        </button>
      </div>
    </div>
  );
}
