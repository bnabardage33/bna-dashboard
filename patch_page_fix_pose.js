const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

const target1 = `calepinage={calepinageGlobalResult?.resultatsMur?.[mur.id] || null}`;
const replace1 = `calepinage={calepinageGlobalResult?.resultatsMur?.[mur.id]?.calepinage || null}`;
content = content.replace(target1, replace1);

const target2 = `pose={null}`;
const replace2 = `pose={calepinageGlobalResult?.resultatsMur?.[mur.id]?.pose || null}`;
content = content.replace(target2, replace2);

fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
console.log("Patched page.tsx for pose and calepinage access");
