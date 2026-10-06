// app/api/espace-client/[code_acces]/verify-otp/route.ts
//
// Vérifie le code de signature et écrit la PREUVE, en une seule opération.
//
// POURQUOI UNE RPC ET PAS TROIS ÉCRITURES DEPUIS CETTE ROUTE
// ---------------------------------------------------------
// Signer un devis demande trois écritures qui doivent réussir ou échouer
// ENSEMBLE :
//   1. consommation de l'OTP   (devis_otp.consumed_at)
//   2. écriture de la preuve   (devis_signatures)
//   3. changement de statut    (devis.statut = 'signe')
// FaITES EN ORDRE depuis le code applicatif, elles ouvrent des fenêtres : si
// l'OTP est consommé puis que l'insertion échoue, le client a brûlé un code ; si
// la preuve est écrite puis que le statut échoue, une SECONDE preuve peut être
// produite pour le même devis. La RPC `public.signature_devis_valider_otp`
// (migration 20261003, §8) rend le triplet indivisible.
//
// DEUX COUCHES, MÊME PRÉDICAT — ET POURQUOI CE N'EST PAS REDONDANT
// ---------------------------------------------------------------
// Cette route ne fait PAS confiance au verdict de la RPC, ni l'inverse : les
// deux appliquent le même prédicat par des mécanismes différents, comme le duo
// `.eq("entreprise_id")` en lecture puis en écriture ailleurs dans ce dépôt.
//
//   Couche 1 — ICI, en TypeScript : `evaluerTentativeOtp()`.
//
//   Couche 2 — DANS la RPC, en SQL : un `UPDATE devis_otp ... WHERE code_hmac =
//             <condensat attendu> AND consumed_at IS NULL AND expires_at >
//             now() AND tentatives < 5`, c'est-à-dire une BARRIÈRE ATOMIQUE.
//
// La couche 2 est nécessaire parce que la couche 1 a une fenêtre : entre le
// SELECT de `devis_otp` et l'écriture de la preuve, une autre requête peut
// consommer l'OTP. La couche 1 est nécessaire parce que la couche 2 ne peut pas
// être la seule : `condenserCodeOtp()` est un HMAC calculé avec un secret
// d'environnement Node, qui n'a pas à être connu de PostgreSQL.
//
// LE SECRET HMAC ET LE CODE RESTENT CÔTÉ NODE
// ------------------------------------------
// PostgreSQL ne reçoit jamais `OTP_HMAC_SECRET`, ni le code en clair. Il ne
// reçoit que `p_code_hmac_attendu`, un condensat opaque qu'il compare par
// égalité SQL. La comparaison à temps constant (`comparerCondensats`, dans
// `evaluerTentativeOtp`) est donc faite ici, où `timingSafeEqual` existe.
//
// AUCUNE VALEUR DE CONFIANCE NE VIENT DU NAVIGATEUR
// --------------------------------------------------
// Le navigateur fournit : `devisId`, `code`, `signatureImage`,
// `mentionBonPourAccord`. Il ne fournit NI `entreprise_id`, NI `client_id`, NI
// `chantier_id`, NI `signataire`, NI `statut`, NI `telephone_source`, NI
// `signe_par`, NI l'empreinte. La RPC les DÉRIVE tous. C'est ce qui rend la
// fonction inutilisable pour forger une preuve, et pas seulement difficile.
//
// ANTI-ORACLE
// -----------
// Tous les motifs de refus OTP et `devis_clot` produisent la MÊME réponse
// (`messageRefusPublic()`, 400). Aucun `Retry-After` n'est renvoyé, y compris
// pour un verrou : un en-tête temporel permettrait de mesurer la durée d'expiration
// d'un code et de rejouer la fenêtre plus tard. Voir lib/otp.ts § 5.4.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { autoriserSignature, ERREUR_CODE_ACCES } from '../_garde-signature';
import { verifierEncreSignature } from '../_encre-signature';
import {
  condenserCodeOtp,
  doitIncrementerTentatives,
  estCodeOtpBienForme,
  evaluerTentativeOtp,
  extraireIp,
  messageRefusPublic,
  statutHttpRefusPublic,
  type LigneOtp,
} from '@/lib/otp';

