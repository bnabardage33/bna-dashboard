const fs = require('fs');
let p = 'app/terrain/chantier/[id]/page.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(/chantier\.materiau_structurel === "plaques_hpl"/g, '(chantier.materiau_structurel as string) === "plaques_hpl"');

fs.writeFileSync(p, txt);
console.log('Fixed page TS error');
