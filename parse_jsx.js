const fs = require('fs');
let txt = fs.readFileSync('components/ZoneCard.tsx', 'utf8');
const lines = txt.split('\n');

// Find the function body
const start = lines.findIndex(l => l.includes('export default function ZoneCard'));
const end = lines.findIndex((l, i) => i > start && l.startsWith('}'));

let html = lines.slice(start, end+1).join('\n');
console.log(html.slice(html.length - 300));
