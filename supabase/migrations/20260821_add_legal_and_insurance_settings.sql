-- Migration : Ajout des colonnes juridiques, assurance et médiation à entreprise_settings
ALTER TABLE entreprise_settings
ADD COLUMN IF NOT EXISTS assurance_nom TEXT,
ADD COLUMN IF NOT EXISTS assurance_numero_police TEXT,
ADD COLUMN IF NOT EXISTS assurance_zone_geo TEXT DEFAULT 'France métropolitaine et Corse',
ADD COLUMN IF NOT EXISTS mediateur_nom TEXT DEFAULT 'CM2C (Centre de la Médiation de la Consommation)',
ADD COLUMN IF NOT EXISTS mediateur_contact TEXT DEFAULT 'https://www.cm2c.net - 14 rue Saint Jean 75017 Paris';
