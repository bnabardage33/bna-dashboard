/**
 * L'Algorithme de Chiffrage et Planification (La "Gaël Logic")
 */

/**
 * Étape 1 - Le Temps Budget (Vente)
 * Calcule le temps théorique total en croisant les données du chantier (le calepinage) avec le catalogue_temps.
 * 
 * @param surfaceM2 Surface du chantier en m2
 * @param tempsUnitaireSurface Temps en heures par m2
 * @param quantiteCoupesMl Quantité de coupes en mètres linéaires
 * @param tempsUnitaireCoupe Temps en heures par coupe ML
 * @param singularitesNb Nombre de singularités (ex: fenêtres)
 * @param tempsUnitaireSingularite Temps en heures par singularité
 * @returns Temps Budget total en heures
 */
export function calculerTempsBudget(
  surfaceM2: number,
  tempsUnitaireSurface: number,
  quantiteCoupesMl: number,
  tempsUnitaireCoupe: number,
  singularitesNb: number,
  tempsUnitaireSingularite: number
): number {
  return (surfaceM2 * tempsUnitaireSurface) + 
         (quantiteCoupesMl * tempsUnitaireCoupe) + 
         (singularitesNb * tempsUnitaireSingularite);
}

/**
 * Étape 2 - Le Temps de Planification (Réalité terrain pour l'équipe)
 * Calcule le temps de présence estimé sur place, avec une marge de sécurité.
 * 
 * @param tempsBudget Le temps budget calculé à l'étape 1
 * @param coefPerteRendement Le coefficient de perte (ex: 1.8 pour une équipe de 2 personnes)
 * @returns Temps de planification en heures
 */
export function calculerTempsPlanification(
  tempsBudget: number, 
  coefPerteRendement: number = 1.8
): number {
  return tempsBudget / coefPerteRendement;
}

/**
 * Étape 3 - Le Bilan de Rentabilité
 * Compare le "Temps Budget" avec la somme des heures déclarées.
 * 
 * @param tempsBudget Le temps budget initial
 * @param tempsReelDeclare Le total des heures pointées (somme des volume_heures_declare)
 * @returns L'écart en heures (Positif = gain, Négatif = perte)
 */
export function calculerBilanRentabilite(
  tempsBudget: number, 
  tempsReelDeclare: number
): number {
  return tempsBudget - tempsReelDeclare;
}
