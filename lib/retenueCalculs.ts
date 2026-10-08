// lib/retenueCalculs.ts
//
// MOTEUR FINANCIER RETENUE DE GARANTIE (Loi n° 71-584 du 16 juillet 1971) & MULTI-TVA.
//
// Bibliothèque PURE (aucune dépendance Supabase ni React).
// Utilisable côté serveur (routes API / validation) et côté client (devis, factures, aperçu PDF).
//
// Invariants financiers garantis :
//  1. Plafond légal : retenue_garantie_pct <= 5.00 % (art. 1er Loi 71-584).
//  2. Ventilation Multi-TVA : calcul décomposé par assiette de taux τ (0 %, 5.5 %, 10 %, 20 %).
//  3. Immutabilité des centimes :
//     montant_retenue_ttc = somme(Retenue_TTC_τ)
//     montant_retenue_ht  = somme(Retenue_HT_τ)
//     net_a_payer_ttc     = total_ttc - montant_retenue_ttc
//  4. Aucune divergence d'arrondi : calcul sans arrondissement prématuré des multiplications intermédiaires.

import { normaliserTauxTva } from "@/lib/tauxTva";

/** Plafond légal BTP de la retenue de garantie (Loi n° 71-584). */
export const RETENUE_GARANTIE_MAX_PCT = 5.0;
export const RETENUE_GARANTIE_MIN_PCT = 0.0;

/** Ligne élémentaire de facturation soumise au calcul. */
export interface LigneFacturation {
  designation?: string;
  description?: string | null;
  qte: number | null | undefined;
  pu_ht: number | null | undefined;
  tva_pct?: number | null;
  unite?: string;
  a_chiffrer?: boolean;
}

/** Ventilation fiscale et retenue par tranche de TVA. */
export interface TrancheTva {
  taux_tva: number;
  base_ht: number;
  montant_tva: number;
  montant_ttc: number;
  retenue_ht: number;
  retenue_ttc: number;
  net_a_payer_ttc: number;
}

/** Résultat consolidé de facturation avec retenue de garantie. */
export interface ResultatCalculRetenue {
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  retenue_garantie_pct: number;
  montant_retenue_ht: number;
  montant_retenue_ttc: number;
  net_a_payer_ttc: number;
  tranches: TrancheTva[];
}

/** Options passées au calculateur. */
export interface OptionsCalculRetenue {
  lignes: LigneFacturation[];
  retenue_garantie_pct?: number | null;
  tva_defaut_pct?: number | null;
}

/**
 * Arrondi monétaire déterministe au centime le plus proche (half-up).
 * Résout les imprécisions d'arrondi des flottants IEEE-754 (ex: 1.005 -> 1.01).
 */
export function arrondirCentimes(montant: number): number {
  if (!Number.isFinite(montant)) return 0;
  return Math.round((montant + Number.EPSILON) * 100) / 100;
}

/**
 * Valide et normalise le taux de retenue de garantie (0.00 % à 5.00 %).
 * Lève une exception explicite si le taux dépasse le plafond légal de 5 %.
 */
export function validerTauxRetenue(taux: unknown): number {
  if (taux === null || taux === undefined || taux === "") {
    return 0;
  }
  const n = typeof taux === "number" ? taux : parseFloat(String(taux).replace(",", "."));
  if (!Number.isFinite(n)) {
    throw new TypeError(`Taux de retenue de garantie non numérique : ${String(taux)}`);
  }
  if (n < RETENUE_GARANTIE_MIN_PCT) {
    throw new RangeError(
      `Le taux de retenue de garantie ne peut être négatif (${n} %).`
    );
  }
  if (n > RETENUE_GARANTIE_MAX_PCT) {
    throw new RangeError(
      `Le taux de retenue de garantie (${n} %) dépasse le plafond légal de 5 % (Loi n° 71-584).`
    );
  }
  return arrondirCentimes(n);
}

/**
 * Calcule l'intégralité d'une facture/situation avec retenue de garantie et ventilation Multi-TVA.
 *
 * Formules V2.1 respectées pour chaque taux de TVA distinct τ :
 *   HT_τ = somme(qte × pu_ht)
 *   TVA_τ = ROUND(HT_τ × τ / 100, 2)
 *   TTC_τ = HT_τ + TVA_τ
 *   Retenue_TTC_τ = ROUND(TTC_τ × retenue_garantie_pct / 100, 2)
 *   Retenue_HT_τ = ROUND(HT_τ × retenue_garantie_pct / 100, 2)
 *
 * Consolidations :
 *   montant_retenue_ttc = somme(Retenue_TTC_τ)
 *   montant_retenue_ht  = somme(Retenue_HT_τ)
 *   net_a_payer_ttc     = total_ttc - montant_retenue_ttc
 */
