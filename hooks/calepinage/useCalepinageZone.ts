import { useState, useCallback, useEffect, useRef } from "react";
import { getSupabase } from "@/lib/supabase";
import type {
  CalepinageCalculerResponse,
  ChantierZone,
  Module,
  ModuleGroup,
  Opening,
  Percage,
} from "@/types/calepinage";

const messageErreur = (e: unknown, repli: string): string =>
  e instanceof Error ? e.message : repli;


export type OuvertureSaisie = Omit<Opening, "id" | "zone_id" | "entreprise_id" | "created_at">;

/**
 * Données et actions du calepinage d'UNE zone :
 *  - lecture de la zone (`chantier_zones`), de ses ouvertures positionnées
 *    (`chantier_zones_ouvertures`), de ses modules, groupes et perçages ;
 *  - CRUD des ouvertures ;
 *  - déclenchement du calcul côté serveur (POST /api/calepinage/calculer).
 *
 * Les actions d'écriture et `calculate` LÈVENT une `Error` en cas d'échec (message
 * lisible) pour que l'appelant affiche un toast ; `error` ne concerne que le
 * chargement initial.
 */
export function useCalepinageZone(zoneId: string) {
  const [zone, setZone] = useState<ChantierZone | null>(null);
  const [ouvertures, setOuvertures] = useState<Opening[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [groups, setGroups] = useState<ModuleGroup[]>([]);
  const [percages, setPercages] = useState<Percage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ignore les réponses d'une requête périmée (changement de zone / démontage).
  const requeteRef = useRef(0);

  const chargerResultats = useCallback(async () => {
    const sb = getSupabase();
    const [m, g, p] = await Promise.all([
      sb.from("chantier_zones_modules").select("*").eq("zone_id", zoneId),
      sb.from("chantier_zones_module_groups").select("*").eq("zone_id", zoneId).order("group_number"),
      sb.from("chantier_zones_percages").select("*").eq("zone_id", zoneId),
    ]);
    if (m.error) throw m.error;
    if (g.error) throw g.error;
    if (p.error) throw p.error;
    return {
      modules: (m.data ?? []) as Module[],
      groups: (g.data ?? []) as ModuleGroup[],
      percages: (p.data ?? []) as Percage[],
    };
  }, [zoneId]);

  const refetch = useCallback(async () => {
    const id = ++requeteRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const sb = getSupabase();
      const [z, o, resultats] = await Promise.all([
        sb.from("chantier_zones").select("*").eq("id", zoneId).single(),
        sb
          .from("chantier_zones_ouvertures")
          .select("*")
          .eq("zone_id", zoneId)
          .order("created_at", { ascending: true }),
        chargerResultats(),
      ]);
      if (z.error) throw z.error;
      if (o.error) throw o.error;
      if (id !== requeteRef.current) return;
      setZone(z.data as ChantierZone);
      setOuvertures((o.data ?? []) as Opening[]);
      setModules(resultats.modules);
      setGroups(resultats.groups);
      setPercages(resultats.percages);
    } catch (e: unknown) {
      if (id === requeteRef.current) setError(messageErreur(e, "Impossible de charger la zone"));
    } finally {
      if (id === requeteRef.current) setIsLoading(false);
    }
  }, [zoneId, chargerResultats]);

  useEffect(() => {
    void refetch();
    return () => {
      requeteRef.current++;
    };
  }, [refetch]);

  const addOuverture = useCallback(
    async (ouverture: OuvertureSaisie): Promise<Opening> => {
      const { data, error: err } = await getSupabase()
        .from("chantier_zones_ouvertures")
        .insert({ ...ouverture, zone_id: zoneId })
        .select()
        .single();
      if (err) throw new Error(err.message);
      const cree = data as Opening;
      setOuvertures((prev) => [...prev, cree]);
      return cree;
    },
    [zoneId],
  );

  const updateOuverture = useCallback(
    async (id: string, ouverture: Partial<OuvertureSaisie>): Promise<Opening> => {
      const { data, error: err } = await getSupabase()
        .from("chantier_zones_ouvertures")
        .update(ouverture)
        .eq("id", id)
        .select()
        .single();
      if (err) throw new Error(err.message);
      const maj = data as Opening;
      setOuvertures((prev) => prev.map((o) => (o.id === id ? maj : o)));
      return maj;
    },
    [],
  );

  const deleteOuverture = useCallback(async (id: string): Promise<void> => {
    const { error: err } = await getSupabase().from("chantier_zones_ouvertures").delete().eq("id", id);
    if (err) throw new Error(err.message);
    setOuvertures((prev) => prev.filter((o) => o.id !== id));
  }, []);

  /** Lance le calcul serveur puis rafraîchit modules et groupes. */
  const calculate = useCallback(async (): Promise<CalepinageCalculerResponse> => {
    setIsCalculating(true);
    try {
      const res = await fetch("/api/calepinage/calculer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone_id: zoneId }),
      });
      const corps: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          corps && typeof corps === "object" && "error" in corps && typeof corps.error === "string"
            ? corps.error
            : `Échec du calcul (${res.status})`;
        throw new Error(msg);
      }
      const resultat = corps as CalepinageCalculerResponse;
      const frais = await chargerResultats();
      setModules(frais.modules);
      setGroups(frais.groups);
      setPercages(frais.percages);
      return resultat;
    } finally {
      setIsCalculating(false);
    }
  }, [zoneId, chargerResultats]);

  return {
    zone,
    ouvertures,
    modules,
    groups,
    percages,
    isLoading,
    isCalculating,
    error,
    refetch,
    addOuverture,
    updateOuverture,
    deleteOuverture,
    calculate,
  };
}
