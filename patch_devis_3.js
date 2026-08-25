const fs = require('fs');
const path = 'app/bureau/sav/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'signature_client: null as string | null',
  'signature_client: null as string | null,\n    chantiers: null as any'
);

fs.writeFileSync(path, content);
