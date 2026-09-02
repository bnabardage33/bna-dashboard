const fs = require('fs');

let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

if (!content.includes('import SaisieGlobaleCalepinage')) {
  content = content.replace(
    'import { Suspense, useEffect, useState, useCallback } from "react";',
    'import { Suspense, useEffect, useState, useCallback } from "react";\nimport SaisieGlobaleCalepinage from "@/components/SaisieGlobaleCalepinage";\nimport { genererCalepinageGlobal } from "@/lib/calepinageEngine";'
  );
}

// Replace the old CONFIGURATION GLOBALE section with SaisieGlobaleCalepinage
const startMarker = '{/* ==================== CONFIGURATION GLOBALE ==================== */}';
const endMarker = '<div className="space-y-4">'; // right before mapping zones to ZoneCard

const replaceBlock = `
        {/* ==================== CONFIGURATION GLOBALE ==================== */}
        <SaisieGlobaleCalepinage 
          zonesExistantes={zones} 
          onValider={(input) => {
            const res = genererCalepinageGlobal(input);
            setCalepinageGlobalResult(res.calepinageGlobal as any);
            setIsGlobalCalculated(true);
            // On pourrait aussi afficher les ossatures générées
            console.log("Ossatures générées :", res.ossatures);
          }} 
        />
        
`;

if (content.includes(startMarker)) {
  const startIndex = content.indexOf(startMarker);
  // Find the next space-y-4 which maps zones
  const searchPattern = '<div className="space-y-4">';
  let searchIndex = content.indexOf(searchPattern, startIndex);
  
  if (startIndex !== -1 && searchIndex !== -1) {
    content = content.substring(0, startIndex) + replaceBlock + content.substring(searchIndex);
  }
}

fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
console.log("Patched page.tsx");
