export interface Entreprise {
  raison_sociale: string;
  siret: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  assurance: string | null;
  assurance_nom?: string | null;
  assurance_numero_police?: string | null;
  assurance_zone_geo?: string | null;
  mediateur_nom?: string | null;
  mediateur_contact?: string | null;
  iban: string | null;
  bic: string | null;
  mentions_legales: string | null;
  logo_url: string | null;
}