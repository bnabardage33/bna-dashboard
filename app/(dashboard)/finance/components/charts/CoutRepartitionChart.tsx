"use client";

import { useCoutRepartition } from "@/hooks/useFinance";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS: Record<string, string> = {
  "Matériaux": "#22d3ee", // cyan-400
  "Quincaillerie": "#60a5fa", // blue-400
  "Sous-traitance": "#fbbf24", // amber-400
  "Location": "#fb7185", // rose-400
  "Frais": "#94a3b8", // slate-400
  "Autre": "#475569", // slate-600
};

export default function CoutRepartitionChart({ mois }: { mois?: string }) {
  const { data, isLoading } = useCoutRepartition(mois);

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-white/10 bg-[#1A1D24]/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-transparent"></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-white/10 bg-[#1A1D24]/50">
        <span className="text-gray-500">Aucune dépense enregistrée</span>
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-300">
        Répartition des coûts
      </h3>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius="60%"
              outerRadius="80%"
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.name] || COLORS["Autre"]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                borderColor: "#475569",
                borderRadius: "0.5rem",
                color: "#f1f5f9",
              }}
              itemStyle={{ color: "#f1f5f9" }}
              formatter={(value, name) => [
                `${fmtEuro(Number(value))} (${((Number(value) / total) * 100).toFixed(1)}%)`,
                String(name),
              ]}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: "12px", color: "#94a3b8" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
