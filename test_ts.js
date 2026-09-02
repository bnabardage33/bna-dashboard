const fs = require('fs');
// Let's just grep for basic syntax errors or missing imports
const p = 'app/terrain/chantier/[id]/page.tsx';
const content = fs.readFileSync(p, 'utf-8');
console.log("File loaded");
