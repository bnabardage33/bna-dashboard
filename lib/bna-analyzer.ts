export interface ChantierHealthData {
  avancementPct: number;
  heuresConsommeesPct: number;
  joursSansPointage: number;
  joursSansAvancement: number;
  joursIntemperies: number;
  margeActuellePct: number;
  margePrevuePct: number;
}

export interface ChantierHealthAnalysis {
  statusColor: string;
  statusLabel: string;
  summary: string;
  reasons: string[];
}

export function analyzeChantierHealth(data: ChantierHealthData): ChantierHealthAnalysis {
  const {
    avancementPct,
    heuresConsommeesPct,
    joursSansPointage,
    joursSansAvancement,
    joursIntemperies,
    margeActuellePct,
    margePrevuePct,
  } = data;

  const delta = heuresConsommeesPct - avancementPct;
  const reasons: string[] = [];
  
  let statusColor = "";
  let statusLabel = "";
  let summary = "";

  // Helper context generation
  const buildReasons = () => {
    if (delta > 0) {
      reasons.push(`+${Math.round(delta)}% d'écart de main-d'œuvre par rapport à l'avancement`);
    } else if (delta < 0) {
      reasons.push(`${Math.abs(Math.round(delta))}% d'avance sur les heures prévues`);
    }
    
    if (joursIntemperies > 0) {
      reasons.push(`${joursIntemperies} jour(s) d'intempéries signalées`);
    }
    
    const margeDelta = margeActuellePct - margePrevuePct;
    if (margeDelta < 0) {
      reasons.push(`Marge prévisionnelle en baisse (${margePrevuePct}% -> ${margeActuellePct}%)`);
    } else if (margeDelta > 0) {
      reasons.push(`Marge prévisionnelle en hausse (${margePrevuePct}% -> ${margeActuellePct}%)`);
    }
  };

  // Rule 1: Incohérence (Pointages arrêtés mais l'avancement progresse)
  if (joursSansPointage > 3 && joursSansAvancement <= 3 && avancementPct > 0) {
    statusColor = "⚪";
    statusLabel = "DONNÉES INCOHÉRENTES";
    summary = "Avancement récent sans aucune heure saisie dans les pointages.";
    reasons.push(`Aucun pointage depuis ${joursSansPointage} jours`);
    reasons.push(`Dernier avancement signalé il y a ${joursSansAvancement} jour(s)`);
  } 
  // Rule 2: Critique
  else if (delta > 35 || heuresConsommeesPct > 100) {
    statusColor = "🔴";
    statusLabel = "CRITIQUE";
    summary = "Risque majeur de perte de rentabilité sur le chantier.";
    buildReasons();
    if (heuresConsommeesPct > 100) {
      reasons.push(`Budget d'heures dépassé (${heuresConsommeesPct}%)`);
    }
  } 
  // Rule 3: Anomalie
  else if (delta > 20 && delta <= 35) {
    statusColor = "🟠";
    statusLabel = "ANOMALIE";
    summary = "Consommation d'heures nettement supérieure à l'avancement.";
    buildReasons();
  } 
  // Rule 4: A surveiller
  else if (delta > 10 && delta <= 20) {
    statusColor = "🟡";
    statusLabel = "À SURVEILLER";
    summary = "Léger dérapage de la main d'œuvre.";
    buildReasons();
  } 
  // Rule 5: Normal
  else if (delta >= -15 && delta <= 10) {
    statusColor = "🟢";
    statusLabel = "NORMAL";
    summary = "Les heures et l'avancement évoluent de manière cohérente.";
    if (joursIntemperies > 0) {
      reasons.push(`${joursIntemperies} jour(s) d'intempéries signalées`);
    }
  } 
  // Rule 6: Situation Inhabituelle
  else if (delta < -15) {
    statusColor = "🔵";
    statusLabel = "SITUATION INHABITUELLE";
    summary = "La productivité est exceptionnellement bonne, ou des heures ont été oubliées.";
    buildReasons();
    if (joursSansPointage > 0) {
      reasons.push(`Vérifiez si des pointages n'ont pas été oubliés (${joursSansPointage} jours sans pointage).`);
    }
  }

  return {
    statusColor,
    statusLabel,
    summary,
    reasons
  };
}
