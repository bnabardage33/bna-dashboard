-- PARTIE 2/4 - verdict post-migration (20261003_devis_signature_provenance)
-- Chaque partie est une instruction complete et autonome : elle recoit le
-- prefixe WITH verbatim pour etre executable seule. Le contenu SQL des
-- controles est identique, au caractere pres, a celui du fichier source.
-- A coller SEULE dans le SQL Editor, dans l'ordre 1 puis 2 puis 3 puis 4.
--
-- ============================================================================
-- VERDICT GLOBAL — verification post-migration
-- Projet    : onhygmsxfdjkcjjnhabo
-- Migration : 20261003_devis_signature_provenance.sql (sha256 e5acd04a...)
--
-- 100 % LECTURE SEULE. Aucun INSERT, UPDATE, DELETE, ALTER, CREATE, DROP,
-- TRUNCATE, GRANT ni REVOKE. Aucune fonction a effet de bord.
--
-- UNE SEULE COLE. Une ligne par controle, colonne `statut` = OK ou *** ECART ***.
-- Attendu : 58 lignes, toutes OK.
-- Si une ligne manque ou si le statut n'est pas OK : ARRET, ne rien corriger.
-- ============================================================================

with f as (
  select p.oid, p.prosecdef, p.proconfig,
         regexp_replace(lower(pg_get_functiondef(p.oid)), '[[:space:]]+', ' ', 'g') as corps
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
  where p.proname='signature_devis_valider_otp'
),
m(v) as (values
  ('security definer'),
  ('set search_path = public, extensions'),
  ('p_code_acces text'),
  ('p_code_hmac_attendu text'),
  ('returns jsonb'),
  ('''intrant'''),
  ('^[0-9a-f]{64}$'),
  ('data:image/png;base64,'),
  ('mention_absente'),
  ('from public.chantiers c where c.code_acces = btrim(p_code_acces)'),
  ('and d.chantier_id = v_chantier_id'),
  ('and d.entreprise_id = v_entreprise_id'),
  ('order by o.created_at desc limit 1'),
  ('for update'),
  ('if v_otp_id is distinct from p_otp_id'),
  ('''otp_consomme'''),
  ('''otp_verrouille'''),
  ('coalesce(v_tentatives, 0) >= 5'),
  ('''otp_tentatives'''),
  ('''otp_expire'''),
  ('o.code_hmac = p_code_hmac_attendu'),
  ('set tentatives = coalesce(o.tentatives, 0) + 1'),
  ('verrouille_jusqua = case'),
  ('interval ''10 minutes'''),
  ('set consumed_at = now()'),
  ('and o.consumed_at is null'),
  ('and coalesce(o.tentatives, 0) < 5'),
  ('and o.expires_at > now()'),
  ('and o.entreprise_id = v_entreprise_id'),
  ('''otp_indisponible'''),
  ('update public.devis_otp o set consumed_at = now(), tentatives = 0, verrouille_jusqua = null where o.id = v_otp_id and o.devis_id = p_devis_id and o.entreprise_id = v_entreprise_id and o.consumed_at is null and (o.verrouille_jusqua is null or o.verrouille_jusqua <= now()) and coalesce(o.tentatives, 0) < 5 and o.expires_at > now() and o.code_hmac = p_code_hmac_attendu')
),
inv as (
  select count(*) filter (where strpos(f.corps, m.v) > 0) as ok, count(*) as total
  from f cross join m
),
v(n, pt, ctrl, attendu, obtenu, ok) as (
  select 17 as n, 'D.1' as pt, 'anon SELECT sur devis_signatures' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('anon', to_regclass('public.devis_signatures')::oid, 'SELECT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('anon', to_regclass('public.devis_signatures')::oid, 'SELECT'),false) = true)) as ok
union all
  select 18 as n, 'D.1' as pt, 'anon INSERT sur devis_signatures' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('anon', to_regclass('public.devis_signatures')::oid, 'INSERT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('anon', to_regclass('public.devis_signatures')::oid, 'INSERT'),false) = false)) as ok
union all
  select 19 as n, 'D.1' as pt, 'anon UPDATE sur devis_signatures' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('anon', to_regclass('public.devis_signatures')::oid, 'UPDATE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('anon', to_regclass('public.devis_signatures')::oid, 'UPDATE'),false) = false)) as ok
union all
  select 20 as n, 'D.1' as pt, 'anon DELETE sur devis_signatures' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('anon', to_regclass('public.devis_signatures')::oid, 'DELETE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('anon', to_regclass('public.devis_signatures')::oid, 'DELETE'),false) = false)) as ok
union all
  select 21 as n, 'D.1' as pt, 'authenticated SELECT sur devis_signatures' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_signatures')::oid, 'SELECT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_signatures')::oid, 'SELECT'),false) = true)) as ok
union all
  select 22 as n, 'D.1' as pt, 'authenticated INSERT sur devis_signatures' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_signatures')::oid, 'INSERT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_signatures')::oid, 'INSERT'),false) = false)) as ok
union all
  select 23 as n, 'D.1' as pt, 'authenticated UPDATE sur devis_signatures' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_signatures')::oid, 'UPDATE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_signatures')::oid, 'UPDATE'),false) = false)) as ok
union all
  select 24 as n, 'D.1' as pt, 'authenticated DELETE sur devis_signatures' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_signatures')::oid, 'DELETE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_signatures')::oid, 'DELETE'),false) = false)) as ok
union all
  select 25 as n, 'D.3' as pt, 'service_role SELECT sur devis_signatures' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('service_role', to_regclass('public.devis_signatures')::oid, 'SELECT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('service_role', to_regclass('public.devis_signatures')::oid, 'SELECT'),false) = true)) as ok
union all
  select 26 as n, 'D.3' as pt, 'service_role INSERT sur devis_signatures' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('service_role', to_regclass('public.devis_signatures')::oid, 'INSERT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('service_role', to_regclass('public.devis_signatures')::oid, 'INSERT'),false) = true)) as ok
union all
  select 27 as n, 'D.3' as pt, 'service_role UPDATE sur devis_signatures' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('service_role', to_regclass('public.devis_signatures')::oid, 'UPDATE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('service_role', to_regclass('public.devis_signatures')::oid, 'UPDATE'),false) = true)) as ok
union all
  select 28 as n, 'D.3' as pt, 'service_role DELETE sur devis_signatures' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('service_role', to_regclass('public.devis_signatures')::oid, 'DELETE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('service_role', to_regclass('public.devis_signatures')::oid, 'DELETE'),false) = true)) as ok
union all
  select 29 as n, 'D.2' as pt, 'anon SELECT sur devis_otp' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('anon', to_regclass('public.devis_otp')::oid, 'SELECT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('anon', to_regclass('public.devis_otp')::oid, 'SELECT'),false) = false)) as ok
union all
  select 30 as n, 'D.2' as pt, 'anon INSERT sur devis_otp' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('anon', to_regclass('public.devis_otp')::oid, 'INSERT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('anon', to_regclass('public.devis_otp')::oid, 'INSERT'),false) = false)) as ok
union all
  select 31 as n, 'D.2' as pt, 'anon UPDATE sur devis_otp' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('anon', to_regclass('public.devis_otp')::oid, 'UPDATE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('anon', to_regclass('public.devis_otp')::oid, 'UPDATE'),false) = false)) as ok
union all
  select 32 as n, 'D.2' as pt, 'anon DELETE sur devis_otp' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('anon', to_regclass('public.devis_otp')::oid, 'DELETE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('anon', to_regclass('public.devis_otp')::oid, 'DELETE'),false) = false)) as ok
union all
  select 33 as n, 'D.2' as pt, 'authenticated SELECT sur devis_otp' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_otp')::oid, 'SELECT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_otp')::oid, 'SELECT'),false) = false)) as ok
)
select n, pt, ctrl, attendu, obtenu,
  case when ok then 'OK' else '*** ECART ***' end as statut
from v order by n;
