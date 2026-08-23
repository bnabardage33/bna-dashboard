"use client";

import { useHistoriqueSaisies } from "@/hooks/useFinance";
import { fmtEuro } from "@/lib/financeCalculs";
import { Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function HistoriquePage() {
  const { pointages, depenses, avancements, isLoading, supprimerPointage, supprimerDepense, supprimerAvancement } = useHistoriqueSaisies();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 lg:p-8 text-slate-100 flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4">
          <div>
            <Link
              href="/finance"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-slate-100">Historique des saisies</h1>
            <p className="text-sm font-medium text-slate-400">
              Modifiez ou supprimez les 50 dernières saisies en cas d'erreur.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Tableau Pointages */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="text-lg font-bold text-slate-200 mb-4">Derniers Pointages</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-700 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Ouvrier</th>
                    <th className="px-2 py-2">Chantier</th>
                    <th className="px-2 py-2 text-right">Heures</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {pointages.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-700/20">
                      <td className="px-2 py-2">{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-2 py-2">{p.profiles?.full_name || "Inconnu"}</td>
                      <td className="px-2 py-2 truncate max-w-[120px]" title={p.chantiers?.nom}>{p.chantiers?.nom}</td>
                      <td className="px-2 py-2 text-right font-medium text-cyan-400">{p.heures}h</td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => supprimerPointage(p.id)}
                          className="text-slate-500 hover:text-rose-400 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pointages.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">Aucun pointage.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tableau Dépenses */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="text-lg font-bold text-slate-200 mb-4">Dernières Dépenses</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-700 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Nature</th>
                    <th className="px-2 py-2">Chantier</th>
                    <th className="px-2 py-2 text-right">Montant</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {depenses.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-700/20">
                      <td className="px-2 py-2">{new Date(d.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-2 py-2 capitalize">{d.nature.replace("_", " ")}</td>
                      <td className="px-2 py-2 truncate max-w-[120px]" title={d.chantiers?.nom}>{d.chantiers?.nom}</td>
                      <td className="px-2 py-2 text-right font-medium text-rose-400">
                        -{fmtEuro(d.montant_ht)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => supprimerDepense(d.id)}
                          className="text-slate-500 hover:text-rose-400 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {depenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">Aucune dépense.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tableau Avancements */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="text-lg font-bold text-slate-200 mb-4">Dernières Saisies Avancement</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-700 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Chantier</th>
                    <th className="px-2 py-2 text-right">Avancement</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {avancements.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-700/20">
                      <td className="px-2 py-2">{new Date(a.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-2 py-2 truncate max-w-[120px]" title={a.chantiers?.nom}>{a.chantiers?.nom}</td>
                      <td className="px-2 py-2 text-right font-medium text-cyan-400">
                        {a.pourcentage}%
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => supprimerAvancement(a.id)}
                          className="text-slate-500 hover:text-rose-400 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {avancements.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-500">Aucun avancement.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
