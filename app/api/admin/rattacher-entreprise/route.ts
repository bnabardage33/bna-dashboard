// app/api/admin/rattacher-entreprise/route.ts
// Phase 2A (P0 #30) — provisionnement du rattachement entreprise.
//
// POST { user_id, entreprise_id }
//   - session requise (verifierSession) ;
//   - appelant soumis au périmètre BNA : son claim app_metadata.entreprise_id
//     doit valoir BNA (seuls les comptes du dirigeant sont BNA aujourd'hui) ;
//   - refuse tout rattachement vers une autre entreprise que BNA ;
//   - délègue à la RPC rattacher_entreprise (service_role uniquement) qui pose
//     le claim JWT et renseigne profiles.entreprise_id si la fiche existe,
//     SANS jamais créer de fiche.
//
// Sécurité : aucun secret exposé ; la clé service_role reste côté serveur
// (lib/supabaseAdmin.ts) ; échec fermé (fail-closed) sur chaque contrôle.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const BNA = '11111111-1111-4111-8111-111111111111';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const { user_id, entreprise_id } = (body ?? {}) as {
    user_id?: unknown;
    entreprise_id?: unknown;
  };

  if (typeof user_id !== 'string' || !UUID_RE.test(user_id)) {
    return NextResponse.json({ error: 'user_id (uuid) requis' }, { status: 400 });
  }
  if (typeof entreprise_id !== 'string' || !UUID_RE.test(entreprise_id)) {
    return NextResponse.json({ error: 'entreprise_id (uuid) requis' }, { status: 400 });
  }

  try {
    // Périmètre BNA : l'appelant doit porter le claim BNA (mono-entreprise).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    if ((user.app_metadata as { entreprise_id?: string } | null)?.entreprise_id !== BNA) {
      return NextResponse.json(
        { error: 'Action réservée au périmètre BNA' },
        { status: 403 }
      );
    }

    // Seul le rattachement vers BNA est autorisé (pas de switch multi-entreprise).
    if (entreprise_id !== BNA) {
      return NextResponse.json(
        { error: 'Rattachement vers une autre entreprise refusé' },
        { status: 403 }
      );
    }

    const { error } = await supabaseAdmin.rpc('rattacher_entreprise', {
      p_user_id: user_id,
      p_entreprise_id: entreprise_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, user_id, entreprise_id });
  } catch (err) {
    console.error('rattacher-entreprise :', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}