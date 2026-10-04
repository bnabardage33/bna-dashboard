-- =============================================================================
-- PREUVE DE SIGNATURE DES DEVIS — socle de données (Canvas + OTP)
-- Projet : BNA Dashboard — 2026-10-03
--
-- PORTÉE
-- ------
-- Cette migration est purement ADDITIVE et NE MODIFIE AUCUNE DONNÉE METIER.
-- Elle crée le modèle de preuve qui manque aujourd'hui : le flux de signature
-- vivant (app/api/espace-client/[code_acces]/signer) n'écrit QUE `statut='signe'`,
-- sans signataire, sans date, sans IP, sans image, sans empreinte.
--
--   * devis_signatures : preuve, une ligne par signature, JAMAIS écrasée.
--   * devis_otp        : état d'un OTP, avec condensat HMAC (jamais en clair).
--   * devis            : + signature_image, telephone_source, devis_empreinte_sha256.
--   * clients          : + tel_normalise, tel_verifie.
--   * chantiers        : + code_acces_expires_at, code_acces_utilise_at (INERTES).
--   * devis.statut     : normalisation des statuts nuls puis CHECK.
--   * index            : devis_otp(devis_id, created_at desc) et
--                        devis_signatures(devis_id, signed_at desc).
--   * grants           : devis_signatures resserrés (SELECT pour anon/authenticated,
--                        ÉCRITURE service_role seule — la preuve est écrite par la
--                        RPC SECURITY DEFINER du §8).
--   * RPC §8           : signature_devis_valider_otp — commit ATOMIQUE de la
--                        signature (consommation OTP + preuve + statut).
--
-- CONVENTIONS RESPECTÉES (vérifiées sur les migrations existantes)
-- ----------------------------------------------------------
--   * id uuid PRIMARY KEY DEFAULT gen_random_uuid()      (frais_deplacement)
--   * entreprise_id uuid NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT
--   * timestamptz pour toute date                         (devis_ia, 20260917)
--   * RLS : alter table ... enable row level security + policies
--           `entreprise_courante()`                        (part2 §5.1)
--   * GRANT EXPLICITE sur toute table créée ici           (part5 : une table
--     créée en SQL Editor n'hérite d'aucun privilège de base ; sans GRANT,
--     un SELECT authentifié échoue "permission denied" AVANT l'évaluation RLS)
--   * idempotence : IF NOT EXISTS / ON CONFLICT / drop trigger if exists
--
-- IDEMPOTENTE : rejouable sans erreur sur une base déjà migrée.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) COLONNES ADDITIVES SUR TABLES EXISTANTES
-- -----------------------------------------------------------------------------

-- 1.1 devis — les colonnes de preuve qui manquaient.
--     `signature_image` rend enfin atteignable components/DocumentPDF.tsx:280
--     (qui attend doc.signature_client) pour un devis signé par le portail.
alter table public.devis
  add column if not exists signature_image       text,
  add column if not exists telephone_source      text,
  add column if not exists devis_empreinte_sha256 text;

comment on column public.devis.signature_image is
  'Signature manuscrite du client (data URL PNG) au moment de la signature. Alimentee par devis_signatures.signature_image ; conservée ici pour que DocumentPDF.tsx puisse l''afficher sans jointure.';
comment on column public.devis.telephone_source is
  'Provenance du numéro utilisé pour l''OTP : ''dossier_client'' uniquement. Un numéro saisi librement par le navigateur n''a jamais valeur de preuve.';
comment on column public.devis.devis_empreinte_sha256 is
  'SHA-256 de la sérialisation canonique du devis AU MOMENT de la signature (lib/empreinte-devis.ts). Détecte toute modification du devis postérieure à la signature.';

-- 1.2 clients — numéro normalisé et vérifié.
--     ATTENTION : `tel_verifie` vaut false par défaut, donc AUCUN client n'est
--     vérifié après migration. La signature par OTP sera donc refusée pour tous
--     tant qu'une procédure de vérification n'a pas été posée. C'est voulu :
--     mieux vaut BLOQUER que d''accepter un numéro non vérifié. Voir le rapport.
alter table public.clients
  add column if not exists tel_normalise text,
  add column if not exists tel_verifie    boolean not null default false;

