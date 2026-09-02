const fs = require('fs');
const p = 'app/terrain/chantier/[id]/page.tsx';
let txt = fs.readFileSync(p, 'utf8');

// Insert State
const stateRegex = /const \[isGeneratingSecurite, setIsGeneratingSecurite\] = useState\(false\);/;
if (!txt.includes('globalConfigHPL')) {
  txt = txt.replace(stateRegex, `$&
  
  const [globalConfigHPL, setGlobalConfigHPL] = useState({
    plaqueLongueurMm: 3050,
    plaqueLargeurMm: 1300,
    moduleLargeurMm: 1000,
    moduleHauteurMm: 600,
    traitDeScieMm: 3,
    sensPose: "horizontal"
  });
  
  const [calepinageGlobalResult, setCalepinageGlobalResult] = useState(null);
  
  function lancerCalepinageGlobal() {
    if (zones.length === 0) return;
    
    // We import dynamically or just assume it's imported
    // Wait, is it imported?
    // Let's add it to imports later
    const input = {
      zones: zones.map(z => ({
        zoneLargeurM: z.largeur,
        zoneHauteurM: z.hauteur_mur,
        hauteurFaiteM: z.hauteur_faite,
        plaqueLongueurMm: globalConfigHPL.plaqueLongueurMm,
        plaqueLargeurMm: globalConfigHPL.plaqueLargeurMm,
        moduleLargeurMm: globalConfigHPL.moduleLargeurMm,
        moduleHauteurMm: globalConfigHPL.moduleHauteurMm,
        traitDeScieMm: globalConfigHPL.traitDeScieMm,
        sensPose: globalConfigHPL.sensPose,
        estPignon: z.type === "pignon",
        typePose: "pose_droite", // default
        ouvertures: z.ouvertures ? z.ouvertures.map(o => ({
          type: o.type === "baie" || o.type === "porte_fenetre" ? "porte" : o.type,
          largeur: o.largeur,
          hauteur: o.hauteur,
          distanceAngleGaucheM: o.distanceAngleGaucheM || 0,
          hauteurSolM: o.hauteurSolM || 0
        })) : [],
        zoneId: z.id,
        zoneNom: z.nom
      })),
      plaqueLongueurMm: globalConfigHPL.plaqueLongueurMm,
      plaqueLargeurMm: globalConfigHPL.plaqueLargeurMm,
      moduleLargeurMm: globalConfigHPL.moduleLargeurMm,
      moduleHauteurMm: globalConfigHPL.moduleHauteurMm,
      traitDeScieMm: globalConfigHPL.traitDeScieMm
    };
    
    // Call the global function
    import('@/lib/calepinageCalcul').then(m => {
      const res = m.calculerCalepinageGlobal(input);
      setCalepinageGlobalResult(res);
    });
  }
`);
}

// Insert UI
const uiRegex = /\{\/\* ==================== ZONES \(MURS\) ==================== \*\/\}/;
if (!txt.includes('Configuration Matérielle Globale')) {
  txt = txt.replace(uiRegex, `
        {/* ==================== CONFIGURATION GLOBALE ==================== */}
        {chantier.materiau_structurel === "plaques_hpl" && (
          <div className="mb-6 rounded-xl border border-white/10 bg-[#11141D] p-5 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Scissors size={120} />
            </div>
            
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
                    setGlobalConfigHPL(p => ({...p, sensPose: e.target.value}));
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
              <Sparkles size={18} />
              Générer le Débit Global du Chantier
            </button>
          </div>
        )}
  
  $&`);
}

// Replace PlanCalepinage logic to use the global result if available
const calepResultRegex = /const calep = calculerZone\(zone, chantier\.materiau_structurel, chantier\.moyen_acces\);/;
if (!txt.includes('global_override')) {
  txt = txt.replace(calepResultRegex, `
                  // global_override
                  let calep = calculerZone(zone, chantier.materiau_structurel, chantier.moyen_acces);
                  if (calepinageGlobalResult && calepinageGlobalResult.resultatsMur[zone.id]) {
                     calep.calepinage = calepinageGlobalResult.resultatsMur[zone.id];
                     // Disable waste display inside PlanCalepinage by unsetting it locally
                     calep.calepinage.tauxChuteNettePct = undefined;
                     calep.calepinage.tauxChuteBrutePct = undefined;
                  }
  `);
}

// Add VisualiseurDebitPlaques Global at the bottom
const endZonesRegex = /\{\/\* \+ NOUVELLE ZONE \*\/\}/;
if (!txt.includes('calepinageGlobalResult &&')) {
  txt = txt.replace(endZonesRegex, `$&
        
        {calepinageGlobalResult && chantier.materiau_structurel === "plaques_hpl" && (
          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-black text-white">
              <span className="text-red-500">🏭</span> Plan de Découpe Global
            </h2>
            <VisualiseurDebitPlaques calepinage={calepinageGlobalResult} />
          </div>
        )}
  `);
}

fs.writeFileSync(p, txt);
console.log('Page patched');
