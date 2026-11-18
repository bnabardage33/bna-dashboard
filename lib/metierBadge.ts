export type MetierFiltre = "tous" | "bardage" | "terrasse" | "cloture";
export type MetierCode = "bardage" | "terrasse" | "cloture";

export function normaliserMetierCode(metier?: string | null): MetierCode {
  const m = (metier ?? "").toLowerCase();
  if (m.includes("terrasse")) return "terrasse";
  if (m.includes("cloture") || m.includes("clôture")) return "cloture";
  return "bardage";
}

export const METIER_BADGE_CONFIG: Record<
  MetierCode,
  { label: string; badgeClass: string; barColor: string }
> = {
  bardage: {
    label: "Bardage",
    badgeClass: "border-[#D96B27]/40 bg-[#D96B27]/15 text-[#F3A261]",
    barColor: "#D96B27",
  },
  terrasse: {
    label: "Terrasse",
    badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    barColor: "#F59E0B",
  },
  cloture: {
    label: "Clôture",
    badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    barColor: "#10B981",
  },
};