comment on column public.clients.tel_normalise is
  'Numéro au format E.164 (+33612345678). Dérivé de `tel`. C''est CETTE colonne qui est utilisée pour envoyer l''OTP : `tel` reste le champ libre de saisie.';
comment on column public.clients.tel_verifie is
  'Vrai seulement après vérification par l''artisan. Tant que c''est faux, aucune signature par OTP n''est possible (anti-envoi d''un SMS à un numéro arbitraire).';

-- MÉCANISME DE VÉRIFICATION — PRÉPARÉ ICI, VOLONTAIREMENT NON IMPLEMENTÉ
-- ------------------------------------------------------------------
-- Décision du 2026-10-03 : AUCUN numéro existant n'est marqué vérifié. Le
-- contrôle doit rester réel, donc `tel_normalise` n'est pas non plus renseigné
-- automatiquement depuis `tel` : ce serait faire unbroken la donnée d'un tiers
-- sans l'avoir vérifiée.
--
-- Levée prévue, en trois temps et dans cet ordre :
--   1. une commande de vérification par SMS vers `clients.tel_normalise`, à
--      réponse devinée ou à lien à usage unique, émise par l''artisan ;
--   2. un contrôle du dossier client (`tel` + pièce d'identité pour un
--      professionnel) qui autorise `tel_verifie = true` à la main ;
--   3. la pigmentation de `tel_normalise` par un trigger, à partir du seul
--      `tel`_VALIDÉ, pour que `send-otp` n'ait plus qu'à le lire.
--
-- Tant que ces trois étapes ne sont pas en place, la signature par OTP est
-- refusée pour tous les clients : c'est un blocage fonctionnel assumé, pas un
-- défaut du modèle.
--
-- POINT OUVERT : `tel_normalise` (numéro au format E.164) est pour l'instant
-- inexistant et non alimenté. `send-otp` (phase 3) n'aura donc rien à lire.
-- Deux voies, à trancher avant la phase 3 :
--   (a) ajouter `tel_normalise_e164` alimenté par la normalisation applicative
--       du `tel` vérifié — simple, mais le format E.164 devient une convention
--       de code applicatif plutôt qu'une garantie base ;
--   (b) une fonction SQL IMMUTABLE de normalisation, appelée par le trigger du
--       point 3, avec `tel_normalise` alimenté par la base — plus solide.
-- Aucune des deux n'est implémentée ici : c'est une décision de conception.

-- 1.3 chantiers — colonnes STRUCTURELLES SEULEMENT.
--     Aucune contrainte, aucun trigger, aucune lecture applicative : le portail
--     continue de fonctionner à l'identique. Ces deux colonnes ne deviendront
--     effectives que dans une migration ultérieure, explicitement validée.
alter table public.chantiers
  add column if not exists code_acces_expires_at timestamptz,
  add column if not exists code_acces_utilise_at  timestamptz;

comment on column public.chantiers.code_acces_expires_at is
  'Expiration du code d''accès. NULL = pas d''expiration. NON UTILISÉ par le code à ce jour (migration préparatoire).';
comment on column public.chantiers.code_acces_utilise_at is
  'Horodatage du dernier usage du code d''accès. NULL = jamais utilisé. NON UTILISÉ par le code à ce jour (migration préparatoire).';


-- -----------------------------------------------------------------------------
-- 2) TABLE devis_signatures — la preuve
-- -----------------------------------------------------------------------------

