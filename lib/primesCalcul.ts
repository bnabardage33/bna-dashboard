export type ProfilRevenu = 'bleu' | 'jaune' | 'violet' | 'rose' | 'aucun';

export interface AidesEstimees {
  primeAnah: number;
  primeCEE: number;
  totalAides: number;
}

export function determinerZoneClimatique(codePostal: string): 'H1' | 'H2' | 'H3' {
  const dep = codePostal.substring(0, 2);
  const h1 = ["75", "77", "78", "91", "92", "93", "94", "95", "59", "62", "80", "02", "60", "51", "08", "10", "52", "54", "55", "57", "88", "67", "68", "70", "90", "25", "39", "71", "21", "89", "58", "42", "69", "01", "74", "73", "38", "05", "26", "07", "43", "63", "15"];
  const h3 = ["06", "83", "13", "30", "34", "11", "66", "2A", "2B"];

  if (h1.includes(dep)) return 'H1';
  if (h3.includes(dep)) return 'H3';
  return 'H2'; // Reste de la France
}

/**
 * Extrait le code postal d'une adresse complète
 */
export function extraireCodePostal(adresse: string | null | undefined): string {
  if (!adresse) return "00000";
  const match = adresse.match(/\b\d{5}\b/);
  return match ? match[0] : "00000";
}

/**
 * Calcule une estimation des aides MaPrimeRénov' et CEE
 * pour des travaux d'Isolation Thermique par l'Extérieur (ITE).
 * Prend en compte l'écrêtement sur le montant des travaux.
 * @param surfaceM2 Surface isolée en mètres carrés
 * @param profilRevenu Code couleur MaPrimeRénov'
 * @param montantTotalHT Montant total HT du devis
 * @param codePostal Code postal du chantier (pour les CEE)
 * @returns { primeAnah, primeCEE, totalAides }
 */
export function calculerAidesITE(surfaceM2: number, profilRevenu: ProfilRevenu, montantTotalHT: number, codePostal: string): AidesEstimees {
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
  
  // 1.5 Calcul précis CEE BAR-EN-102
  const zone = determinerZoneClimatique(codePostal);
  let kwhCumacParM2 = 1300;
  if (zone === 'H1') kwhCumacParM2 = 1600;
  else if (zone === 'H3') kwhCumacParM2 = 880;

  const volumeCumac = surfaceM2 * kwhCumacParM2;
  const tauxCEE = (profilRevenu === 'bleu' || profilRevenu === 'jaune') ? 0.009 : 0.0075;
  const primeCEEBrute = volumeCumac * tauxCEE;

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
    primeAnah = Math.max(0, totalAides - primeCEE);
    primeCEE = totalAides - primeAnah; 
  }

  return {
    primeAnah,
    primeCEE,
    totalAides
  };
}
