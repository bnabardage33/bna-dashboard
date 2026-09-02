const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

const target = `className="flex-1 rounded-xl bg-blue-600/20 border border-blue-500 text-blue-400 font-bold py-3 hover:bg-blue-600/40 transition"`;
const replace = `className="flex-1 rounded-xl border border-white/10 bg-[#1A1D24] text-gray-300 font-bold py-3 hover:bg-slate-800 transition shadow-sm"`;

content = content.replace(target, replace);
fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
console.log("Fixed blue button");
