const fs = require('fs');
let content = fs.readFileSync('components/SaisieGlobaleCalepinage.tsx', 'utf8');

// Add isolant state
if (!content.includes('const [isolant, setIsolant] = useState({')) {
  content = content.replace(
    'const [sensPose, setSensPose] = useState<"horizontal" | "vertical">("horizontal");',
    `const [sensPose, setSensPose] = useState<"horizontal" | "vertical">("horizontal");
  const [isolant, setIsolant] = useState({
    actif: true,
    type: "laine_roche",
    epaisseurMm: 120,
    surfacePaquetM2: 4.8
  });`
  );
}

// Add UI fields
const targetGrid = '<div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-black/40 rounded-lg border border-white/5">';
const newGrid = `<div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-black/40 rounded-lg border border-white/5">`;
content = content.replace(targetGrid, newGrid);

const sensPoseBlock = `
        <div>
          <label className="block text-xs uppercase text-gray-400 font-bold mb-1">Sens de pose</label>
          <select value={sensPose} onChange={e => setSensPose(e.target.value as any)} className="w-full bg-gray-800 text-white p-2 rounded">
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>`;

const isolantBlock = `
        <div className="col-span-2 md:col-span-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
          <label className="flex items-center gap-2 text-xs uppercase text-white font-bold mb-2">
            <input type="checkbox" checked={isolant.actif} onChange={e => setIsolant({...isolant, actif: e.target.checked})} />
            Isolant (Laine ITE)
          </label>
          {isolant.actif && (
            <div className="grid grid-cols-3 gap-2">
              <select value={isolant.type} onChange={e => setIsolant({...isolant, type: e.target.value})} className="bg-gray-900 text-xs text-white p-2 rounded border border-gray-600">
                <option value="laine_roche">Roche</option>
                <option value="laine_verre">Verre</option>
              </select>
              <select value={isolant.epaisseurMm} onChange={e => setIsolant({...isolant, epaisseurMm: +e.target.value})} className="bg-gray-900 text-xs text-white p-2 rounded border border-gray-600">
                <option value={80}>80 mm</option>
                <option value={100}>100 mm</option>
                <option value={120}>120 mm</option>
                <option value={140}>140 mm</option>
                <option value={160}>160 mm</option>
                <option value={200}>200 mm</option>
              </select>
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-400">m²/paquet</span>
                <input type="number" step="0.1" value={isolant.surfacePaquetM2} onChange={e => setIsolant({...isolant, surfacePaquetM2: +e.target.value})} className="bg-gray-900 text-xs text-white p-1 rounded border border-gray-600" />
              </div>
            </div>
          )}
        </div>`;

if (!content.includes('Isolant (Laine ITE)')) {
  content = content.replace(sensPoseBlock, sensPoseBlock + isolantBlock);
}

content = content.replace(
  'onValider({ murs, plaqueBrute: plaque, moduleCible, sensPose } as any)',
  'onValider({ murs, plaqueBrute: plaque, moduleCible, sensPose, isolant } as any)'
);

fs.writeFileSync('components/SaisieGlobaleCalepinage.tsx', content);
console.log("Patched SaisieGlobaleCalepinage.tsx with Isolant");
