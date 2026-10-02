"use client";

import { useRentabiliteChantiers } from "@/hooks/useFinance";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

export default function MargeParTypeChart() {
  const { rentabilites, isLoading } = useRentabiliteChantiers();

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-white/10 bg-[#1E1E1E]/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-transparent"></div>
      </div>
    );
  }

  if (!rentabilites || rentabilites.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-white/10 bg-[#1E1E1E]/50">
        <span className="text-gray-500">Aucun chantier analysable</span>
      </div>
    );
  }

  // Grouper par type (estimation basique sur le nom si pas de type_chantier)
  const grouped: Record<string, { total_vente: number; total_marge: number }> = {
    "Bardage": { total_vente: 0, total_marge: 0 },
    "ITE": { total_vente: 0, total_marge: 0 },
    "Ossature Bois": { total_vente: 0, total_marge: 0 },
    "Autre": { total_vente: 0, total_marge: 0 },
  };

  rentabilites.forEach((r) => {
    const nom = (r.nom || "").toLowerCase();
    let type = "Autre";
    
    if (nom.includes("bardage") || nom.includes("hpl")) type = "Bardage";
    else if (nom.includes("ite") || nom.includes("isolation")) type = "ITE";
    else if (nom.includes("bois") || nom.includes("ossature")) type = "Ossature Bois";

    grouped[type].total_vente += r.prix_vente_ht;
    grouped[type].total_marge += r.marge_brute;
  });

  const data = Object.entries(grouped)
    .filter(([_, v]) => v.total_vente > 0)
    .map(([type, v]) => ({
      type,
      taux_marge: (v.total_marge / v.total_vente) * 100,
    }));

  return (
    <div className="rounded-xl border border-white/10 bg-[#1E1E1E]/50 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-300">
        Marge moyenne par type
      </h3>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barSize={40}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="type"
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                borderColor: "#475569",
                borderRadius: "0.5rem",
                color: "#f1f5f9",
              }}
              cursor={{ fill: "#334155", opacity: 0.4 }}
              formatter={(value) => [
                <span key="marge" className={Number(value) >= 15 ? "text-gray-400" : "text-rose-400"}>
                  {Number(value).toFixed(1)}%
                </span>,
                "Taux de marge",
              ]}
              labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
            />
            <ReferenceLine y={15} stroke="#fbbf24" strokeDasharray="5 5" /> {/* amber-400 */}
            <Bar dataKey="taux_marge" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.taux_marge >= 15 ? "#34d399" : "#fb7185"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
