const fs = require('fs');
let code = fs.readFileSync('app/bureau/devis-factures/page.tsx', 'utf8');
// Undo the previous bad replacement if needed, actually I'll just check if it compiled
