import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() || '';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const searchTerm = `%${q}%`;

    const [clientsRes, chantiersRes, devisRes, fournisseursRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id, nom, societe, email, tel')
        .or(`nom.ilike.${searchTerm},societe.ilike.${searchTerm},email.ilike.${searchTerm},tel.ilike.${searchTerm}`)
        .limit(limit),
      supabase
        .from('chantiers')
        .select('id, nom, adresse_chantier, statut')
        .ilike('nom', searchTerm)
        .limit(limit),
      supabase
        .from('devis')
        .select('id, numero, client_id, statut')
        .ilike('numero', searchTerm)
        .limit(limit),
      supabase
        .from('fournisseurs')
        .select('id, nom, email, tel')
        .ilike('nom', searchTerm)
        .limit(limit),
    ]);

    const results = {
      clients: clientsRes.data || [],
      chantiers: chantiersRes.data || [],
      devis: devisRes.data || [],
      fournisseurs: fournisseursRes.data || [],
    };

    const total = Object.values(results).reduce((acc, curr) => acc + curr.length, 0);

    return NextResponse.json({ results, total });
  } catch (err) {
    console.error('Erreur recherche:', err);
    return NextResponse.json({ error: 'Erreur recherche' }, { status: 500 });
  }
}
