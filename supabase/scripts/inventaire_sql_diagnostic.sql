-- =============================================================================
-- INVENTAIRE GLOBAL PROD — DIAGNOSTIC LECTURE SEULE (aucune écriture)
-- Projet : onhygmsxfdjkcjjnhabo — 2026-09-23 (rév. corrigée)
--
-- CONTRÔLE LECTURE SEULE (avant exécution) :
--   * Les 10 requêtes sont des SELECT sur information_schema / pg_catalog /
--     pg_policies / pg_indexes : AUCUN CREATE / ALTER / DROP / INSERT /
--     UPDATE / DELETE / TRUNCATE.
--   * Fonctions utilisées, toutes pures (aucun effet de bord) :
--     pg_catalog.format_type, pg_get_expr, pg_get_constraintdef,
--     pg_get_viewdef, pg_get_function_result, pg_get_function_identity_arguments,
--     string_agg, array_agg, count, coalesce, case.
--   * Aucune modification de données, de schéma, de policy, de trigger,
--     de GRANT, ni invocation de RPC / fonction à effet de bord.
-- À exécuter dans le SQL Editor (résultats à copier intégralement).
-- =============================================================================

-- 1) OBJETS (tables + vues) et leurs colonnes (type, nullable, default, identité)
select c.relkind, c.relname as objet,
       a.attname as colonne,
       pg_catalog.format_type(a.atttypid, a.atttypmod) as type_sql,
       a.attnotnull as not_null,
       pg_get_expr(d.adbin, d.adrelid) as default_expr,
       a.attidentity as identite   -- '' | 'a' (always) | 'd' (by default)
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
order by c.relname, a.attnum;

-- 2) CONTRAINTES (PK, UNIQUE, CHECK, FK) avec définition complète
--    (actions ON DELETE / ON UPDATE incluses dans pg_get_constraintdef)
select conrelid::regclass as table_,
       conname as contrainte,
       contype as type,        -- p=PK u=UNIQUE c=CHECK f=FK
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text, contype, conname;

-- 3) INDEX (unique ou non, partiels inclus — détection des doublons sur indexdef)
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 4) RLS par objet + comptage de policies
select c.relname as table_,
       c.relrowsecurity as rls_active,
       c.relforcerowsecurity as rls_force,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as nb_policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
order by c.relname;

-- 5) POLICIES exactes (rôles, commande, USING, WITH CHECK)
select schemaname, tablename, policyname, permissive, roles, cmd,
       pg_get_expr(qual, qualrelid) as using_,
       pg_get_expr(with_check, with_check_relid) as with_check_
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 6) GRANTS par table — UNE colonne par rôle (anon / authenticated /
--    service_role / postgres). Agrégation en un seul passage sur
--    role_table_grants pour éviter tout doublon de ligne ou de colonne.
select n.nspname as schema_,
       c.relname as table_,
       c.relkind as type_objet,   -- r=table p=partitioned v=vue
       coalesce(string_agg(distinct case when g.grantee = 'anon'           then g.privilege_type end, ','), '') as anon,
       coalesce(string_agg(distinct case when g.grantee = 'authenticated' then g.privilege_type end, ','), '') as authenticated,
       coalesce(string_agg(distinct case when g.grantee = 'service_role'  then g.privilege_type end, ','), '') as service_role,
       coalesce(string_agg(distinct case when g.grantee = 'postgres'      then g.privilege_type end, ','), '') as postgres,
       coalesce(string_agg(distinct case when g.grantee not in ('anon','authenticated','service_role','postgres')
                                          then g.grantee || ':' || g.privilege_type end, ','), '') as autres_roles
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join information_schema.role_table_grants g
       on g.table_schema = n.nspname
      and g.table_name = c.relname
where n.nspname = 'public' and c.relkind in ('r','p','v')
group by n.nspname, c.relname, c.relkind
order by c.relname;

-- 7) TRIGGERS (table, nom, événement, timing, statement)
select event_object_table as table_, trigger_name, event_manipulation,
       action_timing, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by 1, 2, 3;

-- 8) FONCTIONS public (signature complète, return, language, volatile,
--    SECURITY DEFINER, search_path/config) — les surcharges restent distinctes
--    grâce à l'affichage de l'oid::regprocedure (signature complète).
select p.oid::regprocedure as signature,
       p.proname as nom_fonction,
       pg_get_function_identity_arguments(p.oid) as arguments_identite,
       pg_get_function_result(p.oid) as returns,
       l.lanname as language,
       p.provolatile as volatility,   -- i=immutable s=stable v=volatile
       p.prosecdef as security_definer,
       p.proconfig as config_guces     -- ex: {search_path=public}
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
order by p.proname, p.oid::regprocedure::text;

-- 9) GRANTS EXECUTE sur les fonctions (RPC) — identification par SIGNATURE
--    COMPLÈTE (specific_name = oid de la fonction : chaque surcharge a sa
--    propre ligne ; aucune confusion entre fonctions de même nom).
select p.oid::regprocedure as rpc,
       p.proname as nom_fonction,
       coalesce(string_agg(distinct case when r.grantee = 'anon'           then r.privilege_type end, ','), '') as anon,
       coalesce(string_agg(distinct case when r.grantee = 'authenticated' then r.privilege_type end, ','), '') as authenticated,
       coalesce(string_agg(distinct case when r.grantee = 'service_role'  then r.privilege_type end, ','), '') as service_role,
       coalesce(string_agg(distinct case when r.grantee = 'postgres'      then r.privilege_type end, ','), '') as postgres
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join information_schema.routine_privileges r
       on r.specific_schema = n.nspname
      and r.specific_name::text = p.oid::text
where n.nspname = 'public' and p.prokind = 'f'
group by p.oid
order by p.oid::regprocedure::text;

-- 10) VUES (définitions) — repérer les objets dérivés
select c.relname as vue, pg_get_viewdef(c.oid) as definition
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by 1;