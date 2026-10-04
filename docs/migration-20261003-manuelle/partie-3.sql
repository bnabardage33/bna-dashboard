
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
