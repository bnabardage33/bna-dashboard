import {
  ChantierFinance,
  DepenseFinance,
  PointageFinance,
  FactureFinance,
  AchatFinance,
  RentabiliteResult,
  KpiMensuelResult,
  TvaResult,
  ChargesSocialesResult,
} from "@/types/finance";

/**
 * Calcule la rentabilité d'un chantier en croisant les dépenses directes et le pointage
 * des équipes par rapport au prix de vente HT.
 */
export function calculerRentabiliteChantier(
  chantier: ChantierFinance,
  depenses: DepenseFinance[],
  pointages: PointageFinance[],
  avancements?: any[]
): RentabiliteResult {
  try {
    let avancementReel = 50; // fallback
    if (avancements && avancements.length > 0) {
      // Filtrer pour ce chantier et trier du plus récent au plus ancien
      const avs = avancements
        .filter((a) => a.chantier_id === chantier.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      if (avs.length > 0) {
        avancementReel = avs[0].pourcentage;
      } else if (chantier.avancement) {
        avancementReel = chantier.avancement;
      }
    } else if (chantier.avancement) {
      avancementReel = chantier.avancement;
    }

    let cout_materiaux = 0;
    let cout_sous_traitance = 0;
    let cout_location = 0;
    let cout_frais = 0;

    depenses.forEach((dep) => {
      // Filtrer les dépenses liées à ce chantier
      if (dep.chantier_id !== chantier.id) return;
      
      switch (dep.nature) {
        case "materiaux":
        case "quincaillerie":
          cout_materiaux += dep.montant_ht;
          break;
        case "sous_traitance":
          cout_sous_traitance += dep.montant_ht;
          break;
        case "location":
          cout_location += dep.montant_ht;
          break;
        case "frais":
          cout_frais += dep.montant_ht;
          break;
        default:
          break;
      }
    });

    let cout_main_oeuvre = 0;
    pointages.forEach((ptg) => {
      if (ptg.chantier_id === chantier.id) {
        cout_main_oeuvre += ptg.heures * ptg.taux_horaire_charge;
      }
    });

    const cout_direct_total =
      cout_materiaux + cout_sous_traitance + cout_location + cout_frais + cout_main_oeuvre;

    const marge_brute = chantier.prix_vente_ht - cout_direct_total;
    const taux_marge_pct = chantier.prix_vente_ht > 0 ? (marge_brute / chantier.prix_vente_ht) * 100 : 0;

    // Alerte si : coût_direct > (prix_vente_ht × 0.75 × 0.85) ET avancement < 80
    const seuil_alerte = chantier.prix_vente_ht * 0.75 * 0.85;
    const alerte_depassement = cout_direct_total > seuil_alerte && avancementReel < 80;

    return {
      cout_materiaux,
      cout_main_oeuvre,
      cout_sous_traitance,
      cout_location,
      cout_frais,
      cout_direct_total,
      marge_brute,
      taux_marge_pct,
      alerte_depassement,
      avancement_reel: avancementReel,
    };
  } catch (error) {
    console.error("Erreur dans calculerRentabiliteChantier:", error);
    throw error;
  }
}

/**
 * Calcule les KPIs financiers pour un mois donné (ex: "2026-08")
 */
export function calculerKpiMensuel(
  factures: FactureFinance[],
  achats: AchatFinance[],
  depenses: DepenseFinance[],
  pointages: PointageFinance[],
  chantiers: ChantierFinance[],
  mois: string
): KpiMensuelResult {
  try {
    let ca_facture_ht = 0;
    
    // CA facturé HT = somme des factures du mois (statut ≠ annulée et ≠ brouillon si facturé)
    // "CA facturé HT = somme des factures du mois (statut ≠ annulée)"
    factures.forEach((f) => {
      if (f.statut !== "annulee" && f.date_emission.startsWith(mois)) {
        ca_facture_ht += f.montant_ht;
      }
    });

    let depenses_total = 0;
    
    achats.forEach((a) => {
      if (a.date.startsWith(mois)) {
        depenses_total += a.montant_ht;
      }
    });

    depenses.forEach((d) => {
      if (d.date.startsWith(mois)) {
        depenses_total += d.montant_ht;
      }
    });

    pointages.forEach((ptg) => {
      if (ptg.date.startsWith(mois)) {
        depenses_total += ptg.heures * ptg.taux_horaire_charge;
      }
    });

    const marge_brute = ca_facture_ht - depenses_total;
    const taux_marge_pct = ca_facture_ht > 0 ? (marge_brute / ca_facture_ht) * 100 : 0;

    // Reste à facturer = total prix vente chantiers - total factures émises (hors brouillon/annulée)
    const total_prix_vente = chantiers.reduce((sum, c) => sum + c.prix_vente_ht, 0);
    const total_facture_valide = factures.reduce((sum, f) => {
      if (f.statut === "emise" || f.statut === "payee") {
        return sum + f.montant_ht;
      }
      return sum;
    }, 0);
    
    const reste_a_facturer = Math.max(0, total_prix_vente - total_facture_valide);

    return {
      ca_facture_ht,
      depenses_total,
      marge_brute,
      taux_marge_pct,
      reste_a_facturer,
    };
  } catch (error) {
    console.error("Erreur dans calculerKpiMensuel:", error);
    throw error;
  }
}

/**
 * Calcule la TVA du mois
 */
export function calculerTva(
  factures: FactureFinance[],
  achats: AchatFinance[],
  mois: string
): TvaResult {
  try {
    let collectee_20 = 0;
    let collectee_10 = 0;
    let collectee_5_5 = 0;

    factures.forEach((f) => {
      if (f.statut !== "annulee" && f.date_emission.startsWith(mois)) {
        if (f.taux_tva === 20) collectee_20 += f.montant_tva;
        else if (f.taux_tva === 10) collectee_10 += f.montant_tva;
        else if (f.taux_tva === 5.5) collectee_5_5 += f.montant_tva;
      }
    });

    const collectee_total = collectee_20 + collectee_10 + collectee_5_5;

    let deductible_total = 0;
    achats.forEach((a) => {
      if (a.date.startsWith(mois)) {
        deductible_total += a.montant_tva;
      }
    });

    const solde_brut = collectee_total - deductible_total;
    const type_solde = solde_brut >= 0 ? "a_payer" : "credit";

    return {
      collectee_20,
      collectee_10,
      collectee_5_5,
      collectee_total,
      deductible_total,
      solde: Math.abs(solde_brut),
      type_solde,
    };
  } catch (error) {
    console.error("Erreur dans calculerTva:", error);
    throw error;
  }
}

/**
 * Estime les charges sociales BTP pour la main d'oeuvre
 */
export function estimerChargesSociales(masseSalarialeBrute: number): ChargesSocialesResult {
  try {
    const charges_patronales = masseSalarialeBrute * 0.45;
    const cibtp = masseSalarialeBrute * 0.02;
    const total_charges = charges_patronales + cibtp;
    const taux_global_pct = masseSalarialeBrute > 0 ? (total_charges / masseSalarialeBrute) * 100 : 0;

    return {
      charges_patronales,
      cibtp,
      total_charges,
      taux_global_pct,
    };
  } catch (error) {
    console.error("Erreur dans estimerChargesSociales:", error);
    throw error;
  }
}

/* =========================================================
   FORMATTERS DE DONNÉES
   ========================================================= */

export function fmtEuro(montant?: number | null): string {
  if (montant === null || montant === undefined || Number.isNaN(montant)) {
    return "0,00 €";
  }
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
    }).format(montant);
  } catch (error) {
    return "0,00 €";
  }
}

export function fmtPct(valeur?: number | null): string {
  if (valeur === null || valeur === undefined || Number.isNaN(valeur)) {
    return "0,0 %";
  }
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(valeur / 100);
  } catch (error) {
    return "0,0 %";
  }
}

export function fmtDate(dateIso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(dateIso));
  } catch (error) {
    return dateIso;
  }
}
