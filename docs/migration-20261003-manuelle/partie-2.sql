
-- -----------------------------------------------------------------------------
-- 5) COHÉRENCE entreprise — INSERT *et* UPDATE
-- -----------------------------------------------------------------------------
-- Les triggers de la Phase 1 (part4) ne sont déclenchés que sur `before insert`.
-- Un UPDATE pouvait donc changer entreprise_id sans garde, y compris en
-- service_role (qui contourne le RLS). Les déclencheurs ci-dessous couvrent les
-- DEUX opérations : c'est la condition pour que la chaîne
--     devis_signatures.entreprise_id = devis.entreprise_id = chantier.entreprise_id
-- soit réellement garantie.

-- 5.1 devis_signatures : entreprise_id dérivé du devis, chantier validé.
create or replace function public.tg_devis_signatures_coherence()
returns trigger
language plpgsql
set search_path = public
as $bna$
declare
  v_devis_entreprise   uuid;
  v_chantier_entreprise uuid;
begin
  select d.entreprise_id into v_devis_entreprise
    from public.devis d
   where d.id = new.devis_id;

  if not found then
    raise exception 'devis_signatures: devis % introuvable ou hors tenant',
      coalesce(new.devis_id::text, '(null)');
  end if;

  -- INSERT : le tenant est IMPOSÉ par le devis, jamais reçu de l'appelant.
  -- UPDATE : il doit rester identique.
  if tg_op = 'INSERT' then
    new.entreprise_id := v_devis_entreprise;
  elsif new.entreprise_id is distinct from v_devis_entreprise then
    raise exception 'devis_signatures: entreprise_id % ne correspond pas au devis (%)',
      coalesce(new.entreprise_id::text, '(null)'),
      coalesce(v_devis_entreprise::text, '(null)');
  end if;

  -- Chantier : s'il est renseigné, il doit appartenir au même tenant.
  if new.chantier_id is not null then
    select c.entreprise_id into v_chantier_entreprise
      from public.chantiers c
     where c.id = new.chantier_id;

    if not found then
      raise exception 'devis_signatures: chantier % introuvable',
        coalesce(new.chantier_id::text, '(null)');
    end if;

    if v_chantier_entreprise is distinct from v_devis_entreprise then
      raise exception 'devis_signatures: chantier % (tenant %) different du tenant du devis (%)',
        coalesce(new.chantier_id::text, '(null)'),
        coalesce(v_chantier_entreprise::text, '(null)'),
        coalesce(v_devis_entreprise::text, '(null)');
    end if;
  end if;

  return new;
end
$bna$;

drop trigger if exists tg_devis_signatures_coherence on public.devis_signatures;
create trigger tg_devis_signatures_coherence
  before insert or update on public.devis_signatures
  for each row execute function public.tg_devis_signatures_coherence();

-- 5.2 devis_otp : même garantie de tenant.
create or replace function public.tg_devis_otp_coherence()
returns trigger
language plpgsql
set search_path = public
as $bna$
declare
  v_devis_entreprise uuid;
begin
  select d.entreprise_id into v_devis_entreprise
    from public.devis d
   where d.id = new.devis_id;

  if not found then
    raise exception 'devis_otp: devis % introuvable ou hors tenant',
      coalesce(new.devis_id::text, '(null)');
  end if;

  if tg_op = 'INSERT' then
    new.entreprise_id := v_devis_entreprise;
  elsif new.entreprise_id is distinct from v_devis_entreprise then
    raise exception 'devis_otp: entreprise_id % ne correspond pas au devis (%)',
      coalesce(new.entreprise_id::text, '(null)'),
      coalesce(v_devis_entreprise::text, '(null)');
  end if;

  return new;
end
$bna$;

drop trigger if exists tg_devis_otp_coherence on public.devis_otp;
create trigger tg_devis_otp_coherence
  before insert or update on public.devis_otp
  for each row execute function public.tg_devis_otp_coherence();

-- 5.3 IMMUABILITÉ DU TENANT SUR LES RACINES.
-- Sans cette garde, la chaîne du §5.1 pourrait être cassée en amont : un
-- UPDATE de chantiers.entreprise_id ou de devis.entreprise_id modifierait le
-- tenant de référence après coup. AUCUNE écriture applicative ne modifie ces
-- colonnes (vérifié : les seuls UPDATE de devis portent sur statut/signature_*),
-- donc la garde ne peut pas casser un usage existant.
create or replace function public.tg_refuser_changement_entreprise()
returns trigger
language plpgsql
set search_path = public
as $bna$
begin
  if new.entreprise_id is distinct from old.entreprise_id then
    raise exception '% : entreprise_id est immuable (tentative % -> %)',
      tg_table_name, old.entreprise_id, new.entreprise_id;
  end if;
  return new;
