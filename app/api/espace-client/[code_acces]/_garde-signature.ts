// app/api/espace-client/[code_acces]/_garde-signature.ts
//
// GARDE COMMUN DES ROUTES DE SIGNATURE DU PORTAIL CLIENT.
//
// Ce fichier n'est PAS une route : le préfixe `_` l'exclut du routage Next.js.
// Il factorise la chaîne de confiance que `send-otp` et `verify-otp` doivent
// applied IDENTIQUEMENT.
//
// POURQUOI UN FICHIER PARTAGÉ ET NON DEUX COPIES
// ----------------------------------------------
// Ces gardes SONT la sécurité du flux : sans elles, un code d'accès du tenant A
// pourrait faire signer un devis du tenant B. Dupliquer 90 lignes de logique de
// sécurité dans deux routes, c'est garantir qu'un correctif un jour ne sera
// appliqué qu'à une seule des deux — la dérive silencieuse typique. Ici les deux
// routes appellent le MÊME code : une régression de cloisonnement casserait les
// deux à la fois, et les tests le voient immédiatement.
//
// CHAÎNE DE CONFIANCE — AUCUNE VALEUR N'EST REÇUE DU NAVIGATEUR
// -------------------------------------------------------------
//   code_acces -> chantier.id -> devis.chantier_id   (appartenance)
//              -> chantier.entreprise_id              (tenant)
//                     -> chantier.client_id -> clients.tel_normalise
//
// DOUBLE VÉRIFICATION
// -------------------
// Deux prédicats, dans le MÊME `.eq()` : donc dans la MÊME requête, donc
// atomiques.
//   1. `devis.chantier_id = chantier.id`                  : le devis est bien
//      celui du code d'accès présenté ;
//   2. `devis.entreprise_id = chantier.entreprise_id`     : le devis et le
//      chantier sont de la même entreprise.
// La seconde est redondante au sens logique — un devis lié à un chantier l'est
// par construction — mais PAS au sens de la sécurité : c'est la garantie que le
// tenant ne peut pas diverger entre la lecture et l'écriture, et elle coûte une
// comparaison.
//
// AUCUN CHAMP DU BODY N'EST LU ICI SAUF `devisId`. Ni téléphone, ni
// `entreprise_id`, ni `client_id`, ni `statut` : même envoyés, ils sont ignorés.
// C'est une garantie structurelle, pas une convention.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreChantierParCodeAcces } from '@/lib/espace-chantier-code';

/**
 * Erreur volontairement IDENTIQUE pour « code inconnu » et « entreprise
 * invalide » : le `code_acces` est la seule preuve d'identité du portail, on ne
 * doit pas permettre d'en tester l'existence par le code de retour.
 */
export const ERREUR_CODE_ACCES = { error: "Code d'accès invalide" } as const;

/**
 * Un UUID mal formé est rejeté AVANT toute requête base. C'est aussi une garde
 * contre l'injection dans les filtres PostgREST : sans ce test, une chaîne
 * contenant `.` ou `,` peut altérer la sémantique du `.eq()`.
 */
export function estUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

// ---------------------------------------------------------------------------
// DETTE DE TYPAGE ASSUMÉE ET AUTO-SIGNALÉE
// ---------------------------------------------------------------------------
// La migration 20261003 n'est pas encore appliquée : `clients.tel_normalise` et
// `clients.tel_verifie` sont absents de types/supabase.ts.
//
// PAS de `@ts-expect-error` ici, et c'est délibéré : `GenericTable.Row` de
// postgrest-js vaut `Record<string, unknown>`, donc `.select()` accepte
// N'IMPORTE QUELLE chaîne de colonnes, y compris inexistante ; une directive
// serait signalée « inutilisée » par `tsc` (TS2578). Le typage échoue en
// réalité plus TARD, sur l'accès aux propriétés (TS2339), et c'est ce que le
// cast explicite neutralise au profit du type local.
type ClientAvecTelephone = {
  id: string;
  tel_normalise: string | null;
  tel_verifie: boolean;
};

export type VerdictGarde =
  | {
      ok: true;
      devisId: string;
      entrepriseId: string;
      clientId: string;
      telNormalise: string;
    }
  | { ok: false; reponse: NextResponse };

/**
 * Résout le devis présenté et ses garde-fous d'appartenance.
 *
 * Chaque refus porte un motif distinct DANS LE CODE (journalisable, testable),
 * tout en renvoyant au client des réponses qui ne divulguent pas l'appartenance
 * à d'autres dossiers.
 */
