require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data, error } = await supabase
    .from('chantiers')
    .select('*, clients(*)').limit(1);
    
  console.log("Chantier:", JSON.stringify(data, null, 2));
}
test();
