-- Ajout de la ventilation analytique par phase de chantier
ALTER TABLE public.pointages
ADD COLUMN phase_travail VARCHAR(50) DEFAULT 'general'
CHECK (phase_travail IN ('ossature', 'isolation', 'bardage', 'finitions', 'general'));

ALTER TABLE public.pointages_globaux
ADD COLUMN phase_travail VARCHAR(50) DEFAULT 'general'
CHECK (phase_travail IN ('ossature', 'isolation', 'bardage', 'finitions', 'general'));
