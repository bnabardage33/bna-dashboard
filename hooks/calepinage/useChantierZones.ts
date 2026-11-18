import { useState, useCallback, useEffect } from "react";
import { getSupabase } from "@/lib/supabase";
import type { ChantierZoneResume } from "@/types/calepinage";

const messageErreur = (e: unknown, repli: string): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const errObj = e as { code?: string | null; message?: string | null };
    const code = errObj.code ? `${errObj.code} ` : "";
    const msg = errObj.message ?? repli;
    return `${code}${msg}`.trim();
  }
  return repli;
};

// Colonnes légères : on exclut `ouvertures` et `resultats_techniques` (JSONB
// potentiellement volumineux) pour garder les listes rapides sur mobile.
const COLONNES =
  "id, chantier_id, entreprise_id, nom, type, largeur, hauteur_mur, hauteur_faite, materiau, created_at";

/**
 * Liste les zones (`chantier_zones`) de l'entreprise de l'utilisateur connecté,
 * éventuellement limitées à un chantier. L'isolation est assurée par la RLS
 * (`entreprise_id = entreprise_courante()`), aucun filtre entreprise n'est
 * nécessaire côté client.
 */
export function useChantierZones(chantierId?: string) {
  const [zones, setZones] = useState<ChantierZoneResume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let requete = getSupabase()
        .from("chantier_zones")
        .select(COLONNES)
        .order("created_at", { ascending: false });
      if (chantierId) requete = requete.eq("chantier_id", chantierId);
      const { data, error: err } = await requete;
      if (err) {
        console.error("[useChantierZones] Erreur Supabase :", err.code, err.message, err.details);
        throw err;
      }
      setZones((data ?? []) as ChantierZoneResume[]);
    } catch (e: unknown) {
      console.error("[useChantierZones] Échec chargement :", e);
      setError(messageErreur(e, "Impossible de charger les zones"));
    } finally {
      setIsLoading(false);
    }
  }, [chantierId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { zones, isLoading, error, refetch };
}
