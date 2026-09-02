import React, { useState } from 'react';
import { MurInput, OuvertureDetail, ProjetCalepinageInput } from '../lib/calepinageEngine';

interface SaisieGlobaleCalepinageProps {
  onValider: (input: ProjetCalepinageInput) => void;
  zonesExistantes: any[]; // On peut pré-remplir avec les zones déjà créées
}

export default function SaisieGlobaleCalepinage({ onValider, zonesExistantes }: SaisieGlobaleCalepinageProps) {
  const [murs, setMurs] = useState<MurInput[]>(
    zonesExistantes.map(z => ({
      id: z.id,
      nom: z.nom || 'Façade',
      largeurM: z.largeur,
      hauteurM: z.hauteur_mur,
      estPignon: z.type === "pignon",
      hauteurFaiteM: z.hauteur_faite,
      ouvertures: [] // On part vide pour les ouvertures complètes avec X/Y par simplicité ou on pourrait mapper si on avait l'info
    }))
  );

  const [plaque, setPlaque] = useState({ longueurMm: 3050, largeurMm: 1300 });
  const [moduleCible, setModuleCible] = useState({ largeurMm: 1000, hauteurMm: 600 });
  
  const ajouterMur = () => {
    setMurs([...murs, { id: Date.now().toString(), nom: `Façade ${murs.length + 1}`, largeurM: 5, hauteurM: 3, ouvertures: [] }]);
  };
  
  const addOuverture = (murId: string) => {
    setMurs(murs.map(m => {
      if (m.id === murId) {
        return {
          ...m,
          ouvertures: [...m.ouvertures, { id: Date.now().toString(), type: 'fenetre', largeurM: 1, hauteurM: 1.2, xM: 1, yM: 1 }]
        };
      }
      return m;
    }));
  };

  const updateMur = (id: string, field: keyof MurInput, value: any) => {
    setMurs(murs.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const updateOuverture = (murId: string, ouvId: string, field: keyof OuvertureDetail, value: any) => {
    setMurs(murs.map(m => {
      if (m.id === murId) {
        return {
          ...m,
          ouvertures: m.ouvertures.map(o => o.id === ouvId ? { ...o, [field]: value } : o)
        };
      }
      return m;
    }));
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#11141D] p-5 shadow-xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span>🌍</span> Saisie Globale Multi-Façades (DTU 45.4)
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-black/40 rounded-lg border border-white/5">
        <div>
          <label className="block text-xs uppercase text-gray-400 font-bold mb-1">Plaque Brute (L x l mm)</label>
          <div className="flex gap-2">
            <input type="number" value={plaque.longueurMm} onChange={e => setPlaque({...plaque, longueurMm: +e.target.value})} className="w-1/2 bg-gray-800 text-white p-2 rounded" />
            <input type="number" value={plaque.largeurMm} onChange={e => setPlaque({...plaque, largeurMm: +e.target.value})} className="w-1/2 bg-gray-800 text-white p-2 rounded" />
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase text-gray-400 font-bold mb-1">Module Cible (L x H mm)</label>
          <div className="flex gap-2">
            <input type="number" value={moduleCible.largeurMm} onChange={e => setModuleCible({...moduleCible, largeurMm: +e.target.value})} className="w-1/2 bg-gray-800 text-white p-2 rounded" />
            <input type="number" value={moduleCible.hauteurMm} onChange={e => setModuleCible({...moduleCible, hauteurMm: +e.target.value})} className="w-1/2 bg-gray-800 text-white p-2 rounded" />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {murs.map((mur, index) => (
          <div key={mur.id} className="p-4 bg-gray-900 rounded-lg border border-gray-700">
            <div className="flex flex-wrap gap-4 mb-4">
              <input type="text" value={mur.nom} onChange={e => updateMur(mur.id, 'nom', e.target.value)} className="bg-black text-white p-2 rounded font-bold" />
              <label className="flex items-center gap-2 text-white">Largeur (m) <input type="number" step="0.1" value={mur.largeurM} onChange={e => updateMur(mur.id, 'largeurM', +e.target.value)} className="w-20 bg-black p-1 rounded" /></label>
              <label className="flex items-center gap-2 text-white">Hauteur (m) <input type="number" step="0.1" value={mur.hauteurM} onChange={e => updateMur(mur.id, 'hauteurM', +e.target.value)} className="w-20 bg-black p-1 rounded" /></label>
            </div>
            
            <div className="pl-4 border-l-2 border-red-500/30 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-semibold text-gray-300">Menuiseries & Ouvertures (Repère X,Y)</h4>
                <button onClick={() => addOuverture(mur.id)} className="text-xs bg-gray-800 text-white px-2 py-1 rounded hover:bg-gray-700">+ Ajouter Menuiserie</button>
              </div>
              
              {mur.ouvertures.map(ouv => (
                <div key={ouv.id} className="flex flex-wrap gap-3 items-center bg-black/50 p-3 rounded">
                  <select value={ouv.type} onChange={e => updateOuverture(mur.id, ouv.id, 'type', e.target.value)} className="bg-gray-800 text-white p-1 rounded text-sm">
                    <option value="fenetre">Fenêtre</option>
                    <option value="porte">Porte</option>
                    <option value="baie">Baie</option>
                  </select>
                  <label className="text-xs text-gray-400">X (m) <input type="number" step="0.1" value={ouv.xM} onChange={e => updateOuverture(mur.id, ouv.id, 'xM', +e.target.value)} className="w-16 bg-gray-800 text-white p-1 rounded ml-1" /></label>
                  <label className="text-xs text-gray-400">Y Allège (m) <input type="number" step="0.1" value={ouv.yM} onChange={e => updateOuverture(mur.id, ouv.id, 'yM', +e.target.value)} className="w-16 bg-gray-800 text-white p-1 rounded ml-1" /></label>
                  <label className="text-xs text-gray-400">Largeur (m) <input type="number" step="0.1" value={ouv.largeurM} onChange={e => updateOuverture(mur.id, ouv.id, 'largeurM', +e.target.value)} className="w-16 bg-gray-800 text-white p-1 rounded ml-1" /></label>
                  <label className="text-xs text-gray-400">Hauteur (m) <input type="number" step="0.1" value={ouv.hauteurM} onChange={e => updateOuverture(mur.id, ouv.id, 'hauteurM', +e.target.value)} className="w-16 bg-gray-800 text-white p-1 rounded ml-1" /></label>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        <button onClick={ajouterMur} className="w-full py-2 border border-dashed border-gray-600 text-gray-400 rounded hover:text-white hover:border-gray-400 transition">
          + Ajouter une face (Pignon, Façade...)
        </button>
      </div>

      <button
        onClick={() => onValider({ murs, plaqueBrute: plaque, moduleCible })}
        className="w-full mt-6 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold py-4 rounded-xl shadow-lg transform transition hover:scale-[1.02] active:scale-95 text-lg"
      >
        Valider le plan et Générer le Calepinage
      </button>
    </div>
  );
}
