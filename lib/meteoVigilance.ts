// lib/meteoVigilance.ts
//
// Historiquement, ce fichier portait SA PROPRE lecture de la Vigilance
// Météo-France (en plus des helpers de couleur), sous forme d'une copie d'ancien
// route handler. Trois copies de la même lecture ont ainsi divergé : ici, dans
// `app/api/meteo-vigilance/route.ts`, et dans l'Edge Function
// `supabase/functions/generer-rapports-intemperies`.
//
// La lecture vit désormais dans `lib/vigilanceMeteoFrance.ts`, partagée. Ce
// fichier ne fait plus que réexporter, pour ne pas casser les imports existants
// (`lib/meteoAlerte.ts`, `app/api/meteo/intemperies/route.ts`) ni le type
// `VigilanceDepartement`.
//
// Ne RIEN réimplémenter ici : une seule source de vérité.
export * from "./vigilanceMeteoFrance";
