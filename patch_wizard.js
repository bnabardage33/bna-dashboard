const fs = require('fs');

// Patch ZoneCard
let p2 = 'components/ZoneCard.tsx';
let txt2 = fs.readFileSync(p2, 'utf8');

if (!txt2.includes('mode: "saisie" | "resultat"')) {
  txt2 = txt2.replace(/globalCalepinage\?: any;/g, 'globalCalepinage?: any;\n  mode?: "saisie" | "resultat";');
  txt2 = txt2.replace(/globalCalepinage,\n}: \{/g, 'globalCalepinage,\n  mode = "resultat",\n}: {');
  
  // Hide the results if mode === "saisie"
  // The results start after the OUVERTURES block.
  // There is a div containing the Ouvertures, then "Synthèse Technique" etc.
  // We can just wrap the bottom half in `{mode === "resultat" && ( ... )}`
  // Let's find a safe injection point.
  const synthRegex = /\{\/\* ====================================================== \*\/\}\s*\{\/\* RÉSULTATS & PLANS \*\/\}/;
  if (txt2.includes('{/* RÉSULTATS & PLANS */}')) {
    txt2 = txt2.replace(synthRegex, '{mode === "resultat" && (\n      <>\n      $&');
    // And close it at the end of the return statement before the final </div>
    // Wait, the final return </div> is at the end of the component.
    const endComponent = /    <\/div>\n  \);\n\}/;
    txt2 = txt2.replace(endComponent, '      </>\n      )}\n    </div>\n  );\n}');
  } else {
    // If we don't have RÉSULTATS & PLANS, let's just wrap after OUVERTURES
    // Let's see what follows OUVERTURES
    console.log("Could not find RESULTATS & PLANS");
  }
}
fs.writeFileSync(p2, txt2);

// Patch page.tsx
let p1 = 'app/terrain/chantier/[id]/page.tsx';
let txt1 = fs.readFileSync(p1, 'utf8');

if (!txt1.includes('isGlobalCalculated')) {
  txt1 = txt1.replace(/const \[calepinageGlobalResult, setCalepinageGlobalResult\] = useState<any>\(null\);/, 'const [calepinageGlobalResult, setCalepinageGlobalResult] = useState<any>(null);\n  const [isGlobalCalculated, setIsGlobalCalculated] = useState(false);');
  
  txt1 = txt1.replace(/setCalepinageGlobalResult\(res\);/, 'setCalepinageGlobalResult(res);\n      setIsGlobalCalculated(true);');
  
  // Reset isGlobalCalculated when things change
  txt1 = txt1.replace(/setCalepinageGlobalResult\(null\);/g, 'setCalepinageGlobalResult(null);\nsetIsGlobalCalculated(false);');
  
  // Pass mode to ZoneCard
  txt1 = txt1.replace(/globalCalepinage=\{calepinageGlobalResult\?\.resultatsMur\?\.\[zone\.id\]\}/g, 'globalCalepinage={calepinageGlobalResult?.resultatsMur?.[zone.id]}\n                mode={isGlobalCalculated ? "resultat" : "saisie"}');
  
  // Hide Resume cards when not calculated
  txt1 = txt1.replace(/<div className="grid grid-cols-2 gap-3 rounded-xl border border-white\/10 bg-\[\#1A1D24\] p-4 sm:grid-cols-5">/, '{isGlobalCalculated && (\n          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-[#1A1D24] p-4 sm:grid-cols-5">');
  txt1 = txt1.replace(/<Resume label="À commander" value=\{totaux\.aCommander\} highlight \/>\n          <\/div>/, '<Resume label="À commander" value={totaux.aCommander} highlight />\n          </div>\n          )}');
}
fs.writeFileSync(p1, txt1);

console.log('Patched Wizard UI');
