const fs = require('fs');
const p = 'app/terrain/chantier/[id]/page.tsx';
let code = fs.readFileSync(p, 'utf8');

// Fix 1: State types
code = code.replace(/useState\(null\)/g, 'useState<any>(null)');

// Fix 2: Type casting for sensPose and Ouverture mapping
const oldMapping = /ouvertures: z\.ouvertures \? z\.ouvertures\.map\(o => \(\{\s*type: o\.type === "baie" \|\| o\.type === "porte_fenetre" \? "porte" : o\.type,\s*largeur: o\.largeur,\s*hauteur: o\.hauteur,\s*distanceAngleGaucheM: o\.distanceAngleGaucheM \|\| 0,\s*hauteurSolM: o\.hauteurSolM \|\| 0\s*\}\)\) : \[\]/s;

const newMapping = `ouvertures: z.ouvertures ? z.ouvertures.map(o => ({
          type: (o.type === "baie" || o.type === "porte_fenetre" ? "porte" : o.type) as "porte"|"fenetre",
          largeur: o.largeur,
          hauteur: o.hauteur,
          hauteurLinteauM: (o as any).hauteurAllegeMm ? ((o as any).hauteurAllegeMm / 1000) + o.hauteur : null
        })) : []`;

code = code.replace(oldMapping, newMapping);

code = code.replace(/sensPose: globalConfigHPL\.sensPose,/g, 'sensPose: globalConfigHPL.sensPose as "horizontal" | "vertical",');

fs.writeFileSync(p, code);
console.log('Fixed TS errors in page.tsx');
