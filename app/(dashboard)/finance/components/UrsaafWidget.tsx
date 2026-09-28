"use client";

import { useUrssaf } from "@/hooks/useFinance";
import { estimerChargesSociales, fmtEuro, fmtPct } from "@/lib/financeCalculs";
import { Users } from "lucide-react";

export default function UrsaafWidget({ mois }: { mois?: string }) {
  const { masseSalariale, isLoading } = useUrssaf();

  if (isLoading) {
    return <div className="animate-pulse h-64 rounded-xl border border-white/10 bg-[#1A1D24]/50"></div>;
  }

  const { charges_patronales, cibtp, total_charges, taux_global_pct } = estimerChargesSociales(masseSalariale);

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 flex flex-col h-full">
      <div className="flex items-center gap-3 border-b border-white/10 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-gray-400">
          <Users className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-white">
            Charges sociales estimées
          </h2>
        </div>
        <div className="text-2xl font-black text-slate-600">
          {fmtPct(taux_global_pct)}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5 flex-1 justify-between">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between text-gray-200">
            <span>Masse salariale brute</span>
            <span>{fmtEuro(masseSalariale)}</span>
          </div>
          
          <div className="my-2 border-t border-white/10"></div>
          
          <div className="flex items-center justify-between text-gray-300">
            <span>Charges patronales (45%)</span>
            <span>{fmtEuro(charges_patronales)}</span>
          </div>
          
          <div className="flex items-center justify-between text-gray-300">
            <span>CIBTP (2%)</span>
            <span>{fmtEuro(cibtp)}</span>
          </div>
        </div>

        <div>
          <div className="mb-3 border-t border-white/10"></div>
          
          <div className="flex items-end justify-between">
            <span className="text-sm font-semibold uppercase text-gray-400">
              Total à provisionner
            </span>
            <span className="text-lg font-bold text-rose-400">
              {fmtEuro(total_charges)}
            </span>
          </div>
        </div>
        
        <p className="text-xs text-gray-500 text-center mt-2">
          Estimation indicative basée sur les pointages du mois
        </p>
      </div>
    </div>
  );
}
