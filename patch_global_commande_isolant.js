const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

const target = `if (totalVisParement > 0) {
                        lignes.push({ id: Date.now().toString() + "-vispar", nom_produit: "Vis Parement", designation: "Vis/Clips fixation parement", quantite: totalVisParement, unite: "pcs", prix_unitaire: 0, total: 0, is_custom: true });
                      }`;

const addition = `
                      let totalIsolantPaquets = 0;
                      let totalIsolantChevilles = 0;
                      let isolantLabel = "";
                      Object.values(calepinageGlobalResult.resultatsMur).forEach((res: any) => {
                        if (res.pose?.isolant?.actif) {
                           totalIsolantPaquets += res.pose.isolant.nbPaquetsACommander || 0;
                           totalIsolantChevilles += res.pose.isolant.nbChevillesRosaces || 0;
                           isolantLabel = "Isolant " + res.pose.isolant.typeIsolant + " ép. " + res.pose.isolant.epaisseurMm + "mm";
                        }
                      });
                      if (totalIsolantPaquets > 0) {
                        lignes.push({ id: Date.now().toString() + "-iso", nom_produit: "Isolant", designation: isolantLabel, quantite: totalIsolantPaquets, unite: "paquets", prix_unitaire: 0, total: 0, is_custom: true });
                        lignes.push({ id: Date.now().toString() + "-isochev", nom_produit: "Chevilles Isolant", designation: "Chevilles rosaces à frapper", quantite: totalIsolantChevilles, unite: "pcs", prix_unitaire: 0, total: 0, is_custom: true });
                      }
`;

if (!content.includes('totalIsolantPaquets')) {
  content = content.replace(target, target + addition);
  fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
  console.log("Patched page.tsx for Isolant command lines");
}
