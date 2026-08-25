const fs = require('fs');
const path = 'app/bureau/sav/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add import
content = content.replace('import SignaturePad from "@/components/SignaturePad";', 'import SignaturePad from "@/components/SignaturePad";\nimport RapportSAVPDF from "@/components/RapportSAVPDF";\nimport { Printer, X } from "lucide-react";');

// Add states
content = content.replace('const [chantiers, setChantiers] = useState<any[]>([]);', 'const [chantiers, setChantiers] = useState<any[]>([]);\n  const [entreprise, setEntreprise] = useState<any>(null);\n  const [showPDF, setShowPDF] = useState(false);');

// Fetch entreprise
content = content.replace('// Load chantiers for the dropdown', 'supabase.from("entreprise_settings").select("*").eq("id", 1).single().then(({data}) => { if (data) setEntreprise(data) });\n    // Load chantiers for the dropdown');

// Add Voir PDF button in the Cloture Tuile
const clotureBtnOld = '<Save size={18} /> {ticket.statut === "cloture" ? "Ticket Clôturé" : "Clôturer le SAV"}';
const clotureBtnNew = '<Save size={18} /> {ticket.statut === "cloture" ? "Ticket Clôturé" : "Clôturer le SAV"}\n            </button>\n            {ticket.statut === "cloture" && (\n              <button onClick={() => setShowPDF(true)} className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center gap-2">\n                <FileCheck size={18} /> Voir le Rapport\n              </button>\n            )}';

content = content.replace(clotureBtnOld + '\n            </button>', clotureBtnNew);

// Add Modal at the end of the return
const modalHtml = `
      {showPDF && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 flex flex-col backdrop-blur-sm">
          <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-800 print:hidden">
            <h2 className="text-xl font-bold text-white">Rapport SAV</h2>
            <div className="flex gap-4">
              <button onClick={() => window.print()} className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-xl font-bold">
                <Printer size={18} /> Imprimer / PDF
              </button>
              <button onClick={() => setShowPDF(false)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950/50 flex justify-center print:bg-white print:p-0 print:block">
            <RapportSAVPDF ticket={ticket} entreprise={entreprise} />
          </div>
        </div>
      )}
    </div>
  );
`;

content = content.replace('    </div>\n  );\n}', modalHtml + '\n}');

fs.writeFileSync(path, content);
