const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.rpc('run_sql', { sql: 'select relrowsecurity from pg_class where relname = \'tickets_sav\'' });
  console.log("Error:", error);
}
run();
