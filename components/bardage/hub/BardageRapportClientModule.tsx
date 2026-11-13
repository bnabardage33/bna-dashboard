"use client";

import React from "react";
import RapportClientWrapper from "@/components/RapportClientWrapper";
import { FileText, Sparkles } from "lucide-react";

export interface BardageRapportClientModuleProps {
  chantierId: string;
}

export default function BardageRapportClientModule({
  chantierId,
}: BardageRapportClientModuleProps) {
  return (
    <div className="space-y-6">
      {/* En-tête du module Rapport Client Bardage */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-[#23272B]">
                Compte-Rendu d&apos;Intervention &amp; Rapport Client
              </h3>
              <p className="text-xs text-[#777777]">
                Synthèse d&apos;activité, relevés météo, photos d&apos;avancement et transmission directe au client
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 px-3 py-1.5 text-xs font-bold text-[#B85B2B]">
            <Sparkles className="h-4 w-4" />
            <span>Synthèse hebdomadaire Bardage</span>
          </div>
        </div>
      </div>

      {/* Contenu principal du rapport client */}
      <RapportClientWrapper chantierId={chantierId} />
    </div>
  );
}
