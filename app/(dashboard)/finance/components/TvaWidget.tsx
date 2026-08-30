"use client";

import { useTvaMensuelle } from "@/hooks/useFinance";
import { fmtEuro } from "@/lib/financeCalculs";
import { Calculator } from "lucide-react";

export default function TvaWidget({ mois }: { mois?: string }) {
  const { tva, isLoading } = useTvaMensuelle();
  const moisAffiche = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  if (isLoading) {
    return <div className="animate-pulse h-64 rounded-xl border border-white/10 bg-[#1A1D24]/50"></div>;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 flex flex-col h-full">
      <div className="flex items-center gap-3 border-b border-white/10 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-gray-400">
          <Calculator className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-bold text-white capitalize">
          TVA — {moisAffiche}
        </h2>
      </div>

      <div className="flex flex-col gap-4 p-5 flex-1 justify-between">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between text-gray-300">
            <span>TVA collectée 20%</span>
            <span>{fmtEuro(tva.collectee_20)}</span>
          </div>
          <div className="flex items-center justify-between text-gray-300">
            <span>TVA collectée 10%</span>
            <span>{fmtEuro(tva.collectee_10)}</span>
          </div>
          <div className="flex items-center justify-between text-gray-300">
            <span>TVA collectée 5.5%</span>
            <span>{fmtEuro(tva.collectee_5_5)}</span>
          </div>
          
          <div className="my-2 border-t border-white/10"></div>
          
          <div className="flex items-center justify-between font-medium text-gray-400">
            <span>Total collectée</span>
            <span>{fmtEuro(tva.collectee_total)}</span>
          </div>
          
          <div className="flex items-center justify-between text-rose-400">
            <span>TVA déductible</span>
            <span>-{fmtEuro(tva.deductible_total)}</span>
          </div>
        </div>

        <div>
          <div className="mb-3 border-t border-white/10"></div>
          
          <div className="flex items-end justify-between">
            <span className={`text-sm font-semibold uppercase ${tva.type_solde === 'a_payer' ? 'text-rose-400' : 'text-gray-400'}`}>
              {tva.solde > 0 && tva.type_solde === 'a_payer' ? "À payer" : tva.type_solde === 'credit' ? "Crédit TVA" : "Solde nul"}
            </span>
            <span className={`text-2xl font-bold ${tva.type_solde === 'a_payer' ? 'text-rose-400' : 'text-gray-400'}`}>
              {fmtEuro(tva.solde)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
