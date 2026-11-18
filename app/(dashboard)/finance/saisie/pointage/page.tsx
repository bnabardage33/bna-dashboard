"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { TablesInsert } from "@/types/supabase";
import { METIER_BADGE_CONFIG, normaliserMetierCode } from "@/lib/metierBadge";
import {
  AlerteIntemperiePointage,
  calculerIndemnitesPointage,
  deduireHeuresARattraper,
  useArretIntemperieJour,
  type TypeHeurePointage,
} from "@/components/AlerteIntemperiePointage";
import { useRouter } from "next/navigation";


export default function SaisiePointage() {
  const router = useRouter();
  
  const [chantiers, setChantiers] = useState<{ id: string; nom: string | null; metier?: string | null }[]>([]);
  const [ouvriers, setOuvriers] = useState<{id: string; full_name: string}[]>([]);
  
  const [formData, setFormData] = useState({
    chantier_id: "",
    date: new Date().toISOString().slice(0, 10),
    ouvrier_id: "",
    heures: 7,
    taux_horaire_charge: 28.50,
    type_heure: "productive" as TypeHeurePointage,
    phase_travail: "general",
    panier_repas: 10.5,
    indemnite_transport: 8.0,
    indemnite_trajet: 6.0,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const { rapportArrete } = useArretIntemperieJour(formData.chantier_id, formData.date);

  const indemnitesCalculees = calculerIndemnitesPointage(
    {
      panier: formData.panier_repas,
      transport: formData.indemnite_transport,
      trajet: formData.indemnite_trajet,
    },
    rapportArrete
  );

  useEffect(() => {
    let isMounted = true;
    const fetchSelects = async () => {
      const { data: cData } = await supabase.from("chantiers").select("id, nom, metier").in("statut", ["en_cours", "prevu"]);
      if (cData && isMounted) setChantiers(cData);
      
      const { data: oData } = await supabase.from("profiles").select("id, full_name, role");
      if (oData && isMounted) {
        setOuvriers(oData.filter((o: { role: string | null }) => o.role && ["ouvrier", "chef", "admin"].includes(o.role)));
      }
    };
    fetchSelects();
    return () => { isMounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      if (!formData.chantier_id || !formData.ouvrier_id) {
        throw new Error("Chantier et Ouvrier sont requis.");
      }
      if (rapportArrete && formData.type_heure === "productive") {
        throw new Error(
          `Arrêt intempéries validé (${rapportArrete.numero}) à cette date : la saisie d'heures productives est bloquée. Basculez en « Intempérie ».`
        );
      }

      const heuresSaisies =
        formData.type_heure === "recuperation_intemperie"
          ? Math.min(1, Math.max(0, formData.heures))
          : formData.heures;

      const { error: insertError } = await supabase.from("pointages").insert({
        chantier_id: formData.chantier_id,
        user_id: formData.ouvrier_id,
        heures: heuresSaisies,
        taux_horaire_charge: formData.taux_horaire_charge,
        date: formData.date,
        type_heure: formData.type_heure,
        phase_travail: formData.phase_travail,
        panier_repas: indemnitesCalculees.panier,
        indemnite_transport: indemnitesCalculees.transport,
        indemnite_trajet: indemnitesCalculees.trajet,
      } as TablesInsert<"pointages">);

      if (insertError) throw insertError;

      if (formData.type_heure === "recuperation_intemperie") {
        await deduireHeuresARattraper(formData.chantier_id, heuresSaisies);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
      setFormData(prev => ({
        ...prev,
        ouvrier_id: "",
        heures: 7,
        type_heure: "productive",
        phase_travail: "general"
      }));
    } catch (err) {
      setError((err as Error).message || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-[#1E1E1E]/50 rounded-xl border border-white/10 mt-8 text-white">
      <h1 className="text-2xl font-bold mb-6">Saisie Pointage</h1>
      
      {error && <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-md text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-md text-sm font-medium">Pointage enregistré avec succès !</div>}

      <div className="mb-4">
        <AlerteIntemperiePointage
          rapport={rapportArrete}
          bloqueProductive={formData.type_heure === "productive"}
          onBasculerIntemperie={() =>
            setFormData((prev) => ({ ...prev, type_heure: "intemperie" }))
          }
          regleIndemnite={indemnitesCalculees.regle}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="chp-chantier" className="block text-sm text-gray-400 mb-1">Chantier</label>
          <select id="chp-chantier" required className="w-full bg-surface-raised border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.chantier_id} onChange={e => setFormData({...formData, chantier_id: e.target.value})}>
            <option value="">Sélectionner un chantier</option>
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                [{METIER_BADGE_CONFIG[normaliserMetierCode(c.metier)].label}] {c.nom}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="chp-date" className="block text-sm text-gray-400 mb-1">Date</label>
            <input id="chp-date" type="date" required className="w-full bg-surface-raised border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
          <div>
            <label htmlFor="chp-ouvrier" className="block text-sm text-gray-400 mb-1">Ouvrier</label>
            <select id="chp-ouvrier" required className="w-full bg-surface-raised border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.ouvrier_id} onChange={e => setFormData({...formData, ouvrier_id: e.target.value})}>
              <option value="">Sélectionner</option>
              {ouvriers.map(o => <option key={o.id} value={o.id}>{o.full_name || o.id}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="chp-heures" className="block text-sm text-gray-400 mb-1">Heures</label>
            <input id="chp-heures" type="number" step="0.5" min="0.5" max="24" required className="w-full bg-surface-raised border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.heures} onChange={e => setFormData({...formData, heures: parseFloat(e.target.value)})} />
          </div>
          <div>
            <label htmlFor="chp-taux-horaire-charge" className="block text-sm text-gray-400 mb-1">Taux horaire chargé (€)</label>
            <input id="chp-taux-horaire-charge" type="number" step="0.01" min="0" required className="w-full bg-surface-raised border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.taux_horaire_charge} onChange={e => setFormData({...formData, taux_horaire_charge: parseFloat(e.target.value)})} />
          </div>
        </div>

        
        <div>
          <label htmlFor="chp-phase-de-travail" className="block text-sm text-gray-400 mb-1">Phase de travail</label>
          <select id="chp-phase-de-travail" required className="w-full bg-surface-raised border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.phase_travail} onChange={e => setFormData({...formData, phase_travail: e.target.value})}>
            <option value="ossature">🏗️ Pose Ossature (DTU 45.4)</option>
            <option value="isolation">🌡️ Pose Isolation (ITE)</option>
            <option value="bardage">🪵 Pose Bardage (DTU 41.2)</option>
            <option value="finitions">✨ Finitions & Profilés</option>
            <option value="general">📁 Nettoyage / Repli général</option>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="chp-panier" className="block text-xs text-gray-400 mb-1">
              Panier (€)
            </label>
            <input
              id="chp-panier"
              type="number"
              step="0.5"
              min="0"
              disabled={Boolean(rapportArrete)}
              className="w-full bg-surface-raised border border-white/10 rounded-md p-2 text-sm disabled:opacity-60 outline-none"
              value={indemnitesCalculees.panier}
              onChange={(e) =>
                setFormData({ ...formData, panier_repas: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label htmlFor="chp-transport" className="block text-xs text-gray-400 mb-1">
              Transport (€)
            </label>
            <input
              id="chp-transport"
              type="number"
              step="0.5"
              min="0"
              disabled={Boolean(rapportArrete)}
              className="w-full bg-surface-raised border border-white/10 rounded-md p-2 text-sm disabled:opacity-60 outline-none"
              value={indemnitesCalculees.transport}
              onChange={(e) =>
                setFormData({ ...formData, indemnite_transport: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label htmlFor="chp-trajet" className="block text-xs text-gray-400 mb-1">
              Trajet (€)
            </label>
            <input
              id="chp-trajet"
              type="number"
              step="0.5"
              min="0"
              disabled={Boolean(rapportArrete)}
              className="w-full bg-surface-raised border border-white/10 rounded-md p-2 text-sm disabled:opacity-60 outline-none"
              value={indemnitesCalculees.trajet}
              onChange={(e) =>
                setFormData({ ...formData, indemnite_trajet: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        <div>
          <label id="grp-type-d-heure" className="block text-sm text-gray-400 mb-1">Type d&apos;heure</label>
          <div role="group" aria-labelledby="grp-type-d-heure" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { value: "productive", label: "Productive" },
                { value: "intemperie", label: "Intempérie" },
                { value: "recuperation_intemperie", label: "Récup. intemp. (max 1h/j)" },
                { value: "supplementaire", label: "Supplémentaire" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormData({ ...formData, type_heure: opt.value })}
                className={`py-2 px-2 text-xs font-medium rounded-md border transition-colors ${
                  formData.type_heure === opt.value
                    ? "bg-[#D96B27]/25 border-[#D96B27] text-amber-200"
                    : "border-white/10 bg-transparent text-gray-400 hover:bg-[#1E1E1E]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {formData.type_heure === "recuperation_intemperie" && (
            <p className="mt-1 text-[11px] text-amber-200/80">
              Récupération intempéries : sans majoration +25 %, plafonnée à 1 h/jour et déduite automatiquement de heures_a_rattraper.
            </p>
          )}
        </div>

        <div className="pt-4 flex justify-between items-center">
          <button type="button" onClick={() => router.back()} className="text-sm font-medium text-gray-400 hover:text-gray-200">Retour</button>
          <button type="submit" disabled={loading} className="px-6 py-2 bg-red-600 hover:bg-red-600 text-white rounded-md font-medium disabled:opacity-50 transition-colors">
            {loading ? "Enregistrement..." : "Enregistrer le pointage"}
          </button>
        </div>
      </form>
    </div>
  );
}
