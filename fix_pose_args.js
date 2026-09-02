const fs = require('fs');
let content = fs.readFileSync('lib/calepinageEngine.ts', 'utf8');

const target = `{
        resultats: resultatMur,
        estPignon: mur.estPignon || false,
        pentePct: resultatMur.pentePct || 0
      }`;

const replace = `{}`;

if (content.includes('resultats: resultatMur,')) {
  content = content.replace(target, replace);
  fs.writeFileSync('lib/calepinageEngine.ts', content);
  console.log("Fixed pose args");
}
