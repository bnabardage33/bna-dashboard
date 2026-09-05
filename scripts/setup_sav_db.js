const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('ERREUR: NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis dans .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log("🚀 Lancement de la configuration SAV...");
  try {
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
    } else {
      console.log("✅ Table tickets_sav vérifiée/créée.");
    }
  } catch (e) {
    console.error("❌ Erreur RPC run_sql :", e);
    console.log("Le RPC run_sql n'est pas disponible. Utilisez le SQL Editor Supabase.");
  }
}
run();
