import { describe, it, expect } from "vitest";
import { simulerPoseComposite } from "../../lib/poseCompositeCalcul";

describe("poseCompositeCalcul", () => {
  it("Mur Droit 6x4m - lames 2.09 x 0.187", () => {
    // 4 / 0.187 = 21.39 -> 22 rangées
    // 6 / 2.09 = 2.87 -> 3 lames par rangée (en joints perdus)
    const res = simulerPoseComposite("facade", 6, 4, null, null, 2.09, 0.187, 1);
    
    // Total net sans récup = 22 * 3 = 66
    // Mais en joints perdus continus : 22 * 6 = 132 ml. 
    // 132 / 2.09 = 63.1 -> 64 lames
    expect(res.lamesNeuves).toBeGreaterThan(60);
    expect(res.lamesNeuves).toBeLessThanOrEqual(66);
    expect(res.lamesACommander).toBe(res.lamesNeuves);
  });

  it("Pignon Symétrique - Vérification réutilisation", () => {
    // Pignon seul. Largeur 6m, hauteur mur 0, hauteur faîte 2m.
    const res = simulerPoseComposite("pignon", 6, 0, 2, 3, 2.09, 0.187, 1);
    // Dans un pignon symétrique parfait, la pointe tombant à droite d'une lame s'insère à gauche de la ligne du dessus.
    // Le taux de réutilisation doit être élevé.
    expect(res.morceauxReutilises).toBeGreaterThan(0);
    // On vérifie qu'il y a bien des chutes générées puis réutilisées
    expect(res.longueurChutesReutilisees).toBeGreaterThan(0);
  });

  it("Pignon Asymétrique - Refus de réutilisation si angle incompatible", () => {
    // Pignon asymétrique. 
    // La pente gauche et droite sont radicalement différentes.
    // L'angle généré à droite ne sera pas compatible avec l'angle de gauche.
    // La perte d'équerrage lors des recoupes forcera une surconsommation de matière par rapport au symétrique.
    const resAsym = simulerPoseComposite("pignon", 6, 0, 2, 1, 2.09, 0.187, 1);
    const resSym = simulerPoseComposite("pignon", 6, 0, 2, 3, 2.09, 0.187, 1);
    
    // Le pignon asymétrique engendre structurellement plus de chutes perdues car les pointes droites (peu pentues)
    // ne rentrent pas dans les trous gauches (très pentus) sans être massivement recoupées.
    expect(resAsym.chutesPerdues).toBeGreaterThanOrEqual(resSym.chutesPerdues);
  });
});