end
$bna$;

drop trigger if exists tg_entreprise_immuable on public.devis;
create trigger tg_entreprise_immuable
  before update of entreprise_id on public.devis
  for each row execute function public.tg_refuser_changement_entreprise();

drop trigger if exists tg_entreprise_immuable on public.chantiers;
create trigger tg_entreprise_immuable
  before update of entreprise_id on public.chantiers
  for each row execute function public.tg_refuser_changement_entreprise();


-- -----------------------------------------------------------------------------
-- 6) NORMALISATION puis CONTRAINTE sur devis.statut
-- -----------------------------------------------------------------------------
-- Ensemble établi par un scan exhaustif du code (écritures LITTÉRALES :
-- 'brouillon' api/devis:236 et sav/[id]:229, 'signe' signer:85 et verify-otp:106,
-- 'accepte' devis-factures:784 et :1566 ; écriture DYNAMIQUE : le <select> de
-- devis-factures:876-893 propose exactement brouillon/envoye/accepte/refuse).
-- Les valeurs 'emise','envoyee','payee','en_attente' appartiennent à FACTURES ;
-- 'en_cours','terminee','en_echec' à DEVIS_IA ; 'prevu' à CHANTIERS ; aucune
-- n'est écrite sur devis.
--
-- Étape 1 : les statuts nuls ou vides sont ramenés à 'brouillon' (état neutre
-- d'un devis en cours de rédaction). Le nombre de lignes touchées est annoncé.
do $bna$
declare
  v_n integer;
begin
  update public.devis
     set statut = 'brouillon'
   where statut is null or btrim(statut) = '';

  get diagnostics v_n = row_count;
  raise notice 'devis.statut : % ligne(s) normalisee(s) vers ''brouillon''', v_n;
end
$bna$;

-- Étape 2 : toute valeur hors ensemble restante INTERROMPIT la migration avec la
-- liste exacte. Aucune valeur n'est inventée ni remappée silencieusement : le
-- défaut doit être vu par un humain, pas masqué par une migration.
do $bna$
declare
  v_hors_ensemble text;
begin
  select string_agg(distinct statut, ', ' order by statut)
    into v_hors_ensemble
    from (select statut from public.devis
           where statut is not null
             and statut <> all (array['brouillon','envoye','signe','accepte','refuse'])
           limit 20) s
   where statut is not null;

  if v_hors_ensemble is not null then
    raise exception
      'devis.statut : % valeur(s) hors ensemble detectee(s) : %. Corriger ces lignes avant de relancer la migration.',
      (select count(*) from public.devis
        where statut is not null
          and statut <> all (array['brouillon','envoye','signe','accepte','refuse'])),
      v_hors_ensemble;
  end if;
end
$bna$;

-- Étape 3 : contrainte ajoutée NOT VALID puis VALIDEE, comme demandé. Les deux
-- étapes sont visibles dans le journal du SQL Editor ; la seconde échoue si une
-- ligne a été introduite entre-temps avec une valeur invalide.
do $bna$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.devis'::regclass
       and conname = 'devis_statut_check'
  ) then
    alter table public.devis
      add constraint devis_statut_check
      check (statut in ('brouillon', 'envoye', 'signe', 'accepte', 'refuse')) not valid;
  end if;
end
$bna$;

alter table public.devis validate constraint devis_statut_check;

comment on constraint devis_statut_check on public.devis is
  'Ensemble des statuts réellement utilisés par le produit (scan exhaustif du code au 2026-10-03). Toute autre valeur est rejetee.';


-- -----------------------------------------------------------------------------
-- 7) RLS ET GRANTS
-- -----------------------------------------------------------------------------

-- 7.1 devis_signatures — même cloisonnement que devis (part2 §5.1).
alter table public.devis_signatures enable row level security;

drop policy if exists devis_signatures_ent_select on public.devis_signatures;
drop policy if exists devis_signatures_ent_insert on public.devis_signatures;
drop policy if exists devis_signatures_ent_update on public.devis_signatures;
drop policy if exists devis_signatures_ent_delete on public.devis_signatures;

