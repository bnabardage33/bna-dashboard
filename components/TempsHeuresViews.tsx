"use client";

import React, { useState } from "react";
import { 
  calculerTempsBudget, 
  calculerTempsPlanification, 
  calculerBilanRentabilite,
  calculerTempsConsommeMeteo
} from "@/lib/gaelLogic";
import { validerPointageAvecMeteo, supprimerPointageGlob } from "@/app/actions/pointage";
import { Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
export function PointageEquipeView({ chantierId, chantierNom }: { chantierId: string, chantierNom: string }) {
  const [heures, setHeures] = useState<number>(0);
  const [dateSaisie, setDateSaisie] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [historique, setHistorique] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [equipeId, setEquipeId] = useState<string>("00000000-0000-0000-0000-000000000000");

  const fetchHistorique = async () => {
    if (!chantierId) return;
    const { data } = await supabase
      .from('pointages_globaux')
      .select('id, date_saisie, volume_heures_declare, meteo_relevee, coef_meteo, equipe:equipe_id(nom, prenom)')
      .eq('chantier_id', chantierId)
      .order('date_saisie', { ascending: false })
      .order('created_at', { ascending: false });
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
    const result = await supprimerPointageGlob(id);
    if (result.success) {
      window.dispatchEvent(new Event("pointageChanged"));
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
          <div className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm text-slate-300">
            {chantierNom}
          </div>
        </div>

        {equipes.length > 0 && (
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Équipe / Ouvrier</label>
            <select 
              value={equipeId} 
              onChange={(e) => setEquipeId(e.target.value)} 
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              {equipes.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.prenom} {eq.nom}</option>
              ))}
            </select>
          </div>
        )}
        
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">Date du pointage</label>
          <input 
            type="date" 
            value={dateSaisie} 
            onChange={(e) => setDateSaisie(e.target.value)} 
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100" 
          />
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
          disabled={loading || heures <= 0 || !dateSaisie}
          className="w-full rounded-lg bg-sky-600 py-3 font-bold text-white hover:bg-sky-500 transition-colors disabled:opacity-50"
        >
          {loading ? "Validation en cours..." : "Valider le Pointage"}
        </button>
      </div>

      <div className="mt-8 border-t border-slate-700 pt-6">
        <h4 className="text-sm font-bold text-slate-200 mb-4">Historique des saisies</h4>
        {historique.length === 0 ? (
          <p className="text-xs text-slate-500 italic">Aucun pointage pour ce chantier.</p>
        ) : (
          <div className="space-y-2">
            {historique.map(p => {
              const adjusted = p.volume_heures_declare / p.coef_meteo;
              const icon = METEO_ICONS[p.meteo_relevee] || '➖';
              const equipeName = p.equipe ? `${p.equipe.prenom} ${p.equipe.nom}` : 'Équipe inconnue';
              
              return (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{p.date_saisie}</p>
                    <p className="text-xs text-slate-400">
                      {equipeName} · Météo : {p.meteo_relevee} {icon} (Coef: {p.coef_meteo})
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-slate-300">Brut : {p.volume_heures_declare}h</p>
                      <p className="text-xs text-sky-400">Ajusté : {adjusted.toFixed(1)}h</p>
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
export function TableauDeBordRentabiliteView({ chantierId, chantierNom }: { chantierId: string, chantierNom: string }) {
  const [data, setData] = useState<any>(null);

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
        pointages: (chantier.pointages_globaux as any[])?.map(p => ({
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
    window.addEventListener("pointageAdded", fetchData);
    return () => window.removeEventListener("pointageAdded", fetchData);
  }, [chantierId]);

  if (!data) return null;

  const totalPointesBrut = data.pointages.reduce((sum: number, p: any) => sum + p.volumeHeures, 0);
  const tempsConsomme = calculerTempsConsommeMeteo(data.pointages);
  const ecart = calculerBilanRentabilite(data.budget, tempsConsomme);
  const pct = data.budget > 0 ? Math.min((tempsConsomme / data.budget) * 100, 100) : 0;
  const estPositif = ecart >= 0;

  // Déterminer la météo dominante ou l'afficher en icônes
  const icones = Array.from(new Set(data.pointages.map((p: any) => METEO_ICONS[p.meteo] || '➖'))).join(" ");

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-6 space-y-4">
      <h3 className="text-lg font-bold text-slate-100">Tableau de Bord / Rentabilité</h3>
      <p className="text-sm text-slate-400">
        Analyse du "Temps Budget" vs "Temps Réel Consommé" (ajusté selon la météo).
      </p>

      <div className="space-y-6 mt-4">
        <div className="p-4 rounded-lg bg-slate-900 border border-slate-700">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold text-slate-200">{data.nom} {icones}</span>
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
            <span>Budget : {data.budget.toFixed(1)}h</span>
          </div>
        </div>
      </div>
    </div>
  );
}
