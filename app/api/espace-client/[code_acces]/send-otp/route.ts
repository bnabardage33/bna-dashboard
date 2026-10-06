// app/api/espace-client/[code_acces]/send-otp/route.ts
//
// Émet un code de signature à usage unique pour un devis du portail client.
//
// POURQUOI CETTE ROUTE EST NOUVELLE (et pas /api/devis/[id]/send-otp)
// -----------------------------------------------------------------------
// L'ancienne route vivait sous `/api/devis/[id]/`, qui est HORS de la liste
// blanche du middleware (lib/supabase/middleware.ts:20 —
// `PUBLIC_PREFIXES = ['/espace-client', '/api/espace-client']`). Or le client du
// portail n'a JAMAIS de session : il s'authentifie par `code_acces`. La route
// était donc redirigée vers `/login` avant d'atteindre son handler, et le flux
// de signature était inatteignable depuis le portail. Elargir la liste blanche
// aurait exposé TOUTES les routes `/api/devis/*`, dont `analyse` : ce n'est pas
// le bon remède. Le flux public est donc placé sous `/api/espace-client/`.
//
// ELLE A ÉTÉ SUPPRIMÉE DEPUIS. La cartographie des appelants n'a trouvé ni page,
// ni composant, ni construction d'URL dynamique, ni script : elle n'avait plus
// d'appelant. Trois défauts motivent ce retrait, tous Now fermés, tous documentés :
//
//   * elle prenait `phone` dans le CORPS de la requête — le numéro qui reçoit
//     l'avertissement était choisi par l'appelant, pas déduit du dossier ;
//   * elle écrivait l'OTP EN CLAIR dans `devis.otp_code` ;
//   * elle journalisait cet OTP en clair, sans garde d'environnement.
//
// `devis-id-tenant.test.ts` section B verifie désormais l'absence physique des
// deux fichiers, ce qui est une garantie plus forte que tout test d'isolation :
// un fichier absent ne produit aucune route.
//
// Les garde-fous d'appartenance et de téléphone sont dans
// `_garde-signature.ts`, PARTAGÉS avec `verify-otp`. Voir ce fichier pour le
// détail de la chaîne de confiance `code_acces -> chantier -> devis` et de la
// double vérification. Dupliquer ces gardes ici créerait deux implémentations
// d'une même barrière de sécurité, dont une seule serait corrigée un jour.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  autoriserSignature,
  ERREUR_CODE_ACCES,
} from '../_garde-signature';
import {
  composerMessageOtp,
  condenserCodeOtp,
  DUREE_VALIDITE_MS,
  extraireIp,
  genererCodeOtp,
  selectionnerFournisseurSms,
} from '@/lib/otp';

// Fenêtre de cooldown entre deux envois pour un même devis. Persistée en base
// (colonne `created_at` de `devis_otp`) et NON en mémoire : un `Map` module-level
// est vidé à chaque redéploiement et, sur une plateforme serverless, n'est pas
// partagé entre instances. Un cooldown en mémoire est donc soit absent en
// production, soit contournable en changeant d'instance. La base est la seule
// source qui survive aux deux.
const COOLDOWN_MS = 60 * 1000;

type LigneOtpRecente = {
  id: string;
  created_at: string;
};

/**
 * Insertion d'un OTP. Le code en clair n'apparaît pas dans ce type : il n'a
 * aucun champ possible. C'est une garantie de compilation, pas une discipline.
 */