create policy devis_signatures_ent_select on public.devis_signatures
  for select using (entreprise_id = public.entreprise_courante());
create policy devis_signatures_ent_insert on public.devis_signatures
  for insert with check (entreprise_id = public.entreprise_courante());
create policy devis_signatures_ent_update on public.devis_signatures
  for update using (entreprise_id = public.entreprise_courante())
  with check (entreprise_id = public.entreprise_courante());
create policy devis_signatures_ent_delete on public.devis_signatures
  for delete using (entreprise_id = public.entreprise_courante());

-- 7.2 devis_otp — RLS ACTIVÉE MAIS **AUCUNE POLICY**.
-- Délibéré : l'OTP n'est accessible que par service_role, qui contourne le RLS,
-- via les routes serveur. Aucune policy = aucun accès direct par PostgREST,
-- même pour un utilisateur authentifié du bon tenant ni pour le rôle anon du
-- portail client. Lire un condensat HMAC depuis le navigateur n'a aucun intérêt
-- métier et élargirait inutilement la surface d'attaque. Fail-closed.
alter table public.devis_otp enable row level security;

-- 7.3 GRANTS — sans cette étape, une table créée ici n'a AUCUN privilège de base et
-- un SELECT authentifié échoue "permission denied for table" AVANT l'évaluation
-- du RLS (cause racine documentée en part5).
--
-- `devis_signatures` N'EST PAS traité ici, et c'est délibéré.
--
-- La version précédente de cette section accordait :
--
--     grant select, insert, update, delete on table public.devis_signatures
--       to anon, authenticated, service_role;
--
-- puis le §7.4 retirait les trois droits à `anon` et `authenticated`. L'ÉTAT
-- FINAL était donc correct — mais le fichier contenait DEUX RÉPONSES à la
-- question « le navigateur peut-il écrire dans la table de preuve ? », dont
-- une fausse. Un fichier qui se contredit sur le point le plus sensible de la
-- migration est un fichier dont la garantie dépend de l'ordre de lecture, et
-- l'ordre de lecture n'est pas une garantie.
--
-- L'état final de `devis_signatures` est écrit EN UN SEUL ENDROIT, au §7.4,
-- et il est complet : SELECT pour `anon` et `authenticated`, aucune écriture
-- directe pour eux, CRUD pour `service_role` seul.
--
-- devis_otp : service_role SEULEMENT. Le GRANT est explicite pour que
-- l'intention soit lisible dans le dépôt ; il n'est pas la protection, qui est
-- l'absence de policy combinée au contournement du RLS par service_role.
grant select, insert, update, delete on table public.devis_otp
  to service_role;

-- 7.4 devis_signatures — GRANTS RESSERRÉS, ÉTAT FINAL COMPLET (décision phase 3, INC-9).
--
-- Cette section fait autorité : elle seule décrit les droits de
-- `devis_signatures`, pour les trois rôles, sans dépendre d'aucune autre.
--
-- Constat : `anon` et `authenticated` n'ont besoin que du LECTURE. Le seul
-- lecteur navigateur est app/bureau/devis-factures/page.tsx:835
-- (`supabase.from("devis_signatures").select(...)` avec la clé anon), qui pose
-- une question de MÊME tenant avant de proposer la suppression d'un devis.
-- Aucun code applicatif n'écrit `devis_signatures` : la seule écriture est la
-- RPC SECURITY DEFINER du §8, qui s'exécute avec les droits de son
-- propriétaire et contourne donc ce GRANT.
--
-- Pourquoi retirer insert/update/delete à anon : `devis_signatures` est la
-- TABLE DE PREUVE. Un droit d'écriture direct depuis le navigateur serait un
-- chemin de forge qui court-circuite entièrement le contrôle OTP, le canvas et
-- l'empreinte serveur — exactement ce que la RPC du §8 existe pour empêcher.
-- Le RLS reste fail-closed (policies §7.1 inchangées, `entreprise_courante()`
-- renvoyant NULL sans JWT), mais laisser un droit d'écriture à `anon` sur une
-- table de preuve serait une défense en profondeur absente, pas une protection.
revoke all on table public.devis_signatures from anon, authenticated;
grant select on table public.devis_signatures to anon, authenticated;
grant select, insert, update, delete on table public.devis_signatures
  to service_role;

