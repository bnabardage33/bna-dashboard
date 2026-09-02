const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

const target = '<PlanCalepinage calepinage={calepinageGlobalResult?.resultatsMur?.[mur.id]} />';
const replacement = `<PlanCalepinage 
                  calepinage={calepinageGlobalResult?.resultatsMur?.[mur.id] || null} 
                  largeurM={mur.largeurM}
                  hauteurM={mur.hauteurM}
                  hauteurFaiteReelleM={mur.hauteurFaiteM || null}
                  pose={null}
                  estPignon={mur.estPignon || false}
                />`;

content = content.replace(target, replacement);
fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
