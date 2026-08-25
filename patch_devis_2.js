const fs = require('fs');
const path = 'app/bureau/sav/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Fix tickets_sav fetch to include chantiers
content = content.replace(
  'supabase.from("tickets_sav").select("*").eq("id", id).single()',
  'supabase.from("tickets_sav").select("*, chantiers(nom, client_id, adresse_chantier, clients(id, nom, societe))").eq("id", id).single()'
);

fs.writeFileSync(path, content);
