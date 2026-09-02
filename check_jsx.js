const fs = require('fs');
let txt = fs.readFileSync('components/ZoneCard.tsx', 'utf8');
const start = txt.indexOf('{mode === "resultat" && (');
const end = txt.indexOf('</>', start);
const chunk = txt.slice(start, end);
const openDivs = (chunk.match(/<div/g) || []).length;
const closeDivs = (chunk.match(/<\/div>/g) || []).length;
console.log('Open divs:', openDivs, 'Close divs:', closeDivs);
