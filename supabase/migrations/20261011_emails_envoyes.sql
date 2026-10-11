CREATE TABLE IF NOT EXISTS emails_envoyes (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id               uuid NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  type_document               text NOT NULL,
  document_id                 uuid,
  document_reference          text,
  destinataire_email          text NOT NULL,
  destinataire_nom            text,
  copies_cc                   text[],
  expediteur_email            text NOT NULL,
  expediteur_nom              text NOT NULL,
  objet                       text NOT NULL,
  corps_resume                text,
  has_attachment              boolean NOT NULL DEFAULT true,
  nom_piece_jointe            text,
  taille_piece_jointe_octets  integer,
  provider                    text NOT NULL,
  message_id_externe          text,
  statut                      text NOT NULL DEFAULT 'en_cours',
  erreur_detail               text,
  envoye_le                   timestamptz NOT NULL DEFAULT now(),
  delivre_le                  timestamptz,
  ouvert_le                   timestamptz,
  nb_ouvertures               integer NOT NULL DEFAULT 0,
  clique_le                   timestamptz,
  nb_clics                    integer NOT NULL DEFAULT 0,
  dernier_evenement           text,
  dernier_evenement_le        timestamptz,
  metadata_evenements         jsonb,
  envoye_par_user_id          uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emails_envoyes_document
  ON emails_envoyes (entreprise_id, document_id);

CREATE INDEX IF NOT EXISTS idx_emails_envoyes_date
  ON emails_envoyes (entreprise_id, envoye_le DESC);

CREATE INDEX IF NOT EXISTS idx_emails_envoyes_statut
  ON emails_envoyes (entreprise_id, statut);

CREATE INDEX IF NOT EXISTS idx_emails_envoyes_message_id
  ON emails_envoyes (message_id_externe);

ALTER TABLE emails_envoyes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emails_envoyes_ent_select ON emails_envoyes;
DROP POLICY IF EXISTS emails_envoyes_ent_insert ON emails_envoyes;
DROP POLICY IF EXISTS emails_envoyes_ent_update ON emails_envoyes;
DROP POLICY IF EXISTS emails_envoyes_ent_delete ON emails_envoyes;

CREATE POLICY emails_envoyes_ent_select ON emails_envoyes FOR SELECT
  USING (entreprise_id = public.entreprise_courante());

CREATE POLICY emails_envoyes_ent_insert ON emails_envoyes FOR INSERT
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY emails_envoyes_ent_update ON emails_envoyes FOR UPDATE
  USING (entreprise_id = public.entreprise_courante())
  WITH CHECK (entreprise_id = public.entreprise_courante());

CREATE POLICY emails_envoyes_ent_delete ON emails_envoyes FOR DELETE
  USING (entreprise_id = public.entreprise_courante());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE emails_envoyes TO authenticated, service_role;
