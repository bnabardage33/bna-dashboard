const fs = require('fs');
let content = fs.readFileSync('components/VisualiseurDebitPlaques.tsx', 'utf8');

// Replace sky colors with red colors
content = content.replace('isRive ? "#38bdf8" : "#0284c7"', 'isRive ? "#ef4444" : "#dc2626"');

// And maybe another blue?
if (content.includes('blue-') || content.includes('sky-')) {
  content = content.replace(/blue-/g, 'red-');
  content = content.replace(/sky-/g, 'red-');
}

fs.writeFileSync('components/VisualiseurDebitPlaques.tsx', content);
console.log("Fixed SVG blue colors");
