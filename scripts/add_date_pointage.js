const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('ERREUR: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis dans .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { error } = await supabase.rpc('execute_sql', {
    sql_string: "ALTER TABLE pointages_globaux ADD COLUMN IF NOT EXISTS date_pointage DATE DEFAULT CURRENT_DATE;"
  });
  if (error) console.error("RPC Error:", error);
  else console.log("✅ Colonne date_pointage ajoutée");
}
run();
