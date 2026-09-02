const fs = require('fs');
let p = 'components/ZoneCard.tsx';
let txt = fs.readFileSync(p, 'utf8');

// Undo the calculating logic in calculerZone
txt = txt.replace(/const calep = globalCalepinage \|\| calculerCalepinage\(\{/, 'const calep = calculerCalepinage({');

// And in ZoneCard component:
// const resultats = calculerZone(zone);
// Let's replace that with logic that overrides calepinage
txt = txt.replace(/const resultats = calculerZone\(zone\);/, 'const resultats = calculerZone(zone);\n  if (globalCalepinage) resultats.calepinage = globalCalepinage;');

fs.writeFileSync(p, txt);
console.log('Fixed ZoneCard TS error');
