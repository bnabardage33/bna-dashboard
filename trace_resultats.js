const fs = require('fs');
let txt = fs.readFileSync('components/ZoneCard.tsx', 'utf8');

const lines = txt.split('\n');
let divs = 0;
for (let i = 210; i < 1050; i++) {
  if (lines[i].includes('function Chiffre')) break;
  let o = (lines[i].match(/<div/g) || []).length;
  let c = (lines[i].match(/<\/div>/g) || []).length;
  divs += o - c;
  if (i > 1030) {
    console.log('Line', i, 'Depth after line:', divs, 'Content:', lines[i].trim());
  }
}
