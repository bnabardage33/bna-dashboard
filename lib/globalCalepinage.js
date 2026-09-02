// Script to patch calepinageCalcul.ts with the new function
const fs = require('fs');
const p = 'lib/calepinageCalcul.ts';
let code = fs.readFileSync(p, 'utf8');

if (!code.includes('export function calculerCalepinageGlobal')) {
  code += `

export interface CalepinageGlobalInput {
  zones: (CalepinageInput & { zoneId: string; zoneNom: string })[];
  plaqueLongueurMm: number;
  plaqueLargeurMm: number;
  moduleLargeurMm: number;
  moduleHauteurMm: number;
  traitDeScieMm?: number;
}

export interface ResultatCalepinageGlobal {
  plaquesDebit: PlaqueDebit[];
  pieces: PieceCalepinage[];
  nbPlaquesNecessaires: number;
  surfacePlaquesAchetesM2: number;
  totalChutesReutilisablesM2: number;
  totalDechetsPerteM2: number;
  tauxChuteBrutePct: number;
  tauxChuteNettePct: number;
  resultatsMur: Record<string, ResultatCalepinage>;
}

export function calculerCalepinageGlobal(input: CalepinageGlobalInput): ResultatCalepinageGlobal {
  const { zones, plaqueLongueurMm, plaqueLargeurMm, moduleLargeurMm, moduleHauteurMm, traitDeScieMm = 3 } = input;
  
  let allPieces: PieceCalepinage[] = [];
  const resultatsMur: Record<string, ResultatCalepinage> = {};
  
  for (const zone of zones) {
    const res = calculerCalepinage({
      ...zone,
      plaqueLongueurMm,
      plaqueLargeurMm,
      moduleLargeurMm,
      moduleHauteurMm,
    });
    
    resultatsMur[zone.zoneId] = res;
    
    for (const p of res.pieces) {
      allPieces.push({
        ...p,
        id: \`\${zone.zoneId}-\${p.id}\`,
        repere: \`\${zone.zoneNom}-\${p.repere}\`,
      });
    }
  }
  
  const nestingResult = genererPlanDebitNesting(
    allPieces,
    plaqueLongueurMm,
    plaqueLargeurMm,
    moduleLargeurMm,
    moduleHauteurMm,
    traitDeScieMm
  );
  
  const plaquesDebit = nestingResult.plaquesDebit;
  const nbPlaquesNecessaires = plaquesDebit.length;
  const surfacePlaqueBruteM2 = (plaqueLongueurMm * plaqueLargeurMm) / 1_000_000;
  const surfacePlaquesAchetesM2 = nbPlaquesNecessaires * surfacePlaqueBruteM2;
  const surfaceZoneM2 = allPieces.reduce((s, p) => s + p.surfaceM2, 0);
  
  const totalChutesReutilisablesM2 = plaquesDebit.reduce(
    (s, p) => s + p.surfaceChutesReutilisablesM2,
    0
  );

  const totalDechetsPerteM2 = Math.max(
    0,
    surfacePlaquesAchetesM2 - surfaceZoneM2 - totalChutesReutilisablesM2
  );

  const chuteBruteM2 = Math.max(0, surfacePlaquesAchetesM2 - surfaceZoneM2);
  const tauxChuteBrutePct =
    surfacePlaquesAchetesM2 > 0
      ? (chuteBruteM2 / surfacePlaquesAchetesM2) * 100
      : 0;

  const tauxChuteNettePct =
    surfacePlaquesAchetesM2 > 0
      ? (totalDechetsPerteM2 / surfacePlaquesAchetesM2) * 100
      : 0;
      
  return {
    plaquesDebit,
    pieces: allPieces,
    nbPlaquesNecessaires,
    surfacePlaquesAchetesM2,
    totalChutesReutilisablesM2,
    totalDechetsPerteM2,
    tauxChuteBrutePct,
    tauxChuteNettePct,
    resultatsMur
  };
}
`;
  fs.writeFileSync(p, code);
  console.log('Added calculerCalepinageGlobal');
} else {
  console.log('Already exists');
}
