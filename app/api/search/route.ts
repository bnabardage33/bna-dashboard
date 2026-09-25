import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifierSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    // Contexte multi-entreprise : le claim app_metadata.entreprise_id de la
    // session (même source que la RPC RLS entreprise_courante()) est la seule
    // autorité de scoping. Le client SSR honore la RLS (défense en profondeur)
    // et le filtre .eq() explicite ci-dessous verrouille chaque requête sur ce
    // tenant. Fail-closed : pas de claim => aucune donnée servie.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const entreprise_id =
      (user?.app_metadata as { entreprise_id?: string } | null | undefined)
        ?.entreprise_id ?? null;

    if (!entreprise_id) {
      return NextResponse.json(
        { error: 'Contexte entreprise introuvable.' },
        { status: 403 }
      );
    }

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
        .eq('entreprise_id', entreprise_id)
        .ilike('nom', searchTerm)
        .limit(limit),
      supabase
        .from('chantiers')
        .select('id, nom, adresse_chantier, statut')
        .eq('entreprise_id', entreprise_id)
        .ilike('nom', searchTerm)
        .limit(limit),
      supabase
        .from('devis')
        .select('id, numero, client_id, statut')
        .eq('entreprise_id', entreprise_id)
        .ilike('numero', searchTerm)
        .limit(limit),
      supabase
        .from('fournisseurs')
        .select('id, nom, email, tel')
        .eq('entreprise_id', entreprise_id)
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
