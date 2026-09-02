const fs = require('fs');
let txt = fs.readFileSync('components/ZoneCard.tsx', 'utf8');

let stack = [];
let lineNum = 1;
for (let i = 0; i < txt.length; i++) {
  if (txt[i] === '\n') lineNum++;
  if (txt[i] === '{') stack.push({char: '{', line: lineNum});
  if (txt[i] === '}') {
    if (stack.length === 0 || stack[stack.length - 1].char !== '{') {
      console.log('Unbalanced } at line ' + lineNum);
      break;
    }
    stack.pop();
  }
}
if (stack.length > 0) {
  console.log('Unbalanced { at line ' + stack[stack.length - 1].line);
} else {
  console.log('Braces are balanced!');
}
