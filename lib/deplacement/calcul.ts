import { arrondir } from "@/lib/devisCalcul";

export function calculerMontantDeplacement(
  distanceAllerKm: number,
  distanceRetourKm: number,
  tarifKm: number
): number {
  const distanceTotal = Math.max(0, distanceAllerKm) + Math.max(0, distanceRetourKm);
  const tarif = Math.max(0, tarifKm);
  return arrondir(distanceTotal * tarif);
}

export function calculerTaxesDeplacement(
  montantHt: number,
  tauxTva: number
): { montantTva: number; montantTtc: number } {
  const ht = Math.max(0, montantHt);
  const tva = arrondir(ht * (Math.max(0, tauxTva) / 100));
  const ttc = arrondir(ht + tva);
  return { montantTva: tva, montantTtc: ttc };
}
