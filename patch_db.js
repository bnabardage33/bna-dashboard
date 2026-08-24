const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: chantiers } = await supabase.from('chantiers').select('id, code_acces').is('code_acces', null);
  
  if (!chantiers || chantiers.length === 0) {
    console.log("Aucun chantier sans code_acces.");
    return;
  }
  
  for (const chantier of chantiers) {
    const code = "BNA-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    await supabase.from('chantiers').update({ code_acces: code }).eq('id', chantier.id);
    console.log(`Mis à jour chantier ${chantier.id} avec code: ${code}`);
  }
  console.log("Terminé.");
}
run();
