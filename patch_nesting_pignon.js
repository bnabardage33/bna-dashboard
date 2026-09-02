const fs = require('fs');
let content = fs.readFileSync('lib/calepinageCalcul.ts', 'utf8');

const targetStr = `  const piecesToPlace: PieceToPlace[] = pieces.map((p) => ({
    sourcePiece: p,
    wMm: p.largeurNetteMm || Math.round(p.largeurM * 1000),
    hMm: p.hauteurNetteMm || Math.round(p.hauteurM * 1000),
    surfaceM2: p.surfaceM2,
  }));`;

const replacementStr = `  const piecesToPlace: PieceToPlace[] = [];
  const processedPieceIds = new Set<string>();

  for (let i = 0; i < pieces.length; i++) {
    const p1 = pieces[i];
    if (processedPieceIds.has(p1.id)) continue;

    let paired = false;
    // Si c'est une pièce de pignon, essayons de trouver son miroir
    if (p1.type === "pignon" && p1.points && p1.points.length >= 3) {
      // Trouver la hauteur gauche et droite
      const pts1 = [...p1.points].sort((a, b) => a.xM - b.xM);
      const leftPts1 = pts1.filter(pt => Math.abs(pt.xM - pts1[0].xM) < 0.01);
      const rightPts1 = pts1.filter(pt => Math.abs(pt.xM - pts1[pts1.length-1].xM) < 0.01);
      
      const hL1 = Math.max(...leftPts1.map(pt => pt.yM)) - Math.min(...leftPts1.map(pt => pt.yM));
      const hR1 = Math.max(...rightPts1.map(pt => pt.yM)) - Math.min(...rightPts1.map(pt => pt.yM));

      for (let j = i + 1; j < pieces.length; j++) {
        const p2 = pieces[j];
        if (p2.type === "pignon" && p2.points && !processedPieceIds.has(p2.id)) {
          // Vérifier si p2 est le miroir exact
          if (Math.abs(p1.largeurNetteMm - p2.largeurNetteMm) < 2) {
            const pts2 = [...p2.points].sort((a, b) => a.xM - b.xM);
            const leftPts2 = pts2.filter(pt => Math.abs(pt.xM - pts2[0].xM) < 0.01);
            const rightPts2 = pts2.filter(pt => Math.abs(pt.xM - pts2[pts2.length-1].xM) < 0.01);
            
            const hL2 = Math.max(...leftPts2.map(pt => pt.yM)) - Math.min(...leftPts2.map(pt => pt.yM));
            const hR2 = Math.max(...rightPts2.map(pt => pt.yM)) - Math.min(...rightPts2.map(pt => pt.yM));

            // Si hL1 == hR2 et hR1 == hL2, c'est un miroir !
            if (Math.abs(hL1 - hR2) < 0.05 && Math.abs(hR1 - hL2) < 0.05) {
              // On peut les fusionner dans un seul rectangle
              const combinedHeightM = hL1 + hR1; // since hL1 + hR1 = hL1 + hL2 (trait de scie inclus dans p.hauteurNetteMm mais on va juste faire la somme des hauteurs nettes)
              // En fait, la hauteur combinée est la somme des hauteurs max des deux, moins le chevauchement.
              // Plus simplement: H = hL1 + hR1
              const combinedHeightMm = Math.round(combinedHeightM * 1000) + traitDeScieMm;
              
              piecesToPlace.push({
                sourcePiece: {
                  ...p1,
                  repere: p1.repere + " + " + p2.repere,
                  surfaceM2: p1.surfaceM2 + p2.surfaceM2,
                  estPairePignon: true
                } as any,
                wMm: p1.largeurNetteMm,
                hMm: combinedHeightMm,
                surfaceM2: p1.surfaceM2 + p2.surfaceM2,
              });
              
              processedPieceIds.add(p1.id);
              processedPieceIds.add(p2.id);
              paired = true;
              break;
            }
          }
        }
      }
    }

    if (!paired) {
      piecesToPlace.push({
        sourcePiece: p1,
        wMm: p1.largeurNetteMm || Math.round(p1.largeurM * 1000),
        hMm: p1.hauteurNetteMm || Math.round(p1.hauteurM * 1000),
        surfaceM2: p1.surfaceM2,
      });
      processedPieceIds.add(p1.id);
    }
  }`;

if (content.includes('const piecesToPlace: PieceToPlace[] = pieces.map((p) => ({')) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync('lib/calepinageCalcul.ts', content);
  console.log("Patched nesting for pignon reuse");
} else {
  console.log("Could not find target string.");
}
