export interface ChuteGeometrique {
  id: string;
  longueurBas: number; // Longueur côté rainure
  dxGauche: number; // Décalage horizontal coupe gauche (haut - bas)
  dxDroite: number; // Décalage horizontal coupe droite (haut - bas)
  origine: string;
}

export interface BesoinGeometrique {
  longueurBas: number;
  dxGauche: number;
  dxDroite: number;
}

export interface SimulationResult {
  lamesNeuves: number;
  morceauxReutilises: number;
  longueurChutesGenerees: number;
  longueurChutesReutilisees: number;
  chutesPerdues: number; // Somme des longueurs max des chutes inutilisées
  surfaceTheoriqueLames: number;
  lamesACommander: number;
}

/**
 * Calcule la géométrie du mur à une hauteur donnée Y.
 * Gère les murs droits, pignons symétriques et asymétriques.
 */
function calculerX(y: number, type: "facade" | "pignon", largeur: number, hMur: number, hFaite: number | null, peakX: number, cote: "gauche" | "droite"): number {
  if (type === "facade" || y <= hMur || !hFaite) {
    return cote === "gauche" ? 0 : largeur;
  }
  const hTriangle = hFaite - hMur;
  if (hTriangle <= 0) return cote === "gauche" ? 0 : largeur;
  
  const dy = y - hMur;
  if (dy >= hTriangle) return peakX;

  if (cote === "gauche") {
    // Interpole de 0 (y=hMur) à peakX (y=hFaite)
    return peakX * (dy / hTriangle);
  } else {
    // Interpole de largeur à peakX
    return largeur - (largeur - peakX) * (dy / hTriangle);
  }
}

/**
 * Tente d'adapter une chute à un besoin gauche. Retourne la perte de la coupe gauche.
 */
function calculerPerteRecoupeGauche(chute_dxGauche: number, besoin_dxGauche: number): number {
  // x0 = max(0, chute.dxGauche - besoin.dxGauche)
  return Math.max(0, chute_dxGauche - besoin_dxGauche);
}

/**
 * Tente d'adapter une lame/chute à un besoin droit. Retourne la perte de la coupe droite.
 */
function calculerPerteRecoupeDroite(chute_dxDroite: number, besoin_dxDroite: number): number {
  // loss = max(0, besoin.dxDroite - chute.dxDroite)
  return Math.max(0, besoin_dxDroite - chute_dxDroite);
}

