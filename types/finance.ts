export interface ChantierFinance {
  id: string;
  nom: string;
  prix_vente_ht: number;
  avancement: number;
}

export interface ChantierBilan extends ChantierFinance {
  client_nom: string;
  avancement_reel: number;
  cout_materiaux: number;
  cout_main_oeuvre: number;
  cout_sous_traitance: number;
  cout_location: number;
  cout_frais: number;
  cout_direct_total: number;
  marge_brute: number;
  taux_marge_pct: number;
}

export type NatureDepense = 'materiaux' | 'quincaillerie' | 'sous_traitance' | 'location' | 'frais' | 'autre';

export interface DepenseFinance {
  id: string;
  chantier_id: string;
  nature: NatureDepense;
  montant_ht: number;
  date: string;
}

export interface PointageFinance {
  id: string;
  chantier_id: string;
  heures: number;
  taux_horaire_charge: number;
  date: string;
}

export type StatutFacture = 'brouillon' | 'emise' | 'payee' | 'annulee';
export type TauxTVA = 20 | 10 | 5.5 | 0;

export interface FactureFinance {
  id: string;
  chantier_id: string;
  lignes: { qte: number; pu_ht: number }[];
  tva_pct: number;
  statut: StatutFacture;
  date_emission: string;
  echeance: string;
}

export interface AchatFinance {
  id: string;
  chantier_id: string;
  montant_ht: number;
  statut: string;
  date_livraison_prevue: string | null;
  created_at: string;
}

export interface RentabiliteResult {
  cout_materiaux: number;
  cout_main_oeuvre: number;
  cout_sous_traitance: number;
  cout_location: number;
  cout_frais: number;
  cout_direct_total: number;
  marge_brute: number;
  taux_marge_pct: number;
  alerte_depassement: boolean;
  avancement_reel: number;
}

export interface KpiMensuelResult {
  ca_facture_ht: number;
  depenses_total: number;
  marge_brute: number;
  taux_marge_pct: number;
  reste_a_facturer: number;
}

export interface TvaResult {
  collectee_20: number;
  collectee_10: number;
  collectee_5_5: number;
  collectee_total: number;
  deductible_total: number;
  solde: number;
  type_solde: 'a_payer' | 'credit';
}

export interface ChargesSocialesResult {
  charges_patronales: number;
  cibtp: number;
  total_charges: number;
  taux_global_pct: number;
}

// --- Types pour jointures Supabase (select avec relations) ---

export interface ChantierRow {
  id: string;
  nom: string;
  client_nom: string;
  prix_vente_ht: number;
  statut: string;
}

export interface AvancementRow {
  id: string;
  chantier_id: string;
  date: string;
  pourcentage?: number;
  chantiers?: { nom: string };
}

export interface PointageRow extends PointageFinance {
  chantiers: { nom: string };
  profiles: { full_name: string };
}

export interface DepenseRow extends DepenseFinance {
  chantiers: { nom: string };
  fournisseurs: { nom: string };
}

export interface FactureWithClient extends FactureFinance {
  clients: { nom: string };
}

export interface CommandeFinance {
  id: string;
  fournisseur_id: string;
  chantier_id: string;
  reference_interne: string;
  objet: string;
  date_commande: string;
  date_livraison_prevue: string | null;
  lignes: any;
  montant_ht: number;
  statut: string;
  fournisseurs?: { nom: string };
}

export interface TicketSav {
  id: string;
  chantier_id: string;
  statut: string;
  sous_garantie: boolean;
  type_sinistre: string;
  localisation: string;
  description: string;
  cause_probable: string;
  respect_dtu: boolean;
  diagnostic_dtu: string;
  materiel_prevu: any[];
  date_intervention: string;
  temps_estime: string;
  intervenant: string;
  moyen_acces: string;
  photos: { client: string | null; avant: string | null; apres: string | null };
  signature_technicien: string | null;
  signature_client: string | null;
  chantiers?: { nom: string; client_id: string; adresse_chantier: string; clients?: { id: string; nom: string; societe: string } };
}

export interface EntrepriseSettings {
  id: number;
  raison_sociale: string;
  siret: string;
  telephone: string;
  email: string;
  adresse: string;
  code_postal: string;
  ville: string;
  iban: string;
  bic: string;
  assurance: string;
  assurance_nom: string;
  assurance_numero_police: string;
  assurance_zone_geo: string;
  mediateur_nom: string;
  mediateur_contact: string;
  mentions_legales: string;
  logo_url: string;
  seuil_ca: number;
  taux_cotisations: number;
}

export interface Equipe {
  id: string;
  nom: string;
  prenom: string;
  role: string;
}
