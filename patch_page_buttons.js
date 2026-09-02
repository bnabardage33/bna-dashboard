const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

// We need to add state for modalDebitOuvert
if (!content.includes('const [modalGlobalDebitOuvert, setModalGlobalDebitOuvert] = useState(false);')) {
  content = content.replace(
    'const [isGlobalCalculated, setIsGlobalCalculated] = useState(false);',
    'const [isGlobalCalculated, setIsGlobalCalculated] = useState(false);\n  const [modalGlobalDebitOuvert, setModalGlobalDebitOuvert] = useState(false);'
  );
}

// Add the buttons and the modal
const targetRender = '{isGlobalCalculated && activeMurs.map((mur) => (';
const buttonsAndModal = `
          {isGlobalCalculated && (
            <div className="mb-6 flex gap-4">
              <button
                onClick={() => setModalGlobalDebitOuvert(true)}
                className="flex-1 rounded-xl bg-blue-600/20 border border-blue-500 text-blue-400 font-bold py-3 hover:bg-blue-600/40 transition"
              >
                📄 Ouvrir le Plan de Débit Global (Atelier)
              </button>
              <button
                onClick={() => {
                  if (calepinageGlobalResult) {
                    const lignes = [{
                      id: Date.now().toString(),
                      nom_produit: "Plaques HPL",
                      quantite: calepinageGlobalResult.nbPlaquesNecessaires,
                      unite: "pcs",
                      prix_unitaire: 0,
                      total: 0,
                      is_custom: true
                    }];
                    // Appel global
                    handleCreerCommande(lignes, "Chantier Global");
                  }
                }}
                className="flex-1 rounded-xl bg-red-600/20 border border-red-500 text-red-400 font-bold py-3 hover:bg-red-600/40 transition"
              >
                ➕ Créer une Commande Globale
              </button>
            </div>
          )}
          
          {modalGlobalDebitOuvert && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
              <div className="relative w-full max-w-5xl rounded-2xl bg-[#11141D] border border-white/10 shadow-2xl overflow-hidden flex flex-col h-[90vh]">
                <div className="flex items-center justify-between border-b border-white/10 p-4 bg-[#1A1D24]">
                  <h3 className="text-lg font-bold text-white">Plan de Débit Global (Toutes Façades)</h3>
                  <button onClick={() => setModalGlobalDebitOuvert(false)} className="text-gray-400 hover:text-white p-2">✕</button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">
                  <VisualiseurDebitPlaques calepinage={calepinageGlobalResult} titreZone="Projet Global" />
                </div>
              </div>
            </div>
          )}

          `;

if (!content.includes('setModalGlobalDebitOuvert(true)')) {
  content = content.replace(targetRender, buttonsAndModal + targetRender);
  fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
  console.log("Patched page.tsx with Atelier & Commande buttons");
}