/**
 * Bornes de l'image de signature. Les MÊMES que celles de la RPC — redondance
 * volontaire : la route rejette sans consommer l'OTP, la RPC rejette sans
 * consommer l'OTP non plus (son contrôle de forme est antérieur à la
 * consommation), donc les deux filtres sont indépendants et aucun des deux ne
 * fait confiance à l'autre.
 */
const PREFIXE_PNG = 'data:image/png;base64,';
const TAILLE_MIN = 21;
const TAILLE_MAX = 262144;

type ResultatRpc = {
  ok?: boolean;
  motif?: string;
  signature_id?: string;
  signed_at?: string;
  devis_empreinte_sha256?: string;
};

/**
 * Table de correspondance motif -> réponse publique.
 *
 * `switch` avec un `default` qui retombe sur le refus uniforme : c'est
 * fail-closed. Un motif inconnu — donc une valeur inattendue venue de la base,
 * qui n'est pas une entrée de confiance — ne peut pas produire une réponse plus
 * bavarde que celles prévues. Ajouter un motif dans la RPC sans le déclarer ici
 * ne fait donc jamais fuir d'information : il rend le refus plus obscur, ce qui
 * est réversible, alors que l'inverse ne l'est pas.
 */
function reponsePourMotif(motif: string | undefined): NextResponse {
  switch (motif) {
    // Chaîne de confiance rompue : code inconnu, devis d'un autre chantier,
    // devis d'un autre tenant, UUID inexistant. 404 indistinguable.
    case 'intrant':
      return NextResponse.json({ error: 'Devis introuvable' }, { status: 404 });

    // Evenements de VIE DU DOSSIER, déjà exposés par `send-otp` au meme
    // destinataire : le client est le proprietaire du dossier, il n'apprend rien
    // sur les autres.
    case 'client_absent':
      return NextResponse.json(
        { error: 'Aucun client associé à ce chantier' },
        { status: 409 }
      );
    case 'tel_non_verifie':
      return NextResponse.json(
        {
          error:
            "Votre numéro de téléphone n'est pas vérifié. Contactez votre artisan pour le vérifier avant de signer.",
        },
        { status: 409 }
      );

    // Defaut de FORME de la soumission. Distinct du refus OTP parce qu'il ne
    // depend d'aucun etat de securite : le client peut le corriger seul.
    case 'image_invalide':
    case 'mention_absente':
      return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });

    // TOUT LE RESTE, volontairement indistinct :
    //   devis_clot, otp_perime, otp_absent, otp_expire, otp_consomme,
    //   otp_verrouille, otp_tentatives, otp_code, otp_indisponible,
    //   et tout motif inconnu venu de la base.
    default:
      return NextResponse.json({ error: messageRefusPublic() }, { status: statutHttpRefusPublic() });
  }
}

function refusPublic(): NextResponse {
  return NextResponse.json({ error: messageRefusPublic() }, { status: statutHttpRefusPublic() });
}

