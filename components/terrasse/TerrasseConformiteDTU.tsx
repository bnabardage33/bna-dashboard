"use client";

import React, { useState } from "react";
import type { RapportConformiteDTU } from "@/lib/terrasse/types";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";

interface TerrasseConformiteDTUProps {
  conformite: RapportConformiteDTU;
}

export default function TerrasseConformiteDTU({ conformite }: TerrasseConformiteDTUProps) {
  const { statutGlobal, controles, nbConformes, nbAvertissements, nbNonConformes } = conformite;
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-4 sm:p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all">
      {/* 1. Synthèse globale & En-tête cliquable (Volet déroulant / Accordéon) */}
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full text-left flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between group cursor-pointer focus:outline-hidden"
        aria-expanded={ouvert}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27] group-hover:bg-[#D96B27]/15 transition">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#D96B27]">
                Audit Normatif & DTU 51.4
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-3xs font-bold ${
                  statutGlobal === "conforme"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-200"
                    : statutGlobal === "avertissement"
                    ? "bg-amber-500/15 text-amber-900 border border-amber-200"
                    : "bg-red-500/15 text-red-900 border border-red-200"
                }`}
              >
                {statutGlobal === "conforme"
                  ? "✓ Conforme DTU 51.4"
                  : statutGlobal === "avertissement"
                  ? "⚠️ Avertissement"
                  : "✕ Non Conforme"}
              </span>
            </div>
            <p className="text-xs font-semibold text-[#F5EFEA] truncate mt-0.5">
              {statutGlobal === "conforme"
                ? "Tous les points de conception respectent les exigences du DTU 51.4"
                : statutGlobal === "avertissement"
                ? "Points d'attention recommandés sur la conception"
                : "Non-conformités critiques à corriger"}
            </p>
          </div>
        </div>

        {/* Compteurs & Déclencheur du volet */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-0.5 text-2xs font-bold text-emerald-300 border border-emerald-200">
              <CheckCircle2 size={11} />
              {nbConformes} conformes
            </span>
            {nbAvertissements > 0 && (
              <span className="flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-0.5 text-2xs font-bold text-amber-900 border border-amber-200">
                <AlertTriangle size={11} />
                {nbAvertissements} attention
              </span>
            )}
            {nbNonConformes > 0 && (
              <span className="flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-0.5 text-2xs font-bold text-red-900 border border-red-200">
                <XCircle size={11} />
                {nbNonConformes} non-conf.
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs font-bold text-[#8E7F74] group-hover:text-[#D96B27] transition pl-2">
            <span className="hidden md:inline text-3xs uppercase tracking-wider">
              {ouvert ? "Masquer" : "Détails"}
            </span>
            <ChevronDown
              size={16}
              className={`transform transition-transform duration-200 ${
                ouvert ? "rotate-180 text-[#D96B27]" : ""
              }`}
            />
          </div>
        </div>
      </button>

      {/* 2. Volet déroulant : Les 7 règles DTU présentées en lignes compactes sans sous-cartes */}
      {ouvert && (
        <div className="mt-4 pt-3 border-t border-white/10 space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-3xs font-semibold uppercase text-[#8E7F74] px-2">
            <span>Points de contrôle ({controles.length})</span>
            <span>Valeur constatée / Exigence DTU</span>
          </div>

          <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-[#FBFBFA] overflow-hidden">
            {controles.map((c) => (
              <div
                key={c.id}
                className="p-3 sm:px-4 sm:py-3 transition-colors hover:bg-[#221B17]"
              >
                {/* Ligne principale : Statut + Titre + Valeur mesurée */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="pt-0.5 shrink-0">
                      {c.statut === "conforme" && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                      {c.statut === "avertissement" && (
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      )}
                      {c.statut === "non_conforme" && (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-bold text-[#F5EFEA]">{c.titre}</h4>
                        {c.sourceNormative && (
                          <span className="rounded bg-[#1B1511] px-1.5 py-0.5 text-3xs font-mono text-[#8E7F74] border border-white/10">
                            {c.sourceNormative}
                          </span>
                        )}
                      </div>
                      <p className="text-3xs text-[#8E7F74] mt-0.5 leading-relaxed">
                        {c.regleDtu}
                      </p>
                    </div>
                  </div>

                  {/* Badge de valeur mesurée */}
                  <span
                    className={`shrink-0 text-3xs font-bold px-2 py-1 rounded-md border ${
                      c.statut === "conforme"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-200"
                        : c.statut === "avertissement"
                        ? "bg-amber-500/15 text-amber-900 border-amber-200"
                        : "bg-red-500/15 text-red-900 border-red-200"
                    }`}
                  >
                    {c.valeurConstatee}
                  </span>
                </div>

                {/* Ligne d'action recommandée (compacte) */}
                <div className="mt-2 pl-6.5 text-3xs text-[#B8A99E]">
                  <span className="font-bold text-[#F5EFEA]">Action recommandée : </span>
                  <span>{c.recommandation}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
