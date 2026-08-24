require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data } = await supabase.from('devis').select('id, numero, statut, objet, chantier_id').limit(10);
  console.log(JSON.stringify(data, null, 2));
}
test();
