"use client";

import { useTvaMensuelle } from "@/hooks/useFinance";
import { fmtEuro } from "@/lib/financeCalculs";
import { Calculator } from "lucide-react";

export default function TvaWidget({ mois }: { mois?: string }) {
  const { tva, isLoading } = useTvaMensuelle();
  const moisAffiche = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  if (isLoading) {
    return <div className="animate-pulse h-64 rounded-xl border border-white/10 bg-[#1E1E1E]/50"></div>;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#1B1511] flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#D96B27]/30 bg-[#D96B27]/15 text-[#D96B27]">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#F5EFEA] capitalize">
              TVA EURL — {moisAffiche}
            </h2>
            <p className="text-[11px] text-[#8E7F74]">
              Collectée (5,5% · 10% · 20%) vs Déductible
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5 flex-1 justify-between">
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center justify-between text-gray-300">
            <span>TVA collectée 20% <span className="text-[11px] text-[#8E7F74]">(Neuf / Terrasse / Clôture)</span></span>
            <span className="font-medium text-white">{fmtEuro(tva.collectee_20)}</span>
          </div>
          <div className="flex items-center justify-between text-gray-300">
            <span>TVA collectée 10% <span className="text-[11px] text-[#8E7F74]">(Rénov. &gt; 2 ans)</span></span>
            <span className="font-medium text-white">{fmtEuro(tva.collectee_10)}</span>
          </div>
          <div className="flex items-center justify-between text-gray-300">
            <span>TVA collectée 5,5% <span className="text-[11px] text-[#8E7F74]">(ITE / Énergie)</span></span>
            <span className="font-medium text-white">{fmtEuro(tva.collectee_5_5)}</span>
          </div>
          
          <div className="my-2 border-t border-white/10"></div>
          
          <div className="flex items-center justify-between font-semibold text-[#F5EFEA]">
            <span>Total TVA collectée</span>
            <span>{fmtEuro(tva.collectee_total)}</span>
          </div>
          
          <div className="flex items-center justify-between text-emerald-400">
            <span>TVA déductible (achats &amp; intérim)</span>
            <span>-{fmtEuro(tva.deductible_total)}</span>
          </div>
        </div>

        <div>
          <div className="mb-3 border-t border-white/10"></div>
          
          <div className="flex items-end justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${tva.type_solde === 'a_payer' ? 'text-[#D96B27]' : 'text-emerald-400'}`}>
              {tva.solde > 0 && tva.type_solde === 'a_payer' ? "TVA nette à décaisser" : tva.type_solde === 'credit' ? "Crédit de TVA" : "Solde nul"}
            </span>
            <span className={`text-2xl font-black ${tva.type_solde === 'a_payer' ? 'text-[#F59E0B]' : 'text-emerald-400'}`}>
              {fmtEuro(tva.solde)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
