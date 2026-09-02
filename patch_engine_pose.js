const fs = require('fs');
let content = fs.readFileSync('lib/calepinageEngine.ts', 'utf8');

if (!content.includes('import { calculerPose }')) {
  content = 'import { calculerPose } from "./poseCalcul";\n' + content;
}

const replaceStr = `resultatsMur[mur.id] = resultatMur;`;
const replacement = `
    const pose = calculerPose(
      "hpl",
      mur.largeurM,
      mur.estPignon && mur.hauteurFaiteM ? mur.hauteurFaiteM : mur.hauteurM,
      0, // angle
      1, // vent
      100, // largeurLame par défaut
      {
        resultats: resultatMur,
        estPignon: mur.estPignon || false,
        pentePct: resultatMur.pentePct || 0
      }
    );
    resultatsMur[mur.id] = { calepinage: resultatMur, pose };`;

if (!content.includes('resultatsMur[mur.id] = { calepinage: resultatMur, pose };')) {
  content = content.replace(replaceStr, replacement);
  fs.writeFileSync('lib/calepinageEngine.ts', content);
  console.log("Patched engine to compute pose");
}
