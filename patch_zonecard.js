const fs = require('fs');
const p = 'components/ZoneCard.tsx';
let txt = fs.readFileSync(p, 'utf8');

const start = txt.indexOf('{zone.famille_pose ===\n          "hpl" && (\n          <div className="space-y-4 rounded-lg border border-white/10 bg-[#0B0F19]/60 p-3.5">');
const endStr = '          </div>\n        )}';
const end = txt.indexOf(endStr, start);

if (start !== -1 && end !== -1) {
  const before = txt.substring(0, start);
  const after = txt.substring(end + endStr.length);
  fs.writeFileSync(p, before + '{/* PARAMETRES HPL DEPLACES AU CHANTIER */}' + after);
  console.log('Replaced successfully');
} else {
  console.log('Not found', start, end);
}
