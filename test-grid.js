function trouverMeilleureGrilleSymetrique(
  largeurMurM, hauteurMurM, hauteurFaiteM, epaisseurJointM,
  hauteurPieceM, rawPlaqueL_M, rawPlaqueH_M, epaisseurTraitScieM
) {
  const hTotale = hauteurFaiteM ?? hauteurMurM;
  const nbRows = Math.max(1, Math.ceil(hTotale / (hauteurPieceM + epaisseurJointM)));

  const candidates = [];
  const targetL = largeurMurM;
  const J = epaisseurJointM;

  // 1. Random sampling of symmetric grids
  // Try n panels from 1 to maxN
  const maxN = Math.floor(targetL / 0.3); // min width 300mm
  
  for (let n = 2; n <= maxN; n++) {
    const spaceToFill = targetL - (n - 1) * J;
    if (spaceToFill <= 0) continue;

    // Generate 1000 random symmetric combinations for each n
    for (let iter = 0; iter < 1000; iter++) {
      const halfN = Math.floor(n / 2);
      const isOdd = n % 2 !== 0;
      
      const weights = [];
      let totalWeight = 0;
      
      for (let i = 0; i < halfN; i++) {
        // Random weight between 0.5 and 1.5 to keep variation reasonable
        const w = 0.5 + Math.random();
        weights.push(w);
        totalWeight += w * 2;
      }
      
      let centerWeight = 0;
      if (isOdd) {
        centerWeight = 0.5 + Math.random();
        totalWeight += centerWeight;
      }
      
      // Normalize to spaceToFill
      const scale = spaceToFill / totalWeight;
      
      const grid = [];
      let isValid = true;
      let nbChangements = 0;

      for (let i = 0; i < halfN; i++) {
        const val = weights[i] * scale;
        if (val < 0.3 || val > rawPlaqueL_M) isValid = false;
        grid.push(val);
      }
      
      if (!isValid) continue;

      const fullGrid = [...grid];
      if (isOdd) {
        const val = centerWeight * scale;
        if (val < 0.3 || val > rawPlaqueL_M) isValid = false;
        fullGrid.push(val);
      }
      fullGrid.push(...[...grid].reverse());
      
      if (!isValid) continue;

      // Check aesthetic variation
      for (let i = 0; i < fullGrid.length - 1; i++) {
        if (Math.abs(fullGrid[i] - fullGrid[i+1]) > 0.05) nbChangements++;
      }
      
      if (nbChangements >= (fullGrid.length - 1) * 0.4 || fullGrid.length <= 3) {
        candidates.push(fullGrid);
      }
    }
  }

  // Fallback
  if (candidates.length === 0) {
     let n = Math.floor((targetL + J) / (1.0 + J));
     if (n < 1) n = 1;
     const w = (targetL - (n - 1) * J) / n;
     candidates.push(Array(n).fill(w));
  }

  // 2. Evaluate
  let bestGrid = candidates[0];
  let bestYield = -1;

  for (const grid of candidates) {
    const pieces1D = [];
    for (let i = 0; i < nbRows; i++) {
      pieces1D.push(...grid);
    }
    
    const stripsPerPlaque = Math.floor((rawPlaqueH_M + epaisseurTraitScieM) / (hauteurPieceM + epaisseurTraitScieM));
    if (stripsPerPlaque === 0) continue;

    pieces1D.sort((a, b) => b - a);
    
    const bins = [];
    for (const p of pieces1D) {
      let placed = false;
      for (let i = 0; i < bins.length; i++) {
        if (bins[i] >= p) {
          bins[i] -= (p + epaisseurTraitScieM);
          placed = true;
          break;
        }
      }
      if (!placed) {
        bins.push(rawPlaqueL_M - p - epaisseurTraitScieM);
      }
    }
    
    const nbStripsNeeded = bins.length;
    const nbPlaquesNeeded = Math.ceil(nbStripsNeeded / stripsPerPlaque);
    const materialUsed = nbPlaquesNeeded * rawPlaqueL_M * rawPlaqueH_M;
    const materialNeeded = pieces1D.reduce((s, x) => s + x * hauteurPieceM, 0);
    const yieldPct = materialNeeded / materialUsed;

    if (yieldPct > bestYield) {
      bestYield = yieldPct;
      bestGrid = grid;
    }
  }

  return { largeurs: bestGrid, rendement: bestYield };
}

console.time("opt");
console.log(trouverMeilleureGrilleSymetrique(
  10.0, 6.0, null, 0.008, 0.6, 3.050, 1.300, 0.003
));
console.timeEnd("opt");
