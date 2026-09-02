const fs = require('fs');
let p = 'app/terrain/chantier/[id]/page.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(/\{zones\.some\(z => z\.famille_pose === "hpl" \|\| \(z\.materiau as string\) === "plaques_hpl"\) && \(/, '{true && (');

txt = txt.replace(/mode=\{isGlobalCalculated \? "resultat" : "saisie"\}/g, 'mode={(isGlobalCalculated || (zone.famille_pose !== "hpl" && zone.materiau !== "plaques_hpl" && zone.materiau !== "fibres_ciment")) ? "resultat" : "saisie"}');

fs.writeFileSync(p, txt);
console.log('Patched page visibility unconditionally');
