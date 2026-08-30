const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { 
    sql_query: "ALTER TABLE catalogue_ouvrages ADD COLUMN IF NOT EXISTS dimensions_disponibles JSONB DEFAULT '[]'::jsonb;" 
  });
  console.log("RPC Error (expected if not installed):", error?.message);
  
  // Alternative if execute_sql is not available: we can't run DDL via REST API. 
  // Let's check if the user gave me a way. 
}
run();
