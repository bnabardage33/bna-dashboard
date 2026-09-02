const fs = require('fs');
let content = fs.readFileSync('lib/calepinageEngine.ts', 'utf8');

// Add sensPose to ProjetCalepinageInput
if (!content.includes('sensPose?: "horizontal" | "vertical"')) {
  content = content.replace(
    'jointMm?: number;',
    'jointMm?: number;\n  sensPose?: "horizontal" | "vertical";'
  );
}

// Extract sensPose and pass it to calculerCalepinage
content = content.replace(
  'const { murs, plaqueBrute, moduleCible, jointMm = 8 } = input;',
  'const { murs, plaqueBrute, moduleCible, jointMm = 8, sensPose = "horizontal" } = input;'
);

content = content.replace(
  'jointMm: jointMm,',
  'jointMm: jointMm,\n      sensPose: sensPose,'
);

fs.writeFileSync('lib/calepinageEngine.ts', content);
console.log("Patched lib/calepinageEngine.ts for sensPose");
