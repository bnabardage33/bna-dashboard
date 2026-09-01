// app/api/documents-compta/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('documents_compta')
    .select('*')
    .order('date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = formData.get('type') as string;
    const date = (formData.get('date') as string) || new Date().toISOString().slice(0, 10);
    const note = (formData.get('note') as string) || '';
    const montantHt = parseFloat(formData.get('montant_ht') as string) || 0;
    const tauxTva = parseFloat(formData.get('taux_tva') as string) || 20;

    if (!file || !type) {
      return NextResponse.json({ error: 'file et type sont requis' }, { status: 400 });
    }
    if (type !== 'bl' && type !== 'ticket') {
      return NextResponse.json({ error: 'type doit etre "bl" ou "ticket"' }, { status: 400 });
    }

    const montantTva = montantHt * (tauxTva / 100);
    const montantTtc = montantHt + montantTva;

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `documents-compta/${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: storageError } = await supabaseAdmin.storage
      .from('tickets')
      .upload(fileName, buffer, { contentType: file.type, upsert: false });

    if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });

    const { data: urlData } = supabaseAdmin.storage
      .from('tickets')
      .getPublicUrl(fileName);

    const { data, error } = await supabaseAdmin
      .from('documents_compta')
      .insert({
        type,
        date,
        note,
        montant_ht: montantHt,
        taux_tva: tauxTva,
        montant_tva: montantTva,
        montant_ttc: montantTtc,
        url_image: urlData.publicUrl,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ document: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const { data: doc } = await supabaseAdmin.from('documents_compta').select('url_image').eq('id', id).single();
  if (doc?.url_image) {
    const path = doc.url_image.split('/tickets/')[1];
    if (path) await supabaseAdmin.storage.from('tickets').remove([path]);
  }

  const { error } = await supabaseAdmin.from('documents_compta').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
