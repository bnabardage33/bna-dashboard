"use client";

import { useRentabiliteChantiers } from "@/hooks/useFinance";
import {
  METIER_BADGE_CONFIG,
  normaliserMetierCode,
  type MetierCode,
  type MetierFiltre,
} from "@/lib/metierBadge";
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

const ORDRE_METIERS: MetierCode[] = ["bardage", "terrasse", "cloture"];

export default function MargeParTypeChart({
  metierFilter = "tous",
}: {
  metierFilter?: MetierFiltre;
}) {
  const { rentabilites, isLoading } = useRentabiliteChantiers();

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-white/10 bg-[#1B1511]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#D96B27]/30 border-t-[#D96B27]" />
      </div>
    );
  }

  const liste =
    metierFilter === "tous"
      ? rentabilites
      : rentabilites.filter((r) => normaliserMetierCode(r.metier) === metierFilter);

  if (!liste || liste.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-white/10 bg-[#1B1511]">
        <span className="text-xs text-[#8E7F74]">Aucun chantier analysable</span>
      </div>
    );
  }

  const grouped: Record<MetierCode, { total_vente: number; total_marge: number; nb: number }> = {
    bardage: { total_vente: 0, total_marge: 0, nb: 0 },
    terrasse: { total_vente: 0, total_marge: 0, nb: 0 },
    cloture: { total_vente: 0, total_marge: 0, nb: 0 },
  };

  liste.forEach((r) => {
    const code = normaliserMetierCode(r.metier);
    grouped[code].total_vente += r.prix_vente_ht;
    grouped[code].total_marge += r.marge_brute;
    grouped[code].nb += 1;
  });

  const data = ORDRE_METIERS.filter(
    (code) => grouped[code].total_vente > 0 || grouped[code].nb > 0
  ).map((code) => ({
    code,
    type: METIER_BADGE_CONFIG[code].label,
    taux_marge:
      grouped[code].total_vente > 0
        ? (grouped[code].total_marge / grouped[code].total_vente) * 100
        : 0,
    color: METIER_BADGE_CONFIG[code].barColor,
  }));

  return (
    <div className="rounded-xl border border-white/10 bg-[#1B1511] p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#F5EFEA]">
          Marge moyenne par métier
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-[#B8A99E]">
          {ORDRE_METIERS.map((code) => (
            <span key={code} className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: METIER_BADGE_CONFIG[code].barColor }}
              />
              {METIER_BADGE_CONFIG[code].label}
            </span>
          ))}
        </div>
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barSize={44}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="type"
              stroke="#B8A99E"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#B8A99E"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `${Number(val).toFixed(0)}%`}
            />
            <Tooltip
              formatter={(value: unknown) => [`${Number(value).toFixed(1)} %`, "Taux de marge"]}
              contentStyle={{
                backgroundColor: "#120F0D",
                borderColor: "rgba(255,255,255,0.15)",
                borderRadius: "12px",
                color: "#F5EFEA",
                fontSize: "12px",
              }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
            <Bar dataKey="taux_marge" radius={[8, 8, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.code} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
