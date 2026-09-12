-- Socle MÉTRÉ + TECHNIQUE — source de vérité des quantités pour le futur IA Devis.
--
-- Objet : faire du module Métré + Technique une donnée persistante et fiable.
-- La base conserve le résultat VALIDÉ produit par les moteurs de calcul
-- (calculerZone / calculerPose / calculerCalepinage) — elle ne recopie AUCUNE
-- logique de calcul et n'invente aucune quantité. Les moteurs restent la source
-- du calcul ; la base conserve le résultat.
--
-- Migration STRICTEMENT additive et rétro-compatible :
--   * chantiers        : configuration technique réellement utilisée par
--                        calculerPose() (isolant, conditionnement paquet, vent de
--                        rive). coef_perte_rendement existe déjà sur la table.
--   * chantier_zones   : resultats_techniques JSONB = instantané validé des moteurs.
--   * lignes_commande  : zone_id nullable FK -> chantier_zones (ON DELETE SET NULL :
--                        les commandes historiques non rattachées restent valides).

-- 1) chantiers — configuration technique utilisée par calculerPose()
alter table public.chantiers
  add column if not exists type_isolant text
    check (type_isolant in ('laine_roche', 'laine_verre', 'sans_isolant')),
  add column if not exists epaisseur_isolant_mm numeric,
  add column if not exists surface_paquet_m2 numeric,
  add column if not exists zone_vent_rive boolean;

comment on column public.chantiers.type_isolant is
  'Type d''isolant ITE retenu pour le chantier (laine_roche | laine_verre | sans_isolant). Utilisé par calculerPose().';
comment on column public.chantiers.epaisseur_isolant_mm is
  'Épaisseur d''isolant retenue (mm). Utilisée par calculerPose() (sélection du modèle d''équerre Isolco et de la surface à commander).';
comment on column public.chantiers.surface_paquet_m2 is
  'Surface conditionnée par paquet d''isolant (m²). Utilisée par calculerPose() pour déduire le nombre de paquets à commander.';
comment on column public.chantiers.zone_vent_rive is
  'Resserrement en rives lié à l''exposition au vent : entraxe 40 cm sur le 1er et dernier mètre. Utilisé par calculerPose().';

-- NB : public.chantiers.coef_perte_rendement existe déjà (aucune action requise).

-- 2) chantier_zones — résultat technique VALIDÉ des moteurs de calcul
alter table public.chantier_zones
  add column if not exists resultats_techniques jsonb;

comment on column public.chantier_zones.resultats_techniques is
  'Instantané JSONB du résultat VALIDÉ produit par les moteurs (calculerZone / calculerPose / calculerCalepinage) pour une zone : entrées utilisées, surfaces, coupes, ossature, quincaillerie, isolant, plaques, découpes, chutes, version moteur et date de calcul. Point d''entrée du futur GET /api/chantiers/[id]/metre-complet. Les moteurs restent la source du calcul.';

-- 3) lignes_commande — rattachement optionnel d''une ligne à sa zone d''origine
alter table public.lignes_commande
  add column if not exists zone_id uuid
    references public.chantier_zones (id) on delete set null;

comment on column public.lignes_commande.zone_id is
  'Zone (chantier_zones.id) d''origine de la ligne de commande. Nullable : les commandes historiques restent valides avec NULL. ON DELETE SET NULL pour préserver la commande si la zone est supprimée (ne jamais casser les données existantes).';