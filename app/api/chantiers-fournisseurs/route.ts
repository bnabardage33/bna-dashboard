import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
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
