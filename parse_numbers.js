const fs = require('fs');
let content = fs.readFileSync('components/SaisieGlobaleCalepinage.tsx', 'utf8');

const oldButton = `onValider({ murs, plaqueBrute: plaque, moduleCible, sensPose, isolant } as any)`;

const newButton = `onValider({ 
          murs: murs.map(m => ({
            ...m,
            largeurM: Number(m.largeurM),
            hauteurM: Number(m.hauteurM),
            hauteurFaiteM: m.hauteurFaiteM ? Number(m.hauteurFaiteM) : undefined,
            ouvertures: m.ouvertures.map(o => ({
              ...o,
              xM: Number(o.xM),
              yM: Number(o.yM),
              largeurM: Number(o.largeurM),
              hauteurM: Number(o.hauteurM)
            }))
          })), 
          plaqueBrute: { longueurMm: Number(plaque.longueurMm), largeurMm: Number(plaque.largeurMm) }, 
          moduleCible: { largeurMm: Number(moduleCible.largeurMm), hauteurMm: Number(moduleCible.hauteurMm) }, 
          sensPose, 
          isolant: { ...isolant, epaisseurMm: Number(isolant.epaisseurMm), surfacePaquetM2: Number(isolant.surfacePaquetM2) } 
        } as any)`;

content = content.replace(oldButton, newButton);
fs.writeFileSync('components/SaisieGlobaleCalepinage.tsx', content);
console.log("Added parse to numbers on valider");
