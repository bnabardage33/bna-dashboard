const fs = require('fs');

// --- 1. SaisieGlobaleCalepinage.tsx ---
let saisie = fs.readFileSync('components/SaisieGlobaleCalepinage.tsx', 'utf8');

// Add savedInput to Props
saisie = saisie.replace(
  'zonesExistantes: any[];',
  'zonesExistantes: any[];\n  savedInput?: any;'
);
saisie = saisie.replace(
  'export default function SaisieGlobaleCalepinage({ onValider, zonesExistantes }: SaisieGlobaleCalepinageProps) {',
  'export default function SaisieGlobaleCalepinage({ onValider, zonesExistantes, savedInput }: SaisieGlobaleCalepinageProps) {'
);

// Update initial states to use savedInput if available
saisie = saisie.replace(
  'const [murDeplie, setMurDeplie] = useState<string | null>(zonesExistantes[0]?.id || null);',
  'const [murDeplie, setMurDeplie] = useState<string | null>(savedInput?.murs?.[0]?.id || zonesExistantes[0]?.id || null);'
);

saisie = saisie.replace(
  `const [murs, setMurs] = useState<MurInput[]>(
    zonesExistantes.map(z => ({`,
  `const [murs, setMurs] = useState<MurInput[]>(
    savedInput?.murs || zonesExistantes.map(z => ({`
);

saisie = saisie.replace(
  'const [plaque, setPlaque] = useState({ longueurMm: 3050, largeurMm: 1300 });',
  'const [plaque, setPlaque] = useState(savedInput?.plaqueBrute || { longueurMm: 3050, largeurMm: 1300 });'
);

saisie = saisie.replace(
  'const [moduleCible, setModuleCible] = useState({ largeurMm: 1000, hauteurMm: 600 });',
  'const [moduleCible, setModuleCible] = useState(savedInput?.moduleCible || { largeurMm: 1000, hauteurMm: 600 });'
);

saisie = saisie.replace(
  'const [sensPose, setSensPose] = useState<"horizontal" | "vertical">("horizontal");',
  'const [sensPose, setSensPose] = useState<"horizontal" | "vertical">(savedInput?.sensPose || "horizontal");'
);

saisie = saisie.replace(
  `const [isolant, setIsolant] = useState({
    actif: true,
    type: "laine_roche",
    epaisseurMm: 120,
    surfacePaquetM2: 4.8
  });`,
  `const [isolant, setIsolant] = useState(savedInput?.isolant || {
    actif: true,
    type: "laine_roche",
    epaisseurMm: 120,
    surfacePaquetM2: 4.8
  });`
);

fs.writeFileSync('components/SaisieGlobaleCalepinage.tsx', saisie);

// --- 2. page.tsx ---
let page = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

// Add savedInput state
if (!page.includes('const [savedGlobalInput, setSavedGlobalInput] = useState<any>(null);')) {
  page = page.replace(
    'const [isGlobalCalculated, setIsGlobalCalculated] = useState(false);',
    'const [isGlobalCalculated, setIsGlobalCalculated] = useState(false);\n  const [savedGlobalInput, setSavedGlobalInput] = useState<any>(null);'
  );
}

// Add useEffect to load from localStorage
const loadEffect = `
  useEffect(() => {
    if (chantier?.id) {
      const saved = localStorage.getItem('calepinage_' + chantier.id);
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.input) setSavedGlobalInput(data.input);
          if (data.result) setCalepinageGlobalResult(data.result);
          if (data.activeMurs) setActiveMurs(data.activeMurs);
          if (data.isCalculated) setIsGlobalCalculated(true);
        } catch (e) {}
      }
    }
  }, [chantier?.id]);
`;
if (!page.includes("localStorage.getItem('calepinage_'")) {
  page = page.replace(
    'useEffect(() => {',
    loadEffect + '\n  useEffect(() => {'
  );
}

// Modify onValider to save to localStorage
const oldOnValider = `onValider={(input) => {
            const res = genererCalepinageGlobal(input);
            setCalepinageGlobalResult(res.calepinageGlobal as any);
            setActiveMurs(input.murs);
            setIsGlobalCalculated(true);
            console.log("Ossatures générées :", res.ossatures);
          }}`;

const newOnValider = `onValider={(input) => {
            const res = genererCalepinageGlobal(input);
            setCalepinageGlobalResult(res.calepinageGlobal as any);
            setActiveMurs(input.murs);
            setIsGlobalCalculated(true);
            setSavedGlobalInput(input);
            
            // Sauvegarder dans le navigateur
            if (chantier?.id) {
              localStorage.setItem('calepinage_' + chantier.id, JSON.stringify({
                input: input,
                result: res.calepinageGlobal,
                activeMurs: input.murs,
                isCalculated: true
              }));
            }
          }}`;

page = page.replace(oldOnValider, newOnValider);

// Pass savedInput to component
page = page.replace(
  'zonesExistantes={zones}',
  'zonesExistantes={zones} savedInput={savedGlobalInput}'
);

fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', page);
console.log("Patched persistence");
