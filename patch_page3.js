const fs = require('fs');
const p = 'app/terrain/chantier/[id]/page.tsx';
let code = fs.readFileSync(p, 'utf8');

code = code.replace(/typePose: "pose_droite",/g, 'typePose: "pose_droite" as const,');

fs.writeFileSync(p, code);
console.log('Fixed typePose TS error');
