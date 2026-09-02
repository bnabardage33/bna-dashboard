const fs = require('fs');
let content = fs.readFileSync('components/SaisieGlobaleCalepinage.tsx', 'utf8');

const targetStr = `<label className="flex items-center gap-2 text-white">Hauteur (m) <input type="number" step="0.1" value={mur.hauteurM} onChange={e => updateMur(mur.id, 'hauteurM', +e.target.value)} className="w-20 bg-black p-1 rounded" /></label>`;

const replacementStr = `<label className="flex items-center gap-2 text-white">Hauteur Mur (m) <input type="number" step="0.1" value={mur.hauteurM} onChange={e => updateMur(mur.id, 'hauteurM', +e.target.value)} className="w-20 bg-black p-1 rounded" /></label>
              <label className="flex items-center gap-2 text-white ml-4">
                <input type="checkbox" checked={mur.estPignon || false} onChange={e => updateMur(mur.id, 'estPignon', e.target.checked)} className="rounded" />
                Est un Pignon
              </label>
              {mur.estPignon && (
                <label className="flex items-center gap-2 text-yellow-400">Hauteur Pointe Faîte (m) <input type="number" step="0.1" value={mur.hauteurFaiteM || mur.hauteurM} onChange={e => updateMur(mur.id, 'hauteurFaiteM', +e.target.value)} className="w-20 bg-black text-white p-1 rounded border border-yellow-500/50" /></label>
              )}`;

content = content.replace(targetStr, replacementStr);

fs.writeFileSync('components/SaisieGlobaleCalepinage.tsx', content);
