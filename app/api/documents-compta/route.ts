// app/api/documents-compta/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  const { data, error } = await supabaseAdmin
    .from('documents_compta')
    .select('*, chantiers(id, nom), fournisseurs(id, nom)')
    .order('date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}

export async function POST(request: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileUrl = (formData.get('file_url') as string) || null;
    const type = formData.get('type') as string;
    const date = (formData.get('date') as string) || new Date().toISOString().slice(0, 10);
    const note = (formData.get('note') as string) || '';
    const montantHt = parseFloat(formData.get('montant_ht') as string) || 0;
    const tauxTva = parseFloat(formData.get('taux_tva') as string) || 20;
    const chantierId = (formData.get('chantier_id') as string) || null;
    const fournisseurId = (formData.get('fournisseur_id') as string) || null;
    const categorie = (formData.get('categorie') as string) || 'materiaux';

    const montantTva = montantHt * (tauxTva / 100);
    const montantTtc = montantHt + montantTva;

    let urlImage = fileUrl;

    if (!urlImage) {
      if (!file || !type) {
        return NextResponse.json({ error: 'file et type sont requis' }, { status: 400 });
      }
      if (type !== 'bl' && type !== 'ticket') {
        return NextResponse.json({ error: 'type doit etre "bl" ou "ticket"' }, { status: 400 });
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `documents-compta/${Date.now()}.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      const { error: storageError } = await supabaseAdmin.storage
        .from('tickets')
        .upload(fileName, buffer, { contentType: file.type, upsert: false });

      if (storageError) return NextResponse.json({ error: storageError.message }, { status: 500 });

      const { data: urlData } = supabaseAdmin.storage
        .from('tickets')
        .getPublicUrl(fileName);

      urlImage = urlData.publicUrl;
    }

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
        url_image: urlImage,
        chantier_id: chantierId,
        fournisseur_id: fournisseurId,
        categorie,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (chantierId && data) {
      const { error: depenseError } = await supabaseAdmin
        .from('depenses_chantier')
        .insert({
          chantier_id: chantierId,
          fournisseur_id: fournisseurId,
          date,
          nature: categorie,
          montant_ht: montantHt,
          montant_tva: montantTva,
          taux_tva: tauxTva,
          statut: 'engage',
          document_url: urlImage,
        });

      if (depenseError) {
        console.error('Erreur insertion depense_chantier:', depenseError.message);
      }
    }

    return NextResponse.json({ document: data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
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
