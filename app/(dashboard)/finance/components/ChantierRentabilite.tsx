"use client";

import { useRentabiliteChantiers } from "@/hooks/useFinance";
import { fmtEuro, fmtPct } from "@/lib/financeCalculs";
import { AlertTriangle, BarChart2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import type { RentabiliteChantierExt } from "@/hooks/useFinance";
import BilanChantierPDF from "./exports/BilanChantierPDF";
import {
  METIER_BADGE_CONFIG,
  normaliserMetierCode,
  type MetierFiltre,
} from "@/lib/metierBadge";
import { OPTIONS_TVA_BTP } from "@/lib/baremeFFBGironde";

export default function ChantierRentabilite({
  metierFilter = "tous",
}: {
  metierFilter?: MetierFiltre;
}) {
  const { rentabilites, alertes, isLoading } = useRentabiliteChantiers();
  const [printingBilan, setPrintingBilan] = useState<RentabiliteChantierExt | null>(null);
  const [supprimantId, setSupprimantId] = useState<string | null>(null);
  const [tvaOverrides, setTvaOverrides] = useState<Record<string, number>>({});

  const handleChangerTva = async (chantierId: string, taux: number) => {
    setTvaOverrides((prev) => ({ ...prev, [chantierId]: taux }));
    const { error } = await supabase
      .from("chantiers")
      .update({ taux_tva: taux })
      .eq("id", chantierId);
    if (error) {
      console.error("[ChantierRentabilite] Erreur maj TVA :", error);
      alert(`Erreur mise à jour TVA (${error.code ?? "SQL"}) : ${error.message}`);
    }
  };

  const handleSupprimerChantier = async (id: string, nom: string) => {
    const confirmation = window.confirm(
      `Supprimer définitivement le chantier "${nom}" ? Cette action est irréversible.`
    );
    if (!confirmation) return;

    setSupprimantId(id);
    try {
      const { error } = await supabase.from("chantiers").delete().eq("id", id);
      if (error) throw error;
      window.location.reload();
    } catch (err) {
      alert("Erreur lors de la suppression : " + (err as Error).message);
    } finally {
      setSupprimantId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-white/10 bg-[#1E1E1E]/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {printingBilan && (
        <div className="hidden print:block">
          <BilanChantierPDF
            chantier={printingBilan}
            onReady={() => {
              window.print();
              setPrintingBilan(null);
            }}
          />
        </div>
      )}

      {alertes.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-400">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            {alertes.length} chantier(s) en alerte — marge &lt; 15% ou dérive budgétaire
          </p>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-[#1B1511] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#B8A99E]">
            <thead className="border-b border-white/10 bg-[#221B17] text-xs uppercase text-[#B8A99E]">
              <tr>
                <th className="px-4 py-3 font-medium">Chantier</th>
                <th className="px-4 py-3 font-medium text-center">TVA</th>
                <th className="px-4 py-3 font-medium text-right">CA HT</th>
                <th className="px-4 py-3 font-medium text-center">Avancement</th>
                <th className="px-4 py-3 font-medium text-right">Coût direct HT</th>
                <th className="px-4 py-3 font-medium text-right">Marge HT</th>
                <th className="px-4 py-3 font-medium text-center">Taux marge</th>
                <th className="px-4 py-3 font-medium text-center">Statut</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rentabilites
                .filter(
                  (r) =>
                    metierFilter === "tous" ||
                    normaliserMetierCode(r.metier) === metierFilter
                )
                .map((r) => {
                  const mCode = normaliserMetierCode(r.metier);
                  const mCfg = METIER_BADGE_CONFIG[mCode];
                  return (
                    <tr
                      key={r.chantier_id}
                      className={`hover:bg-white/[0.03] transition-colors ${
                        r.alerte_depassement ? "border-l-2 border-l-rose-500" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-[#F5EFEA]">{r.nom}</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${mCfg.badgeClass}`}
                          >
                            {mCfg.label}
                          </span>
                          {r.zone_deplacement && (
                            <span className="rounded-full border border-[#D96B27]/40 bg-[#D96B27]/15 px-2 py-0.5 text-[10px] font-semibold text-[#F59E0B]">
                              Zone {r.zone_deplacement}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#8E7F74]">{r.client_nom}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          aria-label={`TVA ${r.nom}`}
                          value={tvaOverrides[r.chantier_id] ?? r.taux_tva ?? 20}
                          onChange={(e) =>
                            void handleChangerTva(r.chantier_id, parseFloat(e.target.value))
                          }
                          title={OPTIONS_TVA_BTP.map((o) => o.aide).join(" | ")}
                          className="rounded-lg border border-white/10 bg-[#120F0D] px-2 py-1 text-xs font-semibold text-[#F5EFEA] focus:border-[#D96B27] focus:outline-none"
                        >
                          <option value={20}>20%</option>
                          <option value={10}>10%</option>
                          <option value={5.5}>5,5%</option>
                        </select>
                      </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {fmtEuro(r.prix_vente_ht)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-bold text-gray-400">{r.avancement_reel || 0}%</span>
                        <div className="w-16 h-1.5 bg-[#1E1E1E] rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${Math.min(r.avancement_reel || 0, 100)}%` }}></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {fmtEuro(r.cout_direct_total)}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${r.marge_brute >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmtEuro(r.marge_brute)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${
                          r.taux_marge_pct >= 15
                            ? "bg-emerald-500/10 text-emerald-400"
                            : r.taux_marge_pct > 0
                            ? "bg-orange-500/10 text-orange-400"
                            : "bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {fmtPct(r.taux_marge_pct)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full bg-[#1E1E1E] px-2 py-1 text-2xs font-semibold uppercase text-gray-300">
                        {r.statut || "en_cours"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setPrintingBilan(r)}
                          disabled={!!printingBilan}
                          className="flex items-center justify-center rounded p-1.5 text-gray-400 hover:bg-[#1E1E1E] hover:text-gray-400 transition-colors disabled:opacity-50"
                          title="Générer le Bilan Analytique"
                        >
                          <BarChart2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleSupprimerChantier(r.chantier_id, r.nom)}
                          disabled={supprimantId === r.chantier_id}
                          className="flex items-center justify-center rounded p-1.5 text-gray-400 hover:bg-[#1E1E1E] hover:text-rose-400 transition-colors disabled:opacity-50"
                          title="Supprimer le chantier"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rentabilites.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
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
