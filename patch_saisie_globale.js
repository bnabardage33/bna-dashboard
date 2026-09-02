const fs = require('fs');
let content = fs.readFileSync('components/SaisieGlobaleCalepinage.tsx', 'utf8');

// replace onValider to pass murs
// Wait, it already passes { murs, plaqueBrute, moduleCible }
