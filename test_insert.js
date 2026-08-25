const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: chantiers } = await supabase.from('chantiers').select('id').limit(1);
  if (!chantiers || chantiers.length === 0) return console.log("No chantier found");
  
  const payload = {
    chantier_id: chantiers[0].id,
    statut: "ouvert",
    sous_garantie: true,
    type_sinistre: "Test",
    localisation: "Façade",
    description: "Test description",
    cause_probable: "Test cause",
    respect_dtu: true,
    diagnostic_dtu: "Test diag",
    materiel_prevu: [],
    date_intervention: null,
    temps_estime: "1h",
    intervenant: "Gaël",
    moyen_acces: "Echelle",
    photos: { client: null, avant: null, apres: null },
    signature_client: null
  };
  
  const { data, error } = await supabase.from('tickets_sav').insert(payload).select().single();
  console.log("Error:", error);
  console.log("Data:", data);
}
run();
