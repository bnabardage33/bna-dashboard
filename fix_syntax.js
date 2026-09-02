const fs = require('fs');
let p = 'components/ZoneCard.tsx';
let txt = fs.readFileSync(p, 'utf8');

const badPart = `        </div>
      )}

        </div>
      )}
      </>
      )}
    </div>
  );
}`;

const goodPart = `        </div>
      )}
      </>
      )}
    </div>
  );
}`;

if (txt.includes(badPart)) {
    txt = txt.replace(badPart, goodPart);
    console.log("Fixed syntax 1");
} else {
    // maybe it's slightly different
    txt = txt.replace(/        <\/div>\n      \)\}\n\n        <\/div>\n      \)\}\n      <\/>\n      \)\}\n    <\/div>\n  \);\n\}/, goodPart);
    console.log("Attempted fix 2");
}

fs.writeFileSync(p, txt);
