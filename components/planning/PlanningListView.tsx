"use client";

import React, { useState } from "react";
import {
  CalendarCheck2,
  CheckCircle2,
  Clock,
  HardHat,
  MapPin,
  Package,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  NATURES_CONFIG,
  parseYMD,
  type UnifiedPlanningItem,
} from "@/lib/services/planningService";
import {
  basculerStatutRendezVous,
  supprimerRendezVous,
} from "@/lib/services/rendezVousService";

interface PlanningListViewProps {
  items: UnifiedPlanningItem[];
  onSelectItem: (item: UnifiedPlanningItem) => void;
  onChanged: () => void;
}

function formatDateFr(dateStr: string): string {
  const dt = parseYMD(dateStr);
  if (!dt) return dateStr;
  return dt.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PlanningListView({
  items,
  onSelectItem,
  onChanged,
}: PlanningListViewProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-10 text-center">
        <p className="text-sm font-semibold text-white/80">
          Aucun élément ne correspond aux filtres actifs.
        </p>
        <p className="mt-1 text-xs text-white/45">
          Créez un rendez-vous ou planifiez des dates sur un chantier pour alimenter la vue.
        </p>
      </div>
    );
  }

  const handleToggle = async (e: React.MouseEvent, item: UnifiedPlanningItem) => {
    e.stopPropagation();
    setBusyId(item.id);
    try {
      await basculerStatutRendezVous(supabase, item.rawId, item.statut);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, item: UnifiedPlanningItem) => {
    e.stopPropagation();
    setBusyId(item.id);
    try {
      await supprimerRendezVous(supabase, item.rawId);
      setConfirmId(null);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const cfg = NATURES_CONFIG[item.natureKey] ?? NATURES_CONFIG.autre;
        const Icon =
          item.type === "chantier"
            ? HardHat
            : item.type === "rdv"
            ? CalendarCheck2
            : Package;

        return (
          <div
            key={item.id}
            onClick={() => onSelectItem(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectItem(item);
              }
            }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#1B1511] p-4 hover:border-[#D96B27]/50 transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#120F0D]">
                <Icon className="h-4 w-4 text-[#D96B27]" />
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold text-white truncate">
                    {item.titre}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.badgeClass}`}
                  >
                    {cfg.label}
                  </span>
                  {item.metier && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/75">
                      {item.metier}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-[#D96B27]" />
                    {formatDateFr(item.dateDebut)}
                    {item.dateFin && item.dateFin !== item.dateDebut
                      ? ` → ${formatDateFr(item.dateFin)}`
                      : ""}
                    {item.heure ? ` · ${item.heure}` : ""}
                  </span>
                  {item.lieu && (
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin className="h-3.5 w-3.5 text-white/40" />
                      {item.lieu}
                    </span>
                  )}
                </div>

                {item.sousTitre && (
                  <p className="text-xs text-white/45 truncate">{item.sousTitre}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 shrink-0">
              <span className="rounded-lg border border-white/10 bg-[#120F0D] px-2.5 py-1 text-[11px] font-semibold text-amber-200/80">
                {item.statutLabel}
              </span>

              {item.type === "rdv" && confirmId !== item.id && (
                <>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={(e) => handleToggle(e, item)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                    title={
                      item.statut === "effectue"
                        ? "Marquer comme planifié"
                        : "Marquer comme effectué"
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmId(item.id);
                    }}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-red-500/30 bg-red-950/30 text-red-300 hover:bg-red-950/60 cursor-pointer"
                    title="Supprimer ce rendez-vous"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}

              {item.type === "rdv" && confirmId === item.id && (
                <div
                  className="flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={(e) => handleDelete(e, item)}
                    className="h-8 px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-[11px] font-bold text-white cursor-pointer"
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="h-8 px-2 rounded-lg border border-white/15 text-[11px] text-white/70 hover:text-white cursor-pointer"
                  >
                    Non
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
