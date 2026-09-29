export type FraisDeplacementStatut = "prevu" | "effectue" | "annule";

export interface FraisDeplacementRow {
  id: string;
  entreprise_id: string;
  chantier_id: string;
  date: string;
  adresse_depart: string | null;
  adresse_arrivee: string | null;
  distance_aller_km: number;
  distance_retour_km: number;
  tarif_km: number;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number | null;
  montant_ttc: number | null;
  motif: string;
  statut: FraisDeplacementStatut;
  commentaire: string | null;
  devis_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FraisDeplacementInsert {
  entreprise_id: string;
  chantier_id: string;
  date: string;
  adresse_depart?: string | null;
  adresse_arrivee?: string | null;
  distance_aller_km: number;
  distance_retour_km: number;
  tarif_km: number;
  montant_ht: number;
  taux_tva?: number;
  montant_tva?: number | null;
  montant_ttc?: number | null;
  motif?: string;
  statut?: FraisDeplacementStatut;
  commentaire?: string | null;
  devis_id?: string | null;
}
