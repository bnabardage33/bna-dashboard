import { NextRequest, NextResponse } from 'next/server';
import { resoudreChantierParCodeAcces } from '@/lib/espace-chantier-code';
import { traiterConsolidation } from '@/lib/espace-chat-summary.server';

// Clôture du chat déclenchée depuis l'Espace Client (préfixe /api/espace-client/*,
// donc public par middleware). Le chantier et le nom du client sont déduits du
// code d'accès côté serveur : le corps de la requête ne fait JAMAIS foi.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  try {
    const { code_acces } = await params;
    if (!code_acces || code_acces.trim() === '') {
      return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
    }

    const chantier = await resoudreChantierParCodeAcces(code_acces.trim());
    if (!chantier) {
      return NextResponse.json({ error: "Code d'accès invalide" }, { status: 403 });
    }

    const corps = (await req.json()) as Record<string, unknown> | null;
    if (!corps || typeof corps !== 'object') {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    return await traiterConsolidation({
      messages: corps.messages,
      sessionId: typeof corps.sessionId === 'string' ? corps.sessionId : null,
      chantierId: chantier.id,
      clientName: chantier.clientName || 'Client',
    });
  } catch (err) {
    console.error('Erreur IA Chat Client Summary (Espace Client scopé):', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}