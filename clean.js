const fs = require('fs');
let code = fs.readFileSync('app/bureau/catalogue/page.tsx', 'utf8');

// The block:
/*
1014:                     })()}
1015:                   </fieldset>
1016:                   </>
1017:                 )}
1018:                   </>
1019:                 )}
1020: 
1021:                 </>
1022:                 )}
1023: 
1024: 
1025:                 {/* ── Sections matériau
*/

// Let's replace anything from </fieldset> to {/* ── Sections matériau
const regex = /<\/fieldset>[\s\S]*?\{\/\* ── Sections matériau/;
const replace = `</fieldset>\n                  </>\n                )}\n\n\n                {/* ── Sections matériau`;

code = code.replace(regex, replace);
fs.writeFileSync('app/bureau/catalogue/page.tsx', code);
console.log("Cleaned tags");
