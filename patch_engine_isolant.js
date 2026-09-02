const fs = require('fs');
let content = fs.readFileSync('lib/calepinageEngine.ts', 'utf8');

if (!content.includes('isolant?: { actif: boolean; type: string; epaisseurMm: number; surfacePaquetM2: number; };')) {
  content = content.replace(
    'sensPose?: "horizontal" | "vertical";',
    'sensPose?: "horizontal" | "vertical";\n  isolant?: { actif: boolean; type: string; epaisseurMm: number; surfacePaquetM2: number; };'
  );
}

content = content.replace(
  'const { murs, plaqueBrute, moduleCible, jointMm = 8, sensPose = "horizontal" } = input;',
  'const { murs, plaqueBrute, moduleCible, jointMm = 8, sensPose = "horizontal", isolant } = input;'
);

const targetPose = `    const pose = calculerPose(
      "hpl",
      mur.largeurM,
      mur.estPignon && mur.hauteurFaiteM ? mur.hauteurFaiteM : mur.hauteurM,
      false, // angle
      1, // vent
      100, // largeurLame par défaut
      {}
    );`;

const replacePose = `    const pose = calculerPose(
      "hpl",
      mur.largeurM,
      mur.estPignon && mur.hauteurFaiteM ? mur.hauteurFaiteM : mur.hauteurM,
      false, // angle
      1, // vent
      100, // largeurLame par défaut
      {
        epaisseurIsolantMm: isolant?.actif ? isolant.epaisseurMm : 0,
        typeIsolant: (isolant?.type as any) || "laine_roche",
        surfacePaquetM2: isolant?.surfacePaquetM2 || 4.8
      }
    );`;

if (content.includes('{}')) {
  content = content.replace(targetPose, replacePose);
  fs.writeFileSync('lib/calepinageEngine.ts', content);
  console.log("Patched calepinageEngine.ts for Isolant");
}
