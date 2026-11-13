"use client";

import React from "react";
import ChantierTerrasseTab from "@/components/terrasse/ChantierTerrasseTab";

interface TerrasseCalepinageModuleProps {
  chantierId: string;
  chantierNom: string;
  clientNom?: string;
}

export default function TerrasseCalepinageModule({
  chantierId,
  chantierNom,
  clientNom,
}: TerrasseCalepinageModuleProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Conteneur principal réutilisant directement le moteur existant ChantierTerrasseTab */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-4 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <ChantierTerrasseTab
          chantierId={chantierId}
          chantierNom={chantierNom}
          clientNom={clientNom}
        />
      </div>
    </div>
  );
}
