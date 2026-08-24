require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const CODE_ACCES = "65";
  
  // Étape 1: trouver le chantier par code_acces
  const { data: chantiers, error: e1 } = await supabase
    .from('chantiers')
    .select('*, clients(*)')
    .eq('code_acces', CODE_ACCES)
    .limit(1);
  
  console.log("Chantier trouvé:", JSON.stringify(chantiers, null, 2));
  console.log("Erreur chantier:", e1);
  
  if (!chantiers || chantiers.length === 0) return;
  const chantier = chantiers[0];
  
  // Étape 2: fetch devis par chantier_id + statut
  const { data: devisParChantier, error: e2 } = await supabase
    .from('devis')
    .select('*')
    .eq('chantier_id', chantier.id)
    .in('statut', ['envoye', 'accepte']);
  
  console.log("Devis trouvés:", JSON.stringify(devisParChantier, null, 2));
  console.log("Erreur devis:", e2);
}
test();
