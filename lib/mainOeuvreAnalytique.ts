import { supabase } from "@/lib/supabase";
import { calculerTempsConsommeMeteo } from "@/lib/gaelLogic";

export type RentabilitePhase = {
  phase: string;
  nom_affichage: string;
  cout_reel: number;
  budget_vendu: number;
  ecart: number;
  performance_pct: number;
  performance_meteo_pct: number;
};

export async function analyserRentabiliteMainOeuvre(chantierId: string): Promise<RentabilitePhase[]> {
  // 1. Récupérer les pointages
  const { data: pointages } = await supabase
    .from("pointages")
    .select("heures, taux_horaire_charge, phase_travail")
    .eq("chantier_id", chantierId);

  const { data: pointagesGlobaux } = await supabase
    .from("pointages_globaux")
    .select("volume_heures_declare, coef_meteo, phase_travail")
    .eq("chantier_id", chantierId);

  // 2. Calculer le Coût Réel par phase
  const coutsReels: Record<string, number> = {
    ossature: 0,
    isolation: 0,
    bardage: 0,
    finitions: 0,
    general: 0
  };

  if (pointages) {
    for (const p of pointages) {
      const phase = p.phase_travail || "general";
      if (coutsReels[phase] !== undefined) {
        coutsReels[phase] += (p.heures || 0) * (p.taux_horaire_charge || 0);
      } else {
        coutsReels.general += (p.heures || 0) * (p.taux_horaire_charge || 0);
      }
    }
  }

  // 3. Récupérer le Devis signé
  const { data: devisList } = await supabase
    .from("devis")
    .select("lignes")
    .eq("chantier_id", chantierId)
    .in("statut", ["signe", "accepte"]);

  // 4. Analyser le Budget Vendu par phase
  const budgetVendu: Record<string, number> = {
    ossature: 0,
    isolation: 0,
    bardage: 0,
    finitions: 0,
    general: 0
  };

  if (devisList) {
    for (const d of devisList) {
      if (Array.isArray(d.lignes)) {
        for (const l of d.lignes) {
          const ligne = l as any;
          const designation = (ligne.designation || "").toLowerCase();
          const isMainOeuvre = ligne.type_cout === "main_oeuvre" || /pose|main\s*d['’]oeuvre/i.test(designation);
          
          if (isMainOeuvre) {
            const montantHT = (ligne.qte || 0) * (ligne.pu_ht || 0);
            
            if (/ossature|tasseau|liteau|chevron/i.test(designation)) {
              budgetVendu.ossature += montantHT;
            } else if (/isol|pare-pluie|laine/i.test(designation)) {
              budgetVendu.isolation += montantHT;
            } else if (/bardage|lame|composite|claire-voie/i.test(designation)) {
              budgetVendu.bardage += montantHT;
            } else if (/finition|profil|angle|encadrement|pliage/i.test(designation)) {
              budgetVendu.finitions += montantHT;
            } else {
              budgetVendu.general += montantHT;
            }
          }
        }
      }
    }
  }

  // 5. Synthèse
  const phases = [
    { key: "ossature", label: "🏗️ Ossature" },
    { key: "isolation", label: "🌡️ Isolation" },
    { key: "bardage", label: "🪵 Bardage" },
    { key: "finitions", label: "✨ Finitions" },
    { key: "general", label: "📁 Général" }
  ];

  return phases.map((p) => {
    const reel = coutsReels[p.key];
    const vendu = budgetVendu[p.key];
    const ecart = vendu - reel;
    const performance = vendu > 0 ? (ecart / vendu) * 100 : reel > 0 ? -100 : 0;

    // Calcul de la performance météo (Gaël Logic)
    let tempsBudgetPhase = vendu > 0 ? vendu / 28.50 : 0; // Taux moyen horaire
    
    // Récupérer les pointages globaux pour cette phase
    const pGlobauxPhase = (pointagesGlobaux || []).filter(pg => (pg.phase_travail || "general") === p.key);
    const heuresDeclareesTotal = pGlobauxPhase.reduce((acc, pg) => acc + (pg.volume_heures_declare || 0), 0);
    
    let tempsConsommeMeteo = 0;
    if (heuresDeclareesTotal > 0) {
      const formatted = pGlobauxPhase.map(pg => ({
        volumeHeures: pg.volume_heures_declare || 0,
        coefMeteo: pg.coef_meteo || 1.0
      }));
      tempsConsommeMeteo = calculerTempsConsommeMeteo(formatted);
    } else {
      // Fallback si pas de saisie d'équipe (pointages_globaux) mais seulement des pointages individuels
      const pIndivPhase = (pointages || []).filter(pt => (pt.phase_travail || "general") === p.key);
      const heuresIndivTotal = pIndivPhase.reduce((acc, pt) => acc + (pt.heures || 0), 0);
      tempsConsommeMeteo = heuresIndivTotal; // Par défaut pas de météo en individuel
    }

    const performanceMeteoPct = tempsBudgetPhase > 0 ? (1 - (tempsConsommeMeteo / tempsBudgetPhase)) * 100 : 0;

    return {
      phase: p.key,
      nom_affichage: p.label,
      cout_reel: reel,
      budget_vendu: vendu,
      ecart: ecart,
      performance_pct: performance,
      performance_meteo_pct: performanceMeteoPct
    };
  });
}
