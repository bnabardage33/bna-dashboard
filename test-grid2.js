function trouverMeilleureGrilleSymetrique(
  largeurMurM, hauteurMurM, hauteurFaiteM, epaisseurJointM,
  hauteurPieceM, rawPlaqueL_M, rawPlaqueH_M, epaisseurTraitScieM
) {
  const hTotale = hauteurFaiteM ?? hauteurMurM;
  const nbRows = Math.max(1, Math.ceil(hTotale / (hauteurPieceM + epaisseurJointM)));

  const candidates = [];
  const targetL = largeurMurM;
  const J = epaisseurJointM;

  // We want combinations of W (in steps of 0.05m) that sum to L.
  // Actually, let's work in mm to avoid float issues.
  const targetMm = Math.round(targetL * 1000);
  const jMm = Math.round(J * 1000);
  const maxW_Mm = Math.round(rawPlaqueL_M * 1000);
  
  // Possible widths: 300 to maxW, step 50
  const possibleWidths = [];
  for (let w = 300; w <= Math.min(1500, maxW_Mm); w += 50) {
    possibleWidths.push(w);
  }

  // To cover targetMm with n panels:
  // sum(w_i) + (n-1)*jMm = targetMm
  // sum(w_i) = targetMm - (n-1)*jMm
  
  const maxN = Math.floor(targetMm / 300);

  for (let n = 2; n <= maxN; n++) {
    const spaceToFill = targetMm - (n - 1) * jMm;
    if (spaceToFill <= 0) continue;
    
    // We want a symmetric array of length n.
    // If n is even (n = 2k), we need k elements that sum to spaceToFill / 2
    // If n is odd (n = 2k + 1), we need k elements + 1 center element that sum to spaceToFill,
    // where 2 * sum(k) + center = spaceToFill
    
    const halfN = Math.floor(n / 2);
    const isOdd = n % 2 !== 0;

    function search(depth, currentHalf, currentSum) {
      if (depth === halfN) {
        if (isOdd) {
          const center = spaceToFill - 2 * currentSum;
          if (center >= 300 && center <= Math.min(1500, maxW_Mm)) {
            // Valid!
            const fullGrid = [...currentHalf, center, ...[...currentHalf].reverse()];
            addCandidate(fullGrid);
          }
        } else {
          if (currentSum * 2 === spaceToFill) {
            // Valid!
            const fullGrid = [...currentHalf, ...[...currentHalf].reverse()];
            addCandidate(fullGrid);
          }
        }
        return;
      }
      
      for (const w of possibleWidths) {
        if (currentSum * 2 + w * 2 <= spaceToFill) {
          search(depth + 1, [...currentHalf, w], currentSum + w);
        }
      }
    }

    function addCandidate(gridMm) {
      // Aesthetic check:
      let nbChangements = 0;
      for (let i = 0; i < gridMm.length - 1; i++) {
        if (Math.abs(gridMm[i] - gridMm[i+1]) > 10) nbChangements++;
      }
      if (nbChangements >= (gridMm.length - 1) * 0.4 || gridMm.length <= 3) {
        candidates.push(gridMm.map(v => v / 1000));
      }
    }

    search(0, [], 0);
  }

  // Fallback
  if (candidates.length === 0) {
     let n = Math.floor((targetL + J) / (1.0 + J));
     if (n < 1) n = 1;
     const w = (targetL - (n - 1) * J) / n;
     candidates.push(Array(n).fill(w));
  }
  
  console.log("Candidates generated:", candidates.length);

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
  5.0, 6.0, null, 0.008, 0.6, 3.050, 1.300, 0.003
));
console.timeEnd("opt");
