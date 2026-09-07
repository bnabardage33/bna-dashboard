-- Avancement Façades : JSONB des cases cochées + timestamp
ALTER TABLE public.avancements_chantier
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS commentaire text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- SAV : Visa du technicien
ALTER TABLE public.tickets_sav
  ADD COLUMN IF NOT EXISTS signature_technicien text;
