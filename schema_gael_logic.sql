-- Structure de la Base de Données (Supabase)

-- 1. Equipe
CREATE TABLE equipe (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'ouvrier'))
);

-- 2. Catalogue Temps
CREATE TABLE catalogue_temps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom_tache TEXT NOT NULL,
  temps_unitaire_heure NUMERIC NOT NULL
);

-- Insertion de données de test pour le catalogue
INSERT INTO catalogue_temps (nom_tache, temps_unitaire_heure) VALUES
('Pose ossature', 0.5),
('Coupe HPL', 0.3),
('Habillage fenêtre', 1.5);

-- 3. Chantiers (Mise à jour ou création si on repart de zéro)
-- NB: Dans un projet existant, on ferait un ALTER TABLE chantiers
ALTER TABLE chantiers
ADD COLUMN IF NOT EXISTS surface_m2 NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS quantite_coupes_ml NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS singularites_nb INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS coef_perte_rendement NUMERIC DEFAULT 1.8;

-- 4. Pointages Globaux (Mode Confiance)
CREATE TABLE pointages_globaux (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  equipe_id UUID REFERENCES equipe(id) ON DELETE CASCADE,
  date_saisie DATE NOT NULL DEFAULT CURRENT_DATE,
  volume_heures_declare NUMERIC NOT NULL, -- Forfait global
  commentaire TEXT
);
