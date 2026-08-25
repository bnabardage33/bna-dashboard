const fs = require('fs');
const path = 'app/bureau/sav/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace input to add capture="environment"
content = content.replace(
  '<input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, \'avant\')} disabled={uploading.avant} />',
  '<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileUpload(e, \'avant\')} disabled={uploading.avant} />'
);

content = content.replace(
  '<input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, \'apres\')} disabled={uploading.apres} />',
  '<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileUpload(e, \'apres\')} disabled={uploading.apres} />'
);

fs.writeFileSync(path, content);
