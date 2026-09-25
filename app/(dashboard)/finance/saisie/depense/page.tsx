"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { TablesInsert } from "@/types/supabase";

export default function SaisieDepense() {
  const router = useRouter();
  
  const [chantiers, setChantiers] = useState<{ id: string; nom: string | null }[]>([]);
  const [fournisseurs, setFournisseurs] = useState<{id: string; nom: string}[]>([]);
  
  const [formData, setFormData] = useState({
    chantier_id: "",
    nature: "materiaux",
    montant_ht: "",
    taux_tva: 20,
    montant_tva: "",
    date: new Date().toISOString().slice(0, 10),
    fournisseur_id: "",
    statut: "Engagé"
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchSelects = async () => {
      const { data: cData } = await supabase.from("chantiers").select("id, nom").in("statut", ["en_cours", "prevu"]);
      if (cData && isMounted) setChantiers(cData);
      
      const { data: fData } = await supabase.from("fournisseurs").select("id, nom");
      if (fData && isMounted) setFournisseurs(fData);
    };
    fetchSelects();
    return () => { isMounted = false; };
  }, []);

  const handleTvaChange = (val: string) => {
    setFormData(prev => ({ ...prev, taux_tva: parseFloat(val) }));
  };

  const handleMontantChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ht = e.target.value;
    setFormData(prev => ({
      ...prev,
      montant_ht: ht,
      montant_tva: ht ? (parseFloat(ht) * prev.taux_tva / 100).toFixed(2) : ""
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const ht = parseFloat(formData.montant_ht);
      if (isNaN(ht) || ht <= 0) throw new Error("Montant HT invalide.");

      const insertData = {
        nature: formData.nature,
        montant_ht: ht,
        taux_tva: formData.taux_tva,
        montant_tva: parseFloat(formData.montant_tva) || (ht * formData.taux_tva / 100),
        date: formData.date,
        statut: formData.statut,
        ...(formData.chantier_id ? { chantier_id: formData.chantier_id } : {}),
        ...(formData.fournisseur_id ? { fournisseur_id: formData.fournisseur_id } : {}),
      };
      

      const { error: insertError } = await supabase.from("depenses_chantier").insert(insertData as TablesInsert<"depenses_chantier">);

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      
      setFormData(prev => ({
        ...prev,
        montant_ht: "",
        montant_tva: "",
        fournisseur_id: "",
        nature: "materiaux"
      }));
    } catch (err) {
      setError((err as Error).message || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-[#1A1D24]/50 rounded-xl border border-white/10 mt-8 text-white">
      <h1 className="text-2xl font-bold mb-6">Saisie Dépense</h1>
      
      {error && <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-md text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-md text-sm font-medium">Dépense enregistrée avec succès !</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Date</label>
            <input type="date" required className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Chantier <span className="text-xs text-gray-500">(Optionnel)</span></label>
            <select className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.chantier_id} onChange={e => setFormData({...formData, chantier_id: e.target.value})}>
              <option value="">-- Sans affectation --</option>
              {chantiers.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nature</label>
            <select required className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.nature} onChange={e => setFormData({...formData, nature: e.target.value})}>
              <option value="materiaux">Matériaux</option>
              <option value="quincaillerie">Quincaillerie</option>
              <option value="sous_traitance">Sous-traitance</option>
              <option value="location">Location</option>
              <option value="frais">Frais</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fournisseur <span className="text-xs text-gray-500">(Optionnel)</span></label>
            <select className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.fournisseur_id} onChange={e => setFormData({...formData, fournisseur_id: e.target.value})}>
              <option value="">Sélectionner</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Montant HT (€)</label>
            <input type="number" step="0.01" min="0" required className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.montant_ht} onChange={handleMontantChange} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">TVA (%)</label>
              <select className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.taux_tva} onChange={e => handleTvaChange(e.target.value)}>
                <option value="20">20%</option>
                <option value="10">10%</option>
                <option value="5.5">5.5%</option>
                <option value="0">0%</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-1">Montant TVA</label>
              <input type="number" step="0.01" className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none" value={formData.montant_tva} onChange={e => setFormData({...formData, montant_tva: e.target.value})} />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Statut</label>
          <div className="flex gap-2">
            {["Prévu", "Engagé", "Payé"].map(statut => (
              <button
                key={statut}
                type="button"
                onClick={() => setFormData({...formData, statut})}
                className={`flex-1 py-2 text-sm rounded-md border transition-colors ${formData.statut === statut ? 'bg-red-600/20 border-white/10 text-gray-400' : 'border-white/10 bg-transparent text-gray-400 hover:bg-[#1A1D24]'}`}
              >
                {statut}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 flex justify-between items-center">
          <button type="button" onClick={() => router.back()} className="text-sm font-medium text-gray-400 hover:text-gray-200">Retour</button>
          <button type="submit" disabled={loading} className="px-6 py-2 bg-red-600 hover:bg-red-600 text-white rounded-md font-medium disabled:opacity-50 transition-colors">
            {loading ? "Enregistrement..." : "Enregistrer la dépense"}
          </button>
        </div>
      </form>
    </div>
  );
}
