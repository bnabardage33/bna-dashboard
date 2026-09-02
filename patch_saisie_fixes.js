const fs = require('fs');
let content = fs.readFileSync('components/SaisieGlobaleCalepinage.tsx', 'utf8');

// Add sensPose state
if (!content.includes('const [sensPose, setSensPose]')) {
  content = content.replace(
    'const [moduleCible, setModuleCible] = useState({ largeurMm: 1000, hauteurMm: 600 });',
    'const [moduleCible, setModuleCible] = useState({ largeurMm: 1000, hauteurMm: 600 });\n  const [sensPose, setSensPose] = useState<"horizontal" | "vertical">("horizontal");'
  );
}

// Add sensPose select
if (!content.includes('Sens de pose')) {
  const targetGrid = '<div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-black/40 rounded-lg border border-white/5">';
  const sensPoseBlock = `
        <div>
          <label className="block text-xs uppercase text-gray-400 font-bold mb-1">Sens de pose</label>
          <select value={sensPose} onChange={e => setSensPose(e.target.value as any)} className="w-full bg-gray-800 text-white p-2 rounded">
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>`;
  content = content.replace(targetGrid, targetGrid + sensPoseBlock);
}

// Pass sensPose to onValider
content = content.replace(
  'onValider({ murs, plaqueBrute: plaque, moduleCible })',
  'onValider({ murs, plaqueBrute: plaque, moduleCible, sensPose } as any)'
);

// Fix the 0 in inputs for murs
content = content.replace(/value=\{mur\.largeurM\}/g, 'value={mur.largeurM || ""}');
content = content.replace(/value=\{mur\.hauteurM\}/g, 'value={mur.hauteurM || ""}');
content = content.replace(/value=\{mur\.hauteurFaiteM \|\| mur\.hauteurM\}/g, 'value={mur.hauteurFaiteM || ""}');

// Fix the 0 in inputs for ouvertures
content = content.replace(/value=\{ouv\.xM\}/g, 'value={ouv.xM === 0 ? "0" : (ouv.xM || "")}');
content = content.replace(/value=\{ouv\.yM\}/g, 'value={ouv.yM === 0 ? "0" : (ouv.yM || "")}');
content = content.replace(/value=\{ouv\.largeurM\}/g, 'value={ouv.largeurM || ""}');
content = content.replace(/value=\{ouv\.hauteurM\}/g, 'value={ouv.hauteurM || ""}');

fs.writeFileSync('components/SaisieGlobaleCalepinage.tsx', content);
console.log("Patched SaisieGlobaleCalepinage.tsx");
