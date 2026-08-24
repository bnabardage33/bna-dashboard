require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data, error } = await supabase.from('notes_patron').insert({
    titre: '🔴 Alerte Client Espace Web',
    contenu: 'Test insertion depuis script',
    epingle: true
  }).select();
  
  console.log("Error:", error);
  console.log("Data:", data);
}
test();
