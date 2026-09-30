-- =============================================================================
-- C1 — search_path des fonctions SECURITY DEFINER
-- Projet : BNA Dashboard — 2026-09-30
--
-- POURQUOI
-- --------
-- Une fonction SECURITY DEFINER s'exécute avec les droits de son propriétaire.
-- Si elle ne fixe pas son `search_path`, PostgreSQL résout les noms non
-- qualifiés dans l'ordre du search_path de la session — donc dans un ordre que
-- l'appelant contrôle. Un utilisateur authentifié qui possède ne serait-ce
-- qu'une table dans un autre schéma visible de son search_path pourrait y
-- placer un objet tel que `ma_requete()` désignerait par erreur : c'est la
-- cible classique du « search_path hijacking ».
--
-- Le correctif est `set search_path = public`.
--
-- METHODE — ET POURQUOI `ALTER`, PAS `CREATE OR REPLACE`
-- -----------------------------------------------------
-- Le correctif pourrait être écrit en `create or replace function … set search_path`,
-- ce qui obligerait à RETRANSCRIRE les 11 corps de fonction dans cette migration.
-- Une retranscription est une source de dérive silencieuse : le moindre caractère
-- mal recopié change une règle métier sans que rien ne le signale.
--
-- On utilise donc `alter function … set search_path`, qui est une opération de
-- CATALOGUE : il ne lit ni ne réécrit le corps de la fonction. Le comportement
-- observable est identique, et le risque de transcription est nul.
--
-- INVENTAIRE PRÉALABLE (exigence explicite du GO : ne rien modifier sans
-- vérification) — 26 fonctions SECURITY DEFINER dans supabase/migrations :
--
--   *  8 portent déjà `set search_path = public` (dont profiles_auto_entreprise,
--      rattacher_entreprise, lier_deplacement_devis et lier_deplacement_devis_ctx
--      issues du durcissement du même jour) ;
--   *  7 sont des définitions superseded par un `create or replace` ultérieur ;
--   * 11 sont vivantes et sans search_path — celles traitées ici.
--
-- Contrôle de sûreté, fonction par fonction (voir /tmp/opencode/audit/c1-searchpath.mjs) :
-- chaque référence du corps a été classée. Résultat : 0 alerte. Autrement dit,
-- dans ces 11 corps, TOUTE référence non qualifiée est soit :
--   - une fonction ou un type de pg_catalog, toujours implicitement en tête du
--     search_path (now, coalesce, round, to_char, regexp_replace,
--     jsonb_build_object, ::bit(64)::bigint, …) ;
--   - soit un objet de public (table ou fonction listé dans types/supabase.ts).
-- Aucun appel à une extension hors de public (pgcrypto, uuid-ossp, age…), aucune
-- table d'un autre schéma écrite sans qualification (auth.users, storage.*),
-- aucun type composite d'un autre schéma. Fixer search_path à public ne peut donc
-- rien faire échouer.
--
-- ROBUSTESSE
-- ----------
-- Les cibles sont sélectionnées par `oid` DIRECTEMENT dans `pg_proc`, et non par
-- une liste de signatures écrites à la main comparées à
-- `pg_get_function_identity_arguments()`. Ce choix est délibéré, et corrige un
-- défaut de la première version de cette migration.
--
-- DÉFAUT ÉVITÉ
-- ------------
-- `pg_get_function_identity_arguments()` restitue la signature AVEC les noms de
-- paramètres : pour `generer_prochain_numero_ri(p_entreprise_id uuid)` elle
-- renvoie `p_entreprise_id uuid`, et NON `uuid`. Une garde comparant l'identité
-- à la chaîne `uuid` n'était donc satisfaite que pour les fonctions SANS
-- argument, et laissait passer silencieusement les 8 autres — sans lever la
-- moindre erreur, puisque « fonction absente » et « cible non retenue » sont
-- indiscernables dans ce code. La migration réussissait en n'ayant corrigé que
-- 3 fonctions sur 11.
--
-- En somme :
--   * on ne compare plus aucun texte de signature — les OID sont les cibles ;
--   * TOUTES les surcharges d'un nom sont couvertes, donc aucune ne peut être
--     omise par un oubli dans une liste ;
--   * `regprocedure` restitue la signature EXACTE, correctement échappée, ce qui
--     interdit tout écart entre la cible testée et la cible modifiée ;
--   * chaque fonction traitée émet un `raise notice` : un no-op devient VISIBLE
--     dans la sortie du SQL Editor au lieu d'être silencieux ;
--   * l'idempotence est portée par le filtre `proconfig is distinct from`, pas
--     par un test d'existence : une fonction déjà corrigée est simplement
--     sautée, et une fonction absente n'apparaît tout simplement pas.
--
-- AUCUNE donnée n'est modifiée. AUCUN calcul, AUCUN tarif, AUCUNE règle métier.
-- =============================================================================

do $bna$
declare
  r        record;
  v_traite integer := 0;
begin
  for r in
    select p.oid, n.nspname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
            'generer_prochain_numero_ri',
            'generer_prochain_numero_ri_ctx',
            'generer_prochain_numero_sav',
            'generer_prochain_numero_sav_ctx',
            'generer_prochain_numero_sit',
            'generer_prochain_numero_sit_ctx',
            'generer_prochain_numero_avenant',
            'generer_prochain_numero_avenant_ctx'
          ])
      -- SECURITY DEFINER uniquement : une fonction SECURITY INVOKER n'exécute
      -- rien avec des droits-CoPI, le search_path n'y est donc pas un vecteur.
      and p.prosecdef
      -- Déjà corrigée -> ignorée. `coalesce` car proconfig est NULL quand la
      -- fonction ne fixe aucun GUC, et NULL IS DISTINCT FROM <valeur> = true.
      and coalesce(p.proconfig, '{}'::text[])
          is distinct from array['search_path=public']::text[]
  loop
    -- `regprocedure` restitue la signature EXACTE (noms de paramètres compris),
    -- avec les guillemets si besoin : aucune chaîne n'est écrite à la main, donc
    -- aucune désynchronisation possible entre la cible testée et la cible
    -- modifiée. `format` échappe le nom de schéma via %I.
    execute format('alter function %I.%s set search_path = public',
                   r.nspname, r.oid::regprocedure::text);
    v_traite := v_traite + 1;
    raise notice 'C1 — search_path fixé sur : %', r.oid::regprocedure::text;
  end loop;

  raise notice 'C1 — % fonction(s) traitée(s). 0 = déjà toutes corrigées, ou nom inattendu en base.', v_traite;
end
$bna$;

-- -----------------------------------------------------------------------------
-- VOLONTAIREMENT HORS LOT
-- -----------------------
-- `public.lier_deplacement_devis(uuid, uuid, uuid)` — l'ancienne signature à
-- trois arguments, qui acceptait le tenant du client : elle est SUPPRIMÉE par
-- 20260929_harden_lier_deplacement_devis.sql (`drop function`). Lui poser un
-- search_path n'aurait aucun effet et laisserait croire qu'elle est maintenue.
--
-- `spira_*`, `handle_new_user` et consorts : fonctions du schéma `auth`, hors
-- périmètre du dépôt — leurs droits appartiennent à Supabase.
-- =============================================================================
