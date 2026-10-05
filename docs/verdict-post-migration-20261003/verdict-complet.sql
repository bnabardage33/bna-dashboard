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
  select 1 as n, 'A.1' as pt, 'table devis_signatures' as ctrl,
         'presente' as attendu, cast((case when to_regclass('public.devis_signatures') is not null then 'present' else 'ABSENT' end) as text) as obtenu, ((to_regclass('public.devis_signatures') is not null)) as ok
union all
  select 2 as n, 'A.1' as pt, 'table devis_otp' as ctrl,
         'presente' as attendu, cast((case when to_regclass('public.devis_otp') is not null then 'present' else 'ABSENT' end) as text) as obtenu, ((to_regclass('public.devis_otp') is not null)) as ok
union all
  select 3 as n, 'A.2' as pt, 'colonnes ajoutees (devis/clients/chantiers)' as ctrl,
         '7' as attendu, cast((select count(*)::text from information_schema.columns where table_schema='public' and (table_name,column_name) in (('devis','signature_image'),('devis','telephone_source'),('devis','devis_empreinte_sha256'),('clients','tel_normalise'),('clients','tel_verifie'),('chantiers','code_acces_expires_at'),('chantiers','code_acces_utilise_at'))) as text) as obtenu, ((select count(*)=7 from information_schema.columns where table_schema='public' and (table_name,column_name) in (('devis','signature_image'),('devis','telephone_source'),('devis','devis_empreinte_sha256'),('clients','tel_normalise'),('clients','tel_verifie'),('chantiers','code_acces_expires_at'),('chantiers','code_acces_utilise_at')))) as ok
union all
  select 4 as n, 'A.2' as pt, 'colonne devis.signature_image' as ctrl,
         'presente' as attendu, cast((case when (select count(*)=1 from information_schema.columns where table_schema='public' and table_name='devis' and column_name='signature_image') then 'present' else 'ABSENT' end) as text) as obtenu, ((select count(*)=1 from information_schema.columns where table_schema='public' and table_name='devis' and column_name='signature_image')) as ok
union all
  select 5 as n, 'A.3' as pt, 'colonnes de devis_signatures' as ctrl,
         '20' as attendu, cast((select count(*)::text from pg_attribute where attrelid=to_regclass('public.devis_signatures') and attnum>0 and not attisdropped) as text) as obtenu, ((select count(*)=20 from pg_attribute where attrelid=to_regclass('public.devis_signatures') and attnum>0 and not attisdropped)) as ok
union all
  select 6 as n, 'A.3' as pt, 'colonnes de devis_otp' as ctrl,
         '12' as attendu, cast((select count(*)::text from pg_attribute where attrelid=to_regclass('public.devis_otp') and attnum>0 and not attisdropped) as text) as obtenu, ((select count(*)=12 from pg_attribute where attrelid=to_regclass('public.devis_otp') and attnum>0 and not attisdropped)) as ok
union all
  select 7 as n, 'B.1' as pt, 'devis_statut_check validee' as ctrl,
         'oui' as attendu, cast((coalesce((select convalidated::text from pg_constraint where conrelid='public.devis'::regclass and conname='devis_statut_check'),'ABSENTE')) as text) as obtenu, ((coalesce((select convalidated from pg_constraint where conrelid='public.devis'::regclass and conname='devis_statut_check'),false))) as ok
union all
  select 8 as n, 'B.2' as pt, 'contraintes CHECK sur devis_signatures' as ctrl,
         '>=1' as attendu, cast((select count(*)::text from pg_constraint where conrelid=to_regclass('public.devis_signatures') and contype='c') as text) as obtenu, ((select count(*)>=1 from pg_constraint where conrelid=to_regclass('public.devis_signatures') and contype='c')) as ok
union all
  select 9 as n, 'B.2' as pt, 'contraintes CHECK sur devis_otp' as ctrl,
         '>=1' as attendu, cast((select count(*)::text from pg_constraint where conrelid=to_regclass('public.devis_otp') and contype='c') as text) as obtenu, ((select count(*)>=1 from pg_constraint where conrelid=to_regclass('public.devis_otp') and contype='c')) as ok
union all
  select 10 as n, 'B.3' as pt, 'FK devis_signatures -> devis' as ctrl,
         'presente' as attendu, cast((select count(*)::text from pg_constraint where conrelid=to_regclass('public.devis_signatures') and contype='f' and confrelid='public.devis'::regclass) as text) as obtenu, ((select count(*)>=1 from pg_constraint where conrelid=to_regclass('public.devis_signatures') and contype='f' and confrelid='public.devis'::regclass)) as ok
union all
  select 11 as n, 'B.3' as pt, 'index devis_otp_devis_recent_idx' as ctrl,
         'present' as attendu, cast((case when (select count(*)=1 from pg_indexes where schemaname='public' and indexname='devis_otp_devis_recent_idx') then 'present' else 'ABSENT' end) as text) as obtenu, ((select count(*)=1 from pg_indexes where schemaname='public' and indexname='devis_otp_devis_recent_idx')) as ok
union all
  select 12 as n, 'B.3' as pt, 'index devis_signatures_devis_idx' as ctrl,
         'present' as attendu, cast((case when (select count(*)=1 from pg_indexes where schemaname='public' and indexname='devis_signatures_devis_idx') then 'present' else 'ABSENT' end) as text) as obtenu, ((select count(*)=1 from pg_indexes where schemaname='public' and indexname='devis_signatures_devis_idx')) as ok
