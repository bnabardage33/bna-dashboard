const fs = require('fs');

// Fix page.tsx
let page = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');
page = page.replace(
  'nom_produit: "Plaques HPL",',
  'nom_produit: "Plaques HPL",\n                      designation: "Plaques HPL (Calepinage Global)",'
);
fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', page);

// Fix VisualiseurDebitPlaques.tsx
let vis = fs.readFileSync('components/VisualiseurDebitPlaques.tsx', 'utf8');
vis = vis.replace('reduce((s, p)', 'reduce((s: number, p: any)');
vis = vis.replace('reduce((s, p)', 'reduce((s: number, p: any)'); // In case there are multiple
vis = vis.replace('plaques.map((plaque, idx)', 'plaques.map((plaque: any, idx: number)');
fs.writeFileSync('components/VisualiseurDebitPlaques.tsx', vis);
console.log("Fixed TS errors");
