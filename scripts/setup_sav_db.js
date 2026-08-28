const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("🚀 Lancement de la configuration SAV...");
  
  // 1. Create table
  const { error: tableError } = await supabase.rpc('run_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS tickets_sav (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
        statut TEXT DEFAULT 'ouvert',
        sous_garantie BOOLEAN DEFAULT true,
        type_sinistre TEXT,
        localisation TEXT,
        description TEXT,
        cause_probable TEXT,
        respect_dtu BOOLEAN DEFAULT true,
        diagnostic_dtu TEXT,
        materiel_prevu JSONB DEFAULT '[]'::jsonb,
        date_intervention TIMESTAMP WITH TIME ZONE,
        temps_estime TEXT,
        intervenant TEXT,
        moyen_acces TEXT,
        photos JSONB DEFAULT '{"client": null, "avant": null, "apres": null}'::jsonb,
        signature_client TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
      );
    `
  });
  
  if (tableError) {
    console.error("❌ Erreur SQL Table :", tableError);
    // If run_sql doesn't exist, we fallback to REST creating a dummy row or doing it differently.
  } else {
    console.log("✅ Table tickets_sav vérifiée/créée via RPC.");
  }

  // Fallback if rpc run_sql doesn't work: usually we can't run raw DDL from client without RPC.
  // I'll check if table exists by inserting and catching error.
}
run();
