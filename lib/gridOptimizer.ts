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
  
  // 1. Uniform grids [W, W, ..., W]
  for (let n = 1; n <= 30; n++) {
    const w = (largeurMurM - (n - 1) * epaisseurJointM) / n;
    if (w >= 0.15 && w <= rawPlaqueL_M) {
      candidates.push(Array(n).fill(w));
    }
  }

  // 2. Standard [R, W, ..., W, R]
  // Test W by varying from 300mm to max raw board size
  for (let w = 0.3; w <= rawPlaqueL_M; w += 0.05) {
    const maxN = Math.floor((largeurMurM + epaisseurJointM) / (w + epaisseurJointM));
    for (let n = 1; n <= maxN; n++) {
      const reste = largeurMurM - (n * w + (n - 1) * epaisseurJointM);
      const r = (reste - 2 * epaisseurJointM) / 2;
      // Rive doit être réalisable (>= 150mm)
      if (r >= 0.15 && r <= rawPlaqueL_M) {
        candidates.push([r, ...Array(n).fill(w), r]);
      }
    }
  }

  // Si aucun candidat n'est généré, on fallback sur des largeurs égales
  if (candidates.length === 0) {
    let bestN = Math.max(1, Math.floor(largeurMurM / rawPlaqueL_M));
    let w = (largeurMurM - (bestN - 1) * epaisseurJointM) / bestN;
    while (w > rawPlaqueL_M) {
        bestN++;
        w = (largeurMurM - (bestN - 1) * epaisseurJointM) / bestN;
    }
    candidates.push(Array(bestN).fill(w));
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
