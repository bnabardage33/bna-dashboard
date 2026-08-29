"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Chantier = { id: string; nom: string };

export default function FraisInterimPage() {
  const router = useRouter();
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    chantier_id: "",
    date: new Date().toISOString().slice(0, 10),
    agence_nom: "",
    interimaire_nom: "",
    salaire_brut: "",
    coefficient: "2",
    taux_tva: "20",
  });

  useEffect(() => {
    async function charger() {
      const { data } = await supabase.from("chantiers").select("id, nom").neq("statut", "termine");
      if (data) setChantiers(data);
    }
    charger();
  }, []);

  const salaireBrut = parseFloat(formData.salaire_brut) || 0;
  const coefficient = parseFloat(formData.coefficient) || 0;
  const tauxTva = parseFloat(formData.taux_tva) || 0;

  const totalHT = salaireBrut * coefficient;
  const montantTva = totalHT * (tauxTva / 100);
  const totalTTC = totalHT + montantTva;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.agence_nom.trim() || !formData.interimaire_nom.trim() || salaireBrut <= 0) {
      setMessage("❌ Nom de l'agence, nom de l'intérimaire et salaire brut sont requis.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const { error } = await supabase.from("frais_interim").insert({
      chantier_id: formData.chantier_id || null,
      date: formData.date,
      agence_nom: formData.agence_nom.trim(),
      interimaire_nom: formData.interimaire_nom.trim(),
      salaire_brut: salaireBrut,
      coefficient,
      taux_tva: tauxTva,
    });

    if (!error) {
      const depenseData: any = {
        nature: "sous_traitance",
        montant_ht: totalHT,
        taux_tva: tauxTva,
        montant_tva: montantTva,
        date: formData.date,
        statut: "Engagé",
      };
      if (formData.chantier_id) depenseData.chantier_id = formData.chantier_id;

      const { error: depenseError } = await supabase.from("depenses_chantier").insert(depenseData);
      if (depenseError) {
        console.error("Erreur insertion depense miroir frais interim:", depenseError);
      }
    }

    if (error) {
      setMessage("❌ Erreur : " + error.message);
    } else {
      setMessage("✓ Frais d'intérim enregistré avec succès !");
      setFormData((prev) => ({
        ...prev,
        agence_nom: "",
        interimaire_nom: "",
        salaire_brut: "",
      }));
    }
    setIsSaving(false);
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-6">
          <h1 className="text-xl font-bold text-slate-100 mb-6">Frais d'Agence Intérim</h1>

          {message && (
            <div className={`mb-4 rounded-lg border p-3 text-sm ${message.startsWith("✓") ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-rose-500/40 bg-rose-500/10 text-rose-400"}`}>
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Chantier (optionnel)</label>
                <select
                  value={formData.chantier_id}
                  onChange={(e) => setFormData({ ...formData, chantier_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none"
                >
                  <option value="">-- Sans affectation --</option>
                  {chantiers.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nom de l'agence</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Adecco, Manpower..."
                  value={formData.agence_nom}
                  onChange={(e) => setFormData({ ...formData, agence_nom: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nom de l'intérimaire</label>
                <input
                  type="text"
                  required
                  value={formData.interimaire_nom}
                  onChange={(e) => setFormData({ ...formData, interimaire_nom: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Salaire brut (€)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.salaire_brut}
                  onChange={(e) => setFormData({ ...formData, salaire_brut: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Coefficient agence</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.coefficient}
                  onChange={(e) => setFormData({ ...formData, coefficient: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">TVA (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.taux_tva}
                  onChange={(e) => setFormData({ ...formData, taux_tva: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:border-cyan-400 outline-none"
                />
              </div>
            </div>

            {/* Récapitulatif calculé */}
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Total HT</p>
                <p className="text-lg font-black text-white">{totalHT.toFixed(2)} €</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">TVA</p>
                <p className="text-lg font-black text-slate-300">{montantTva.toFixed(2)} €</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-cyan-400 font-bold">Total TTC</p>
                <p className="text-lg font-black text-cyan-400">{totalTTC.toFixed(2)} €</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => router.back()} className="text-sm text-slate-400 hover:text-slate-200">
                Retour
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-cyan-600 hover:bg-cyan-500 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition-colors"
              >
                {isSaving ? "Enregistrement..." : "Enregistrer les frais d'intérim"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
