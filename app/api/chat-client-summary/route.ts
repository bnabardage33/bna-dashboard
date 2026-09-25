import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifierSession } from '@/lib/auth';
import { traiterConsolidation } from '@/lib/espace-chat-summary.server';

// Clôture demandée par le patron (interface de gestion) : exige une session.
// La même consolidation est exposée côté client via
// /api/espace-client/:code/chat-summary (validée par code d'accès).
//
// O3-B5 — ISOLATION MULTI-ENTREPRISE. Le tenant vient EXCLUSIVEMENT du claim
// `user.app_metadata.entreprise_id` : il est résolu AVANT `req.json()`, donc le
// corps de la requête ne peut structurellement pas l'influencer. Le champ
// `chantierId` reste Accepted comme simple clé de mémoire de conversation, mais
// il ne choisit plus l'entreprise : toutes les lectures et écritures du cœur sont
// filtrées par le tenant de la session, une `cle` étrangère ne charge plus rien.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    // Claim de session : même source que `entreprise_courante()` côté PostgREST
    // (app_metadata, non modifiable par l'utilisateur). Résolu avant toute
    // lecture du corps : un body piégé ne peut pas l'influencer.
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    const entrepriseId = (user?.app_metadata as { entreprise_id?: unknown } | null | undefined)
      ?.entreprise_id;

    if (typeof entrepriseId !== 'string' || !estUuid(entrepriseId)) {
      return NextResponse.json({ error: 'Contexte entreprise introuvable' }, { status: 403 });
    }

    const corps = (await req.json()) as Record<string, unknown> | null;
    if (!corps || typeof corps !== 'object') {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }
    return await traiterConsolidation(corps, entrepriseId);
  } catch (err) {
    console.error('Erreur IA Chat Client Summary:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
