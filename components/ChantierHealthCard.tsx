"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp, CheckCircle, Info, Activity, AlertOctagon } from "lucide-react";
import { ChantierHealthData, ChantierHealthAnalysis } from "@/lib/bna-analyzer";

export default function ChantierHealthCard({ 
  chantierName, 
  chantierData 
}: { 
  chantierName: string;
  chantierData: ChantierHealthData 
}) {
  const [analysis, setAnalysis] = useState<ChantierHealthAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const res = await fetch("/api/analyze-chantier", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chantierData)
        });
        
        if (!res.ok) throw new Error("Erreur de diagnostic");
        const json = await res.json();
        setAnalysis(json.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    if (chantierData) {
      fetchAnalysis();
    }
  }, [chantierData]);

  if (loading) {
    return (
      <div className="bg-[#1A1D24] border border-white/10 rounded-xl p-5 flex flex-col gap-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-5 bg-slate-700 rounded w-1/3"></div>
          <div className="h-6 bg-slate-700 rounded-full w-24"></div>
        </div>
        <div className="h-4 bg-slate-700 rounded w-3/4"></div>
        <div className="space-y-2 mt-4">
          <div className="h-3 bg-slate-700 rounded w-full"></div>
          <div className="h-3 bg-slate-700 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="bg-[#1A1D24] border border-white/10 rounded-xl p-5 text-center text-gray-500 text-sm">
        Impossible de charger le diagnostic pour {chantierName}
      </div>
    );
  }

  // Configurations visuelles selon le statut
  let borderColor = "border-white/10";
  let glowColor = "";
  let Icon = Activity;
  let iconColor = "text-gray-400";

  switch(analysis.statusColor) {
    case "🔴": // CRITIQUE
      borderColor = "border-rose-500/50";
      glowColor = "shadow-[0_0_15px_rgba(244,63,94,0.2)]";
      Icon = AlertOctagon;
      iconColor = "text-rose-500";
      break;
    case "🟠": // ANOMALIE
      borderColor = "border-orange-500/40";
      glowColor = "shadow-[0_0_15px_rgba(249,115,22,0.15)]";
      Icon = AlertTriangle;
      iconColor = "text-orange-500";
      break;
    case "🟡": // A SURVEILLER
      borderColor = "border-yellow-500/30";
      Icon = AlertTriangle;
      iconColor = "text-yellow-500";
      break;
    case "🟢": // NORMAL
      borderColor = "border-emerald-500/30";
      Icon = CheckCircle;
      iconColor = "text-emerald-500";
      break;
    case "🔵": // INHABITUELLE
      borderColor = "border-slate-500/50";
      glowColor = "shadow-[0_0_15px_rgba(148,163,184,0.2)]";
      Icon = TrendingUp;
      iconColor = "text-slate-400";
      break;
    case "⚪": // INCOHERENTE
    default:
      borderColor = "border-gray-500/50";
      Icon = Info;
      iconColor = "text-gray-400";
      break;
  }

  return (
    <div className={`bg-[#1A1D24] border ${borderColor} rounded-xl p-5 transition-all ${glowColor}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h3 className="font-bold text-white text-lg truncate pr-4" title={chantierName}>
          {chantierName}
        </h3>
        <div className="flex items-center gap-2 shrink-0 bg-[#0B0F19] px-3 py-1.5 rounded-full border border-white/5">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${iconColor}`}>
            {analysis.statusLabel}
          </span>
        </div>
      </div>
      
      <p className="text-sm text-gray-300 font-medium mb-4 leading-relaxed">
        {analysis.summary}
      </p>

      {analysis.reasons && analysis.reasons.length > 0 && analysis.statusColor !== "🟢" && (
        <ul className="space-y-2 mt-2 pt-4 border-t border-white/5">
          {analysis.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
              <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-gray-600" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Composant interne pour l'icône, ou on peut utiliser un import de lucide-react si non fourni au dessus
function ArrowRight({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14"></path>
      <path d="m12 5 7 7-7 7"></path>
    </svg>
  );
}
