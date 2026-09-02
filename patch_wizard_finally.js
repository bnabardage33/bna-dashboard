const fs = require('fs');
let p = 'components/ZoneCard.tsx';
let txt = fs.readFileSync(p, 'utf8');

// The file currently has:
//        </div>
//      )}
//      </>
//      )}
//    </div>
//  );
//}
// We want to change it to:
//      </>
//      )}
//        </div>
//      )}
//    </div>
//  );
//}

const bad = `        </div>
      )}
      </>
      )}
    </div>
  );
}

/* ==============================================================
   CHAMP NUMÉRIQUE`;

const good = `      </>
      )}
        </div>
      )}
    </div>
  );
}

/* ==============================================================
   CHAMP NUMÉRIQUE`;

if (txt.includes(bad)) {
  txt = txt.replace(bad, good);
  fs.writeFileSync(p, txt);
  console.log("Fixed the cross-boundary JSX error!!");
} else {
  console.log("Could not find the bad string");
}

