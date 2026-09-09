-- Ajoute les dimensions de module HPL (largeur/hauteur) à la table chantier_zones
-- Ces colonnes permettent de persister le module 1000x600 (ou autre) choisi
-- pour le calcul dynamique de l'entraxe des chevrons (déjà présentes dans l'UI).

alter table public.chantier_zones
  add column if not exists module_largeur_mm numeric default null,
  add column if not exists module_hauteur_mm numeric default null;