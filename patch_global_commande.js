const fs = require('fs');
let content = fs.readFileSync('app/terrain/chantier/[id]/page.tsx', 'utf8');

const oldLogic = `                    const lignes = [{
                      id: Date.now().toString(),
                      nom_produit: "Plaques HPL",
                      quantite: calepinageGlobalResult.nbPlaquesNecessaires,
                      unite: "pcs",
                      prix_unitaire: 0,
                      total: 0,
                      is_custom: true,
                      designation: "Plaques HPL (Calepinage Global)"
                    }];`;

const newLogic = `                    const lignes: any[] = [];
                    // 1. Plaques
                    lignes.push({
                      id: Date.now().toString() + "-1",
                      nom_produit: "Plaques HPL",
                      designation: "Plaques HPL brutes " + calepinageGlobalResult.plaquesDebit?.[0]?.longueurMm + "x" + calepinageGlobalResult.plaquesDebit?.[0]?.largeurMm + " (Projet Global)",
                      quantite: calepinageGlobalResult.nbPlaquesNecessaires,
                      unite: "plaques",
                      prix_unitaire: 0,
                      total: 0,
                      is_custom: true,
                    });
                    
                    // 2. Ossature & Quincaillerie (agrégation de tous les murs)
                    let totalChevronsML = 0;
                    let totalChevronsPcs = 0;
                    let totalEquerresPorteuses = 0;
                    let totalEquerresGuides = 0;
                    let totalChevillesMurales = 0;
                    let totalVisEquerre = 0;
                    let totalEPDM = 0;
                    let totalVisParement = 0;
                    let modeleEquerre = "Isolco 3000 P2";
                    
                    Object.values(calepinageGlobalResult.resultatsMur).forEach((res: any) => {
                      if (res.pose) {
                        totalChevronsML += res.pose.lineaireChevronsM || 0;
                        totalChevronsPcs += res.pose.nbSegmentsChevrons || 0;
                        totalEquerresPorteuses += res.pose.nbEquerresPorteuses || 0;
                        totalEquerresGuides += res.pose.nbEquerresGuides || 0;
                        totalChevillesMurales += res.pose.nbChevillesMurales || 0;
                        totalVisEquerre += res.pose.nbVisChevronEquerre || 0;
                        totalEPDM += res.pose.lineaireBandeEPDMM || 0;
                        totalVisParement += res.pose.nbVisParement || 0;
                        if (res.pose.isolant?.modeleEquerreIsolco) modeleEquerre = res.pose.isolant.modeleEquerreIsolco;
                      }
                    });

                    if (totalChevronsPcs > 0) {
                      lignes.push({ id: Date.now().toString() + "-chev", nom_produit: "Chevrons", designation: "Chevrons/Montants (" + totalChevronsML.toFixed(1) + " ml)", quantite: totalChevronsPcs, unite: "pcs", prix_unitaire: 0, total: 0, is_custom: true });
                      lignes.push({ id: Date.now().toString() + "-eq", nom_produit: "Équerres", designation: "Équerres " + modeleEquerre + " (" + totalEquerresPorteuses + " porteuses, " + totalEquerresGuides + " guides)", quantite: totalEquerresPorteuses + totalEquerresGuides, unite: "pcs", prix_unitaire: 0, total: 0, is_custom: true });
                      lignes.push({ id: Date.now().toString() + "-chevilles", nom_produit: "Chevilles Spit", designation: "Chevilles maçonnerie Spit MP3-S Ø12×70mm", quantite: totalChevillesMurales, unite: "pcs", prix_unitaire: 0, total: 0, is_custom: true });
                      lignes.push({ id: Date.now().toString() + "-viseq", nom_produit: "Vis Inox", designation: "Vis Inox assemblage chevron/équerre", quantite: totalVisEquerre, unite: "pcs", prix_unitaire: 0, total: 0, is_custom: true });
                      lignes.push({ id: Date.now().toString() + "-epdm", nom_produit: "Bande EPDM", designation: "Bande de protection EPDM 80-100mm", quantite: Math.ceil(totalEPDM), unite: "ml", prix_unitaire: 0, total: 0, is_custom: true });
                      if (totalVisParement > 0) {
                        lignes.push({ id: Date.now().toString() + "-vispar", nom_produit: "Vis Parement", designation: "Vis/Clips fixation parement", quantite: totalVisParement, unite: "pcs", prix_unitaire: 0, total: 0, is_custom: true });
                      }
                    }`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync('app/terrain/chantier/[id]/page.tsx', content);
console.log("Patched Commande Globale in page.tsx");
