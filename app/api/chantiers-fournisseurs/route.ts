import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  const [chantiersRes, fournisseursRes] = await Promise.all([
    supabaseAdmin
      .from('chantiers')
      .select('id, nom, clients(nom, societe)')
      .order('nom'),
    supabaseAdmin
      .from('fournisseurs')
      .select('id, nom')
      .order('nom'),
  ]);

  return NextResponse.json({
    chantiers: chantiersRes.data ?? [],
    fournisseurs: fournisseursRes.data ?? [],
  });
}
