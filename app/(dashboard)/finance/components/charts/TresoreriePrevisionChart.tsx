"use client";

import { useTresoreriePrevision } from "@/hooks/useFinance";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export default function TresoreriePrevisionChart() {
  const { data, isLoading } = useTresoreriePrevision(90);

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-white/10 bg-[#1E1E1E]/50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-transparent"></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-white/10 bg-[#1E1E1E]/50">
        <span className="text-gray-500">Aucune donnée prévisionnelle</span>
      </div>
    );
  }

  // Créer un gradient de couleur dynamique basé sur les valeurs
  const min = Math.min(...data.map(d => d.solde));
  const max = Math.max(...data.map(d => d.solde));
  
  // Ratio pour diviser le gradient (0 = tout rouge, 1 = tout vert, entre = transition au niveau du 0)
  const zeroOffset = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);

  return (
    <div className="rounded-xl border border-white/10 bg-[#1E1E1E]/50 p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-300">
        Trésorerie prévisionnelle (90 jours)
      </h3>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset={zeroOffset} stopColor="#34d399" stopOpacity={0.2} /> {/* emerald-400 */}
                <stop offset={zeroOffset} stopColor="#fb7185" stopOpacity={0.2} /> {/* rose-400 */}
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#94a3b8"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              minTickGap={30}
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
                backgroundColor: "#1e293b",
                borderColor: "#475569",
                borderRadius: "0.5rem",
                color: "#f1f5f9",
              }}
              formatter={(value) => [
                <span key="solde" className={Number(value) >= 0 ? "text-gray-400" : "text-rose-400"}>
                  {fmtEuro(Number(value))}
                </span>,
                "Solde",
              ]}
              labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
            />
            <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="solde"
              stroke="#34d399" // Fallback stroke if gradient on stroke doesn't work well
              fill="url(#splitColor)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
