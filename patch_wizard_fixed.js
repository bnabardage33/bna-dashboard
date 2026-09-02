const fs = require('fs');
let p = 'components/ZoneCard.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(/globalCalepinage\?: any;/g, 'globalCalepinage?: any;\n  mode?: "saisie" | "resultat";');
txt = txt.replace(/globalCalepinage,\n}: \{/g, 'globalCalepinage,\n  mode = "resultat",\n}: {');

const synthRegex = /\{\/\* ====================================================== \*\/\}\s*\{\/\* RÉSULTATS MÉTRÉS \*\/\}/;
txt = txt.replace(synthRegex, '{mode === "resultat" && (\n      <>\n      $&');

// Now we need to close it at the end of ZoneCard.
// The end of ZoneCard is immediately before:
// /* ==============================================================
//   CHAMP NUMÉRIQUE
//   ============================================================== */
const endZoneCard = /\s*\{\/\* ==============================================================\s*CHAMP NUMÉRIQUE/;
txt = txt.replace(endZoneCard, '\n      </>\n      )}\n$&');

fs.writeFileSync(p, txt);
console.log('Fixed ZoneCard correctly');
