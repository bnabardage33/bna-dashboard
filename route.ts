import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ⚠️ Clé service_role : ne JAMAIS préfixer par NEXT_PUBLIC_,
// ce fichier tourne uniquement côté serveur (route API).
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;

  if (!code_acces) {
    return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
  }

  // Paramètres entreprise (logo, coordonnées, etc.)
  const { data: settings } = await supabaseAdmin
    .from('entreprise_settings')
    .select('*')
    .eq('id', 1)
    .single();

  // Chantier correspondant au code d'accès + client lié (jointure)
  const { data: chantiers, error: chantierError } = await supabaseAdmin
    .from('chantiers')
    .select('*, clients(*)')
    .eq('code_acces', code_acces);

  if (chantierError || !chantiers || chantiers.length === 0) {
    return NextResponse.json({ error: "Code d'accès invalide" }, { status: 404 });
  }

  const chantier = chantiers[0];

  // Avancement du chantier
  const { data: avancements } = await supabaseAdmin
    .from('avancements_chantier')
    .select('*')
    .eq('chantier_id', chantier.id);

  // Devis liés au chantier ET au client (dédupliqués par id)
  const { data: devisParChantier } = await supabaseAdmin
    .from('devis')
    .select('*')
    .eq('chantier_id', chantier.id);

  const { data: devisParClient } = await supabaseAdmin
    .from('devis')
    .select('*')
    .eq('client_id', chantier.client_id);

  const devisMap = new Map();
  [...(devisParChantier || []), ...(devisParClient || [])].forEach((d: any) => devisMap.set(d.id, d));
  const devis = Array.from(devisMap.values());

  // Factures liées au chantier ET au client (dédupliquées par id)
  const { data: facturesParChantier } = await supabaseAdmin
    .from('factures')
    .select('*')
    .eq('chantier_id', chantier.id);

  const { data: facturesParClient } = await supabaseAdmin
    .from('factures')
    .select('*')
    .eq('client_id', chantier.client_id);

  const facturesMap = new Map();
  [...(facturesParChantier || []), ...(facturesParClient || [])].forEach((f: any) => facturesMap.set(f.id, f));
  const factures = Array.from(facturesMap.values());

  // Moyenne des avancements si plusieurs entrées, sinon 0
  const avancementMoyen =
    avancements && avancements.length > 0
      ? Math.round(
          avancements.reduce((sum: number, a: any) => sum + (a.pourcentage || 0), 0) /
            avancements.length
        )
      : 0;

  // Le navigateur ne reçoit QUE ça — jamais la clé service_role,
  // jamais les données des autres clients.
  return NextResponse.json({
    entreprise: settings || null,
    chantier,
    client: chantier.clients || null,
    avancement: avancementMoyen,
    devis,
    factures,
  });
}
