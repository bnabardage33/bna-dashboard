-- Migration : Création et enrichissement de la table pv_receptions (Procès-Verbaux de Réception de Chantier)

CREATE TABLE IF NOT EXISTS pv_receptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  devis_id UUID REFERENCES devis(id) ON DELETE SET NULL,
  date_reception DATE NOT NULL DEFAULT CURRENT_DATE,
  statut TEXT NOT NULL DEFAULT 'sans_reserve', -- 'sans_reserve' | 'avec_reserves' | 'reserves_levees' | 'refuse'
  type_travaux TEXT DEFAULT 'Travaux de bardage et isolation extérieure (ITE)',
  adresse_chantier TEXT,
  materiaux_utilises TEXT,
  zones_metres JSONB DEFAULT '[]'::jsonb, -- Array de { id, nom, type, largeur, hauteur_mur, surfaceBrute, surfaceOuvertures, surfaceNette, materiau }
  photos JSONB DEFAULT '[]'::jsonb, -- Array de { id, url, titre }
  notice_entretien JSONB DEFAULT '{"remise_fiches_techniques": true, "remise_guide_entretien": true, "remise_attestation_decennale": true}'::jsonb,
  reserves JSONB DEFAULT '[]'::jsonb, -- Array de { id: string, designation: string, localisation: string, date_limite: string, levee: boolean, date_levee?: string }
  observations TEXT,
  signature_client TEXT, -- Data URL (base64)
  signataire_client_nom TEXT,
  signature_entreprise TEXT, -- Data URL (base64)
  signataire_entreprise_nom TEXT DEFAULT 'BNA BARDAGE',
  checklist_repli JSONB DEFAULT '{"nettoyage": true, "dechets_evacues": true, "echafaudage_demonte": true, "fiches_techniques_remises": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ajout des colonnes enrichies si la table existait déjà
ALTER TABLE pv_receptions ADD COLUMN IF NOT EXISTS zones_metres JSONB DEFAULT '[]'::jsonb;
ALTER TABLE pv_receptions ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE pv_receptions ADD COLUMN IF NOT EXISTS notice_entretien JSONB DEFAULT '{"remise_fiches_techniques": true, "remise_guide_entretien": true, "remise_attestation_decennale": true}'::jsonb;

-- Index pour des requêtes ultra-rapides
CREATE INDEX IF NOT EXISTS idx_pv_receptions_chantier ON pv_receptions(chantier_id);
CREATE INDEX IF NOT EXISTS idx_pv_receptions_client ON pv_receptions(client_id);
