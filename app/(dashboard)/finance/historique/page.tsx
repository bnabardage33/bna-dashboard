"use client";

import { useHistoriqueSaisies } from "@/hooks/useFinance";
import { fmtEuro } from "@/lib/financeCalculs";
import { Trash2, ArrowLeft, Paperclip } from "lucide-react";
import Link from "next/link";

export default function HistoriquePage() {
  const { pointages, depenses, avancements, isLoading, supprimerPointage, supprimerDepense, supprimerAvancement } = useHistoriqueSaisies();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-transparent p-4 lg:p-8 text-white flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-4 lg:p-8 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4">
          <div>
            <Link
              href="/finance"
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-400 transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-white">Historique des saisies</h1>
            <p className="text-sm font-medium text-gray-400">
              Modifiez ou supprimez les 50 dernières saisies en cas d'erreur.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Tableau Pointages */}
          <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 p-4">
            <h2 className="text-lg font-bold text-gray-200 mb-4">Derniers Pointages</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="border-b border-white/10 text-xs uppercase text-gray-400">
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
                    <tr key={p.id} className="hover:bg-[#1A1D24]/20">
                      <td className="px-2 py-2">{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-2 py-2">{p.profiles?.full_name || "Inconnu"}</td>
                      <td className="px-2 py-2 truncate max-w-[120px]" title={p.chantiers?.nom}>{p.chantiers?.nom}
                        <br />
                        <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium border ${
                          p.phase_travail === "ossature" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                          p.phase_travail === "isolation" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                          p.phase_travail === "bardage" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          p.phase_travail === "finitions" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                          "bg-gray-500/10 text-gray-400 border-gray-500/20"
                        }`}>
                          {p.phase_travail === "ossature" ? "🏗️ Ossature" :
                           p.phase_travail === "isolation" ? "🌡️ Isolation" :
                           p.phase_travail === "bardage" ? "🪵 Bardage" :
                           p.phase_travail === "finitions" ? "✨ Finitions" :
                           "📁 Général"}
                        </span>
</td>
                      <td className="px-2 py-2 text-right font-medium text-gray-400">{p.heures}h</td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => supprimerPointage(p.id)}
                          className="text-gray-500 hover:text-rose-400 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pointages.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-500">Aucun pointage.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tableau Dépenses */}
          <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 p-4">
            <h2 className="text-lg font-bold text-gray-200 mb-4">Dernières Dépenses</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="border-b border-white/10 text-xs uppercase text-gray-400">
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
                    <tr key={d.id} className="hover:bg-[#1A1D24]/20">
                      <td className="px-2 py-2">{new Date(d.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-2 py-2 capitalize">{d.nature.replace("_", " ")}</td>
                      <td className="px-2 py-2 truncate max-w-[120px]" title={d.chantiers?.nom}>{d.chantiers?.nom}</td>
                      <td className="px-2 py-2 text-right font-medium text-rose-400">
                        -{fmtEuro(d.montant_ht)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {d.document_url && (
                            <a
                              href={d.document_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-emerald-400 hover:text-emerald-300 transition-colors"
                              title="Voir le document"
                            >
                              <Paperclip className="h-4 w-4" />
                            </a>
                          )}
                          <button
                            onClick={() => supprimerDepense(d.id)}
                            className="text-gray-500 hover:text-rose-400 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {depenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-gray-500">Aucune dépense.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tableau Avancements */}
          <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 p-4">
            <h2 className="text-lg font-bold text-gray-200 mb-4">Dernières Saisies Avancement</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300">
                <thead className="border-b border-white/10 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Chantier</th>
                    <th className="px-2 py-2 text-right">Avancement</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {avancements.map((a) => (
                    <tr key={a.id} className="hover:bg-[#1A1D24]/20">
                      <td className="px-2 py-2">{new Date(a.date).toLocaleDateString("fr-FR")}</td>
                      <td className="px-2 py-2 truncate max-w-[120px]" title={a.chantiers?.nom}>{a.chantiers?.nom}</td>
                      <td className="px-2 py-2 text-right font-medium text-gray-400">
                        {a.pourcentage}%
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => supprimerAvancement(a.id)}
                          className="text-gray-500 hover:text-rose-400 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {avancements.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-gray-500">Aucun avancement.</td>
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
