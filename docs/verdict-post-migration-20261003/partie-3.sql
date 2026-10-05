-- PARTIE 3/4 - verdict post-migration (20261003_devis_signature_provenance)
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
  select 34 as n, 'D.2' as pt, 'authenticated INSERT sur devis_otp' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_otp')::oid, 'INSERT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_otp')::oid, 'INSERT'),false) = false)) as ok
union all
  select 35 as n, 'D.2' as pt, 'authenticated UPDATE sur devis_otp' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_otp')::oid, 'UPDATE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_otp')::oid, 'UPDATE'),false) = false)) as ok
union all
  select 36 as n, 'D.2' as pt, 'authenticated DELETE sur devis_otp' as ctrl,
         'false' as attendu, cast((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_otp')::oid, 'DELETE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('authenticated', to_regclass('public.devis_otp')::oid, 'DELETE'),false) = false)) as ok
union all
  select 37 as n, 'D.2' as pt, 'service_role SELECT sur devis_otp' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('service_role', to_regclass('public.devis_otp')::oid, 'SELECT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('service_role', to_regclass('public.devis_otp')::oid, 'SELECT'),false) = true)) as ok
union all
  select 38 as n, 'D.2' as pt, 'service_role INSERT sur devis_otp' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('service_role', to_regclass('public.devis_otp')::oid, 'INSERT')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('service_role', to_regclass('public.devis_otp')::oid, 'INSERT'),false) = true)) as ok
union all
  select 39 as n, 'D.2' as pt, 'service_role UPDATE sur devis_otp' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('service_role', to_regclass('public.devis_otp')::oid, 'UPDATE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('service_role', to_regclass('public.devis_otp')::oid, 'UPDATE'),false) = true)) as ok
union all
  select 40 as n, 'D.2' as pt, 'service_role DELETE sur devis_otp' as ctrl,
         'true' as attendu, cast((coalesce(has_table_privilege('service_role', to_regclass('public.devis_otp')::oid, 'DELETE')::text,'ROLE INCONNU')) as text) as obtenu, ((coalesce(has_table_privilege('service_role', to_regclass('public.devis_otp')::oid, 'DELETE'),false) = true)) as ok
union all
  select 41 as n, 'E.1' as pt, 'signature_devis_valider_otp existe (1 seule)' as ctrl,
         '1' as attendu, cast((select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp') as text) as obtenu, ((select count(*)=1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp')) as ok
union all
  select 42 as n, 'E.2' as pt, 'RPC security definer' as ctrl,
         'true' as attendu, cast((select coalesce(prosecdef::text,'ABSENTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp') as text) as obtenu, ((select coalesce(prosecdef,false) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp')) as ok
union all
  select 43 as n, 'E.2' as pt, 'RPC search_path' as ctrl,
         '{public,extensions}' as attendu, cast((select coalesce(array_to_string(proconfig,' | '),'(aucun SET)') from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp') as text) as obtenu, ((select coalesce(array_to_string(proconfig,',') like '%search_path=public, extensions%',false) from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp')) as ok
union all
  select 44 as n, 'E.2' as pt, 'RPC retourne jsonb' as ctrl,
         'jsonb' as attendu, cast((select coalesce(pg_get_function_result(p.oid),'ABSENTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp') as text) as obtenu, ((select coalesce(pg_get_function_result(p.oid),'')='jsonb' from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp')) as ok
union all
  select 45 as n, 'E.3' as pt, 'EXECUTE pour anon' as ctrl,
         'false' as attendu, cast((coalesce((select has_function_privilege('anon', p.oid, 'EXECUTE')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp'),'FONCTION ABSENTE')) as text) as obtenu, ((coalesce((select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp'),true)=false)) as ok
union all
  select 46 as n, 'E.3' as pt, 'EXECUTE pour authenticated' as ctrl,
         'false' as attendu, cast((coalesce((select has_function_privilege('authenticated', p.oid, 'EXECUTE')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp'),'FONCTION ABSENTE')) as text) as obtenu, ((coalesce((select has_function_privilege('authenticated', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp'),true)=false)) as ok
union all
  select 47 as n, 'E.3' as pt, 'EXECUTE pour service_role' as ctrl,
         'true' as attendu, cast((coalesce((select has_function_privilege('service_role', p.oid, 'EXECUTE')::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp'),'FONCTION ABSENTE')) as text) as obtenu, ((coalesce((select has_function_privilege('service_role', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp'),false)=true)) as ok
)
select n, pt, ctrl, attendu, obtenu,
  case when ok then 'OK' else '*** ECART ***' end as statut
from v order by n;
