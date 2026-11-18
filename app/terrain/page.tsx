"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Building2, Layers3, Fence } from "lucide-react";
import { supabase } from "@/lib/supabase";
import PlanningChantiers, {
  type PlanningChantierItem,
} from "@/components/PlanningChantiers";

type FiltreMetierPlanning = "tous" | "bardage" | "terrasse" | "cloture";

interface ChantierGlobalRow {
  id: string;
  nom: string | null;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string | null;
  metier: string | null;
  clients: { nom: string; societe: string | null } | null;
}

export default function PlanningGeneralTerrainPage() {
  const [chantiers, setChantiers] = useState<PlanningChantierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreMetier, setFiltreMetier] = useState<FiltreMetierPlanning>("tous");

  const chargerChantiers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("chantiers")
        .select("id, nom, adresse_chantier, date_debut, date_fin, statut, metier, clients(nom, societe)")
        .neq("statut", "corbeille")
        .order("date_debut", { ascending: true });

      if (!error && data) {
        const rows = data as unknown as ChantierGlobalRow[];
        setChantiers(
          rows.map((c) => ({
            id: c.id,
            nom: c.nom,
            client_nom: c.clients?.nom || null,
            client_societe: c.clients?.societe || null,
            adresse_chantier: c.adresse_chantier,
            date_debut: c.date_debut,
            date_fin: c.date_fin,
            statut: c.statut || "prevu",
            metier: c.metier || "bardage",
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    chargerChantiers();
  }, [chargerChantiers]);

  const chantiersFiltres = useMemo(() => {
    if (filtreMetier === "tous") return chantiers;
    return chantiers.filter((c) => (c.metier || "bardage") === filtreMetier);
  }, [chantiers, filtreMetier]);

  const handleUpdateDates = async (id: string, newDebut: string, newFin: string) => {
    await supabase
      .from("chantiers")
      .update({ date_debut: newDebut, date_fin: newFin })
      .eq("id", id);
    chargerChantiers();
  };

  return (
    <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#120F0D] text-[#F5EFEA] px-4 py-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <section className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 md:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27]">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <p className="text-xs font-bold uppercase tracking-[2.5px] text-[#D96B27]">
                  BNA Pilotage BTP · Vue Consolidée
                </p>
              </div>
              <h1 className="mt-2 text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[#F5EFEA]">
                Planning Général Multi-Métiers
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#8E7F74]">
                Visualisation consolidée des chantiers Bardage, Terrasse et Clôture sur une timeline unique.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/terrain/chantier"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] px-3 py-2 text-xs font-bold text-[#F5EFEA] hover:border-[#D96B27]/40"
              >
                <Building2 className="h-3.5 w-3.5 text-[#B8A99E]" /> Bardage
              </Link>
              <Link
                href="/terrain/terrasse"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] px-3 py-2 text-xs font-bold text-[#F5EFEA] hover:border-[#D96B27]/40"
              >
                <Layers3 className="h-3.5 w-3.5 text-amber-600" /> Terrasse
              </Link>
              <Link
                href="/terrain/cloture"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] px-3 py-2 text-xs font-bold text-[#F5EFEA] hover:border-[#D96B27]/40"
              >
                <Fence className="h-3.5 w-3.5 text-[#D96B27]" /> Clôture
              </Link>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "tous", label: "Tous les métiers" },
                { id: "bardage", label: "Bardage" },
                { id: "terrasse", label: "Terrasse" },
                { id: "cloture", label: "Clôture" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltreMetier(f.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                  filtreMetier === f.id
                    ? "bg-[#D96B27] text-white shadow-xs"
                    : "border border-white/10 bg-[#120F0D] text-[#B8A99E] hover:text-[#F5EFEA]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border border-white/10 bg-[#1B1511] p-8">
            <div className="h-9 w-9 animate-spin rounded-full border-3 border-[#D96B27] border-t-transparent" />
          </div>
        ) : (
          <PlanningChantiers
            chantiers={chantiersFiltres}
            onUpdateDates={handleUpdateDates}
          />
        )}
      </div>
    </div>
  );
}