export async function autoriserSignature(
  codeAcces: string,
  devisIdDemande: unknown
): Promise<VerdictGarde> {
  // --- 0. Paramètres de forme -------------------------------------------------
  if (!estUuid(devisIdDemande)) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: 'Demande invalide' }, { status: 400 }),
    };
  }
  const devisId = devisIdDemande.trim();

  // --- 1. Le code d'accès authentifie le chantier ------------------------------
  // resoudreChantierParCodeAcces est fail-closed : sans entreprise valide il
  // renvoie null, indiscernable d'un code inconnu.
  const chantier = await resoudreChantierParCodeAcces(codeAcces);
  if (!chantier) {
    return { ok: false, reponse: NextResponse.json(ERREUR_CODE_ACCES, { status: 403 }) };
  }
  const entrepriseId = chantier.entrepriseId;
  if (!estUuid(entrepriseId)) {
    return { ok: false, reponse: NextResponse.json(ERREUR_CODE_ACCES, { status: 403 }) };
  }

  // --- 2. Le devis doit être celui de ce chantier ET de cette entreprise -------
  const { data: devis, error: erreurDevis } = await supabaseAdmin
    .from('devis')
    .select('id, chantier_id, entreprise_id, statut')
    .eq('id', devisId)
    .eq('chantier_id', chantier.id)
    .eq('entreprise_id', entrepriseId)
    .maybeSingle();

  if (erreurDevis) {
    // Message volontairement dépourvu de détail : une erreur PostgREST peut
    // contenir le nom de colonne ou la requête. Aucun secret ici, mais aucun
    // besoin d'en exposer la forme au client.
    return {
      ok: false,
      reponse: NextResponse.json({ error: 'Erreur interne' }, { status: 500 }),
    };
  }

  // 404 pour « pas trouvé », « autre chantier » et « autre entreprise » : ces
  // trois cas sont indiscernables, donc aucune fuite d'appartenance.
  if (!devis) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: 'Devis introuvable' }, { status: 404 }),
    };
  }

  // --- 3. Un devis déjà signé ne redemande pas d'écriture -----------------------
  // `devis_signatures` n'a volontairement pas de UNIQUE(devis_id) — l'historique
  // ne doit jamais être écrasé — c'est donc le STATUT qui porte cette garantie.
  // La RPC du §8 de la migration 20261003 en repose aussi, ce qui rend ce refus
  // impossible à contourner en appelant la RPC directement.
  if (devis.statut === 'signe' || devis.statut === 'accepte') {
    return {
      ok: false,
      reponse: NextResponse.json({ error: 'Ce devis est déjà signé' }, { status: 409 }),
    };
  }

  // --- 4. Le client est résolu côté serveur -----------------------------------
  // `null` si le chantier n'est rattaché à aucun client : cas réel (devis créés
  // sans client), pas une hypothèse.
  const clientId = chantier.clientId;
  if (!clientId) {
    return {
      ok: false,
      reponse: NextResponse.json(
        { error: 'Aucun client associé à ce chantier' },
        { status: 409 }
      ),
    };
  }

  // --- 5. Le téléphone doit être VÉRIFIÉ --------------------------------------
  // `tel_verifie` n'est jamais mis à true automatiquement : aucun numéro
  // existant n'a été marqué, et la procédure de vérification (phase 3 bis) doit
  // rester le seul chemin vers true. Ce refus est donc, en l'état, applicable à
  // tous les clients — blocage fonctionnel assumé, pas défaut du modèle.
  //
  // Le refus « téléphone non vérifié » est DISTINCT des autres réponses, et c'est
  // délibéré : c'est le client lui-même, propriétaire du dossier, à qui on parle.
  // Lui dire « votre numéro n'est pas vérifié » ne divulgue rien sur les autres
  // dossiers. En revanche le refus d'appartenance (devis d'un autre chantier)
  // reste un 404 indistinguable d'une inexistence.
  const { data: clientBrut, error: erreurClient } = await supabaseAdmin
    .from('clients')
    .select('id, tel_normalise, tel_verifie')
    .eq('id', clientId)
    .eq('entreprise_id', entrepriseId)
    .maybeSingle();
  const client = clientBrut as unknown as ClientAvecTelephone | null;

  if (erreurClient) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: 'Erreur interne' }, { status: 500 }),
    };
  }
  if (!client) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: 'Client introuvable' }, { status: 409 }),
    };
  }
  if (!client.tel_verifie) {
    return {
      ok: false,
      reponse: NextResponse.json(
        {
          error:
            "Votre numéro de téléphone n'est pas vérifié. Contactez votre artisan pour le vérifier avant de signer.",
        },
        { status: 409 }
      ),
    };
  }

  // `tel_normalise` est alimenté par la procédure de vérification. On exige un
  // numéro NON VIDE et à la bonne forme : un `tel_normalise` présent mais
  // inexploitable ne doit pas produire un SMS à une adresse vide, ni une preuve
  // attestant d'un envoi qui n'a pas eu lieu.
  const tel = typeof client.tel_normalise === 'string' ? client.tel_normalise.trim() : '';
  if (!tel || !/^\+[1-9][0-9]{7,14}$/.test(tel)) {
    // Pas d'erreur distincte : on ne confirme pas au client qu'un numéro existe
    // si on ne peut pas s'en servir.
    return {
      ok: false,
      reponse: NextResponse.json(
        { error: 'Aucun numéro de téléphone vérifié n’est disponible pour ce dossier' },
        { status: 409 }
      ),
    };
  }

  return { ok: true, devisId, entrepriseId, clientId, telNormalise: tel };
}
