"use client";

import React from "react";
import RapportClientWrapper from "@/components/RapportClientWrapper";
import { FileText, Send, Sparkles } from "lucide-react";

interface TerrasseRapportClientModuleProps {
  chantierId: string;
}

export default function TerrasseRapportClientModule({
  chantierId,
}: TerrasseRapportClientModuleProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* En-tête explicatif Terrasse */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-[#23272B]">
                Rapports d&apos;Activité & Suivi Maître d&apos;Ouvrage
              </h3>
              <p className="text-xs text-[#777777]">
                Générez des comptes-rendus visuels automatiques pour tenir votre client informé de la pose de sa terrasse
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 px-3 py-1.5 text-xs font-bold text-[#B85B2B]">
            <Sparkles className="h-4 w-4" />
            <span>Synthèse IA adaptée terrasse</span>
          </div>
        </div>
      </div>

      {/* Composant RapportClient existant */}
      <RapportClientWrapper chantierId={chantierId} />
    </div>
  );
}
