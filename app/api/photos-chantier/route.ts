// app/api/photos-chantier/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { TablesInsert } from '@/types/supabase';
import { verifierSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  const chantier_id = request.nextUrl.searchParams.get('chantier_id');

  // Sans chantier_id => retourne la liste de tous les chantiers (pour le select admin)
  if (!chantier_id) {
    const { data, error } = await supabaseAdmin
      .from('chantiers')
      .select('id, nom, adresse_chantier, statut')
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ chantiers: data });
  }

  const { data, error } = await supabaseAdmin
    .from('photos_chantier')
    .select('*')
    .eq('chantier_id', chantier_id)
    .order('date_ajout', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ photos: data });
}

export async function POST(request: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const chantier_id = formData.get('chantier_id') as string;
    const titre = (formData.get('titre') as string) || 'Photo chantier';

    if (!file || !chantier_id) {
      return NextResponse.json({ error: 'file et chantier_id sont requis' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${chantier_id}/${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: storageError } = await supabaseAdmin.storage
      .from('chantiers-photos')
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });

    const { data: urlData } = supabaseAdmin.storage
      .from('chantiers-photos')
      .getPublicUrl(fileName);

    const { data, error } = await supabaseAdmin
      .from('photos_chantier')
      .insert({ chantier_id, url_image: urlData.publicUrl, titre, date_ajout: new Date().toISOString() } as TablesInsert<"photos_chantier">)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ photo: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const { data: photo } = await supabaseAdmin.from('photos_chantier').select('url_image').eq('id', id).single();
  if (photo?.url_image) {
    const path = photo.url_image.split('/chantiers-photos/')[1];
    if (path) await supabaseAdmin.storage.from('chantiers-photos').remove([path]);
  }

  const { error } = await supabaseAdmin.from('photos_chantier').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
