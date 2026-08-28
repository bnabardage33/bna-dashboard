-- Ajout des colonnes pour la météo dans pointages_globaux
ALTER TABLE pointages_globaux
ADD COLUMN IF NOT EXISTS meteo_relevee TEXT DEFAULT 'Clément',
ADD COLUMN IF NOT EXISTS coef_meteo NUMERIC DEFAULT 1.0;
