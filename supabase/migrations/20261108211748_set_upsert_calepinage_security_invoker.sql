-- Les tables du calepinage accordent déjà les opérations requises au rôle
-- authenticated et appliquent quatre policies RLS tenant-scopées chacune.
-- La RPC n'a donc aucune raison de contourner RLS avec SECURITY DEFINER.
ALTER FUNCTION public.upsert_calepinage_zone(UUID, UUID, JSONB, JSONB, JSONB)
  SECURITY INVOKER;
