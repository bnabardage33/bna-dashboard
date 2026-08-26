import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// GET /api/espace-client/[code_acces]
// Reproduit exactement la logique de fetch qui était côté client,
// mais tourne côté serveur avec la clé service_role : le navigateur
// ne reçoit que les données de CE client, jamais la clé ni les autres lignes.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;

  if (!code_acces) {
    return NextResponse.json({ error: 'Code d\'accès manquant' }, { status: 400 });
  }

  try {
    const { data: settings } = await supabaseAdmin
      .from('entreprise_settings')
      .select('*')
      .eq('id', 1)
      .single();

    const { data: chantiers } = await supabaseAdmin
      .from('chantiers')
      .select('*, clients(*)')
      .eq('code_acces', code_acces)
      .limit(1);

    if (!chantiers || chantiers.length === 0) {
      // Code invalide : 404 générique, pas de détail sur pourquoi
      return NextResponse.json({ error: 'Code d\'accès invalide' }, { status: 404 });
    }

    const chantier = chantiers[0];

    const { data: avancements } = await supabaseAdmin
      .from('avancements_chantier')
      .select('pourcentage')
      .eq('chantier_id', chantier.id)
      .order('date', { ascending: false })
      .limit(1);

    const avancement = avancements && avancements.length > 0 ? avancements[0].pourcentage : 45;

    // Devis visibles par le client (envoyé ou accepté)
    let devisList: any[] = [];
    const { data: devisParChantier } = await supabaseAdmin
      .from('devis')
      .select('*')
      .eq('chantier_id', chantier.id)
      .in('statut', ['envoye', 'accepte']);

    if (devisParChantier && devisParChantier.length > 0) {
      devisList = devisParChantier;
    } else if (chantier.client_id) {
      const { data: devisParClient } = await supabaseAdmin
        .from('devis')
        .select('*')
        .eq('client_id', chantier.client_id)
        .in('statut', ['envoye', 'accepte']);
      if (devisParClient) devisList = devisParClient;
    }

    // Factures
    let facturesList: any[] = [];
    const { data: facturesParChantier } = await supabaseAdmin
      .from('factures')
      .select('*')
      .eq('chantier_id', chantier.id)
      .in('statut', ['emise', 'envoyee', 'payee']);

    if (facturesParChantier && facturesParChantier.length > 0) {
      facturesList = facturesParChantier;
    } else if (chantier.client_id) {
      const { data: facturesParClient } = await supabaseAdmin
        .from('factures')
        .select('*')
        .eq('client_id', chantier.client_id)
        .in('statut', ['emise', 'envoyee', 'payee']);
      if (facturesParClient) facturesList = facturesParClient;
    }

    return NextResponse.json({
      entreprise: settings || null,
      chantier,
      client: chantier.clients || null,
      avancement,
      devis: devisList,
      factures: facturesList,
    });
  } catch (e) {
    console.error('Erreur API espace-client (GET)', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/espace-client/[code_acces]
// Remplace la mise à jour Supabase qui se faisait directement depuis le
// navigateur (submitSignature). On vérifie ici que le document appartient
// bien au chantier/client correspondant au code_acces avant de le modifier —
// ça empêche un client de signer/valider le devis d'un AUTRE client en
// devinant simplement un docId.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;

  try {
    const body = await request.json();
    const { docId, kind } = body as { docId: number | string; kind: 'devis' | 'facture' };

    if (!code_acces || !docId || !kind) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }
    if (kind !== 'devis' && kind !== 'facture') {
      return NextResponse.json({ error: 'Type de document invalide' }, { status: 400 });
    }

    const { data: chantiers } = await supabaseAdmin
      .from('chantiers')
      .select('id, client_id')
      .eq('code_acces', code_acces)
      .limit(1);

    if (!chantiers || chantiers.length === 0) {
      return NextResponse.json({ error: 'Code d\'accès invalide' }, { status: 404 });
    }
    const chantier = chantiers[0];

    const table = kind === 'devis' ? 'devis' : 'factures';

    // Vérifie que le document appartient bien à CE chantier ou à CE client
    const { data: doc } = await supabaseAdmin
      .from(table)
      .select('id, chantier_id, client_id')
      .eq('id', docId)
      .single();

    if (!doc || (doc.chantier_id !== chantier.id && doc.client_id !== chantier.client_id)) {
      return NextResponse.json({ error: 'Document introuvable pour ce client' }, { status: 403 });
    }

    const nouveauStatut = kind === 'devis' ? 'accepte' : 'payee';
    const { error } = await supabaseAdmin
      .from(table)
      .update({ statut: nouveauStatut })
      .eq('id', docId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Erreur API espace-client (POST)', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
