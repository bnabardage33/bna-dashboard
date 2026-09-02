import { trouverMeilleureGrilleSymetrique } from "./lib/gridOptimizer";

console.log(trouverMeilleureGrilleSymetrique(
  10.0, // largeur
  6.0,  // hauteur
  null,
  0.008, // joint
  0.6, // module hauteur
  3.050, // plaque L
  1.300, // plaque H
  0.003 // trait scie
));