type InsertionOtp = {
  devis_id: string;
  entreprise_id: string;
  code_hmac: string;
  expires_at: string;
  ip: string | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;
  if (!code_acces || code_acces.trim() === '') {
    return NextResponse.json(ERREUR_CODE_ACCES, { status: 403 });
  }

  // Le body ne doit contenir QUE `devisId`. On ne lit aucun autre champ, et on
  // ne cherchera pas `phone` : même s'il est envoyé, il sera ignoré. La
  // suppression du champ dans SignatureModal est un nettoyage, pas un
  // garde-fou — le garde-fou est l'absence de lecture ici.
  let devisIdDemande: unknown = null;
  try {
    const corps = (await request.json()) as Record<string, unknown> | null;
    if (corps && typeof corps === 'object') devisIdDemande = corps.devisId;
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }
  if (devisIdDemande === null) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }

  const verdict = await autoriserSignature(code_acces.trim(), devisIdDemande);
  if (!verdict.ok) return verdict.reponse;
  const { devisId, entrepriseId, telNormalise } = verdict;

  try {
    // --- 1. Cooldown PERSISTÉ ---------------------------------------------------
    // On lit le dernier envoi du devis. Un cooldown par DEVIS et non par IP :
    // le client légitime n'a pas à être bloqué par les essais d'autrui, et
    // l'attaquant ne peut pas augmenter son quota en changeant d'IP.
    const debutFenetre = new Date(Date.now() - COOLDOWN_MS).toISOString();
    const { data: envoisBruts, error: erreurCooldown } = await supabaseAdmin.from('devis_otp').select('id, created_at').eq('devis_id', devisId).gte('created_at', debutFenetre).limit(1);
    const envoisRecents = envoisBruts as unknown as LigneOtpRecente[] | null;

    if (erreurCooldown) {
      return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
    }
    if (envoisRecents && envoisRecents.length > 0) {
      // Fenêtre glissante calculée sur l'heure du serveur, pas sur un compteur
      // de requêtes : le message reste exact même après un redémarrage.
      const dernier = new Date(envoisRecents[0].created_at).getTime();
      const restant = Math.ceil((COOLDOWN_MS - (Date.now() - dernier)) / 1000);
      return NextResponse.json(
        { error: `Patientez encore ${Math.max(restant, 1)} s avant de redemander un code.` },
        { status: 429 }
      );
    }

    // --- 2. Génération et condensation ------------------------------------------
    // Le code en clair ne quitte pas cette fonction : il va au condensat (base)
    // et au message SMS. Il n'est ni journalisé, ni renvoyé, ni mis en base.
    const code = genererCodeOtp();
    const codeHmac = condenserCodeOtp(code);

    const maintenant = new Date();
    const expiresAt = new Date(maintenant.getTime() + DUREE_VALIDITE_MS).toISOString();

    // --- 3. Écriture du condensat ----------------------------------------------
    // `entreprise_id` est dérivé du chantier, jamais du body. Le trigger
    // `tg_devis_otp_coherence` le réécrit de toute façon depuis `devis` : les
    // deux gardes se recouvrent volontairement (défense en profondeur).
    //
    // `ip` est validée strictement par `extraireIp` : une preuve d'audit ne doit
    // pas pouvoir contenir une chaîne injectée par un en-tête client.
    const ip = extraireIp({
      'x-forwarded-for': request.headers.get('x-forwarded-for') ?? undefined,
      'cf-connecting-ip': request.headers.get('cf-connecting-ip') ?? undefined,
      'x-real-ip': request.headers.get('x-real-ip') ?? undefined,
      'true-client-ip': request.headers.get('true-client-ip') ?? undefined,
    });

    const insertion: InsertionOtp = {
      devis_id: devisId,
      entreprise_id: entrepriseId,
      code_hmac: codeHmac,
      expires_at: expiresAt,
      ip,
    };
    const { error: erreurInsert } = await supabaseAdmin.from('devis_otp').insert(insertion);

    if (erreurInsert) {
      return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
    }

    // --- 4. Envoi du SMS --------------------------------------------------------
    // L'insertion précède l'envoi : si le fournisseur échoue, aucun code valide
    // ne reste en base. L'ordre inverse laisserait le client détenir un code
    // valide, à jamais consommable, si l'insertion échouait après l'envoi.
    const fournisseur = selectionnerFournisseurSms();
    const envoi = await fournisseur.envoyer(telNormalise, composerMessageOtp(code, devisId.slice(0, 8)));

    if (!envoi.ok) {
      // Aucun secret dans le journal : ni le code, ni le condensat, ni le
      // numéro. On enregistre l'échec et son motif technique, qui est utile au
      // diagnostic et sans valeur pour un attaquant.
      console.error(
        `send-otp : envoi impossible (fournisseur=${fournisseur.nom}) motif=${envoi.raison}`
      );
      return NextResponse.json({ error: "L'envoi du code est momentanément indisponible" }, {
        status: 503,
      });
    }

    // Réponse volontairement MINIMALE : ni code, ni expiration, ni numéro. Elle
    // ne doit rien apprendre sur l'état d'un OTP existant.
    return NextResponse.json({ success: true, expiresInSecondes: DUREE_VALIDITE_MS / 1000 });
  } catch (error) {
    // `error` peut contenir des détails PostgREST : on journalise un type, pas
    // l'objet entier, pour ne pas risquer de laisser filer une valeur.
    console.error('send-otp : erreur inattendue', error instanceof Error ? error.message : 'inconnue');
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
