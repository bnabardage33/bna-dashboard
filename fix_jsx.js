const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

// Find the block from {/* Ancien affichage ignoré pour la nouvelle démo: to }*/
const start = content.indexOf('{/* Ancien affichage ignoré pour la nouvelle démo:');
const end = content.indexOf('}*/', start);

if (start !== -1 && end !== -1) {
  content = content.substring(0, start) + content.substring(end + 3);
  fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
  console.log("Fixed JSX comment block");
} else {
  console.log("Could not find block", start, end);
}
