-- Table des clés d'accès biométriques (WebAuthn / Passkey) par utilisateur
CREATE TABLE IF NOT EXISTS public.user_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key_spki text NOT NULL,
  algorithm integer NOT NULL DEFAULT -7,
  counter bigint NOT NULL DEFAULT 0,
  device_name text NOT NULL DEFAULT 'Appareil biométrique',
  transports text[] DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON public.user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id ON public.user_passkeys(credential_id);

ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_passkeys_select_own" ON public.user_passkeys;
CREATE POLICY "user_passkeys_select_own"
  ON public.user_passkeys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_passkeys_delete_own" ON public.user_passkeys;
CREATE POLICY "user_passkeys_delete_own"
  ON public.user_passkeys
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
