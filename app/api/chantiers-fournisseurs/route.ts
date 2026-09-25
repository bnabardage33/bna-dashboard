import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifierSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;

  try {
    // Le client SSR honore la RLS ; le claim et les filtres .eq() constituent
    // une seconde barrière explicite contre toute lecture cross-tenant.
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const entreprise_id =
      (user.app_metadata as { entreprise_id?: unknown } | null | undefined)
        ?.entreprise_id;
    if (typeof entreprise_id !== 'string' || !entreprise_id.trim()) {
      return NextResponse.json(
        { error: 'Contexte entreprise introuvable.' },
        { status: 403 }
      );
    }

    const [chantiersRes, fournisseursRes] = await Promise.all([
      supabase
        .from('chantiers')
        .select('id, client_id, entreprise_id, nom')
        .eq('entreprise_id', entreprise_id)
        .order('nom'),
      supabase
        .from('fournisseurs')
        .select('id, entreprise_id, nom')
        .eq('entreprise_id', entreprise_id)
        .order('nom'),
    ]);

    if (chantiersRes.error || fournisseursRes.error) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    const chantierRows = chantiersRes.data ?? [];
    const fournisseurRows = fournisseursRes.data ?? [];
    if (
      chantierRows.some((chantier) => chantier.entreprise_id !== entreprise_id) ||
      fournisseurRows.some((fournisseur) => fournisseur.entreprise_id !== entreprise_id)
    ) {
      return NextResponse.json({ error: 'Contexte entreprise invalide' }, { status: 500 });
    }

    const clientIds = [...new Set(
      chantierRows
        .map((chantier) => chantier.client_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )];
    const clientsParId = new Map<string, { nom: string | null; societe: string | null }>();

    if (clientIds.length > 0) {
      const clientsRes = await supabase
        .from('clients')
        .select('id, entreprise_id, nom, societe')
        .eq('entreprise_id', entreprise_id)
        .in('id', clientIds);

      if (clientsRes.error) {
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
      }

      for (const client of clientsRes.data ?? []) {
        if (client.entreprise_id !== entreprise_id) {
          return NextResponse.json({ error: 'Contexte entreprise invalide' }, { status: 500 });
        }
        clientsParId.set(client.id, {
          nom: client.nom,
          societe: client.societe,
        });
      }
    }

    return NextResponse.json({
      chantiers: chantierRows.map((chantier) => ({
        id: chantier.id,
        nom: chantier.nom,
        clients: chantier.client_id
          ? clientsParId.get(chantier.client_id) ?? null
          : null,
      })),
      fournisseurs: fournisseurRows.map((fournisseur) => ({
        id: fournisseur.id,
        nom: fournisseur.nom,
      })),
    });
  } catch (err) {
    console.error('Erreur chargement chantiers/fournisseurs:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
