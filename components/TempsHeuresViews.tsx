"use client";

import React, { useState } from "react";
import { 
  calculerTempsBudget, 
  calculerTempsPlanification, 
  calculerBilanRentabilite,
  calculerTempsConsommeMeteo
} from "@/lib/gaelLogic";
import { validerPointageAvecMeteo } from "@/app/actions/pointage";

// -- Mock data pour la démo --
const MOCK_CATALOGUE = {
  surface: 0.5,
  coupe: 0.3,
  singularite: 1.5
};

// Chantiers avec des pointages détaillés incluant la météo
const MOCK_CHANTIERS = [
  { 
    id: "1", 
    nom: "Chantier A", 
    budget: 45, 
    pointages: [
      { volumeHeures: 20, coefMeteo: 1.0, meteo: "Clément" },
      { volumeHeures: 15, coefMeteo: 1.15, meteo: "Pluie fine" },
      { volumeHeures: 5, coefMeteo: 1.30, meteo: "Grosse averse" }
    ]
  },
  { 
    id: "2", 
    nom: "Chantier B", 
    budget: 30, 
    pointages: [
      { volumeHeures: 35, coefMeteo: 1.0, meteo: "Clément" }
    ]
  },
];

const METEO_ICONS: Record<string, string> = {
  'Clément': '☀️',
  'Pluie fine': '🌧️',
  'Grosse averse': '⛈️'
};

/**
 * Vue 1 : Chantiers & Calepinage
 */
export function ChantiersCalepinageView() {
  const [surface, setSurface] = useState<number>(0);
  const [coupes, setCoupes] = useState<number>(0);
  const [singularites, setSingularites] = useState<number>(0);
  const [coef, setCoef] = useState<number>(1.8);

  const tempsBudget = calculerTempsBudget(
    surface, MOCK_CATALOGUE.surface,
    coupes, MOCK_CATALOGUE.coupe,
    singularites, MOCK_CATALOGUE.singularite
  );

  const tempsPlanification = calculerTempsPlanification(tempsBudget, coef);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 space-y-4">
      <h3 className="text-lg font-bold text-slate-100">Chantiers & Calepinage</h3>
      <p className="text-sm text-slate-400">
        Entrez les données du calepinage pour calculer le temps budget.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Surface (m²)</label>
          <input type="number" value={surface} onChange={(e) => setSurface(Number(e.target.value))} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Coupes (ml)</label>
          <input type="number" value={coupes} onChange={(e) => setCoupes(Number(e.target.value))} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Singularités (nb)</label>
          <input type="number" value={singularites} onChange={(e) => setSingularites(Number(e.target.value))} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Coef. de perte de rendement</label>
          <input type="number" step="0.1" value={coef} onChange={(e) => setCoef(Number(e.target.value))} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
        </div>
      </div>

      <div className="mt-4 p-4 rounded-lg bg-slate-900 border border-slate-700 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500">Temps Budget (Vente)</p>
          <p className="text-xl font-bold text-emerald-400">{tempsBudget.toFixed(2)} h</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Temps à Planifier (Réalité)</p>
          <p className="text-xl font-bold text-sky-400">{tempsPlanification.toFixed(2)} h</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Vue 2 : Pointage Équipe (Mode Confiance)
 */
export function PointageEquipeView() {
  const [chantierId, setChantierId] = useState(MOCK_CHANTIERS[0].id);
  const [heures, setHeures] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const validerPointage = async () => {
    if (heures <= 0) return;
    setLoading(true);
    // On simule un equipe_id bidon pour l'exemple
    const equipeId = "00000000-0000-0000-0000-000000000000";
    
    // Appel Server Action
    const result = await validerPointageAvecMeteo(chantierId, equipeId, heures);
    
    setLoading(false);
    if (result.success) {
      alert(`Pointage validé : ${heures}h.\nMétéo détectée : ${result.meteo_relevee} (Coef: ${result.coef_meteo})`);
      setHeures(0);
    } else {
      alert("Erreur: " + result.error);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 space-y-4">
      <h3 className="text-lg font-bold text-slate-100">Pointage Équipe (Mode Confiance)</h3>
      <p className="text-sm text-slate-400">
        Saisissez le volume d&apos;heures global passé sans chronomètre.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Chantier</label>
          <select value={chantierId} onChange={(e) => setChantierId(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100">
            {MOCK_CHANTIERS.map(c => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Heures globales (Forfait)</label>
          <input 
            type="number" 
            placeholder="Ex: 35"
            value={heures || ""} 
            onChange={(e) => setHeures(Number(e.target.value))} 
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 text-center text-2xl font-bold" 
          />
        </div>

        <button 
          onClick={validerPointage}
          disabled={loading || heures <= 0}
          className="w-full rounded-lg bg-sky-600 py-3 font-bold text-white hover:bg-sky-500 transition-colors disabled:opacity-50"
        >
          {loading ? "Validation en cours..." : "Valider le Pointage"}
        </button>
      </div>
    </div>
  );
}

/**
 * Vue 3 : Tableau de Bord / Rentabilité
 */
export function TableauDeBordRentabiliteView() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 space-y-4">
      <h3 className="text-lg font-bold text-slate-100">Tableau de Bord / Rentabilité</h3>
      <p className="text-sm text-slate-400">
        Analyse du "Temps Budget" vs "Temps Réel Consommé" (ajusté selon la météo).
      </p>

      <div className="space-y-6 mt-4">
        {MOCK_CHANTIERS.map(c => {
          const totalPointesBrut = c.pointages.reduce((sum, p) => sum + p.volumeHeures, 0);
          const tempsConsomme = calculerTempsConsommeMeteo(c.pointages);
          const ecart = calculerBilanRentabilite(c.budget, tempsConsomme);
          const pct = Math.min((tempsConsomme / c.budget) * 100, 100);
          const estPositif = ecart >= 0;

          // Déterminer la météo dominante ou l'afficher en icônes
          const icones = Array.from(new Set(c.pointages.map(p => METEO_ICONS[p.meteo]))).join(" ");

          return (
            <div key={c.id} className="p-4 rounded-lg bg-slate-900 border border-slate-700">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-slate-200">{c.nom} {icones}</span>
                <span className={`font-bold ${estPositif ? 'text-emerald-400' : 'text-red-400'}`}>
                  Écart : {ecart > 0 ? '+' : ''}{ecart.toFixed(1)} h
                </span>
              </div>
              
              <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex">
                <div 
                  className={`h-full ${estPositif ? 'bg-emerald-500' : 'bg-red-500'}`} 
                  style={{ width: `${pct}%` }}
                />
              </div>
              
              <div className="flex justify-between text-xs text-slate-500 mt-2">
                <div>
                  <span>Pointé brut : {totalPointesBrut}h</span>
                  <span className="mx-2">|</span>
                  <span className="text-sky-300">Consommé ajusté : {tempsConsomme.toFixed(1)}h</span>
                </div>
                <span>Budget : {c.budget}h</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
