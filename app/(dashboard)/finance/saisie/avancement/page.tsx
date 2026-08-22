"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function SaisieAvancement() {
  const router = useRouter();
  
  const [chantiers, setChantiers] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    chantier_id: "",
    pourcentage: 50,
    date: new Date().toISOString().slice(0, 10),
    commentaire: ""
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchChantiers = async () => {
      const { data } = await supabase.from("chantiers").select("id, nom").in("statut", ["en_cours", "prevu"]);
      if (data && isMounted) setChantiers(data);
    };
    fetchChantiers();
    return () => { isMounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      if (!formData.chantier_id) throw new Error("Veuillez sélectionner un chantier.");
      if (formData.pourcentage < 0 || formData.pourcentage > 100) throw new Error("Le pourcentage doit être compris entre 0 et 100.");

      const { error: insertError } = await supabase.from("avancements_chantier").insert({
        chantier_id: formData.chantier_id,
        pourcentage: formData.pourcentage,
        date: formData.date,
        commentaire: formData.commentaire || null
      });

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
      setFormData(prev => ({
        ...prev,
        commentaire: ""
      }));
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-slate-800/50 rounded-xl border border-slate-700 mt-8 text-slate-100">
      <h1 className="text-2xl font-bold mb-6">Saisie Avancement</h1>
      
      {error && <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-md text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-md text-sm font-medium">Avancement enregistré avec succès !</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Chantier</label>
          <select required className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none" value={formData.chantier_id} onChange={e => setFormData({...formData, chantier_id: e.target.value})}>
            <option value="">Sélectionner un chantier</option>
            {chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">% d'avancement réel</label>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="100" className="flex-1 accent-cyan-400" value={formData.pourcentage} onChange={e => setFormData({...formData, pourcentage: parseInt(e.target.value)})} />
              <input type="number" min="0" max="100" required className="w-20 bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none text-center font-bold" value={formData.pourcentage} onChange={e => setFormData({...formData, pourcentage: parseInt(e.target.value)})} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Date de constat</label>
            <input type="date" required className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Commentaire <span className="text-xs text-slate-500">(Optionnel)</span></label>
          <textarea rows={3} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none resize-none" placeholder="Observations sur l'avancement..." value={formData.commentaire} onChange={e => setFormData({...formData, commentaire: e.target.value})} />
        </div>

        <div className="pt-4 flex justify-between items-center">
          <button type="button" onClick={() => router.back()} className="text-sm font-medium text-slate-400 hover:text-slate-200">Retour</button>
          <button type="submit" disabled={loading} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md font-medium disabled:opacity-50 transition-colors">
            {loading ? "Enregistrement..." : "Enregistrer l'avancement"}
          </button>
        </div>
      </form>
    </div>
  );
}