-- Les policies du §7.1 sont CONSERVÉES telles quelles : le SELECT de
-- devis-factures ne doit rester lisible que dans le tenant du lecteur. Une
-- policy manquante ou une table sans RLS seraient des régressions
-- silencieuses que rien d'autre dans le dépôt ne détecterait — d'où
-- l'assertion explicite ci-dessous, à la fois vérificateur et document.
do $bna$
declare
  v_rls      boolean;
  v_policies integer;
begin
  select relrowsecurity into v_rls
    from pg_class where oid = 'public.devis_signatures'::regclass;
  if coalesce(v_rls, false) is not true then
    raise exception 'devis_signatures: RLS desactivee, le SELECT navigateur ne serait plus cloisonne';
  end if;

  select count(*) into v_policies
    from pg_policies
   where schemaname = 'public' and tablename = 'devis_signatures';
  if v_policies < 4 then
    raise exception 'devis_signatures: % policy(s) RLS au lieu de 4, cloisonnement incomplet', v_policies;
  end if;
end
$bna$;

-- -----------------------------------------------------------------------------
-- 8) INDEX ET COMMIT ATOMIQUE DE LA SIGNATURE
-- -----------------------------------------------------------------------------
--
-- POURQUOI UNE RPC
-- ----------------
-- Signer un devis demande TROIS écritures qui doivent réussir ou échouer
-- ensemble :
--   1. consommation de l'OTP          (devis_otp.consumed_at)
--   2. écriture de la preuve          (devis_signatures)
--   3. changement de statut           (devis.statut = 'signe')
--
-- FaITES EN ORDRE depuis le code applicatif, elles ouvrent des fenêtres :
--   * si l'OTP est consommé puis que l'insertion de preuve échoue, le client a
--     brûlé un code et ne peut plus rien prouver -> il doit tout recommencer ;
--   * si la preuve est écrite puis que le statut échoue, le devis reste
--     signable et une SECONDE preuve peut être produite pour le même devis.
--
-- Une transaction PostgreSQL rend le triplet indivisible. C'est l'unique façon
-- de garantir « jamais de signature sans OTP consommé » ET « jamais d'OTP
-- consommé sans signature ».
--
-- `SECURITY DEFINER` : la fonction écrit dans `devis_signatures` et `devis_otp`,
-- dont `anon` n'a plus que le droit de lecture (§7.4). Sans ce mode, la fonction
-- s'exécuterait avec les droits de `service_role` — ce qui fonctionne, mais
-- alors la restriction du §7.4 serait contournable par simple appel RPC et
-- n'aurait aucun sens. `SECURITY DEFINER` rend la restriction RÉELLE.
--
-- search_path : `public, extensions` et non `public` seul.
--   `digest()` (empreinte SHA-256) vient de pgcrypto, qui est installé dans le
--   schéma `extensions` sur ce projet — vérifié en base le 2026-10-03 :
--     select n.nspname, p.proname from pg_proc p
--      join pg_namespace n on n.oid = p.pronamespace
--      where p.proname = 'digest';   --> extensions.digest
--   Avec `search_path = public` seul, la fonction serait ACCEPTÉE à la création
--   (PostgreSQL ne résout pas les appels d'une fonction PL/pgSQL) puis
--   ÉCHOUERAIT à la première invocation, en production. Les deux schémas sont
--   épinglés : rien ne peut être hijacké via le search_path, et `extensions`
--   n'est pas inscriptible par les rôles applicatifs.

-- 8.1 INDEX — cohérence avec les requêtes RÉELLEMENT émises.
--
--   * RPC §8.2 étape 7 : `select … from devis_otp where devis_id = p_devis_id
--     order by created_at desc limit 1 for update`
--     → (devis_id, created_at desc) : equality sur le premier terme, tri déjà
--       fourni par l'index, donc le LIMIT 1 s'arrête après 1 entrée.
--   * devis-factures (navigateur) : `select … from devis_signatures
--     where devis_id = eq.<uuid> limit 1`
--     → (devis_id, signed_at desc) : equality sur `devis_id`, donc index
--       utilisable en seekscan. Le tri permet une lecture d'historique sans tri
--       explicite.
--
-- Les deux clés étrangères portent donc enfin un index : sans lui, chaque
-- signature d'un devis donnait un Seq Scan sur `devis_otp`, qui croît jusqu'à la
-- purge manuelle des OTP expirés.
create index if not exists devis_otp_devis_recent_idx
  on public.devis_otp (devis_id, created_at desc);
create index if not exists devis_signatures_devis_idx
  on public.devis_signatures (devis_id, signed_at desc);
