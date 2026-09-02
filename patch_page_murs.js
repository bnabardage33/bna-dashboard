const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

if (!content.includes('const [activeMurs, setActiveMurs]')) {
  content = content.replace(
    'const [isGlobalCalculated, setIsGlobalCalculated] = useState(false);',
    'const [isGlobalCalculated, setIsGlobalCalculated] = useState(false);\n  const [activeMurs, setActiveMurs] = useState<any[]>([]);'
  );
}

const targetValider = `onValider={(input) => {
            const res = genererCalepinageGlobal(input);
            setCalepinageGlobalResult(res.calepinageGlobal as any);
            setIsGlobalCalculated(true);
            // On pourrait aussi afficher les ossatures générées
            console.log("Ossatures générées :", res.ossatures);
          }}`;

const replaceValider = `onValider={(input) => {
            const res = genererCalepinageGlobal(input);
            setCalepinageGlobalResult(res.calepinageGlobal as any);
            setActiveMurs(input.murs);
            setIsGlobalCalculated(true);
            console.log("Ossatures générées :", res.ossatures);
          }}`;

content = content.replace(targetValider, replaceValider);

const targetMap = `{isGlobalCalculated && zones.map((zone) => (`;
const replaceMap = `{isGlobalCalculated && activeMurs.map((mur) => (
              <div key={mur.id} className="mb-4">
                <h3 className="text-xl font-bold text-white mb-2">{mur.nom}</h3>
                <PlanCalepinage calepinage={calepinageGlobalResult?.resultatsMur?.[mur.id]} />
              </div>
            ))}
            {/* Ancien affichage ignoré pour la nouvelle démo:`;

if (!content.includes('Ancien affichage ignoré')) {
  content = content.replace(targetMap, replaceMap);
  const endTarget = `onCreerCommande={handleCreerCommande}\n              />\n            ))}`;
  const endReplace = `onCreerCommande={handleCreerCommande}\n              />\n            ))}*/`;
  content = content.replace(endTarget, endReplace);
}

// Ensure PlanCalepinage is imported
if (!content.includes('import PlanCalepinage')) {
  content = content.replace(
    'import VisualiseurDebitPlaques',
    'import PlanCalepinage from "@/components/PlanCalepinage";\nimport VisualiseurDebitPlaques'
  );
}

fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
console.log("Patched page.tsx for activeMurs");
