-- Force la vue à respecter les politiques RLS de l'utilisateur qui l'invoque,
-- supprimant ainsi le risque d'escalade de privilèges via SECURITY DEFINER.

ALTER VIEW public.rapports_intemperies_jours_arretes SET (security_invoker = true);
