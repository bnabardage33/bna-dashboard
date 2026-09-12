-- IA Devis — Phase 1
-- Catalogue = source de vérité des prix et désignations.
-- Migration STRICTEMENT additive et rétro-compatible :
--   * aucune suppression de colonne/table,
--   * aucune modification des lignes existantes (sauf backfill non destructif de
--     total_ht dérivé des lignes déjà stockées — colonnes nouvelles uniquement).
--
-- 1) catalogue_ouvrages
--    . pu_revient  : coût unitaire de revient HT (matière OU main d'œuvre).
--    . type_cout   : nature du coût -> 'matiere' (fournitures) | 'main_oeuvre' (pose).
--    Les lignes de main-d'œuvre / pose sont des ouvrages du catalogue à part entière
--    (type_cout = 'main_oeuvre') : PAS de système parallèle.

alter table public.catalogue_ouvrages
  add column if not exists pu_revient numeric not null default 0,
  add column if not exists type_cout text not null default 'matiere'
    check (type_cout in ('matiere', 'main_oeuvre'));

comment on column public.catalogue_ouvrages.pu_revient is
  'Coût unitaire de revient HT de l''ouvrage (matière ou main d''oeuvre selon type_cout). Source de vérité pour le calcul de marge des devis.';
comment on column public.catalogue_ouvrages.type_cout is
  'Nature du coût de revient : matiere (fournitures) ou main_oeuvre (pose / main d''oeuvre).';

-- 2) devis
--    . total_ht              : total HT des lignes chiffrées (les lignes « À CHIFFRER » en sont exclues).
--    . cout_matiere_ht       : somme qte * pu_revient des lignes type_cout = 'matiere'.
--    . cout_main_oeuvre_ht   : somme qte * pu_revient des lignes type_cout = 'main_oeuvre'.
--    . marge_ht              : total_ht - cout_matiere_ht - cout_main_oeuvre_ht.
--    . marge_pct             : marge_ht / total_ht * 100 (0 si total_ht = 0).
--    . surface_m2            : surface factuelle utilisée à la génération (chantier ou métré
--                              ponctuel). Null si inconnue — on ne demande jamais à l'IA de la deviner.
--    Ces colonnes sont calculées à la création PAR LE SERVEUR (route /api/devis) et figées
--    ensuite : le navigateur ne fait jamais le calcul officiel.

alter table public.devis
  add column if not exists total_ht numeric not null default 0,
  add column if not exists cout_matiere_ht numeric not null default 0,
  add column if not exists cout_main_oeuvre_ht numeric not null default 0,
  add column if not exists marge_ht numeric not null default 0,
  add column if not exists marge_pct numeric not null default 0,
  add column if not exists surface_m2 numeric;

comment on column public.devis.total_ht is
  'Total HT des lignes chiffrées calculé côté serveur à la création (les lignes À CHIFFRER sont exclues).';
comment on column public.devis.cout_matiere_ht is
  'Coût matière HT = somme(qte * pu_revient) des lignes type_cout = matiere.';
comment on column public.devis.cout_main_oeuvre_ht is
  'Coût main d''oeuvre HT = somme(qte * pu_revient) des lignes type_cout = main_oeuvre.';
comment on column public.devis.marge_ht is
  'Marge HT = total_ht - cout_matiere_ht - cout_main_oeuvre_ht.';
comment on column public.devis.marge_pct is
  'Marge en % = marge_ht / total_ht * 100 (0 si total_ht = 0).';
comment on column public.devis.surface_m2 is
  'Surface factuelle (m²) utilisée à la génération IA : chantiers.surface_m2 ou métré ponctuel fourni. Null si inconnue.';

-- 3) Backfill NON destructif : pour les devis déjà existants, on dérive le total HT
--    des lignes déjà stockées (les anciennes lignes n''ont ni pu_revient ni a_chiffrer :
--    elles étaient toutes « chiffrées »). Les coûts restent à 0 = « marge inconnue ».
update public.devis
  set total_ht = sub.total
  from (
    select
      d.id,
      coalesce(round(sum(
        case
          when jsonb_typeof(l->>'qte') = 'number'
           and jsonb_typeof(l->>'pu_ht') = 'number'
           and coalesce(l->>'a_chiffrer', 'false') = 'false'
          then (l->>'qte')::numeric * (l->>'pu_ht')::numeric
          else 0
        end
      ), 2), 0) as total
    from public.devis d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.lignes) = 'array' then d.lignes else '[]'::jsonb end
    ) as l
    group by d.id
  ) sub
  where public.devis.id = sub.id
    and public.devis.total_ht = 0;