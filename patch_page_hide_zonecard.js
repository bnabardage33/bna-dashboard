const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

const target1 = '<div className="space-y-4">\n            {zones.map((zone) => (';
const replace1 = '<div className="space-y-4">\n            {isGlobalCalculated && zones.map((zone) => (';

content = content.replace(target1, replace1);

const target2 = `          <button
            onClick={ajouterZone}
            className="w-full rounded-xl border border-dashed border-white/10 py-3 text-sm font-medium text-gray-400 hover:border-red-600/40 hover:text-red-400"
          >
            + Ajouter une zone
          </button>`;
const replace2 = `{/* Add zone hidden by new engine */}`;

content = content.replace(target2, replace2);

fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
console.log("Patched page.tsx to hide ZoneCard during saisie");
