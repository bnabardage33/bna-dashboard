import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;

  const { data: settings } = await supabaseAdmin
    .from('entreprise_settings').select('*').eq('id', 1).single();

  const { data: chantiers } = await supabaseAdmin
    .from('chantiers')
    .select('*, clients(*)')
    .eq('code_acces', code_acces)
    .limit(1);

  if (!chantiers || chantiers.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const chantier = chantiers[0];

  const { data: avancements } = await supabaseAdmin
    .from('avancements_chantier')
    .select('pourcentage')
    .eq('chantier_id', chantier.id)
    .order('date', { ascending: false })
    .limit(1);

  let devisList: any[] = [];
  const { data: devisParChantier } = await supabaseAdmin
    .from('devis').select('*')
    .eq('chantier_id', chantier.id)
    .in('statut', ['envoye', 'accepte']);
  if (devisParChantier && devisParChantier.length > 0) {
    devisList = devisParChantier;
  } else if (chantier.client_id) {
    const { data: devisParClient } = await supabaseAdmin
      .from('devis').select('*')
      .eq('client_id', chantier.client_id)
      .in('statut', ['envoye', 'accepte']);
    if (devisParClient) devisList = devisParClient;
  }

  let facturesList: any[] = [];
  const { data: facturesParChantier } = await supabaseAdmin
    .from('factures').select('*')
    .eq('chantier_id', chantier.id)
    .in('statut', ['emise', 'envoyee', 'payee']);
  if (facturesParChantier && facturesParChantier.length > 0) {
    facturesList = facturesParChantier;
  } else if (chantier.client_id) {
    const { data: facturesParClient } = await supabaseAdmin
      .from('factures').select('*')
      .eq('client_id', chantier.client_id)
      .in('statut', ['emise', 'envoyee', 'payee']);
    if (facturesParClient) facturesList = facturesParClient;
  }

  return NextResponse.json({
    entreprise: settings || null,
    chantier,
    client: chantier.clients,
    avancement: avancements && avancements.length > 0 ? avancements[0].pourcentage : 45,
    devis: devisList,
    factures: facturesList,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;
  const { docId, kind } = await req.json();

  const { data: chantiers } = await supabaseAdmin
    .from('chantiers')
    .select('id, client_id')
    .eq('code_acces', code_acces)
    .limit(1);

  if (!chantiers || chantiers.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const chantier = chantiers[0];
  const table = kind === 'devis' ? 'devis' : 'factures';
  const newStatut = kind === 'devis' ? 'accepte' : 'payee';

  // Vérifie que le document appartient bien à CE chantier avant de le modifier
  const { data: doc } = await supabaseAdmin
    .from(table).select('id, chantier_id, client_id')
    .eq('id', docId).single();

  if (!doc || (doc.chantier_id !== chantier.id && doc.client_id !== chantier.client_id)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await supabaseAdmin.from(table).update({ statut: newStatut }).eq('id', docId);
  return NextResponse.json({ ok: true });
}
