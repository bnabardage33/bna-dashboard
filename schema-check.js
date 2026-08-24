require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data: chantiers } = await supabase.from('chantiers').select('*').limit(1);
  const { data: devis } = await supabase.from('devis').select('*').limit(1);
  
  console.log("Chantiers keys:", chantiers && chantiers.length ? Object.keys(chantiers[0]) : "No chantiers");
  console.log("Devis keys:", devis && devis.length ? Object.keys(devis[0]) : "No devis");
}
test();
