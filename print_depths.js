const fs = require('fs');
let txt = fs.readFileSync('components/ZoneCard.tsx', 'utf8');

const lines = txt.split('\n');
let divs = 0;
for (let i = 210; i < lines.length; i++) {
  if (lines[i].includes('function Chiffre')) break;
  let o = (lines[i].match(/<div/g) || []).length;
  let c = (lines[i].match(/<\/div>/g) || []).length;
  divs += o - c;
  if (lines[i].includes('OUVERTURES')) {
    console.log('At OUVERTURES line ' + i + ' depth is:', divs);
  }
  if (lines[i].includes('RÉSULTATS MÉTRÉS')) {
    console.log('At RÉSULTATS MÉTRÉS line ' + i + ' depth is:', divs);
  }
}
