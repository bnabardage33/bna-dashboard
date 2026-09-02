const fs = require('fs');
let p = 'components/ZoneCard.tsx';
let txt = fs.readFileSync(p, 'utf8');

const regex = /\{\/\* ====================================================== \*\/\}\s*\{\/\* RÉSULTATS MÉTRÉS \*\/\}/;

if (txt.includes('RÉSULTATS MÉTRÉS')) {
  txt = txt.replace(regex, '{mode === "resultat" && (\n      <>\n      $&');
  // close it at the end
  const endRegex = /    <\/div>\n  \);\n\}/;
  txt = txt.replace(endRegex, '      </>\n      )}\n    </div>\n  );\n}');
}

fs.writeFileSync(p, txt);
console.log('Patched ZoneCard mode');
