export function trouverMeilleureGrilleSymetrique(
  largeurMurM: number,
  hauteurMurM: number,
  hauteurFaiteM: number | null,
  epaisseurJointM: number,
  hauteurPieceM: number,
  rawPlaqueL_M: number,
  rawPlaqueH_M: number,
  epaisseurTraitScieM: number
): { largeurs: number[], rendement: number } {
  const hTotale = hauteurFaiteM ?? hauteurMurM;
  const nbRows = Math.max(1, Math.ceil(hTotale / (hauteurPieceM + epaisseurJointM)));

  const candidates: number[][] = [];
  const targetMm = Math.round(largeurMurM * 1000);
  const jMm = Math.round(epaisseurJointM * 1000);
  const maxW_Mm = Math.min(1500, Math.round(rawPlaqueL_M * 1000));
  const minW_Mm = 300;

  // 1. Uniform grids [W, W, ..., W]
  for (let n = 1; n <= 30; n++) {
    const w = (largeurMurM - (n - 1) * epaisseurJointM) / n;
    if (w >= minW_Mm / 1000 && w <= maxW_Mm / 1000) {
      candidates.push(Array(n).fill(w));
    }
  }

  // 2. Standard [R, W, ..., W, R]
  for (let w = 0.3; w <= maxW_Mm / 1000; w += 0.05) {
    const maxN = Math.floor((largeurMurM + epaisseurJointM) / (w + epaisseurJointM));
    for (let n = 1; n <= maxN; n++) {
      const reste = largeurMurM - (n * w + (n - 1) * epaisseurJointM);
      const r = (reste - 2 * epaisseurJointM) / 2;
      if (r >= minW_Mm / 1000 && r <= maxW_Mm / 1000) {
        candidates.push([r, ...Array(n).fill(w), r]);
      }
    }
  }

  // 3. Random sampling of aesthetic and optimized grids
  const possibleWidths: number[] = [];
  for (let w = minW_Mm; w <= maxW_Mm; w += 50) {
    possibleWidths.push(w);
  }

  const maxN = Math.floor(targetMm / minW_Mm);
  let attempts = 0;
  let randomAdded = 0;
  
  while (randomAdded < 1000 && attempts < 10000) {
    attempts++;
    const n = Math.floor(Math.random() * (maxN - 1)) + 2;
    const spaceToFill = targetMm - (n - 1) * jMm;
    if (spaceToFill <= 0) continue;

    const halfN = Math.floor(n / 2);
    const isOdd = n % 2 !== 0;
    
    const halfGrid: number[] = [];
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

      // Aesthetic check: We want at least some variation
      let nbChangements = 0;
      for (let i = 0; i < fullGrid.length - 1; i++) {
        if (Math.abs(fullGrid[i] - fullGrid[i+1]) > 10) nbChangements++;
      }
      
      if (nbChangements >= (fullGrid.length - 1) * 0.4 || fullGrid.length <= 3) {
        candidates.push(fullGrid.map(x => x / 1000));
        randomAdded++;
      }
    }
  }

  // Fallback
  if (candidates.length === 0) {
     let n = Math.floor((largeurMurM + epaisseurJointM) / (1.0 + epaisseurJointM));
     if (n < 1) n = 1;
     const w = (largeurMurM - (n - 1) * epaisseurJointM) / n;
     candidates.push(Array(n).fill(w));
  }

  // Evaluate
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
    
    const bins: number[] = [];
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
