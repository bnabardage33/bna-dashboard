export type ProfilRevenu = 'bleu' | 'jaune' | 'violet' | 'rose' | 'aucun';

export interface AidesEstimees {
  primeAnah: number;
  primeCEE: number;
  totalAides: number;
}

/**
 * Calcule une estimation des aides MaPrimeRénov' et CEE
 * pour des travaux d'Isolation Thermique par l'Extérieur (ITE).
 * @param surfaceM2 Surface isolée en mètres carrés
 * @param profilRevenu Code couleur MaPrimeRénov'
 * @returns { primeAnah, primeCEE, totalAides }
 */
export function calculerAidesITE(surfaceM2: number, profilRevenu: ProfilRevenu): AidesEstimees {
  if (profilRevenu === 'aucun' || surfaceM2 <= 0) {
    return { primeAnah: 0, primeCEE: 0, totalAides: 0 };
  }

  let tauxAnah = 0;

  switch (profilRevenu) {
    case 'bleu':
      tauxAnah = 75;
      break;
    case 'jaune':
      tauxAnah = 60;
      break;
    case 'violet':
      tauxAnah = 40;
      break;
    case 'rose':
      tauxAnah = 0;
      break;
  }

  // Prime Anah calculée sur la surface
  const primeAnah = surfaceM2 * tauxAnah;
  
  // Forfait CEE estimatif : 10€ / m² pour tous les profils (valeur moyenne)
  const primeCEE = surfaceM2 * 10;
  
  const totalAides = primeAnah + primeCEE;

  return {
    primeAnah,
    primeCEE,
    totalAides
  };
}
