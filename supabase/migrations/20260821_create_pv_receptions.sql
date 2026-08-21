-- Migration : Création de la table pv_receptions (Procès-Verbaux de Réception de Chantier)

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
  reserves JSONB DEFAULT '[]'::jsonb, -- Array of { id: string, designation: string, localisation: string, date_limite: string, levee: boolean, date_levee?: string }
  observations TEXT,
  signature_client TEXT, -- Data URL (base64)
  signataire_client_nom TEXT,
  signature_entreprise TEXT, -- Data URL (base64)
  signataire_entreprise_nom TEXT DEFAULT 'BNA BARDAGE',
  checklist_repli JSONB DEFAULT '{"nettoyage": true, "dechets_evacues": true, "echafaudage_demonte": true, "fiches_techniques_remises": true}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_receptions_chantier ON pv_receptions(chantier_id);
CREATE INDEX IF NOT EXISTS idx_pv_receptions_client ON pv_receptions(client_id);