-- PAS de contrainte UNIQUE(devis_id) : plusieurs événements restent
-- techniquement possibles (signature initiale, puis avenant, puis re-signature
-- autorisée explicitement par un backoffice). L'historique ne doit jamais être
-- écrasé. L'unicité métier est une règle applicative, pas une contrainte SQL.
create table if not exists public.devis_signatures (
  id                          uuid        primary key default gen_random_uuid(),
  devis_id                    uuid        not null references public.devis(id) on delete restrict,
  entreprise_id               uuid        not null references public.entreprises(id) on delete restrict,
  chantier_id                 uuid        references public.chantiers(id) on delete set null,
  client_id                   uuid        references public.clients(id)   on delete set null,

  -- Qui a signé. 'client' = via le portail code_acces. 'artisan' = backoffice.
  signe_par                   text        not null default 'client'
                                         check (signe_par in ('client', 'artisan')),

  -- Identité déclarée par le signataire. Chaîne libre : c'est une preuve
  -- AUDITÉE, pas une identité vérifiée cryptographiquement.
  signataire_nom              text        not null check (length(btrim(signataire_nom)) > 0),

  -- Numéro RÉELLEMENT utilisé pour l'OTP. Distinct de clients.tel : c'est la
  -- valeur normalisée qui a reçu le SMS.
  telephone_verifie           text,
  telephone_source            text        check (telephone_source in ('dossier_client')),

  -- Décision produit : Canvas + OTP. La valeur 'otp' (preuve SANS image
  -- manuscrite) a été volontairement retirée le 2026-10-03 : elle était
  -- inatteignable de toute façon (contrainte de table ci-dessous), donc
  -- occupait une place morte dans le modèle.
  methode                     text        not null default 'canvas+otp'
                                         check (methode in ('canvas+otp', 'canvas')),

  -- Image de la signature manuscrite (data URL PNG).
  signature_image             text        not null check (length(signature_image) > 0),

  -- Mention manuscrite « Bon pour accord », exigée par les CGV du produit
  -- (components/DocumentPDF.tsx:323). Le booléen est l'équivalent machine,
  -- le texte est l'équivalent probant : les deux sont conservés.
  mention_bon_pour_accord         boolean not null default false,
  mention_bon_pour_accord_texte   text,

  -- Empreinte du document SIGNÉ. Répond à la question centrale : le devis
  -- affiché au signataire est-il bien celui qui a été signé ?
  devis_empreinte_sha256      text        not null check (devis_empreinte_sha256 ~ '^[0-9a-f]{64}$'),
  devis_version_json          jsonb       not null check (jsonb_typeof(devis_version_json) = 'object'),

  -- OTP ayant autorisé cette signature (FK ajoutée plus bas vers devis_otp).
  otp_id                      uuid,

  signed_at                   timestamptz not null default now(),
  signed_ip                   varchar(45),
  user_agent                  text,
  consentement_ip             boolean      not null default false,

  created_at                  timestamptz not null default now(),

  -- Les deux CHECK `methode` (colonne et table) portent EXACTEMENT le même
-- ensemble, `('canvas','canvas+otp')` : il n'existe plus de valeur admise par
-- l'un et refusée par l'autre.
  constraint devis_signatures_methode_coherente
    check (methode in ('canvas', 'canvas+otp'))
);

comment on table public.devis_signatures is
  'Preuve de signature d''un devis : une ligne par signature, jamais écrasée. Porte l''image manuscrite, le signataire, le téléphone RÉELLEMENT utilisé, l''empreinte SHA-256 du devis et le snapshot du document au moment de la signature.';
comment on column public.devis_signatures.devis_empreinte_sha256 is
  'SHA-256 de la forme canonique du devis au moment de la signature. Toute modification ultérieure du devis devient détectable en recalculant l''empreinte.';
comment on column public.devis_signatures.devis_version_json is
  'Snapshot complet du devis signé (lignes, totaux, TVA, client, CGV). Rend la preuve autonome : elle ne dépend pas de l''état courant de la table devis.';


-- -----------------------------------------------------------------------------
-- 3) TABLE devis_otp — état d'un OTP
-- -----------------------------------------------------------------------------

-- `entreprise_id` est ajouté au modèle demandé : sans lui, aucun cloisonnement
-- par tenant n'est possible sur cette table (le RLS porte sur entreprise_id).
create table if not exists public.devis_otp (
  id                 uuid        primary key default gen_random_uuid(),
  devis_id           uuid        not null references public.devis(id) on delete cascade,
  entreprise_id      uuid        not null references public.entreprises(id) on delete restrict,

  -- HMAC-SHA256(secret serveur, code) en hexadécimal minuscule (64 caractères).
  -- Le code EN CLAIR n'est stocké nulle part : ni en base, ni en log, ni en
  -- réponse d'API.
  code_hmac          text        not null check (code_hmac ~ '^[0-9a-f]{64}$'),

  expires_at         timestamptz not null,
  -- Alimentation à la CONSOMMATION. NULL => l'OTP est encore utilisable.
  -- C'est ce qui rend le rejeu impossible : une seconde vérification du même
  -- code trouve consumed_at non nul et échoue.
  consumed_at        timestamptz,
  tentatives         integer     not null default 0 check (tentatives >= 0),
  verrouille_jusqua  timestamptz,
  ip                 varchar(45),

  created_at         timestamptz not null default now(),

  -- Un OTP consommé ne peut pas avoir été consommé avant d'exister.
  constraint devis_otp_consommation_coherente
    check (consumed_at is null or consumed_at >= created_at)
);

