function trouverMeilleureGrilleSymetrique(
  largeurMurM, hauteurMurM, hauteurFaiteM, epaisseurJointM,
  hauteurPieceM, rawPlaqueL_M, rawPlaqueH_M, epaisseurTraitScieM
) {
  const hTotale = hauteurFaiteM ?? hauteurMurM;
  const nbRows = Math.max(1, Math.ceil(hTotale / (hauteurPieceM + epaisseurJointM)));

  const candidates = [];
  const targetMm = Math.round(largeurMurM * 1000);
  const jMm = Math.round(epaisseurJointM * 1000);
  const maxW_Mm = Math.min(1500, Math.round(rawPlaqueL_M * 1000));
  const minW_Mm = 300;

  const possibleWidths = [];
  for (let w = minW_Mm; w <= maxW_Mm; w += 50) {
    possibleWidths.push(w);
  }

  const maxN = Math.floor(targetMm / minW_Mm);

  // Try to generate 5000 valid candidates
  let attempts = 0;
  while (candidates.length < 5000 && attempts < 50000) {
    attempts++;
    const n = Math.floor(Math.random() * (maxN - 1)) + 2;
    const spaceToFill = targetMm - (n - 1) * jMm;
    if (spaceToFill <= 0) continue;

    const halfN = Math.floor(n / 2);
    const isOdd = n % 2 !== 0;
    
    const halfGrid = [];
    let currentSum = 0;
    let valid = true;

    for (let i = 0; i < halfN - (isOdd ? 0 : 1); i++) {
      const w = possibleWidths[Math.floor(Math.random() * possibleWidths.length)];
      halfGrid.push(w);
      currentSum += w;
    }

    let center = 0;
    if (isOdd) {
      center = spaceToFill - 2 * currentSum;
      if (center < minW_Mm || center > maxW_Mm) valid = false;
    } else {
      const lastW = (spaceToFill - 2 * currentSum) / 2;
      if (lastW < minW_Mm || lastW > maxW_Mm) valid = false;
      else halfGrid.push(lastW);
    }

    if (valid) {
      const fullGrid = isOdd 
        ? [...halfGrid, center, ...[...halfGrid].reverse()]
        : [...halfGrid, ...[...halfGrid].reverse()];

      // Aesthetic check
      let nbChangements = 0;
      for (let i = 0; i < fullGrid.length - 1; i++) {
        if (Math.abs(fullGrid[i] - fullGrid[i+1]) > 10) nbChangements++;
      }
      if (nbChangements >= (fullGrid.length - 1) * 0.4 || fullGrid.length <= 3) {
        candidates.push(fullGrid.map(x => x / 1000));
      }
    }
  }

  if (candidates.length === 0) {
     let n = Math.floor((largeurMurM + epaisseurJointM) / (1.0 + epaisseurJointM));
     if (n < 1) n = 1;
     const w = (largeurMurM - (n - 1) * epaisseurJointM) / n;
     candidates.push(Array(n).fill(w));
  }
  
  console.log("Candidates generated:", candidates.length, "in", attempts, "attempts");

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
  15.0, 6.0, null, 0.008, 0.6, 3.050, 1.300, 0.003
));
console.timeEnd("opt");
