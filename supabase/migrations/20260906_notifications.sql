-- Migration : Système de notifications et recherche globale

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('devis', 'facture', 'sav', 'chat', 'chantier', 'rapport', 'general')),
  titre TEXT NOT NULL,
  message TEXT,
  destinataire_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  lien TEXT,
  lu BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_destinataire ON notifications(destinataire_id, lu);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

CREATE OR REPLACE FUNCTION fn_upsert_notification()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (type, titre, message, destinataire_id, lien)
  VALUES (NEW.type, NEW.titre, NEW.message, NEW.destinataire_id, NEW.lien);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
