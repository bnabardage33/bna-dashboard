const fs = require('fs');
const path = 'app/bureau/sav/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  '// setSaving moved down + Math.floor(1000 + Math.random() * 9000);',
  ''
);

fs.writeFileSync(path, content);
