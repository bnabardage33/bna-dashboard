-- PARTIE 4/4 - verdict post-migration (20261003_devis_signature_provenance)
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
