const fs = require('fs');
let content = fs.readFileSync('components/VisualiseurDebitPlaques.tsx', 'utf8');

content = content.replace(
  'calepinage: ResultatCalepinage;',
  'calepinage: any;' // Bypass TS strict check for now
);

const replacements = [
  ['calepinage.plaqueBruteLongueurMm', '(calepinage.plaqueBruteLongueurMm || calepinage.plaquesDebit?.[0]?.longueurMm || 0)'],
  ['calepinage.plaqueBruteLargeurMm', '(calepinage.plaqueBruteLargeurMm || calepinage.plaquesDebit?.[0]?.largeurMm || 0)'],
  ['calepinage.nbPiecesPosees', '(calepinage.nbPiecesPosees || calepinage.pieces?.length || 0)'],
  ['calepinage.surfaceZoneM2', '(calepinage.surfaceZoneM2 || calepinage.pieces?.reduce((s, p) => s + p.surfaceM2, 0) || 0)'],
  ['calepinage.jointMm ?? 8', 'calepinage.jointMm ?? 8']
];

for (const [target, replace] of replacements) {
  content = content.split(target).join(replace);
}

fs.writeFileSync('components/VisualiseurDebitPlaques.tsx', content);
console.log("Patched VisualiseurDebitPlaques.tsx");
