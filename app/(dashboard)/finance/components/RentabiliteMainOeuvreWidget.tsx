"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { analyserRentabiliteMainOeuvre, type RentabilitePhase } from "@/lib/mainOeuvreAnalytique";
import { fmtEuro } from "@/lib/financeCalculs";

export default function RentabiliteMainOeuvreWidget() {
  const [chantiers, setChantiers] = useState<{ id: string; nom: string }[]>([]);
  const [chantierId, setChantierId] = useState<string>("");
  const [data, setData] = useState<RentabilitePhase[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("chantiers")
      .select("id, nom")
      .in("statut", ["en_cours", "prevu", "termine"])
      .order("created_at", { ascending: false })
      .limit(20)
      .then((res) => {
        if (res.data) {
          setChantiers(res.data as any);
          if (res.data.length > 0) setChantierId(res.data[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (!chantierId) return;
    let isMounted = true;
    setLoading(true);
    analyserRentabiliteMainOeuvre(chantierId).then((res) => {
      if (isMounted) {
        setData(res);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [chantierId]);

  const totalVendu = data.reduce((acc, d) => acc + d.budget_vendu, 0);
  const totalReel = data.reduce((acc, d) => acc + d.cout_reel, 0);

  const phaseRentable = data.reduce((prev, curr) => (curr.ecart > prev.ecart ? curr : prev), data[0]);
  const phaseCritique = data.reduce((prev, curr) => (curr.ecart < prev.ecart ? curr : prev), data[0]);

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 p-6 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            ⏱️ Rentabilité de la Main-d'œuvre par Phase
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Compare le coût de vos heures pointées avec le budget vendu au client.
          </p>
        </div>
        <select
          value={chantierId}
          onChange={(e) => setChantierId(e.target.value)}
          className="bg-[#242830] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 w-full sm:w-auto"
          aria-label="Chantier"
        >
          <option value="">Sélectionner un chantier</option>
          {chantiers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-emerald-400"></div>
        </div>
      ) : data.length === 0 ? (
        <div className="text-center p-8 text-gray-500 text-sm">Aucune donnée disponible.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {phaseRentable && phaseRentable.budget_vendu > 0 && (
              <div className="rounded-xl bg-emerald-950/20 border border-emerald-900/30 p-4">
                <p className="text-xs font-semibold text-emerald-400 uppercase">Phase la plus rentable</p>
                <p className="mt-1 text-lg font-bold text-emerald-100">{phaseRentable.nom_affichage}</p>
                <p className="text-xs text-emerald-300/70 mt-1">
                  +{fmtEuro(phaseRentable.ecart)} générés
                </p>
              </div>
            )}
            {phaseCritique && (phaseCritique.ecart < 0 || phaseCritique.cout_reel > 0) && (
              <div className="rounded-xl bg-orange-950/20 border border-orange-900/30 p-4">
                <p className="text-xs font-semibold text-orange-400 uppercase">Phase à optimiser</p>
                <p className="mt-1 text-lg font-bold text-orange-100">{phaseCritique.nom_affichage}</p>
                <p className="text-xs text-orange-300/70 mt-1">
                  {phaseCritique.ecart > 0 ? "+" : ""}{fmtEuro(phaseCritique.ecart)} sur le budget
                </p>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#242830] text-xs uppercase text-gray-400">
                <tr>
                  <th className="p-4">Phase Technique</th>
                  <th className="p-4 text-right">Budget Vendu (€)</th>
                  <th className="p-4 text-right">Coût Réel (€)</th>
                  <th className="p-4 text-right">Écart (€)</th>
                  <th className="p-4 text-right">Perf. Financière</th>
                  <th className="p-4 text-right" title="Performance pondérée par la météo (Gaël Logic)">Perf. Météo 🌦️</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.filter(d => d.budget_vendu > 0 || d.cout_reel > 0).map((d) => (
                  <tr key={d.phase} className="hover:bg-white/5">
                    <td className="p-4 font-medium text-gray-200">{d.nom_affichage}</td>
                    <td className="p-4 text-right text-gray-400">{fmtEuro(d.budget_vendu)}</td>
                    <td className="p-4 text-right text-gray-400">{fmtEuro(d.cout_reel)}</td>
                    <td className="p-4 text-right">
                      <span className={`font-bold ${d.ecart < 0 ? "text-rose-400" : d.ecart > 0 ? "text-emerald-400" : "text-gray-500"}`}>
                        {d.ecart > 0 ? "+" : ""}{fmtEuro(d.ecart)}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${d.ecart < 0 ? "bg-rose-500" : d.performance_pct > 20 ? "bg-emerald-500" : "bg-orange-500"}`}
                            style={{ width: `${Math.min(100, Math.max(0, 100 - (d.cout_reel / (d.budget_vendu || 1) * 100)))}` + "%" }}
                          />
                        </div>
                        <span className={`text-xs ${d.ecart < 0 ? "text-rose-400" : "text-gray-400"}`}>
                          {d.budget_vendu === 0 ? "Hors devis" : `${d.performance_pct > 0 ? "+" : ""}${d.performance_pct.toFixed(1)}%`}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className={`font-bold px-2.5 py-1 rounded-lg text-xs ${d.performance_meteo_pct >= 0 ? "bg-emerald-900/30 text-emerald-400" : "bg-rose-900/30 text-rose-400"}`}>
                        {d.budget_vendu === 0 ? "—" : `${d.performance_meteo_pct > 0 ? "+" : ""}${d.performance_meteo_pct.toFixed(1)}%`}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.filter(d => d.budget_vendu > 0 || d.cout_reel > 0).length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500">
                      Aucune donnée pour ce chantier.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-3 bg-blue-950/20 border border-blue-900/30 rounded-lg flex gap-3 text-sm text-blue-200">
            <span className="text-xl">💡</span>
            <p>
              <strong>Gaël Logic :</strong> Si l'Écart (€) est négatif mais que la <em>Performance Météo</em> est positive, l'équipe a été physiquement très performante compte tenu du mauvais temps. 
              Dans ce cas, ne blâmez pas les ouvriers, mais réévaluez plutôt à la hausse votre prix de vente de la pose au m² pour ce type d'ouvrage !
            </p>
          </div>
        </>
      )}
    </div>
  );
}
