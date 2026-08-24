require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data: devis } = await supabase.from('devis').select('*').eq('chantier_id', '08241d99-57fa-461a-8f56-43611c344ec2');
  console.log("Devis:", JSON.stringify(devis, null, 2));
}
test();
