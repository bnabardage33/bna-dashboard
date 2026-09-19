import { NextRequest, NextResponse } from 'next/server';
import { verifierSession } from '@/lib/auth';
import { traiterConsolidation } from '@/lib/espace-chat-summary.server';

// Clôture demandée par le patron (interface de gestion) : exige une session.
// La même consolidation est exposée côté client via
// /api/espace-client/:code/chat-summary (validée par code d'accès).
export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const corps = (await req.json()) as Record<string, unknown> | null;
    if (!corps || typeof corps !== 'object') {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }
    return await traiterConsolidation(corps);
  } catch (err) {
    console.error('Erreur IA Chat Client Summary:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}