const fs = require('fs');
let p = 'app/terrain/chantier/[id]/page.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(/\{\(chantier\.materiau_structurel as string\) === "plaques_hpl" && \(/, '{zones.some(z => z.famille_pose === "hpl" || (z.materiau as string) === "plaques_hpl") && (');
txt = txt.replace(/\{calepinageGlobalResult && chantier\.materiau_structurel === "plaques_hpl" && \(/, '{calepinageGlobalResult && zones.some(z => z.famille_pose === "hpl" || (z.materiau as string) === "plaques_hpl") && (');

fs.writeFileSync(p, txt);
console.log('Fixed visibility conditions');
