const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await supabase.rpc('execute_sql', {
    sql_string: "ALTER TABLE pointages_globaux ADD COLUMN IF NOT EXISTS date_pointage DATE DEFAULT CURRENT_DATE;"
  });
  console.log("RPC Error:", error);
}
run();
