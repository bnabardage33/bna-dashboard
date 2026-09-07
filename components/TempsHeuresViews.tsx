"use client";

import React, { useState } from "react";
import { 
  calculerTempsBudget, 
  calculerTempsPlanification, 
  calculerBilanRentabilite,
  calculerTempsConsommeMeteo
} from "@/lib/gaelLogic";
import { validerPointageAvecMeteo, supprimerPointageGlob, reinitialiserPointagesChantier } from "@/app/actions/pointage";
import { Trash2, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PointageFinance, Equipe } from "@/types/finance";

const MOCK_CATALOGUE = {
  surface: 0.5,
  coupe: 0.3,
  singularite: 1.5
};

const METEO_ICONS: Record<string, string> = {
  'Clément': '☀️',
  'Pluie fine': '🌧️',
  'Grosse averse': '⛈️',
  'Non relevée': '➖'
};

/**
 * Vue 1 : Chantiers & Calepinage
 */
export function ChantiersCalepinageView({ initialSurface = 0, initialCoupes = 0, initialSingularites = 0 }) {
  const [surface, setSurface] = useState<number>(initialSurface);
  const [coupes, setCoupes] = useState<number>(initialCoupes);
  const [singularites, setSingularites] = useState<number>(initialSingularites);
  const [coef, setCoef] = useState<number>(1.8);

  React.useEffect(() => {
    setSurface(initialSurface);
    setCoupes(initialCoupes);
    setSingularites(initialSingularites);
  }, [initialSurface, initialCoupes, initialSingularites]);

  const tempsBudget = calculerTempsBudget(
    surface, MOCK_CATALOGUE.surface,
    coupes, MOCK_CATALOGUE.coupe,
    singularites, MOCK_CATALOGUE.singularite
  );

  const tempsPlanification = calculerTempsPlanification(tempsBudget, coef);

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-6 space-y-4">
      <h3 className="text-lg font-bold text-white">Chantiers & Calepinage</h3>
      <p className="text-sm text-gray-400">
        Entrez les données du calepinage pour calculer le temps budget.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Surface (m²)</label>
          <input type="number" value={surface} onChange={(e) => setSurface(Number(e.target.value))} className="w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Coupes (ml)</label>
          <input type="number" value={coupes} onChange={(e) => setCoupes(Number(e.target.value))} className="w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Singularités (nb)</label>
          <input type="number" value={singularites} onChange={(e) => setSingularites(Number(e.target.value))} className="w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Coef. de perte de rendement</label>
          <input type="number" step="0.1" value={coef} onChange={(e) => setCoef(Number(e.target.value))} className="w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white" />
        </div>
      </div>

      <div className="mt-4 p-4 rounded-lg bg-[#0B0F19] border border-white/10 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500">Temps Budget (Vente)</p>
          <p className="text-xl font-bold text-emerald-400">{tempsBudget.toFixed(2)} h</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Temps à Planifier (Réalité)</p>
          <p className="text-xl font-bold text-gray-300">{tempsPlanification.toFixed(2)} h</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Vue 2 : Pointage Équipe (Mode Confiance)
 */
export function PointageEquipeView({ chantierId, chantierNom }: { chantierId: string, chantierNom: string }) {
  const [heures, setHeures] = useState<number>(0);
  const [dateSaisie, setDateSaisie] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [historique, setHistorique] = useState<PointageFinance[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [equipeId, setEquipeId] = useState<string>("00000000-0000-0000-0000-000000000000");

  const fetchHistorique = async () => {
    if (!chantierId) return;
    const { data } = await supabase
      .from('pointages_globaux')
      .select('*')
      .eq('chantier_id', chantierId);
    if (data) setHistorique(data);
  };

  const fetchEquipes = async () => {
    const { data } = await supabase.from('equipe').select('id, nom, prenom');
    if (data && data.length > 0) {
      setEquipes(data);
      setEquipeId(data[0].id);
    }
  };

  React.useEffect(() => {
    fetchHistorique();
    fetchEquipes();
    window.addEventListener("pointageChanged", fetchHistorique);
    return () => window.removeEventListener("pointageChanged", fetchHistorique);
  }, [chantierId]);

  const validerPointage = async () => {
    if (heures <= 0 || !chantierId || !dateSaisie) return;
    setLoading(true);
    
    const result = await validerPointageAvecMeteo(chantierId, equipeId, heures, dateSaisie);
    
    setLoading(false);
    if (result.success) {
      alert(`Pointage validé : ${heures}h.\nMétéo détectée : ${result.meteo_relevee} (Coef: ${result.coef_meteo})`);
      setHeures(0);
      window.dispatchEvent(new Event("pointageChanged"));
    } else {
      alert("Erreur: " + result.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer ce pointage ?")) return;
    const { error } = await supabase.from('pointages_globaux').delete().eq('id', id);
    if (!error) {
      window.dispatchEvent(new Event("pointageChanged"));
    } else {
      alert("Erreur: " + error.message);
    }
  };

  const handleReset = async () => {
    if (!confirm("Voulez-vous vraiment remettre à zéro toutes les saisies de ce chantier ?")) return;
    setLoading(true);
    const { error } = await supabase.from('pointages_globaux').delete().eq('chantier_id', chantierId);
    setLoading(false);
    if (!error) {
      window.location.reload();
    } else {
      alert("Erreur: " + error.message);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-6 space-y-4">
      <h3 className="text-lg font-bold text-white">Pointage Équipe (Mode Confiance)</h3>
      <p className="text-sm text-gray-400">
        Saisissez le volume d&apos;heures global passé sans chronomètre.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Chantier</label>
          <div className="w-full rounded-lg border border-white/10 bg-slate-700/50 px-3 py-2 text-sm text-gray-300">
            {chantierNom}
          </div>
        </div>

        {equipes.length > 0 && (
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Équipe / Ouvrier</label>
            <select 
              value={equipeId} 
              onChange={(e) => setEquipeId(e.target.value)} 
              className="w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white"
            >
              {equipes.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.prenom} {eq.nom}</option>
              ))}
            </select>
          </div>
        )}
        
        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Date du pointage</label>
          <input 
            type="date" 
            value={dateSaisie} 
            onChange={(e) => setDateSaisie(e.target.value)} 
            className="w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white" 
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Heures globales (Forfait)</label>
          <input 
            type="number" 
            placeholder="Ex: 35"
            value={heures || ""} 
            onChange={(e) => setHeures(Number(e.target.value))} 
            className="w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white text-center text-2xl font-bold" 
          />
        </div>

        <button 
          onClick={validerPointage}
          disabled={loading || heures <= 0 || !dateSaisie}
          className="w-full rounded-lg bg-red-700 py-3 font-bold text-white hover:bg-red-600 transition-colors disabled:opacity-50"
        >
          {loading ? "Validation en cours..." : "Valider le Pointage"}
        </button>
      </div>

      <div className="mt-8 border-t border-white/10 pt-6">
        <button 
          onClick={handleReset}
          disabled={loading}
          className="mb-4 flex items-center justify-center w-full gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-colors px-4 py-3 rounded-lg"
        >
          🗑️ Remettre à zéro les heures
        </button>
        
        <h4 className="text-sm font-bold text-white mb-4">Historique des saisies</h4>
        
        {historique.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Aucun pointage pour ce chantier.</p>
        ) : (
          <div className="space-y-2">
            {historique.map(p => {
              const adjusted = p.volume_heures_declare / (p.coef_meteo || 1.0);
              const icon = METEO_ICONS[p.meteo_relevee] || '➖';
              
              return (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-[#0B0F19]/50 border border-white/10">
                  <div>
                    <p className="text-sm font-semibold text-white">{p.date_saisie || 'Sans date'}</p>
                    <p className="text-xs text-gray-400">
                      Météo : {p.meteo_relevee || 'N/A'} {icon} (Coef: {p.coef_meteo || 1.0})
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-300">Brut : {p.volume_heures_declare}h</p>
                      <p className="text-xs text-gray-300">Ajusté : {adjusted.toFixed(1)}h</p>
                    </div>
                    <button onClick={() => handleDelete(p.id)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-md transition-colors" title="Supprimer">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Vue 3 : Tableau de Bord / Rentabilité
 */
interface PointageData {
  volumeHeures: number;
  coefMeteo: number;
  meteo: string;
}

interface RentabiliteData {
  id: string;
  nom: string;
  budget: number;
  pointages: PointageData[];
}

export function TableauDeBordRentabiliteView({ chantierId, chantierNom }: { chantierId: string, chantierNom: string }) {
  const [data, setData] = useState<RentabiliteData | null>(null);

  const fetchData = async () => {
    if (!chantierId) return;
    const { data: chantier } = await supabase
      .from("chantiers")
      .select("id, nom, surface_m2, quantite_coupes_ml, singularites_nb, pointages_globaux(volume_heures_declare, coef_meteo, meteo_relevee)")
      .eq("id", chantierId)
      .single();
    
    if (chantier) {
      // Calcul du budget à la volée avec les données du chantier
      const budget = calculerTempsBudget(
        chantier.surface_m2 || 0, MOCK_CATALOGUE.surface,
        chantier.quantite_coupes_ml || 0, MOCK_CATALOGUE.coupe,
        chantier.singularites_nb || 0, MOCK_CATALOGUE.singularite
      );
      
      const formatted = {
        id: chantier.id,
        nom: chantierNom,
        budget: budget || 0,
        pointages: (chantier.pointages_globaux as PointageData[])?.map(p => ({
          volumeHeures: Number(p.volume_heures_declare) || 0,
          coefMeteo: Number(p.coef_meteo) || 1.0,
          meteo: p.meteo_relevee || "Non relevée"
        })) || []
      };
      setData(formatted);
    }
  };

  React.useEffect(() => {
    fetchData();
    window.addEventListener("pointageChanged", fetchData);
    return () => window.removeEventListener("pointageChanged", fetchData);
  }, [chantierId]);

  if (!data) return null;

  const totalPointesBrut = data.pointages.reduce((sum: number, p: PointageData) => sum + p.volumeHeures, 0);
  const tempsConsomme = calculerTempsConsommeMeteo(data.pointages);
  const ecart = calculerBilanRentabilite(data.budget, tempsConsomme);
  const pct = data.budget > 0 ? Math.min((tempsConsomme / data.budget) * 100, 100) : 0;
  const estPositif = ecart >= 0;

  // Déterminer la météo dominante ou l'afficher en icônes
  const icones = Array.from(new Set(data.pointages.map((p: PointageData) => METEO_ICONS[p.meteo] || '➖'))).join(" ");

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-6 space-y-4">
      <h3 className="text-lg font-bold text-white">Tableau de Bord / Rentabilité</h3>
      <p className="text-sm text-gray-400">
        Analyse du "Temps Budget" vs "Temps Réel Consommé" (ajusté selon la météo).
      </p>

      <div className="space-y-6 mt-4">
        <div className="p-4 rounded-lg bg-[#0B0F19] border border-white/10">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold text-white">{data.nom} {icones}</span>
            <span className={`font-bold ${estPositif ? 'text-emerald-400' : 'text-red-400'}`}>
              Écart : {ecart > 0 ? '+' : ''}{ecart.toFixed(1)} h
            </span>
          </div>
          
          <div className="h-4 w-full bg-[#1A1D24] rounded-full overflow-hidden flex">
            <div 
              className={`h-full ${estPositif ? 'bg-emerald-500' : 'bg-red-500'}`} 
              style={{ width: `${pct}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <div>
              <span>Pointé brut : {totalPointesBrut}h</span>
              <span className="mx-2">|</span>
              <span className="text-gray-400">Consommé ajusté : {tempsConsomme.toFixed(1)}h</span>
            </div>
            <span>Budget : {data.budget.toFixed(1)}h</span>
          </div>
        </div>
      </div>
    </div>
  );
}
