require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  // Tous les devis
  const { data: devis } = await supabase.from('devis').select('id, numero, statut, chantier_id, client_id');
  console.log("Tous les devis:", JSON.stringify(devis, null, 2));
  
  // Tous les chantiers
  const { data: chantiers } = await supabase.from('chantiers').select('id, nom, code_acces, client_id');
  console.log("Tous les chantiers:", JSON.stringify(chantiers, null, 2));
}
test();
