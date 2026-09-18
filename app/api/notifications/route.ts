import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifierSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const lu = searchParams.get('lu') || 'all';

    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (lu === 'unread') {
      query = query.eq('lu', false);
    }

    const { data, error } = await query;

    if (error) throw error;
    return NextResponse.json({ notifications: data || [] });
  } catch (err) {
    console.error('Erreur notifications:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const { type, titre, message, destinataire_id, lien } = await req.json();

    const { data, error } = await supabase
      .from('notifications')
      .insert({ type, titre, message, destinataire_id, lien })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ notification: data });
  } catch (err) {
    console.error('Erreur création notification:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const { ids } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids manquants' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('notifications')
      .update({ lu: true })
      .in('id', ids)
      .select();

    if (error) throw error;
    return NextResponse.json({ updated: data });
  } catch (err) {
    console.error('Erreur marquer lu:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
