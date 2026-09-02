const fs = require('fs');
let p = 'app/terrain/chantier/[id]/page.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(/<ZoneCard\n                key=\{zone\.id\}\n                zone=\{zone\}/, '<ZoneCard\n                key={zone.id}\n                zone={zone}\n                globalCalepinage={calepinageGlobalResult?.resultatsMur?.[zone.id]}');

// And we need the VisualiseurDebitPlaques at the end of the page
const endZonesStr = '{/* + NOUVELLE ZONE */}';
const visualiseurInjection = `
        {/* + NOUVELLE ZONE */}
        {calepinageGlobalResult && chantier.materiau_structurel === "plaques_hpl" && (
          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-2xl font-black text-white">
              <span className="text-red-500">🏭</span> Plan de Découpe Global
            </h2>
            <VisualiseurDebitPlaques calepinage={calepinageGlobalResult} />
          </div>
        )}
`;
txt = txt.replace(endZonesStr, visualiseurInjection);
fs.writeFileSync(p, txt);

let p2 = 'components/ZoneCard.tsx';
let txt2 = fs.readFileSync(p2, 'utf8');

txt2 = txt2.replace(/onCreerCommande,\n\}: \{/, 'onCreerCommande,\n  globalCalepinage,\n}: {\n  globalCalepinage?: any;');
txt2 = txt2.replace(/const calep = calculerCalepinage\(\{/, 'const calep = globalCalepinage || calculerCalepinage({');

// And remove the local waste display for PlanCalepinage if globalCalepinage is set
// Actually if it's set, we can just let it render what's in `calep`.
fs.writeFileSync(p2, txt2);

console.log('Patched ZoneCard props');
