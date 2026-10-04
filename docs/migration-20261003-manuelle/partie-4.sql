
-- 8.3 DROITS D'EXÉCUTION
--
-- `create function` accorde `execute` à `public` par DÉFAUT. `public` inclut
-- `anon` et `authenticated`. Sans ce REVOKE, n'importe quel visiteur pourrait
-- appeler `/rest/v1/rpc/signature_devis_valider_otp` — donc REVOKE d'abord,
-- GRANT ensuite. C'est exactement le défaut corrigé le 2026-09-25 pour
-- `espace_client_append` (20260925_o3b6_isolation_espace_client_rpc.sql:53).
revoke all on function public.signature_devis_valider_otp(text, uuid, uuid, text, text, boolean, varchar, text)
  from public;
revoke all on function public.signature_devis_valider_otp(text, uuid, uuid, text, text, boolean, varchar, text)
  from anon;
revoke all on function public.signature_devis_valider_otp(text, uuid, uuid, text, text, boolean, varchar, text)
  from authenticated;
grant execute on function public.signature_devis_valider_otp(text, uuid, uuid, text, text, boolean, varchar, text)
  to service_role;

-- Le propriétaire de la fonction doit être le rôle qui porte les droits de
-- table : `SECURITY DEFINER` s'exécute avec SES droits. Si le rôle applicatif
-- n'avait pas `insert` sur `devis_signatures`, la fonction lèverait
-- « permission denied » au §9. On le dit explicitement plutôt que de le
-- découvrir en production.


-- -----------------------------------------------------------------------------
-- 9) ANNULATION (non exécutée — à jouer manuellement si nécessaire)
-- -----------------------------------------------------------------------------
-- Tout ce qui précède est réversible SANS perte de donnée métier. Pour revenir
-- en arrière, exécuter dans l'ordre :
--
--   drop function if exists public.signature_devis_valider_otp(text, uuid, uuid, text, text, boolean, varchar, text);
--   drop index if exists public.devis_otp_devis_recent_idx;
--   drop index if exists public.devis_signatures_devis_idx;
--   drop trigger if exists tg_entreprise_immuable      on public.chantiers;
--   drop trigger if exists tg_entreprise_immuable      on public.devis;
--   drop trigger if exists tg_devis_otp_coherence      on public.devis_otp;
--   drop trigger if exists tg_devis_signatures_coherence on public.devis_signatures;
--   drop function if exists public.tg_refuser_changement_entreprise();
--   drop function if exists public.tg_devis_otp_coherence();
--   drop function if exists public.tg_devis_signatures_coherence();
--   drop table if exists public.devis_otp;            -- CASCADE non nécessaire
--   drop table if exists public.devis_signatures;
--   alter table public.devis drop constraint if exists devis_statut_check;
--   alter table public.chantiers
--     drop column if exists code_acces_expires_at,
--     drop column if exists code_acces_utilise_at;
--   alter table public.clients
--     drop column if exists tel_normalise,
--     drop column if exists tel_verifie;
--   alter table public.devis
--     drop column if exists signature_image,
--     drop column if exists telephone_source,
--     drop column if exists devis_empreinte_sha256;
--
-- ATTENTION : la normalisation de devis.statut (étape 1 du §6) N'EST PAS
-- réversible : un statut nul ou vide est devenu 'brouillon'. Aucune donnée
-- métier n'est perdue, mais la valeur d'origine ne l'est pas. A noter avant tout
-- retour arrière.


-- -----------------------------------------------------------------------------
-- 10) CONTRÔLES à rejouer dans le SQL Editor après application
-- -----------------------------------------------------------------------------
--   -- Les tables existent-elles et sont-elles protégées ?
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public' and tablename in ('devis_signatures','devis_otp');
--
--   -- devis_otp doit avoir 0 policy, devis_signatures 4 (hors service_role)
--   select tablename, policyname from pg_policies
--    where schemaname='public' and tablename in ('devis_signatures','devis_otp');
--
--   -- La contrainte statut est bien validée (convalidated = true)
--   select conname, convalidated from pg_constraint
--    where conrelid='public.devis'::regclass and conname='devis_statut_check';
--
--   -- Aucune valeur hors ensemble ne doit rester
--   select statut, count(*) from public.devis group by statut order by statut;
--
--   -- Les triggers de cohérence sont bien présents sur INSERT et UPDATE
--   select tgname, tgtype from pg_trigger
--    where tgrelid in ('public.devis_signatures'::regclass,'public.devis_otp'::regclass)
--      and not tgisinternal;
--
--   -- Aucun OTP en clair ne doit subsister (colonne legacy, hors service)
--   select count(*) from public.devis where otp_code is not null;
-- =============================================================================