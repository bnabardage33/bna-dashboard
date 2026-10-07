"use client";

import React from "react";
import Link from "next/link";
import type { ChantierZoneResume, ChantierZone } from "@/types/calepinage";

export interface ZoneListCardProps {
  zone: ChantierZoneResume | ChantierZone;
  isCalcule?: boolean;
  basePath?: string;
  onClick?: () => void;
}

export default function ZoneListCard({
  zone,
  isCalcule = false,
  basePath = "/dashboard/calepinage",
  onClick,
}: ZoneListCardProps) {
  const typeLabel = zone.type === "pignon" ? "Pignon" : "Mur / Façade";
  const dimMur = `${zone.largeur} × ${zone.hauteur_mur} m`;
  const dimFaite =
    zone.type === "pignon" && zone.hauteur_faite != null
      ? ` (faîtage: ${zone.hauteur_faite} m)`
      : "";

  const href = `${basePath}/${zone.id}`;

  return (
    <Link
      href={href}
      onClick={onClick}
      className="group relative block rounded-xl border border-[#333] bg-[#1E1E1E] p-4 transition-all hover:border-[#444] active:bg-[#252525]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold text-white group-hover:text-gray-200 transition-colors">
              {zone.nom}
            </h3>
            <span className="shrink-0 rounded bg-[#2a2a2a] px-2 py-0.5 text-[11px] font-semibold text-gray-300">
              {typeLabel}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
            <span>
              <strong className="text-gray-200">Dimensions :</strong> {dimMur}
              {dimFaite}
            </span>
            <span>•</span>
            <span>
              <strong className="text-gray-200">Matériau :</strong>{" "}
              {zone.materiau ?? "Non défini"}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide border ${
              isCalcule
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                : "border-gray-600/40 bg-gray-500/15 text-gray-400"
            }`}
          >
            {isCalcule ? "Calculé" : "Non calculé"}
          </span>
          <span className="text-gray-500 group-hover:text-white transition-colors text-lg leading-none pr-1">
            ›
          </span>
        </div>
      </div>
    </Link>
  );
}