// Le runtime Node est explicite, pas herite. Cette route depend de deux modules
// natifs Node — `node:crypto` via `lib/otp.ts`, et `node:zlib` via
// `_encre-signature.ts` — et le runtime Edge ne les expose pas. La directive rend
// cette exigence visible dans le fichier au lieu de la laisser reposer sur un
// detail de la chaine d'imports, qui peut changer.
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;
  if (!code_acces || code_acces.trim() === '') {
    return NextResponse.json(ERREUR_CODE_ACCES, { status: 403 });
  }

  // --- 0. Corps de la requête ---------------------------------------------------
  // Lecture STRICTE de quatre champs. Aucun autre n'est lu : même si le
  // navigateur en envoie `entreprise_id`, `client_id`, `statut`, `signataire`,
  // `telephone_source`, `signe_par` ou `empreinte`, ils n'atteignent pas la
  // base. Les seules donnees de confiance acceptees sont `signatureImage` (que la
  // RPC borne) et `mentionBonPourAccord` (que la RPC exige a `true`).
  let corps: Record<string, unknown> | null = null;
  try {
    const brut = (await request.json()) as unknown;
    if (brut && typeof brut === 'object' && !Array.isArray(brut)) {
      corps = brut as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }
  if (!corps) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }

  const code = corps.code;
  const image = corps.signatureImage;
  const mention = corps.mentionBonPourAccord === true;

  // --- 1. Forme : code OTP ------------------------------------------------------
  // Un code mal forme n'est meme pas condense : on evite un HMAC inutile et on
  // repond avec le refus uniforme.
  if (!estCodeOtpBienForme(code)) {
    return refusPublic();
  }

  // --- 2. Forme : image et mention ---------------------------------------------
  // Verifie ICI pour ne pas consommer un OTP valide sur une soumission qui sera
  // de toute facon rejetee. La RPC reverifie.
  if (
    typeof image !== 'string' ||
    image.length < TAILLE_MIN ||
    image.length > TAILLE_MAX ||
    !image.startsWith(PREFIXE_PNG)
  ) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });
  }
  if (!mention) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });
  }

  // --- 2 bis. Integrite de la preuve graphique ---------------------------------
  // Decode le PNG et recompte les pixels. ICI, et non dans la RPC, parce que
  // PostgreSQL n'a aucun decodeur d'image : ce controle ne peut pas exister en
  // SQL. Il est place AVANT toute lecture de l'OTP pour que le refus n consomme
  // rien — une soumission dont la preuve est vide ne doit pas couter une
  // tentative au signataire.
  //
  // Ce controle est un controle d'INTEGRITE, pas une preuve d'identite ni une
  // mesure anti-fraude : il etablit que la preuve n'est pas vide. Voir
  // `_encre-signature.ts` pour ce qu'il ne pretend pas faire.
  //
  // Le refus est le meme que ci-dessus — 400 « Signature invalide » — pour ne
  // rien ajouter d'observable : ni le statut, ni le message, ni le champ ne
  // distinguent une image blanche d'une image malformee.
  const encre = verifierEncreSignature(image);
  if (!encre.ok) {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 });
  }

  // --- 3. Chaine de confiance (PARTAGEE avec send-otp) --------------------------
  const verdict = await autoriserSignature(code_acces.trim(), corps.devisId);
  if (!verdict.ok) return verdict.reponse;
  const { devisId, entrepriseId } = verdict;

  try {
    // --- 4. Couche 1 : lecture de l'OTP courant, cloisonnee ---------------------
    // `order by created_at desc limit 1` : le PLUS RECENT, et lui seul. Un OTP
    // plus ancien est desormais invalide des qu'un nouveau est emis, ce qui
    // interdit deux codes valides simultanement. L'index
    // `devis_otp_devis_recent_idx (devis_id, created_at desc)` sert exactement
    // cette requete.
    //
    // `.eq("entreprise_id")` : meme double predicat que dans `_garde-signature`,
    // donc cette lecture ne peut pas reveler l'etat d'un OTP d'un autre tenant,
    // meme si le `devis_id` came de la base. Le trigger
    // `tg_devis_otp_coherence` reecrit de toute facon `entreprise_id` depuis
    // `devis`.
    //
    // Le code en clair n'est JAMAIS lu ni renvoye ici : la ligne ne contient
    // qu'un condensat.
    //
    // Dette résorbée : `devis_otp` est typé depuis la régénération des types
    // (base validée 58/58, migration 20261003) ; la directive `@ts-expect-error`
    // a été retirée. La requête reste sur UNE SEULE LIGNE : l'index
    // `devis_otp_devis_recent_idx` et le double prédicat `.eq` n'ont pas changé.
    const { data: lignesOtp, error: erreurLectureOtp } = await supabaseAdmin.from('devis_otp').select('id, code_hmac, expires_at, consumed_at, tentatives, verrouille_jusqua, ip').eq('devis_id', devisId).eq('entreprise_id', entrepriseId).order('created_at', { ascending: false }).limit(1);

    if (erreurLectureOtp) {
      console.error('verify-otp : lecture OTP impossible', erreurLectureOtp.message);
      return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
    }

    const ligne = (lignesOtp && lignesOtp.length > 0 ? lignesOtp[0] : null) as LigneOtp | null;

    // --- 5. Couche 1 : verdict applicatif ---------------------------------------
    // Comparaison a temps constant via `comparerCondensats` (interieur de
    // `evaluerTentativeOtp`). Aucune sortie de boucle sur une difference de
    // condensat, donc pas de canal temporel.
    const evaluation = evaluerTentativeOtp(ligne, code);

    // Court-circuit SEULEMENT quand la RPC n'ecrirait rien de toute facon.
    // C'est le point delicat : si l'echec increments `tentatives` (code
    // incorrect), on doit IMPERATIVEMENT aller jusqu'a la RPC, parce que
    // c'est elle, et elle seule, qui committe l'increment. Revenir ici
    // autoriserait un nombre illimite d'essais.
    if (!evaluation.autorise && !doitIncrementerTentatives(evaluation)) {
      // Aucun `Retry-After` : voir la note ANTI-ORACLE en tete de fichier.
      return refusPublic();
    }

    // --- 6. Condensat attendu ---------------------------------------------------
    // `OTP_HMAC_SECRET` n'est lu que dans cette fonction de lib/otp.ts. Ni le
    // secret, ni le code en clair ne franchissent la frontiere PostgreSQL.
    const codeHmacAttendu = condenserCodeOtp(code);

    // --- 7. Couche 2 : commit atomique ------------------------------------------
    // `ip` passee par `extraireIp` : une preuve d'audit ne doit pas pouvoir
    // contenir une chaine injectee par un en-tete client. `user_agent` est borne
    // a 512 caracteres par la RPC.
    const ip = extraireIp({
      'x-forwarded-for': request.headers.get('x-forwarded-for') ?? undefined,
      'cf-connecting-ip': request.headers.get('cf-connecting-ip') ?? undefined,
      'x-real-ip': request.headers.get('x-real-ip') ?? undefined,
      'true-client-ip': request.headers.get('true-client-ip') ?? undefined,
    });

    // La directive `@ts-expect-error` a été retirée : la RPC est typée depuis
    // la régénération des types (fonction présente en base, validée 58/58).
    const { data, error: erreurRpc } = await supabaseAdmin.rpc('signature_devis_valider_otp', {
      p_code_acces: code_acces.trim(),
      p_devis_id: devisId,
      p_otp_id: ligne ? ligne.id : null,
      p_code_hmac_attendu: codeHmacAttendu,
      p_signature_image: image,
      p_mention_acord: mention,
      p_ip: ip,
      p_user_agent: request.headers.get('user-agent'),
    });

    if (erreurRpc) {
      // La RPC ne leve QUE sur echec technique (contrainte, defaillance). Les
      // refus METIER sont des valeurs de retour, jamais des exceptions : c'est
      // ce qui permet a l'increment de `tentatives` d'etre committe. Donc une
      // erreur ici est reellement anormale, et son `message` peut contenir un
      // detail de schema : journalise, jamais renvoye.
      console.error('verify-otp : echec de la transaction de signature', erreurRpc.message);
      return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
    }

    const resultat = data as ResultatRpc | null;

    if (!resultat || resultat.ok !== true) {
      return reponsePourMotif(resultat?.motif);
    }

    // Succes. La reponse expose l'identifiant de la preuve, l'instant de la
    // signature et l'empreinte : ce sont des informations que le client vient
    // de produire, et dont il a besoin pour afficher « signe le » et verifier la
    // coherence du document. Aucun code, aucun condensat, aucun numero.
    return NextResponse.json({
      success: true,
      signatureId: resultat.signature_id ?? null,
      signedAt: resultat.signed_at ?? null,
      devisEmpreinteSha256: resultat.devis_empreinte_sha256 ?? null,
    });
  } catch (error) {
    // `error` peut contenir des details PostgREST : on journalise un type, pas
    // l'objet entier, pour ne pas risquer de laisser filer une valeur.
    console.error(
      'verify-otp : erreur inattendue',
      error instanceof Error ? error.message : 'inconnue'
    );
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