export function simulerPoseComposite(
  type: "facade" | "pignon",
  largeur: number,
  hMur: number,
  hFaite: number | null,
  peakXOffset: number | null,
  longueurLameUtile: number, // L_m
  largeurUtile: number, // l_utile_m
  marge: number
): SimulationResult {
  const stockChutes: ChuteGeometrique[] = [];
  let lamesNeuves = 0;
  let morceauxReutilises = 0;
  let longueurChutesGenerees = 0;
  let longueurChutesReutilisees = 0;
  let chutesPerdues = 0;

  const peakX = peakXOffset ?? largeur / 2; // Par défaut pignon symétrique
  const hMax = (type === "pignon" && hFaite) ? hFaite : hMur;
  const totalRangees = Math.ceil(hMax / largeurUtile);

  let chuteIdCounter = 1;

  for (let i = 0; i < totalRangees; i++) {
    const yBas = i * largeurUtile;
    const yHaut = Math.min((i + 1) * largeurUtile, hMax);

    // Si la hauteur de la rangée est minuscule (arrondi), on skip
    if (yHaut - yBas < 0.001) continue;

    const xGBas = calculerX(yBas, type, largeur, hMur, hFaite, peakX, "gauche");
    const xGHaut = calculerX(yHaut, type, largeur, hMur, hFaite, peakX, "gauche");
    const xDBas = calculerX(yBas, type, largeur, hMur, hFaite, peakX, "droite");
    const xDHaut = calculerX(yHaut, type, largeur, hMur, hFaite, peakX, "droite");

    const dxGauche = xGHaut - xGBas;
    const dxDroite = xDHaut - xDBas;
    let wBas = xDBas - xGBas;

    if (wBas <= 0.001) continue;

    // Remplissage de la rangée de gauche à droite
    let xCourant = 0;
    
    while (xCourant < wBas - 0.001) {
      const isFirstPiece = xCourant === 0;
      const isLastPiece = wBas - xCourant <= longueurLameUtile; // Approximatif, on ajustera
      
      const besoinDxGauche = isFirstPiece ? dxGauche : 0;
      
      // On cherche la meilleure chute. Idéalement : perte gauche = 0. 
      // Sinon, la chute qui donne la lame la plus longue une fois recoupée.
      let bestChuteIdx = -1;
      let minPerteGauche = Infinity;
      
      for (let c = 0; c < stockChutes.length; c++) {
        const chute = stockChutes[c];
        const perteG = calculerPerteRecoupeGauche(chute.dxGauche, besoinDxGauche);
        const lgRestanteBas = chute.longueurBas - perteG;
        
        // La chute doit faire au moins 5cm une fois recoupée
        if (lgRestanteBas > 0.05) {
          if (perteG < minPerteGauche) {
            minPerteGauche = perteG;
            bestChuteIdx = c;
            if (perteG === 0) break; // Perfect match
          }
        }
      }

      let pieceU_dxGauche = besoinDxGauche;
      let pieceU_LgBas = 0;
      
      if (bestChuteIdx !== -1) {
        const chute = stockChutes.splice(bestChuteIdx, 1)[0];
        morceauxReutilises++;
        
        // Recoupe à gauche
        chutesPerdues += minPerteGauche; 
        let lgRestanteBas = chute.longueurBas - minPerteGauche;
        
        // Quelle est la cible pour le côté droit de cette pièce ?
        // Si elle peut finir la ligne :
        const besoinLgBasPourFinir = wBas - xCourant;
        
        if (lgRestanteBas >= besoinLgBasPourFinir) {
          // La chute finit la ligne !
          const besoinDxDroite = dxDroite;
          
          // La pièce fait besoinLgBasPourFinir. Le reste tombe en nouvelle chute.
          // Pour couper à droite, on regarde la perte de coupe. 
          // Mais ici c'est différent : on coupe DANS la lame. 
          // La scie fait un trait à dxDroite.
          pieceU_LgBas = besoinLgBasPourFinir;
          
          const resteBas = lgRestanteBas - pieceU_LgBas;
          
          // La nouvelle chute générée aura comme bord GAUCHE l'angle de la scie (dxDroite)
          // Et son bord DROITE reste chute.dxDroite originel.
          // Mais attention, il y a une perte géométrique si on coupe en plein milieu ? 
          // Non, la scie coupe exactement à l'angle, donc pas de perte d'équerrage, juste un scindement.
          // SAUF si le trait de scie "mange" la lame existante de l'autre côté. 
          // Perte de scindement : max(0, dxDroite - chute.dxDroite) ?
          // Non ! Si on coupe une lame très longue, on fait juste un trait.
          // Le reste a pour longueurBas = resteBas.
          // Mais si resteBas < max(0, dxDroite - chute.dxDroite), c'est qu'on a coupé dans la pointe.
          // Pour simplifier, si resteBas > 0.01, on ajoute.
          if (resteBas > 0.01) {
             stockChutes.push({
                id: `c_${chuteIdCounter++}`,
                longueurBas: resteBas,
                dxGauche: dxDroite,
                dxDroite: chute.dxDroite,
                origine: `Fin rangée ${i} (Chute ${chute.id})`
             });
             longueurChutesGenerees += resteBas;
          }
          longueurChutesReutilisees += pieceU_LgBas;
          xCourant += pieceU_LgBas;
        } else {
          // La chute ne finit pas la ligne. Elle doit être jointe avec un bord DROIT à dx=0.
          // Perte de recoupe à droite = max(0, 0 - chute.dxDroite) = max(0, -chute.dxDroite)
          const perteD = calculerPerteRecoupeDroite(chute.dxDroite, 0);
          lgRestanteBas -= perteD;
          chutesPerdues += perteD;
          
          pieceU_LgBas = lgRestanteBas;
          longueurChutesReutilisees += pieceU_LgBas;
          xCourant += pieceU_LgBas;
        }
      } else {
        // Nouvelle Lame
        lamesNeuves++;
        const LAME_MAX = longueurLameUtile;
        
        // Recoupe à gauche si besoin (perteG)
        const perteG = calculerPerteRecoupeGauche(0, besoinDxGauche); // Nouvelle lame = 0/0
        chutesPerdues += perteG;
        let lgRestanteBas = LAME_MAX - perteG;
        
        const besoinLgBasPourFinir = wBas - xCourant;
        
        if (lgRestanteBas >= besoinLgBasPourFinir) {
           // Finit la ligne
           pieceU_LgBas = besoinLgBasPourFinir;
           const resteBas = lgRestanteBas - pieceU_LgBas;
           
           if (resteBas > 0.01) {
             stockChutes.push({
                id: `c_${chuteIdCounter++}`,
                longueurBas: resteBas,
                dxGauche: dxDroite,
                dxDroite: 0,
                origine: `Fin rangée ${i} (Lame neuve)`
             });
             longueurChutesGenerees += resteBas;
           }
           xCourant += pieceU_LgBas;
        } else {
           // Ne finit pas la ligne. Coupe droite à droite (perteD = 0)
           pieceU_LgBas = lgRestanteBas;
           xCourant += pieceU_LgBas;
        }
      }
    }
  }

  // Fin du calcul, toutes les chutes restantes sont "perdues" (ou stock pour info, on les compte dans perdues)
  chutesPerdues += stockChutes.reduce((sum, c) => sum + c.longueurBas + Math.max(0, c.dxDroite - c.dxGauche), 0);

  const lamesACommander = Math.ceil(lamesNeuves * marge);
  
  return {
    lamesNeuves,
    morceauxReutilises,
    longueurChutesGenerees,
    longueurChutesReutilisees,
    chutesPerdues,
    surfaceTheoriqueLames: lamesACommander * (longueurLameUtile * largeurUtile),
    lamesACommander
  };
}
