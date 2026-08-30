"use client";

import { useCaEvolution } from "@/hooks/useFinance";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function CaEvolutionChart({ endMois }: { endMois?: string }) {
  const { data, isLoading } = useCaEvolution(12, endMois);

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
        <span className="text-gray-500">Pas assez d'historique</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-300">
        Évolution CA HT (12 mois)
      </h3>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              padding={{ left: 10, right: 10 }}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k€`}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b", // slate-800
                borderColor: "#475569", // slate-600
                borderRadius: "0.5rem",
                color: "#f1f5f9", // slate-100
              }}
              itemStyle={{ color: "#22d3ee" }} // cyan-400
              formatter={(value: any) => [fmtEuro(Number(value)), "CA HT"]}
              labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
            />
            <Line
              type="monotone"
              dataKey="ca"
              stroke="#22d3ee" // cyan-400
              strokeWidth={3}
              dot={{ r: 4, fill: "#22d3ee", strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "#22d3ee", stroke: "#0f172a", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
