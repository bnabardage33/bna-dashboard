import React, { useState } from 'react';
import { MurInput, OuvertureDetail, ProjetCalepinageInput } from '../lib/calepinageEngine';

interface SaisieGlobaleCalepinageProps {
  onValider: (input: ProjetCalepinageInput) => void;
  zonesExistantes: any[]; // On peut pré-remplir avec les zones déjà créées
}

export default function SaisieGlobaleCalepinage({ onValider, zonesExistantes }: SaisieGlobaleCalepinageProps) {
  const [murDeplie, setMurDeplie] = useState<string | null>(zonesExistantes[0]?.id || null);
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
  const [sensPose, setSensPose] = useState<"horizontal" | "vertical">("horizontal");
  const [isolant, setIsolant] = useState({
    actif: true,
    type: "laine_roche",
    epaisseurMm: 120,
    surfacePaquetM2: 4.8
  });
  
  const ajouterMur = () => {
    const newId = Date.now().toString();
    setMurDeplie(newId);
    setMurs([...murs, { id: newId, nom: `Façade ${murs.length + 1}`, largeurM: 5, hauteurM: 3, ouvertures: [] }]);
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-black/40 rounded-lg border border-white/5">
        <div>
          <label className="block text-xs uppercase text-gray-400 font-bold mb-1">Sens de pose</label>
          <select value={sensPose} onChange={e => setSensPose(e.target.value as any)} className="w-full bg-gray-800 text-white p-2 rounded">
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>
        <div className="col-span-2 md:col-span-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <label className="flex items-center gap-2 text-xs uppercase text-white font-bold mb-2">
            <input type="checkbox" checked={isolant.actif} onChange={e => setIsolant({...isolant, actif: e.target.checked})} />
            Isolant (Laine ITE)
          </label>
          {isolant.actif && (
            <div className="grid grid-cols-3 gap-2">
              <select value={isolant.type} onChange={e => setIsolant({...isolant, type: e.target.value})} className="bg-gray-900 text-xs text-white p-2 rounded border border-gray-600">
                <option value="laine_roche">Roche</option>
                <option value="laine_verre">Verre</option>
              </select>
              <select value={isolant.epaisseurMm} onChange={e => setIsolant({...isolant, epaisseurMm: +e.target.value})} className="bg-gray-900 text-xs text-white p-2 rounded border border-gray-600">
                <option value={80}>80 mm</option>
                <option value={100}>100 mm</option>
                <option value={120}>120 mm</option>
                <option value={140}>140 mm</option>
                <option value={160}>160 mm</option>
                <option value={200}>200 mm</option>
              </select>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400">m²/paquet</span>
                <input type="number" step="0.1" value={isolant.surfacePaquetM2} onChange={e => setIsolant({...isolant, surfacePaquetM2: +e.target.value})} className="bg-gray-900 text-xs text-white p-1 rounded border border-gray-600" />
              </div>
            </div>
          )}
        </div>
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
        {murs.map((mur, index) => {
          const isDeplie = murDeplie === mur.id;
          return (
          <div key={mur.id} className="p-3 bg-gray-900 rounded-lg border border-gray-700 shadow-sm">
            <div 
              className="flex justify-between items-center cursor-pointer"
              onClick={() => setMurDeplie(isDeplie ? null : mur.id)}
            >
              <input 
                type="text" 
                value={mur.nom} 
                onChange={e => updateMur(mur.id, 'nom', e.target.value)} 
                onClick={e => e.stopPropagation()} 
                className="bg-black text-white p-2 rounded font-bold w-1/2 border border-transparent focus:border-red-500" 
              />
              <div className="text-gray-400 bg-black/50 px-3 py-1 rounded-full text-xs font-bold">
                {isDeplie ? '▲ Replier' : '▼ Déplier'}
              </div>
            </div>
            
            {isDeplie && (
              <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col text-xs text-gray-400 font-semibold">Largeur (m) 
                    <input type="number" step="0.1" value={mur.largeurM || ""} onChange={e => updateMur(mur.id, 'largeurM', +e.target.value)} className="bg-black p-2.5 rounded text-white mt-1 border border-white/10" />
                  </label>
                  <label className="flex flex-col text-xs text-gray-400 font-semibold">Hauteur (m) 
                    <input type="number" step="0.1" value={mur.hauteurM || ""} onChange={e => updateMur(mur.id, 'hauteurM', +e.target.value)} className="bg-black p-2.5 rounded text-white mt-1 border border-white/10" />
                  </label>
                </div>
                
                <div className="flex flex-col gap-2 bg-black/40 p-3 rounded-lg border border-white/5">
                  <label className="flex items-center gap-2 text-white font-semibold text-sm">
                    <input type="checkbox" checked={mur.estPignon || false} onChange={e => updateMur(mur.id, 'estPignon', e.target.checked)} className="rounded w-4 h-4 accent-red-500" />
                    Est un Pignon
                  </label>
                  {mur.estPignon && (
                    <label className="flex flex-col text-xs text-yellow-400 mt-1">Hauteur Pointe Faîte (m) 
                      <input type="number" step="0.1" value={mur.hauteurFaiteM || ""} onChange={e => updateMur(mur.id, 'hauteurFaiteM', +e.target.value)} className="bg-black text-white p-2.5 rounded border border-yellow-500/50 mt-1" />
                    </label>
                  )}
                </div>
                
                <div className="pl-3 border-l-2 border-red-500/50 space-y-3 pt-1">
                  <button onClick={() => addOuverture(mur.id)} className="w-full text-sm font-bold bg-gray-800 text-white py-3 rounded-lg hover:bg-gray-700 transition border border-white/10 shadow-sm">
                    + Ajouter Menuiserie (X,Y)
                  </button>
                  
                  {mur.ouvertures.map(ouv => (
                    <div key={ouv.id} className="grid grid-cols-2 gap-2 items-center bg-black/50 p-3 rounded-lg border border-white/5 relative group">
                      <div className="col-span-2 flex justify-between items-center mb-1">
                        <select value={ouv.type} onChange={e => updateOuverture(mur.id, ouv.id, 'type', e.target.value)} className="bg-gray-800 text-white p-1.5 rounded text-xs font-bold border border-white/10">
                          <option value="fenetre">Fenêtre</option>
                          <option value="porte">Porte</option>
                          <option value="baie">Baie</option>
                        </select>
                        <button onClick={() => updateMur(mur.id, 'ouvertures', mur.ouvertures.filter(o => o.id !== ouv.id))} className="text-red-500 text-xs hover:text-red-400">✕ Retirer</button>
                      </div>
                      <label className="text-xs text-gray-400 flex flex-col">X (m) <input type="number" step="0.1" value={ouv.xM === 0 ? "0" : (ouv.xM || "")} onChange={e => updateOuverture(mur.id, ouv.id, 'xM', +e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded mt-1" /></label>
                      <label className="text-xs text-gray-400 flex flex-col">Y Allège (m) <input type="number" step="0.1" value={ouv.yM === 0 ? "0" : (ouv.yM || "")} onChange={e => updateOuverture(mur.id, ouv.id, 'yM', +e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded mt-1" /></label>
                      <label className="text-xs text-gray-400 flex flex-col">Largeur (m) <input type="number" step="0.1" value={ouv.largeurM || ""} onChange={e => updateOuverture(mur.id, ouv.id, 'largeurM', +e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded mt-1" /></label>
                      <label className="text-xs text-gray-400 flex flex-col">Hauteur (m) <input type="number" step="0.1" value={ouv.hauteurM || ""} onChange={e => updateOuverture(mur.id, ouv.id, 'hauteurM', +e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded mt-1" /></label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )})}
        
        <button onClick={ajouterMur} className="w-full py-3.5 border border-dashed border-gray-600 text-gray-300 font-semibold rounded-xl hover:text-white hover:border-gray-400 hover:bg-white/5 transition shadow-sm">
          + Ajouter une face (Pignon, Façade...)
        </button>
      </div>

      <button
        onClick={() => onValider({ murs, plaqueBrute: plaque, moduleCible, sensPose, isolant } as any)}
        className="w-full mt-6 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold py-4 rounded-xl shadow-lg transform transition hover:scale-[1.02] active:scale-95 text-lg"
      >
        Valider le plan et Générer le Calepinage
      </button>
    </div>
  );
}
