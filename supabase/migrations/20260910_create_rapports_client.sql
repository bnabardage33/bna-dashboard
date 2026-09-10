-- Migration : Rapports hebdo client

-- Snapshot figé à la génération : le contenu reflète l'état des tables
-- au moment de la création et ne change plus ensuite (sauf statut/envoyé).

CREATE TABLE IF NOT EXISTS rapports_client (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  semaine_label TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  contenu JSONB NOT NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon', -- 'brouillon' | 'envoye'
  envoye_le TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index lecture par chantier + période
CREATE INDEX IF NOT EXISTS idx_rapports_client_chantier ON rapports_client(chantier_id);
CREATE INDEX IF NOT EXISTS idx_rapports_client_periode ON rapports_client(chantier_id, date_debut, date_fin);

-- RLS : même policy que le reste du dashboard (uniquement connecté)
-- + GRANT complet aux rôles authenticated et service_role.
ALTER TABLE rapports_client ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acces_authentifie_uniquement" ON rapports_client
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

GRANT ALL ON TABLE rapports_client TO authenticated;
GRANT ALL ON TABLE rapports_client TO service_role;