export function calculerRetenueFacture(
  options: OptionsCalculRetenue
): ResultatCalculRetenue {
  const { lignes, retenue_garantie_pct, tva_defaut_pct } = options;

  // 1) Validation stricte du taux de retenue (0 % <= pct <= 5 %)
  const tauxRetenue = validerTauxRetenue(retenue_garantie_pct);

  // 2) Taux de TVA par défaut de la pièce
  const tvaDefaut = normaliserTauxTva(tva_defaut_pct ?? 20);

  // 3) Regroupement des lignes par tranche de TVA
  // Clé = taux de TVA normalisé, Valeur = cumul non-arrondi du montant HT
  const mapTranches = new Map<number, number>();

  if (Array.isArray(lignes)) {
    for (const ligne of lignes) {
      // Ignorer les lignes « à chiffrer » dont le prix est indéfini
      if (ligne.a_chiffrer) continue;

      const qte = Number(ligne.qte);
      const puHt = Number(ligne.pu_ht);

      // Ignorer les lignes sans quantité ou sans prix numérique valide
      if (!Number.isFinite(qte) || !Number.isFinite(puHt)) continue;

      // Détermination du taux de TVA de la ligne
      const tauxLigne =
        ligne.tva_pct !== undefined && ligne.tva_pct !== null
          ? normaliserTauxTva(ligne.tva_pct)
          : tvaDefaut;

      // Calcul HT brut de la ligne sans arrondi prématuré
      const ligneHt = qte * puHt;

      mapTranches.set(tauxLigne, (mapTranches.get(tauxLigne) ?? 0) + ligneHt);
    }
  }

  // 4) Cas particulier : aucune ligne chiffrable
  if (mapTranches.size === 0) {
    return {
      total_ht: 0,
      total_tva: 0,
      total_ttc: 0,
      retenue_garantie_pct: tauxRetenue,
      montant_retenue_ht: 0,
      montant_retenue_ttc: 0,
      net_a_payer_ttc: 0,
      tranches: [],
    };
  }

  // 5) Calcul par tranche ordonnée par taux croissant (0 %, 5.5 %, 10 %, 20 %)
  const tauxTries = Array.from(mapTranches.keys()).sort((a, b) => a - b);
  const tranches: TrancheTva[] = [];

  for (const taux of tauxTries) {
    const brutHt = mapTranches.get(taux) ?? 0;
    const baseHt = arrondirCentimes(brutHt);

    // Formules V2.1
    const montantTva = arrondirCentimes((baseHt * taux) / 100);
    const montantTtc = arrondirCentimes(baseHt + montantTva);
    const retenueHt = arrondirCentimes((baseHt * tauxRetenue) / 100);
    const retenueTtc = arrondirCentimes((montantTtc * tauxRetenue) / 100);
    const netAPayerTtc = arrondirCentimes(montantTtc - retenueTtc);

    tranches.push({
      taux_tva: taux,
      base_ht: baseHt,
      montant_tva: montantTva,
      montant_ttc: montantTtc,
      retenue_ht: retenueHt,
      retenue_ttc: retenueTtc,
      net_a_payer_ttc: netAPayerTtc,
    });
  }

  // 6) Consolidations exactes (Sommes des tranches)
  const totalHt = arrondirCentimes(
    tranches.reduce((sum, t) => sum + t.base_ht, 0)
  );
  const totalTva = arrondirCentimes(
    tranches.reduce((sum, t) => sum + t.montant_tva, 0)
  );
  const totalTtc = arrondirCentimes(
    tranches.reduce((sum, t) => sum + t.montant_ttc, 0)
  );
  const montantRetenueHt = arrondirCentimes(
    tranches.reduce((sum, t) => sum + t.retenue_ht, 0)
  );
  const montantRetenueTtc = arrondirCentimes(
    tranches.reduce((sum, t) => sum + t.retenue_ttc, 0)
  );
  const netAPayerTtc = arrondirCentimes(totalTtc - montantRetenueTtc);

  // Invariant de sécurité : aucun net négatif
  const netSecurise = Math.max(0, netAPayerTtc);

  return {
    total_ht: totalHt,
    total_tva: totalTva,
    total_ttc: totalTtc,
    retenue_garantie_pct: tauxRetenue,
    montant_retenue_ht: montantRetenueHt,
    montant_retenue_ttc: montantRetenueTtc,
    net_a_payer_ttc: netSecurise,
    tranches,
  };
}

/**
 * Calcule une situation d'avancement au prorata avec retenue de garantie.
 */
export function calculerSituationAvancement(
  lignes: LigneFacturation[],
  avancementPct: number,
  retenuePct: number = 5.0,
  tvaDefautPct: number = 10
): ResultatCalculRetenue {
  const pct = Math.max(0, Math.min(100, Number(avancementPct) || 0));
  const ratio = pct / 100;

  const lignesSituation: LigneFacturation[] = (lignes || []).map((l) => ({
    ...l,
    pu_ht: l.pu_ht != null ? Number(l.pu_ht) * ratio : null,
  }));

  return calculerRetenueFacture({
    lignes: lignesSituation,
    retenue_garantie_pct: retenuePct,
    tva_defaut_pct: tvaDefautPct,
  });
}
