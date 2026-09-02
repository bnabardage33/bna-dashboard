const fs = require('fs');
let txt = fs.readFileSync('components/ZoneCard.tsx', 'utf8');
const lines = txt.split('\n');

let stack = [];
for (let i = 210; i <= 1341; i++) {
  let line = lines[i];
  for (let c = 0; c < line.length; c++) {
    if (line[c] === '{') stack.push({line: i});
    if (line[c] === '}') {
      let open = stack.pop();
      if (open && open.line <= 1040 && i >= 1335) {
        console.log(`Condition opened at ${open.line} and closed at ${i}`);
      }
    }
  }
}
