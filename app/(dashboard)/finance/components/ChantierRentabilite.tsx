"use client";

import { useRentabiliteChantiers } from "@/hooks/useFinance";
import { fmtEuro, fmtPct } from "@/lib/financeCalculs";
import { ArrowUpRight, ArrowDownRight, AlertTriangle } from "lucide-react";

export default function ChantierRentabilite() {
  const { rentabilites, alertes, isLoading } = useRentabiliteChantiers();

  if (isLoading) {
    return <div className="animate-pulse h-64 rounded-xl border border-slate-700 bg-slate-800/50"></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {alertes.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-400">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            {alertes.length} chantier(s) en alerte — marge &lt; 15% ou dérive budgétaire
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-700 bg-slate-800/80 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Chantier</th>
                <th className="px-4 py-3 font-medium text-right">Prix vente</th>
                <th className="px-4 py-3 font-medium text-right">Coût direct</th>
                <th className="px-4 py-3 font-medium text-right">Marge</th>
                <th className="px-4 py-3 font-medium text-center">Taux marge</th>
                <th className="px-4 py-3 font-medium text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {rentabilites.map((r) => {
                const isVert = r.taux_marge_pct >= 30;
                const isOrange = r.taux_marge_pct >= 15 && r.taux_marge_pct < 30;
                const isRouge = r.taux_marge_pct < 15;

                return (
                  <tr
                    key={r.chantier_id}
                    className={`hover:bg-slate-700/20 transition-colors ${
                      r.alerte_depassement ? "border-l-2 border-l-rose-500" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-100">{r.nom}</div>
                      <div className="text-xs text-slate-500">{r.client_nom}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {fmtEuro(r.prix_vente_ht)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {fmtEuro(r.cout_direct_total)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${r.marge_brute >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmtEuro(r.marge_brute)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                          isVert
                            ? "bg-emerald-400/10 text-emerald-400"
                            : isOrange
                            ? "bg-amber-400/10 text-amber-400"
                            : "bg-rose-400/10 text-rose-400"
                        }`}
                      >
                        {isRouge ? (
                          <ArrowDownRight className="h-3 w-3" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3" />
                        )}
                        {fmtPct(r.taux_marge_pct)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full bg-slate-700 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300">
                        {r.statut || "en_cours"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {rentabilites.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Aucun chantier trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
