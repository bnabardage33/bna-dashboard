const fs = require('fs');

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/\\\`Bearer \\\$\\{process.env.GROQ_API_KEY\\}\\\`/g, '\`Bearer ${process.env.GROQ_API_KEY}\`');
  fs.writeFileSync(file, content);
}

fixFile('app/api/ia-devis/route.ts');
fixFile('app/api/ia-securite/route.ts');
