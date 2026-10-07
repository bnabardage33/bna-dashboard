"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useChantierZones } from "@/hooks/calepinage/useChantierZones";
import ZoneListCard from "@/components/calepinage/ZoneListCard";
import { getSupabase } from "@/lib/supabase";

export default function CalepinageListPage() {
  const pathname = usePathname();
  const { zones, isLoading, error, refetch } = useChantierZones();
  const [calculatedZoneIds, setCalculatedZoneIds] = useState<Set<string>>(
    new Set(),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Détermine la route de base selon le chemin accédé
  const basePath = pathname.startsWith("/dashboard/calepinage")
    ? "/dashboard/calepinage"
    : "/calepinage";

  // Récupère la liste des zone_id ayant au moins un module calculé
  const loadCalculatedStatus = useCallback(async () => {
    try {
      const { data, error: err } = await getSupabase()
        .from("chantier_zones_modules")
        .select("zone_id");
      if (err) throw err;
      if (data) {
        const ids = new Set<string>(
          data.map((row) => row.zone_id),
        );
        setCalculatedZoneIds(ids);
      }
    } catch (e: unknown) {
      console.error(
        "[calepinage/liste] Impossible de vérifier les modules calculés :",
        e,
      );
    }
  }, []);

  useEffect(() => {
    void loadCalculatedStatus();
  }, [loadCalculatedStatus]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), loadCalculatedStatus()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#121212] text-white">
      {/* 1. Header (sticky, 56px) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#2e2e2e] bg-[#161616] px-4 shadow-md">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight text-white">
            Calepinage
          </h1>
          {!isLoading && (
            <span className="rounded-full bg-[#252525] px-2.5 py-0.5 text-xs font-semibold text-gray-300 border border-[#333]">
              {zones.length} zone{zones.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </header>

      {/* 2. Liste des zones */}
      <main className="flex-1 space-y-3 p-4 pb-24 max-w-2xl mx-auto w-full">
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-4 text-sm text-red-400">
            <p className="font-bold">Erreur de chargement</p>
            <p className="text-xs text-gray-300 mt-1">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 w-full animate-pulse rounded-xl border border-[#2a2a2a] bg-[#1a1a1a]"
              />
            ))}
          </div>
        ) : zones.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#333] bg-[#181818]/60 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#252525] text-xl">
              📐
            </div>
            <p className="mt-4 text-base font-semibold text-gray-200">
              Aucune zone
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Créez une zone dans l&apos;onglet Chantiers pour configurer son
              calepinage.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {zones.map((zone) => (
              <li key={zone.id}>
                <ZoneListCard
                  zone={zone}
                  isCalcule={calculatedZoneIds.has(zone.id)}
                  basePath={basePath}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* 3. Bouton flottant / sticky en bas "Actualiser" */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#2e2e2e] bg-[#161616]/95 backdrop-blur-md p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto w-full">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isLoading || isRefreshing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white shadow-lg shadow-red-600/20 active:bg-red-700 disabled:opacity-50 transition-all"
          >
            <span
              className={`text-base leading-none ${
                isRefreshing || isLoading ? "animate-spin" : ""
              }`}
            >
              🔄
            </span>
            {isRefreshing ? "Actualisation..." : "Actualiser"}
          </button>
        </div>
      </div>
    </div>
  );
}
