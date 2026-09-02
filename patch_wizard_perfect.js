const fs = require('fs');
let p = 'components/ZoneCard.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(/globalCalepinage\?: any;/g, 'globalCalepinage?: any;\n  mode?: "saisie" | "resultat";');
txt = txt.replace(/globalCalepinage,\n}: \{/g, 'globalCalepinage,\n  mode = "resultat",\n}: {');

const synthRegex = /\{\/\* ====================================================== \*\/\}\s*\{\/\* RÉSULTATS MÉTRÉS \*\/\}/;
txt = txt.replace(synthRegex, '{mode === "resultat" && (\n      <>\n      $&');

const searchEnd = `        </div>
      )}
    </div>
  );
}

/* ==============================================================
   CHAMP NUMÉRIQUE`;

const replaceEnd = `        </div>
      )}
      </>
      )}
    </div>
  );
}

/* ==============================================================
   CHAMP NUMÉRIQUE`;

if (txt.includes(searchEnd)) {
    txt = txt.replace(searchEnd, replaceEnd);
    console.log("Replaced perfectly");
} else {
    console.log("Could not find the end block");
}

fs.writeFileSync(p, txt);
