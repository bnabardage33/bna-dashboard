export type ProfilRevenu = 'bleu' | 'jaune' | 'violet' | 'rose' | 'aucun';

export interface AidesEstimees {
  primeAnah: number;
  primeCEE: number;
  totalAides: number;
}

/**
 * Calcule une estimation des aides MaPrimeRénov' et CEE
 * pour des travaux d'Isolation Thermique par l'Extérieur (ITE).
 * Prend en compte l'écrêtement sur le montant des travaux.
 * @param surfaceM2 Surface isolée en mètres carrés
 * @param profilRevenu Code couleur MaPrimeRénov'
 * @param montantTotalHT Montant total HT du devis
 * @returns { primeAnah, primeCEE, totalAides }
 */
export function calculerAidesITE(surfaceM2: number, profilRevenu: ProfilRevenu, montantTotalHT: number): AidesEstimees {
  if (profilRevenu === 'aucun' || surfaceM2 <= 0 || montantTotalHT <= 0) {
    return { primeAnah: 0, primeCEE: 0, totalAides: 0 };
  }

  let tauxAnah = 0;
  let ecretementPct = 1.0;

  switch (profilRevenu) {
    case 'bleu':
      tauxAnah = 75;
      ecretementPct = 0.90; // 90% max
      break;
    case 'jaune':
      tauxAnah = 60;
      ecretementPct = 0.75; // 75% max
      break;
    case 'violet':
      tauxAnah = 40;
      ecretementPct = 0.60; // 60% max
      break;
    case 'rose':
      tauxAnah = 0;
      ecretementPct = 0.40; // 40% max (CEE seulement)
      break;
  }

  // 1. Calcul des primes brutes au forfait
  const primeAnahBrute = surfaceM2 * tauxAnah;
  const primeCEEBrute = surfaceM2 * 10;
  const totalBrut = primeAnahBrute + primeCEEBrute;

  // 2. Détermination de la base éligible (plafonnée à 150€ HT / m² selon l'Anah pour l'ITE)
  const plafondEligible = surfaceM2 * 150;
  const depenseEligibleHT = Math.min(montantTotalHT, plafondEligible);

  // 3. Calcul de l'écrêtement (le cumul des aides ne peut dépasser un certain pourcentage de la dépense éligible)
  const plafondAidesTotal = depenseEligibleHT * ecretementPct;

  let totalAides = totalBrut;
  let primeAnah = primeAnahBrute;
  let primeCEE = primeCEEBrute;

  if (totalAides > plafondAidesTotal) {
    totalAides = plafondAidesTotal;
    // On réduit la prime Anah en priorité pour respecter le plafond global, 
    // car les CEE sont généralement déduits en premier
    primeAnah = Math.max(0, totalAides - primeCEE);
    // Si même après avoir annulé l'Anah ça dépasse (rare), on réduit les CEE
    primeCEE = totalAides - primeAnah; 
  }

  return {
    primeAnah,
    primeCEE,
    totalAides
  };
}
