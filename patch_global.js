const fs = require('fs');
const p = 'lib/calepinageCalcul.ts';
let code = fs.readFileSync(p, 'utf8');

code = code.replace(/tauxChuteNettePct: number;\n\}/, 'tauxChuteNettePct: number;\n  resultatsMur: Record<string, ResultatCalepinage>;\n}');
code = code.replace(/let allPieces: PieceCalepinage\[\] = \[\];/, 'let allPieces: PieceCalepinage[] = [];\n  const resultatsMur: Record<string, ResultatCalepinage> = {};');
code = code.replace(/for \(const p of res\.pieces\) \{/, 'resultatsMur[zone.zoneId] = res;\n    for (const p of res.pieces) {');
code = code.replace(/tauxChuteNettePct,\n  \};/, 'tauxChuteNettePct,\n    resultatsMur,\n  };');

fs.writeFileSync(p, code);
console.log('Patched');