union all
  select 13 as n, 'C.1' as pt, 'RLS active sur devis_signatures' as ctrl,
         'oui' as attendu, cast((coalesce((select relrowsecurity::text from pg_class where oid=to_regclass('public.devis_signatures')),'TABLE ABSENTE')) as text) as obtenu, ((coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.devis_signatures')),false))) as ok
union all
  select 14 as n, 'C.2' as pt, 'policies sur devis_signatures' as ctrl,
         '4' as attendu, cast((select count(*)::text from pg_policies where schemaname='public' and tablename='devis_signatures') as text) as obtenu, ((select count(*)=4 from pg_policies where schemaname='public' and tablename='devis_signatures')) as ok
union all
  select 15 as n, 'C.1' as pt, 'RLS active sur devis_otp' as ctrl,
         'oui' as attendu, cast((coalesce((select relrowsecurity::text from pg_class where oid=to_regclass('public.devis_otp')),'TABLE ABSENTE')) as text) as obtenu, ((coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.devis_otp')),false))) as ok
union all
  select 16 as n, 'C.2' as pt, 'policies sur devis_otp' as ctrl,
         '0' as attendu, cast((select count(*)::text from pg_policies where schemaname='public' and tablename='devis_otp') as text) as obtenu, ((select count(*)=0 from pg_policies where schemaname='public' and tablename='devis_otp')) as ok
union all
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
union all
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
union all
  select 48 as n, 'E.4' as pt, 'parametres de confiance dans la RPC' as ctrl,
         '0' as attendu, cast((select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp' and proargnames::text ~ 'entreprise|client_id|chantier_id|signe_par|statut|empreinte') as text) as obtenu, ((select count(*)=0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='signature_devis_valider_otp' and proargnames::text ~ 'entreprise|client_id|chantier_id|signe_par|statut|empreinte')) as ok
union all
  select 49 as n, 'E.5' as pt, 'invariants du corps de la RPC' as ctrl,
         '31/31' as attendu, cast((select ok::text || '/' || total::text from inv) as text) as obtenu, ((select ok = total and total = 31 from inv)) as ok
union all
  select 50 as n, 'F.1' as pt, 'trigger tg_devis_signatures_coherence sur devis_signatures' as ctrl,
         'actif' as attendu, cast((case when exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='tg_devis_signatures_coherence' and c.relname='devis_signatures' and t.tgenabled='O') then 'present' else 'ABSENT' end) as text) as obtenu, ((exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='tg_devis_signatures_coherence' and c.relname='devis_signatures' and t.tgenabled='O'))) as ok
union all
  select 51 as n, 'F.1' as pt, 'trigger tg_devis_otp_coherence sur devis_otp' as ctrl,
         'actif' as attendu, cast((case when exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='tg_devis_otp_coherence' and c.relname='devis_otp' and t.tgenabled='O') then 'present' else 'ABSENT' end) as text) as obtenu, ((exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='tg_devis_otp_coherence' and c.relname='devis_otp' and t.tgenabled='O'))) as ok
union all
  select 52 as n, 'F.1' as pt, 'trigger tg_entreprise_immuable sur devis' as ctrl,
         'actif' as attendu, cast((case when exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='tg_entreprise_immuable' and c.relname='devis' and t.tgenabled='O') then 'present' else 'ABSENT' end) as text) as obtenu, ((exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='tg_entreprise_immuable' and c.relname='devis' and t.tgenabled='O'))) as ok
union all
  select 53 as n, 'F.1' as pt, 'trigger tg_entreprise_immuable sur chantiers' as ctrl,
         'actif' as attendu, cast((case when exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='tg_entreprise_immuable' and c.relname='chantiers' and t.tgenabled='O') then 'present' else 'ABSENT' end) as text) as obtenu, ((exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgname='tg_entreprise_immuable' and c.relname='chantiers' and t.tgenabled='O'))) as ok
union all
  select 54 as n, 'F.2' as pt, 'fonction tg_refuser_changement_entreprise' as ctrl,
         'presente' as attendu, cast((case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='tg_refuser_changement_entreprise') then 'present' else 'ABSENT' end) as text) as obtenu, ((exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='tg_refuser_changement_entreprise'))) as ok
union all
  select 55 as n, 'F.2' as pt, 'fonction tg_devis_signatures_coherence' as ctrl,
         'presente' as attendu, cast((case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='tg_devis_signatures_coherence') then 'present' else 'ABSENT' end) as text) as obtenu, ((exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='tg_devis_signatures_coherence'))) as ok
union all
  select 56 as n, 'F.2' as pt, 'fonction tg_devis_otp_coherence' as ctrl,
         'presente' as attendu, cast((case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='tg_devis_otp_coherence') then 'present' else 'ABSENT' end) as text) as obtenu, ((exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public' where p.proname='tg_devis_otp_coherence'))) as ok
union all
  select 57 as n, 'G.1' as pt, 'devis.statut hors ensemble' as ctrl,
         '0' as attendu, cast((select count(*)::text from public.devis where statut is null or statut not in ('brouillon','envoye','signe','accepte','refuse')) as text) as obtenu, ((select count(*)=0 from public.devis where statut is null or statut not in ('brouillon','envoye','signe','accepte','refuse'))) as ok
union all
  select 58 as n, 'G.2' as pt, 'objets public (tables+vues+matviews)' as ctrl,
         '45' as attendu, cast((select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' where c.relkind in ('r','v','m')) as text) as obtenu, ((select count(*)=45 from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' where c.relkind in ('r','v','m'))) as ok
)
select n, pt, ctrl, attendu, obtenu,
  case when ok then 'OK' else '*** ECART ***' end as statut
from v order by n;
