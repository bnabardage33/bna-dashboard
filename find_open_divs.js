const fs = require('fs');
let txt = fs.readFileSync('components/ZoneCard.tsx', 'utf8');
const lines = txt.split('\n');

let stack = [];
for (let i = 210; i < 1040; i++) {
  const line = lines[i];
  
  // Very rough regex to find <div ...> and </div>
  // Let's just do it manually for simplicity
  let pos = 0;
  while (true) {
    let openIdx = line.indexOf('<div', pos);
    let closeIdx = line.indexOf('</div', pos);
    
    if (openIdx === -1 && closeIdx === -1) break;
    
    if (openIdx !== -1 && (closeIdx === -1 || openIdx < closeIdx)) {
      stack.push({line: i, pos: openIdx, text: line.trim()});
      pos = openIdx + 4;
    } else if (closeIdx !== -1) {
      stack.pop();
      pos = closeIdx + 5;
    }
  }
}
console.log(stack);
