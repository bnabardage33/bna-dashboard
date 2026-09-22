-- =============================================================================
-- PART 5 — GRANTS SUR LES NOUVELLES TABLES (correctif probes B6/B7)
-- -----------------------------------------------------------------------------
-- Les tables créées dans la part1 (entreprises, entreprise_membres,
-- catalogue_ouvrages_prix) n'héritent PAS des privilèges anon/authenticated/
-- service_role que Supabase applique automatiquement aux tables créées via
-- l'interface Table Editor. Créées via le SQL Editor, elles n'ont reçu aucun
-- GRANT de base : un SELECT authenticated échoue avec
-- "permission denied for table" AVANT même l'évaluation des policies RLS.
--
-- Ce correctif rétablit les privilèges de base, identiques aux autres tables.
-- La sécurité reste portée par les policies RLS posées dans la part2 :
--   * entreprises          : policy SELECT (membre), AUCUNE policy INSERT/UPDATE
--                            -> la création reste impossible depuis le client ;
--   * entreprise_membres   : policy SELECT (user_id = auth.uid()), aucune écriture ;
--   * catalogue_ouvrages_prix : policies INSERT/UPDATE/DELETE scopées
--                            entreprise_courante() -> pas de forge possible.
-- =============================================================================

grant select, insert, update, delete on table public.entreprises
  to anon, authenticated, service_role;
grant select, insert, update, delete on table public.entreprise_membres
  to anon, authenticated, service_role;
grant select, insert, update, delete on table public.catalogue_ouvrages_prix
  to anon, authenticated, service_role;

-- Contrôles (à rejouer au besoin) :
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name in
--      ('entreprises','entreprise_membres','catalogue_ouvrages_prix')
--    order by table_name, grantee;