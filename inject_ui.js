const fs = require('fs');
const p = 'app/terrain/chantier/[id]/page.tsx';
let txt = fs.readFileSync(p, 'utf8');

const targetStr = '<div className="space-y-4">\n            {zones.map((zone) => (';
const injection = `
        {/* ==================== CONFIGURATION GLOBALE ==================== */}
        {chantier.materiau_structurel === "plaques_hpl" && (
          <div className="mb-6 rounded-xl border border-white/10 bg-[#11141D] p-5 shadow-xl relative overflow-hidden">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
              <span className="text-red-500">⚙️</span> Configuration Matérielle Globale
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5 relative z-10">
              <div>
                <label className="block text-[11px] uppercase text-gray-400 font-bold mb-1">Taille Plaque Brute (mm)</label>
                <select 
                  value={\`\${globalConfigHPL.plaqueLongueurMm}x\${globalConfigHPL.plaqueLargeurMm}\`}
                  onChange={(e) => {
                    const [l, w] = e.target.value.split('x');
                    setGlobalConfigHPL(p => ({...p, plaqueLongueurMm: parseInt(l), plaqueLargeurMm: parseInt(w)}));
                    setCalepinageGlobalResult(null);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-red-500"
                >
                  <option value="3050x1300">Trespa (3050 × 1300)</option>
                  <option value="2550x1860">Fundermax M (2550 × 1860)</option>
                  <option value="4100x1854">Fundermax XL (4100 × 1854)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-[11px] uppercase text-gray-400 font-bold mb-1">Largeur Cible (mm)</label>
                <input 
                  type="number" 
                  value={globalConfigHPL.moduleLargeurMm}
                  onChange={(e) => {
                    setGlobalConfigHPL(p => ({...p, moduleLargeurMm: parseInt(e.target.value) || 1000}));
                    setCalepinageGlobalResult(null);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-red-500"
                />
              </div>
              
              <div>
                <label className="block text-[11px] uppercase text-gray-400 font-bold mb-1">Hauteur de ligne (mm)</label>
                <input 
                  type="number" 
                  value={globalConfigHPL.moduleHauteurMm}
                  onChange={(e) => {
                    setGlobalConfigHPL(p => ({...p, moduleHauteurMm: parseInt(e.target.value) || 600}));
                    setCalepinageGlobalResult(null);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-red-500"
                />
              </div>
              
              <div>
                <label className="block text-[11px] uppercase text-gray-400 font-bold mb-1">Sens de pose</label>
                <select 
                  value={globalConfigHPL.sensPose}
                  onChange={(e) => {
                    setGlobalConfigHPL(p => ({...p, sensPose: e.target.value as "horizontal"|"vertical"}));
                    setCalepinageGlobalResult(null);
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-red-500"
                >
                  <option value="horizontal">Horizontal</option>
                  <option value="vertical">Vertical</option>
                </select>
              </div>
            </div>
            
            <button
              onClick={lancerCalepinageGlobal}
              className="w-full md:w-auto bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transform transition hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            >
              Générer le Débit Global du Chantier
            </button>
          </div>
        )}
        
        <div className="space-y-4">
            {zones.map((zone) => (
`;
if (txt.includes(targetStr)) {
  txt = txt.replace(targetStr, injection);
  console.log("Injected UI");
} else {
  console.log("Could not find target string");
}

fs.writeFileSync(p, txt);