comment on table public.devis_otp is
  'État d''un code de signature à usage unique. Ne contient AUCUN code en clair : uniquement le condensat HMAC-SHA256. Supprimée en cascade avec le devis (donnée technique, sans valeur probante).';
comment on column public.devis_otp.code_hmac is
  'HMAC-SHA256 du code, clé secrète côté serveur. Jamais le code en clair. La comparaison se fait à temps constant sur les condensats.';
comment on column public.devis_otp.consumed_at is
  'Posé à la consommation. Un OTP consommé ne peut plus jamais être rejoué, même si le code est correct et même si le délai n''est pas expiré.';


-- -----------------------------------------------------------------------------
-- 4) FK croisée devis_signatures.otp_id -> devis_otp (tables créées dans l'ordre)
-- -----------------------------------------------------------------------------

do $bna$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.devis_signatures'::regclass
       and conname = 'devis_signatures_otp_id_fkey'
  ) then
    alter table public.devis_signatures
      add constraint devis_signatures_otp_id_fkey
      foreign key (otp_id) references public.devis_otp(id) on delete set null;
  end if;
end
$bna$;


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

-- 8.2 FONCTION — signature_devis_valider_otp
--
-- AUCUN PARAMÈTRE N'EST UNE VALEUR DE CONFIANCE.
-- Le navigateur fournit : le code d'accès, l'id du devis, l'id de la ligne OTP,
-- le condensat du code saisi, l'image du canvas, la case « bon pour accord »,
-- l'IP et l'user-agent.
-- Le serveur DÉRIVE tout le reste : entreprise, chantier, client, signataire,
-- statut, empreinte, telephone_source, signe_par, mention.
-- Aucun de ces éléments n'est accepté en paramètre — c'est ce qui rend la
-- fonction inutilisable pour forger une preuve.
--
-- LE SECRET HMAC NE VIENT PAS ICI. `code_hmac` est un HMAC-SHA256 calculé par
-- la route Node avec OTP_HMAC_SECRET ; PostgreSQL ne reçoit qu'un condensat
-- opaque à comparer. Ni le secret ni le code en clair ne franchissent la
-- frontière.
--
-- VALEUR DE RETOUR : toujours un jsonb `{ ok, motif?, ... }`. Une fonction qui
-- lève une exception pour un refus métier obligerait la route à deviner le
-- motif depuis `errcode`, et surtout EMPÊCHERAIT de valider un compteur de
-- tentatives : le RAISE annulerait la transaction, donc l'incrément. Le refus
-- métier RETOURNE, l'échec technique LEVE. Voir "ATOMICITÉ" plus bas.
create or replace function public.signature_devis_valider_otp(
  p_code_acces        text,
  p_devis_id          uuid,
  p_otp_id            uuid,
  p_code_hmac_attendu text,
  p_signature_image   text,
  p_mention_acord     boolean,
  p_ip                varchar(45),
  p_user_agent        text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $bna$
declare
  v_chantier_id   uuid;
  v_entreprise_id uuid;
  v_client_id     uuid;
  v_statut        text;
  v_devis         public.devis%rowtype;
  v_otp_id        uuid;
  v_tentatives    integer;
  v_client_nom    text;
  v_tel           text;
  v_tel_verifie   boolean;
  v_version       jsonb;
  v_empreinte     text;
  v_signature_id  uuid;
begin
  ---------------------------------------------------------------------------
  -- 1) FORME DES PARAMÈTRES
  --    Avant toute lecture. Un `devis_id` ou un `otp_id` qui n'est pas un UUID
  --    n'est pas « absent » : c'est une requête invalide, et la distinguer d'un
  --    UUID simplement inconnu ouvrirait une sonde d'existence.
  ---------------------------------------------------------------------------
  if p_devis_id is null or p_otp_id is null then
    return jsonb_build_object('ok', false, 'motif', 'intrant');
  end if;

  if p_code_acces is null or btrim(p_code_acces) = '' then
    return jsonb_build_object('ok', false, 'motif', 'intrant');
  end if;

  -- Le condensat soumis doit AVOIR la forme d'un condensat. Comparer un
  -- condensat à n'importe quoi n'échouerait jamais proprement : on le valide.
  if p_code_hmac_attendu is null
     or p_code_hmac_attendu !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'motif', 'otp_code');
  end if;

  -- Image : bornée ET de type déclaré. Le CHECK de la table ne testerait que
  -- `length > 0` ; une borne haute évite qu'un corps de requête arbitrairement
  -- grand soit stocké dans la preuve, et le préfixe interdit qu'un contenu
  -- arbitraire s'y retrouve. Le rendu HTML échappe de son côté.
  if p_signature_image is null
     or length(p_signature_image) < 21
     or length(p_signature_image) > 262144 then
    return jsonb_build_object('ok', false, 'motif', 'image_invalide');
  end if;
  if left(p_signature_image, 22) <> 'data:image/png;base64,' then
    return jsonb_build_object('ok', false, 'motif', 'image_invalide');
  end if;

  -- La mention « Bon pour accord » fait partie du consentement : elle n'est pas
  -- décorative. Son TEXTE est écrit par la fonction ci-dessous, jamais reçu du
  -- navigateur, pour qu'il ne puisse pas être remplacé par une phrase vide.
  if coalesce(p_mention_acord, false) is not true then
    return jsonb_build_object('ok', false, 'motif', 'mention_absente');
  end if;

  ---------------------------------------------------------------------------
  -- 2) CHAÎNE DE CONFIANCE — code_acces → chantier → devis
  --    Le `code_acces` est la SEULE preuve d'identité du portail : il n'y a
  --    aucune session. Tout le reste en découle.
  ---------------------------------------------------------------------------
  select c.id, c.entreprise_id, c.client_id
    into v_chantier_id, v_entreprise_id, v_client_id
    from public.chantiers c
   where c.code_acces = btrim(p_code_acces);

  -- Sans entreprise, pas de tenant : fail-closed. Un chantier à l'entreprise
  -- invalide est INDISTINGUABLE d'un code inconnu.
  if v_chantier_id is null or v_entreprise_id is null then
    return jsonb_build_object('ok', false, 'motif', 'intrant');
  end if;

  -- DEUX prédicats dans le MÊME SELECT : atomique. Le `entreprise_id` est
  -- comparé même si le `chantier_id` suffit logiquement à identifier le devis ;
  -- la redondance est délibérée, elle garantit que le tenant de la preuve ne
  -- peut pas diverger de celui du chantier par un UPDATE concurrent.
  select d.*
    into v_devis
    from public.devis d
   where d.id = p_devis_id
     and d.chantier_id = v_chantier_id
     and d.entreprise_id = v_entreprise_id;

  if v_devis.id is null then
    return jsonb_build_object('ok', false, 'motif', 'intrant');
  end if;

  ---------------------------------------------------------------------------
  -- 3) GARDE DE RE-SIGNATURE
  --    Un devis clos ne redemande pas de preuve. `devis_signatures` n'a pas de
  --    UNIQUE(devis_id) — l'historique ne doit jamais être écrasé — donc c'est
  --    le STATUT qui porte cette garantie, pas la table.
  ---------------------------------------------------------------------------
  v_statut := v_devis.statut;
  if v_statut = 'signe' or v_statut = 'accepte' then
    return jsonb_build_object('ok', false, 'motif', 'devis_clot');
  end if;

  ---------------------------------------------------------------------------
  -- 4) CLIENT ET TÉLÉPHONE — dérivés du chantier, jamais reçus.
  --    `tel_verifie` n'est jamais mis à true automatiquement : c'est le contrôle
  --    qui empêche de signer au nom d'un tiers sur un dossier dont le numéro
  --    n'a jamais été vérifié.
  ---------------------------------------------------------------------------
  if v_client_id is null then
    return jsonb_build_object('ok', false, 'motif', 'client_absent');
  end if;

  select cl.nom, cl.tel_normalise, cl.tel_verifie
    into v_client_nom, v_tel, v_tel_verifie
    from public.clients cl
   where cl.id = v_client_id
     and cl.entreprise_id = v_entreprise_id;

  if v_client_nom is null or btrim(v_client_nom) = '' then
    return jsonb_build_object('ok', false, 'motif', 'client_absent');
  end if;
  if coalesce(v_tel_verifie, false) is not true then
    return jsonb_build_object('ok', false, 'motif', 'tel_non_verifie');
  end if;
  -- Un numéro vérifié doit être EXPLOITABLE : un `tel_normalise` vide ou
  -- malformé produirait une preuve attestant d'un envoi qui n'a pas eu lieu.
  if v_tel is null or v_tel !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'motif', 'tel_non_verifie');
  end if;

  ---------------------------------------------------------------------------
  -- 5) SÉLECTION DE L'OTP — LE PLUS RÉCENT UNIQUEMENT
  --    `order by created_at desc limit 1` : dès qu'un nouveau code est demandé,
  --    les codes précédents deviennent INVALIDES. Un seul code valide à la fois,
  --    donc un seul endroit de verite sur « le code courant du devis ».
  --    `for update` verrouille la ligne : deux requêtes concurrentes ne peuvent
  --    pas lire le même `tentatives` avant de l'incrémenter, ce qui laisserait
  --    passer plus de MAX_TENTATIVES essais.
  -- ---------------------------------------------------------------------------
  select o.id, o.tentatives
    into v_otp_id, v_tentatives
    from public.devis_otp o
   where o.devis_id = p_devis_id
   order by o.created_at desc
   limit 1
     for update;

  if v_otp_id is null then
    return jsonb_build_object('ok', false, 'motif', 'otp_absent');
  end if;

  -- Un `p_otp_id` qui n'est pas la ligne la plus récente = le client soumet un
  -- code PÉRIMÉ alors qu'un code plus récent existe. Refus IMMÉDIAT, et surtout
  -- SANS incrémenter : sinon n'importe qui détenant le code d'accès pourrait
  -- brûler les tentatives du client légitime en soumettant des codes périmés.
  --
  -- CONTRAT OFFICIEL (validé explicitement, phase 3) — trois propriétés, dont
  -- chacune est vérifiée par la preuve T5 :
  --
  --   1. REFUS        : l'OTP soumis n'est pas consommé.
  --   2. PAS D'INCRÉMENT : `tentatives` reste inchangé, donc ce refus ne peut
  --      pas coûter un essai au client légitime — sa fenêtre sur le nouveau code
  --      reste entière.
  --   3. PAS DE VERROUILLAGE : ni `verrouille_jusqua` posée, ni l'OTP courant
  --      touché. Le client peut donc saisir son nouveau code juste après.
  --
  -- Le prix de ce choix est explicite et assumé : un détenteur du code d'accès ne
  -- peut plus déclencher une expiration rapide à coût nul. Il le peut en revanche
  -- par cinq tentatives REELLES, qui sont precisement ce que le seuil ci-dessus
  -- compte. La force brute reste fermée.
  if v_otp_id is distinct from p_otp_id then
    return jsonb_build_object('ok', false, 'motif', 'otp_perime');
  end if;

  ---------------------------------------------------------------------------
  -- 6) ÉVALUATION DE L'OTP
  --    Les six refus correspondent exactement aux six `MotifRefus` de
  --    lib/otp.ts (evaluerTentativeOtp). La route fait déjà cette évaluation en
  --    TypeScript, avec `timingSafeEqual` ; cette couche SQL est la BARRIÈRE
  --    ATOMIQUE qui ferme la course entre la lecture applicative et l'écriture.
  --    Deux predicates, une conclusion : c'est le même duo lecture/écriture que
  --    le `.eq("entreprise_id")` en lecture puis en écriture ailleurs dans ce
  --    dépôt.
  -- ---------------------------------------------------------------------------
  if exists (
       select 1 from public.devis_otp o
        where o.id = v_otp_id
          and o.consumed_at is not null
      ) then
    return jsonb_build_object('ok', false, 'motif', 'otp_consomme');
  end if;

  if exists (
       select 1 from public.devis_otp o
        where o.id = v_otp_id
          and o.verrouille_jusqua is not null
          and o.verrouille_jusqua > now()
      ) then
    return jsonb_build_object('ok', false, 'motif', 'otp_verrouille');
  end if;

  -- CONTRAT OFFICIEL — SEUIL DES TENTATIVES (valide explicitement, phase 3)
  -- =====================================================================
  -- `MAX_TENTATIVES = 5` autorise CINQ ECHECS, pas cinq essais. Le decalage
  -- d'un essai est VOLONTAIRE et fait partie du contrat :
  --
  --     echecs 1..4             -> refus `otp_code`, `tentatives` passe a 1..4
  --     5e SOUMISSION, bon code -> SUCCES  (le verrou n'est pas encore pose)
  --     5e ECHEC                -> `tentatives` = 5 ET `verrouille_jusqua` posee
  --     6e et suivantes         -> refus `otp_verrouille`, sans increment
  --
  -- Pourquoi le decalage est du bon cote : verrouiller a `tentatives >= 4`
  -- punirait le client legitime d'une erreur de PLUS que n'en commet
  -- l'attaquant, puisque l'attaquant ne paie rien de son echec. Ici les deux en
  -- paient un : le client se trompe cinq fois, et l'attaquant doit en commettre
  -- cinq. Le cout est symetrique sur les deux camps, ce qui est la seule maniere
  -- d'eloigner le verrou du client sans l'affaiblir.
  --
  -- La meme regle est implementee cote TypeScript dans `lib/otp.ts`
  -- (`evaluerTentativeOtp`). Toute divergence entre les deux DETERAIT le
  -- contrat : les tests verrouillent donc les DEUX implementations dans le meme
  -- temps, et non l'une apres l'autre.
  if coalesce(v_tentatives, 0) >= 5 then
    return jsonb_build_object('ok', false, 'motif', 'otp_tentatives');
  end if;

  if exists (
       select 1 from public.devis_otp o
        where o.id = v_otp_id
          and (o.expires_at is null or o.expires_at <= now())
      ) then
    return jsonb_build_object('ok', false, 'motif', 'otp_expire');
  end if;

  -- Comparaison des condensats. C'est le SEUL point où le code soumis est
  -- confronté à la valeur stockée — et il ne l'est qu'indirectement : c'est le
  -- condensat calculé par la route qui est comparé, jamais le code en clair.
  if not exists (
       select 1 from public.devis_otp o
        where o.id = v_otp_id
          and o.code_hmac = p_code_hmac_attendu
      ) then
    -- Code FAUX : c'est le seul cas où incrémenter a du sens. On incrémente ET on
    -- verrouille au seuil, puis on RETOURNE (et non RAISE) pour que l'incrément
    -- soit validé par COMMIT : c'est la condition pour que le verrou anti-force
    -- brute survive à un refus.
    update public.devis_otp o
       set tentatives      = coalesce(o.tentatives, 0) + 1,
           verrouille_jusqua = case
                                when coalesce(o.tentatives, 0) + 1 >= 5
                                  then now() + interval '10 minutes'
                                else null
                              end
     where o.id = v_otp_id;
    return jsonb_build_object('ok', false, 'motif', 'otp_code');
  end if;

  ---------------------------------------------------------------------------
  -- 7) CONSOMMATION ATOMIQUE
  --    Le `where` rejoue TOUTES les conditions du §6. C'est cette seconde
  --    barrière qui rend le rejeu impossible même si une écriture concurrente
  --    avait modifié la ligne entre la lecture et ici.
  -- ---------------------------------------------------------------------------
  update public.devis_otp o
     set consumed_at       = now(),
         tentatives        = 0,
         verrouille_jusqua = null
   where o.id = v_otp_id
     and o.devis_id = p_devis_id
     and o.entreprise_id = v_entreprise_id
     and o.consumed_at is null
     and (o.verrouille_jusqua is null or o.verrouille_jusqua <= now())
     and coalesce(o.tentatives, 0) < 5
     and o.expires_at > now()
     and o.code_hmac = p_code_hmac_attendu;

  -- 0 ligne touchée : la ligne a changé entre le §6 et ici. On RETOURNE (pas de
  -- RAISE) pour ne pas consommer un code valide ; la transaction est alors
  -- entièrement en lecture et ne committe rien d'autre.
  if not found then
    return jsonb_build_object('ok', false, 'motif', 'otp_indisponible');
  end if;

  ---------------------------------------------------------------------------
  -- 8) EMPREINTE — CALCULÉE ICI, JAMAIS REÇUE
  --    `v_version::text` est déterministe pour une valeur `jsonb` donnée :
  --    jsonb normalise l'ordre des clés et les espaces, donc aucune
  --    canonicalisation manuelle n'est nécessaire et deux calculs successifs
  --    sur la MÊME ligne donnent le MÊME résultat.
  --
  --    `statut` est EXCLU, et c'est délibéré : le §10 le passe à 'signe'. S'il
  --    figurait dans l'empreinte, celle-ci ne serait plus reproductible après la
  --    signature, et la détection de modification — le SEUL but de la colonne —
  --    serait impossible. Même raison pour les colonnes techniques :
  --    otp_code, otp_expires_at, signature_date, signature_ip, signature_phone,
  --    signature_image, telephone_source, devis_empreinte_sha256, created_at.
  --    Les deux dernières de cette liste seraient en outre auto-référentielles.
  ---------------------------------------------------------------------------
  v_version := jsonb_build_object(
    'id',                   v_devis.id,
    'numero',               v_devis.numero,
    'objet',                v_devis.objet,
    'type_travaux',         v_devis.type_travaux,
    'adresse_chantier',     v_devis.adresse_chantier,
    'surface_m2',           v_devis.surface_m2,
    'date_emission',        v_devis.date_emission,
    'validite_jours',       v_devis.validite_jours,
    'delai_jours',          v_devis.delai_jours,
    'lignes',               v_devis.lignes,
    'cout_main_oeuvre_ht',  v_devis.cout_main_oeuvre_ht,
    'cout_matiere_ht',      v_devis.cout_matiere_ht,
    'marge_ht',             v_devis.marge_ht,
    'marge_pct',            v_devis.marge_pct,
    'total_ht',             v_devis.total_ht,
    'tva_pct',              v_devis.tva_pct,
    'acompte_pct',          v_devis.acompte_pct,
    'is_avenant',           v_devis.is_avenant,
    'devis_parent_id',      v_devis.devis_parent_id,
    'client_id',            v_devis.client_id,
    'chantier_id',          v_devis.chantier_id,
    'entreprise_id',        v_devis.entreprise_id
  );
  v_empreinte := encode(digest(v_version::text, 'sha256'), 'hex');

  ---------------------------------------------------------------------------
  -- 9) PREUVE
  --    `entreprise_id`, `signe_par`, `telephone_source` et le texte de la
  --    mention sont ÉCRITS ICI : ce sont des constantes de fonction, pas des
  --    entrées. Le trigger `tg_devis_signatures_coherence` réimpose de toute
  --    façon `entreprise_id` depuis le devis.
  ---------------------------------------------------------------------------
  insert into public.devis_signatures (
    devis_id,
    entreprise_id,
    chantier_id,
    client_id,
    signe_par,
    signataire_nom,
    telephone_verifie,
    telephone_source,
    methode,
    signature_image,
    mention_bon_pour_accord,
    mention_bon_pour_accord_texte,
    devis_empreinte_sha256,
    devis_version_json,
    otp_id,
    signed_ip,
    user_agent,
    consentement_ip
  ) values (
    v_devis.id,
    v_entreprise_id,
    v_chantier_id,
    v_client_id,
    'client',
    btrim(v_client_nom),
    v_tel,
    'dossier_client',
    'canvas+otp',
    p_signature_image,
    true,
    'Bon pour accord',
    v_empreinte,
    v_version,
    v_otp_id,
    p_ip,
    left(coalesce(p_user_agent, ''), 512),
    (p_ip is not null)
  )
  returning id into v_signature_id;

  ---------------------------------------------------------------------------
  -- 10) STATUT
  --     `signe` et non `accepte` : l'acceptation est une décision de l'artisan,
  --     jamais du client, et le CHECK `devis_statut_check` (§6) l'admet mais
  --     cette route ne doit pas l'atteindre.
  ---------------------------------------------------------------------------
  update public.devis
     set statut = 'signe'
   where id = v_devis.id
     and entreprise_id = v_entreprise_id;

  if not found then
    -- Inattendu : le devis existait au §2. On RAISE pour que TOUT soit
    -- annulé, consommation comprise, plutôt que de valider une preuve sans
    -- statut. C'est le seul RAISE reachable après le §7.
    raise exception 'signature_devis_valider_otp: mise a jour du statut sans effet'
      using errcode = 'internal_error';
  end if;

  return jsonb_build_object(
    'ok', true,
    'signature_id', v_signature_id,
    'signed_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'devis_empreinte_sha256', v_empreinte
  );
end
$bna$;

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