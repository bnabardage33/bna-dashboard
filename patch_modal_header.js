const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

const targetHeader = `<h3 className="text-lg font-bold text-white">Plan de Débit Global (Toutes Façades)</h3>
                  <button onClick={() => setModalGlobalDebitOuvert(false)} className="text-gray-400 hover:text-white p-2">✕</button>`;

const newHeader = `<h3 className="text-lg font-bold text-white">Plan de Débit Global (Toutes Façades)</h3>
                  <div className="flex items-center gap-4">
                    <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all">
                      🖨️ Imprimer le Plan
                    </button>
                    <button onClick={() => setModalGlobalDebitOuvert(false)} className="text-gray-400 hover:text-white p-2">✕</button>
                  </div>`;

content = content.replace(targetHeader, newHeader);
fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
console.log("Patched modal header with Print button");
