import { FraisDeplacementInsert, FraisDeplacementStatut } from "./types";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; erreur: string };

export function validerFraisDeplacement(
  input: Partial<FraisDeplacementInsert>
): ValidationResult<FraisDeplacementInsert> {
  if (!input.entreprise_id) return { ok: false, erreur: "L'identifiant de l'entreprise est requis." };
  if (!input.chantier_id) return { ok: false, erreur: "L'identifiant du chantier est requis." };
  if (!input.date) return { ok: false, erreur: "La date est requise." };

  if (typeof input.distance_aller_km !== "number" || !Number.isFinite(input.distance_aller_km) || input.distance_aller_km < 0) {
    return { ok: false, erreur: "La distance aller doit être un nombre positif ou nul." };
  }

  if (typeof input.distance_retour_km !== "number" || !Number.isFinite(input.distance_retour_km) || input.distance_retour_km < 0) {
    return { ok: false, erreur: "La distance retour doit être un nombre positif ou nul." };
  }

  if (typeof input.tarif_km !== "number" || !Number.isFinite(input.tarif_km) || input.tarif_km <= 0) {
    return { ok: false, erreur: "Le tarif kilométrique doit être strictement supérieur à zéro." };
  }

  const validStatuts: FraisDeplacementStatut[] = ["prevu", "effectue", "annule"];
  if (input.statut && !validStatuts.includes(input.statut)) {
    return { ok: false, erreur: "Statut invalide." };
  }

  return {
    ok: true,
    data: {
      entreprise_id: input.entreprise_id,
      chantier_id: input.chantier_id,
      date: input.date,
      distance_aller_km: input.distance_aller_km,
      distance_retour_km: input.distance_retour_km,
      tarif_km: input.tarif_km,
      montant_ht: input.montant_ht ?? 0,
      taux_tva: input.taux_tva,
      montant_tva: input.montant_tva,
      montant_ttc: input.montant_ttc,
      motif: input.motif,
      statut: input.statut,
      commentaire: input.commentaire,
      devis_id: input.devis_id,
      adresse_depart: input.adresse_depart,
      adresse_arrivee: input.adresse_arrivee,
    }
  };
}
