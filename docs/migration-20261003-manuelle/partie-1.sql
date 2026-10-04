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

