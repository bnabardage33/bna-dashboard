const fs = require('fs');
let content = fs.readFileSync('components/SaisieGlobaleCalepinage.tsx', 'utf8');

// Replace +e.target.value with e.target.value for all number inputs
content = content.replace(/\+e\.target\.value/g, 'e.target.value');

// Also, let's fix `value={mur.largeurM || ""}` to `value={mur.largeurM === 0 ? "" : mur.largeurM}` 
// wait, `|| ""` is fine because if it's "0." it's truthy, if it's 0 it evaluates to "" which is fine, 
// but what if they explicitly type "0"? Then it becomes "", so they can't type "0.5"!
// Ah! If it's "0" (string), "0" || "" is "0"! So it works.
// BUT if it's 0 (number), 0 || "" is "". So they can never have exactly 0 (it shows empty string).
// Let's replace `|| ""` with `=== 0 ? "" : ` ? No, if it's `""` (empty string) in state, `"" || ""` is `""`.
// Let's replace `mur.largeurM || ""` with `mur.largeurM ?? ""`
content = content.replace(/mur\.largeurM \|\| ""/g, 'mur.largeurM ?? ""');
content = content.replace(/mur\.hauteurM \|\| ""/g, 'mur.hauteurM ?? ""');
content = content.replace(/mur\.hauteurFaiteM \|\| ""/g, 'mur.hauteurFaiteM ?? ""');
content = content.replace(/ouv\.xM \|\| ""/g, 'ouv.xM ?? ""');
content = content.replace(/ouv\.yM \|\| ""/g, 'ouv.yM ?? ""');
content = content.replace(/ouv\.largeurM \|\| ""/g, 'ouv.largeurM ?? ""');
content = content.replace(/ouv\.hauteurM \|\| ""/g, 'ouv.hauteurM ?? ""');

// There is also `ouv.xM === 0 ? "0" : (ouv.xM || "")`. Let's just make it `ouv.xM ?? ""`
content = content.replace(/ouv\.xM === 0 \? "0" : \(ouv\.xM \|\| ""\)/g, 'ouv.xM ?? ""');
content = content.replace(/ouv\.yM === 0 \? "0" : \(ouv\.yM \|\| ""\)/g, 'ouv.yM ?? ""');

fs.writeFileSync('components/SaisieGlobaleCalepinage.tsx', content);
console.log("Fixed number inputs");
