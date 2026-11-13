"use client";

import React, { useState, useEffect } from "react";
import OssaturePosee from "@/components/OssaturePosee";
import AvancementFacades from "@/components/AvancementFacadesWrapper";
import { dateParis } from "@/lib/dateParis";
import { CheckCircle2, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { genererFacadesDefaut, type FacadeConfig } from "@/lib/bardage/facadesConfig";

export interface BardageAvancementModuleProps {
  chantierId: string;
  checklist?: Record<string, unknown> | null;
  onChantierMisAJour?: () => void;
}

export default function BardageAvancementModule({
  chantierId,
  checklist,
  onChantierMisAJour,
}: BardageAvancementModuleProps) {
  const [facadesActives, setFacadesActives] = useState<FacadeConfig[]>(() => {
    if (checklist && typeof checklist === "object") {
      const chk = checklist as { facades_config?: FacadeConfig[] };
      if (Array.isArray(chk.facades_config) && chk.facades_config.length > 0) {
        return chk.facades_config;
      }
    }
    return genererFacadesDefaut(4);
  });

  // Synchronisation si checklist change
  useEffect(() => {
    if (checklist && typeof checklist === "object") {
      const chk = checklist as { facades_config?: FacadeConfig[] };
      if (Array.isArray(chk.facades_config) && chk.facades_config.length > 0) {
        setFacadesActives(chk.facades_config);
        return;
      }
    }

    // Charger depuis le dernier avancement ou le chantier si non présent
    async function chargerConfig() {
      const { data } = await supabase
        .from("chantiers")
        .select("checklist")
        .eq("id", chantierId)
        .maybeSingle();

      if (data?.checklist && typeof data.checklist === "object") {
        const chk = data.checklist as { facades_config?: FacadeConfig[] };
        if (Array.isArray(chk.facades_config) && chk.facades_config.length > 0) {
          setFacadesActives(chk.facades_config);
        }
      }
    }
    chargerConfig();
  }, [chantierId, checklist]);

  const handleAvancementMisAJour = (_pct: number, nouvellesFacades: FacadeConfig[]) => {
    setFacadesActives(nouvellesFacades);
    onChantierMisAJour?.();
  };

  return (
    <div className="space-y-6">
      {/* 1. Avancement par Façade (1 à 4 façades configurables) & Dictée vocale IA */}
      <AvancementFacades
        chantierId={chantierId}
        checklistActuelle={checklist}
        onAvancementMisAJour={handleAvancementMisAJour}
      />

      {/* 2. Parcours terrain « Ossature posée » aligné sur les façades actives */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center gap-2 border-b border-[#F0F0F0] pb-3">
          <Layers className="h-5 w-5 text-[#B85B2B]" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
              Parcours Terrain — Suivi d&apos;Ossature du Jour
            </h3>
            <p className="text-3xs text-[#777777]">
              Consignation d&apos;un fait de journée (intempéries gênantes ou bascule sur une autre façade active).
            </p>
          </div>
        </div>

        <OssaturePosee
          chantierId={chantierId}
          jour={dateParis()}
          facadesActives={facadesActives}
        />
      </div>
    </div>
  );
}
