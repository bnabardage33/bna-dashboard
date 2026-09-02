const fs = require('fs');
let content = fs.readFileSync('components/SaisieGlobaleCalepinage.tsx', 'utf8');

// Add murDeplie state
if (!content.includes('const [murDeplie, setMurDeplie]')) {
  content = content.replace(
    'const [murs, setMurs] = useState<MurInput[]>(',
    `const [murDeplie, setMurDeplie] = useState<string | null>(zonesExistantes[0]?.id || null);\n  const [murs, setMurs] = useState<MurInput[]>(`
  );
}

// When adding a new wall, auto-expand it
content = content.replace(
  'const ajouterMur = () => {',
  `const ajouterMur = () => {\n    const newId = Date.now().toString();\n    setMurDeplie(newId);`
);
content = content.replace(
  `setMurs([...murs, { id: Date.now().toString()`,
  `setMurs([...murs, { id: newId`
);

// Replace the murs.map rendering logic
const oldMapStart = `{murs.map((mur, index) => (`;
const oldMapEnd = `</button>
      </div>`;
      
// I will just use regex to replace the whole block from {murs.map to </button>\n      </div>
// Because it's hard to match exact newlines, I'll use substring.
const startIndex = content.indexOf('{murs.map((mur, index) => (');
const endIndex = content.indexOf('</button>\n      </div>', startIndex) + '</button>\n      </div>'.length;

if (startIndex > -1 && endIndex > -1) {
  const newMapLogic = `{murs.map((mur, index) => {
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
      </div>`;
  
  content = content.substring(0, startIndex) + newMapLogic + content.substring(endIndex);
  fs.writeFileSync('components/SaisieGlobaleCalepinage.tsx', content);
  console.log("Patched UI for mobile layout and accordion.");
} else {
  console.error("Could not find the map block to replace.");
}
