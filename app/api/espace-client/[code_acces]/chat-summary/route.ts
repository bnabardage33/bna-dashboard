import { NextRequest, NextResponse } from 'next/server';
import { resoudreChantierParCodeAcces } from '@/lib/espace-chantier-code';
import { traiterConsolidation } from '@/lib/espace-chat-summary.server';

// Clôture du chat déclenchée depuis l'Espace Client (préfixe /api/espace-client/*,
// donc public par middleware). Le chantier et le nom du client sont déduits du
// code d'accès côté serveur : le corps de la requête ne fait JAMAIS foi.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string): boolean {
  return UUID_RE.test(value);
}

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

    // O3-B5 — ISOLATION MULTI-ENTREPRISE. Le `code_acces` authentifie le
    // chantier, donc son `entreprise_id` est la SEULE source de tenant : il est
    // dérivé du chantier résolu côté serveur, jamais lu dans le corps. On
    // revalide ici la forme UUID malgré la garde déjà appliquée dans
    // resoudreChantierParCodeAcces (défense en profondeur, et contrat explicite
    // de traiterConsolidation). Réponse identique au 403 ci-dessus : aucune
    // nouvelle fuite d'information.
    const entrepriseId = chantier.entrepriseId;
    if (typeof entrepriseId !== 'string' || !estUuid(entrepriseId)) {
      return NextResponse.json({ error: "Code d'accès invalide" }, { status: 403 });
    }

    const corps = (await req.json()) as Record<string, unknown> | null;
    if (!corps || typeof corps !== 'object') {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    return await traiterConsolidation(
      {
        messages: corps.messages,
        sessionId: typeof corps.sessionId === 'string' ? corps.sessionId : null,
        chantierId: chantier.id,
        clientName: chantier.clientName || 'Client',
      },
      entrepriseId
    );
  } catch (err) {
    console.error('Erreur IA Chat Client Summary (Espace Client scopé):', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}