BEGIN;

-- GRANTs requis (tables créées par SQL Editor, pas d'héritage des privilèges par défaut)
-- Correspond au comportement du dépôt (chantier_terrasse) : accès restreint à authenticated + service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalogue_terrasse_lames TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalogue_terrasse_accessoires TO authenticated, service_role;

COMMIT;
