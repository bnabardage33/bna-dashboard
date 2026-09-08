"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";


export default function SaisiePointage() {
  const router = useRouter();
  
  const [chantiers, setChantiers] = useState<{ id: string; nom: string | null }[]>([]);
  const [ouvriers, setOuvriers] = useState<{id: string; full_name: string}[]>([]);
  
  const [formData, setFormData] = useState({
    chantier_id: "",
    date: new Date().toISOString().slice(0, 10),
    ouvrier_id: "",
    heures: 7,
    taux_horaire_charge: 28.50,
    type_heure: "Normale"
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchSelects = async () => {
      const { data: cData } = await supabase.from("chantiers").select("id, nom").in("statut", ["en_cours", "prevu"]);
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

      const { error: insertError } = await supabase.from("pointages").insert({
        chantier_id: formData.chantier_id,
        user_id: formData.ouvrier_id,
        heures: formData.heures,
        taux_horaire_charge: formData.taux_horaire_charge,
        date: formData.date,
        type_heure: formData.type_heure
      });

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
      setFormData(prev => ({
        ...prev,
        ouvrier_id: "",
        heures: 7,
        type_heure: "Normale"
      }));
    } catch (err) {
      setError((err as Error).message || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-[#1A1D24]/50 rounded-xl border border-white/10 mt-8 text-white">
      <h1 className="text-2xl font-bold mb-6">Saisie Pointage</h1>
      
      {error && <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-md text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-red-600/10 border border-white/10 text-gray-400 rounded-md text-sm font-medium">Pointage enregistré avec succès !</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Chantier</label>
          <select required className="w-full bg-transparent border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.chantier_id} onChange={e => setFormData({...formData, chantier_id: e.target.value})}>
            <option value="">Sélectionner un chantier</option>
            {chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Date</label>
            <input type="date" required className="w-full bg-transparent border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Ouvrier</label>
            <select required className="w-full bg-transparent border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.ouvrier_id} onChange={e => setFormData({...formData, ouvrier_id: e.target.value})}>
              <option value="">Sélectionner</option>
              {ouvriers.map(o => <option key={o.id} value={o.id}>{o.full_name || o.id}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Heures</label>
            <input type="number" step="0.5" min="0.5" max="24" required className="w-full bg-transparent border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.heures} onChange={e => setFormData({...formData, heures: parseFloat(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Taux horaire chargé (€)</label>
            <input type="number" step="0.01" min="0" required className="w-full bg-transparent border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.taux_horaire_charge} onChange={e => setFormData({...formData, taux_horaire_charge: parseFloat(e.target.value)})} />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Type d'heure</label>
          <div className="flex gap-2">
            {["Normale", "Supplémentaire", "Intempéries"].map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setFormData({...formData, type_heure: type})}
                className={`flex-1 py-2 text-sm rounded-md border transition-colors ${formData.type_heure === type ? 'bg-red-600/20 border-white/10 text-gray-400' : 'border-white/10 bg-transparent text-gray-400 hover:bg-[#1A1D24]'}`}
              >
                {type}
              </button>
            ))}
          </div>
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
