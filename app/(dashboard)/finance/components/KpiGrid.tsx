"use client";

import { useKpiMensuel } from "@/hooks/useFinance";
import { fmtEuro, fmtPct } from "@/lib/financeCalculs";
import { Receipt, Package, TrendingUp, TrendingDown, Wallet, AlertTriangle } from "lucide-react";

export default function KpiGrid({ mois }: { mois?: string }) {
  const { kpis, isLoading } = useKpiMensuel(mois);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-slate-700 bg-slate-800/50 p-4 h-28"></div>
        ))}
      </div>
    );
  }

  const margePositive = (kpis?.marge_brute ?? 0) >= 0;
  const tauxMarge = kpis?.taux_marge_pct ?? 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {/* CA Facturé */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-slate-400">
          <Receipt className="h-4 w-4 text-cyan-400" />
          <span className="text-xs uppercase tracking-wider">CA Facturé HT</span>
        </div>
        <div className="mt-4 text-2xl font-bold text-slate-100">
          {fmtEuro(kpis?.ca_facture_ht ?? 0)}
        </div>
      </div>

      {/* Dépenses */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-slate-400">
          <Package className="h-4 w-4 text-rose-400" />
          <span className="text-xs uppercase tracking-wider">Dépenses du mois</span>
        </div>
        <div className="mt-4 text-2xl font-bold text-slate-100">
          {fmtEuro(kpis?.depenses_total ?? 0)}
        </div>
      </div>

      {/* Marge brute */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-slate-400">
          {margePositive ? (
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          ) : (
            <TrendingDown className="h-4 w-4 text-rose-400" />
          )}
          <span className="text-xs uppercase tracking-wider">Marge Brute</span>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${margePositive ? "text-emerald-400" : "text-rose-400"}`}>
            {fmtEuro(kpis?.marge_brute ?? 0)}
          </span>
          <span className={`text-sm font-medium ${margePositive ? "text-emerald-500" : "text-rose-500"}`}>
            ({fmtPct(tauxMarge)})
          </span>
        </div>
      </div>

      {/* Reste à facturer */}
      <div className="relative rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-slate-400">
          <Wallet className="h-4 w-4 text-amber-400" />
          <span className="text-xs uppercase tracking-wider">Reste à facturer</span>
        </div>
        <div className="mt-4 text-2xl font-bold text-slate-100">
          {fmtEuro(kpis?.reste_a_facturer ?? 0)}
        </div>
        {(kpis?.reste_a_facturer ?? 0) > 50000 && (
          <div className="absolute top-4 right-4 flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Important
          </div>
        )}
      </div>
    </div>
  );
}
