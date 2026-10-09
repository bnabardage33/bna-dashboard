"use client";

import React from "react";
import type { RapportConformiteDTU } from "@/lib/terrasse/types";
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";

interface TerrasseConformiteDTUProps {
  conformite: RapportConformiteDTU;
}

export default function TerrasseConformiteDTU({ conformite }: TerrasseConformiteDTUProps) {
  const { statutGlobal, controles, nbConformes, nbAvertissements, nbNonConformes } = conformite;

  return (
    <div className="space-y-4">
      {/* Synthèse globale */}
      <div
        className={`rounded-2xl border p-5 shadow-xl transition-all ${
          statutGlobal === "conforme"
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-[#121417]"
            : statutGlobal === "avertissement"
            ? "border-amber-500/30 bg-gradient-to-br from-amber-950/40 to-[#121417]"
            : "border-red-500/30 bg-gradient-to-br from-red-950/40 to-[#121417]"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-xl ${
                statutGlobal === "conforme"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : statutGlobal === "avertissement"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Audit Normatif & DTU 51.4
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-3xs font-bold uppercase ${
                    statutGlobal === "conforme"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : statutGlobal === "avertissement"
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      : "bg-red-500/20 text-red-400 border border-red-500/40"
                  }`}
                >
                  {statutGlobal === "conforme"
                    ? "✓ Conforme DTU 51.4"
                    : statutGlobal === "avertissement"
                    ? "⚠️ Avertissement"
                    : "✕ Non Conforme"}
                </span>
              </div>
              <h2 className="text-sm font-bold text-white mt-0.5">
                {statutGlobal === "conforme"
                  ? "Tous les points de conception respectent les exigences du DTU 51.4"
                  : statutGlobal === "avertissement"
                  ? "L'ouvrage est stable mais présente des points d'attention recommandés"
                  : "Des non-conformités critiques doivent être corrigées avant validation"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-2xs font-semibold text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 size={13} />
              {nbConformes} conformes
            </div>
            {nbAvertissements > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-2xs font-semibold text-amber-400 border border-amber-500/20">
                <AlertTriangle size={13} />
                {nbAvertissements} attention
              </div>
            )}
            {nbNonConformes > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1 text-2xs font-semibold text-red-400 border border-red-500/20">
                <XCircle size={13} />
                {nbNonConformes} non-conformes
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Liste des points de contrôle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {controles.map((c) => (
          <div
            key={c.id}
            className={`rounded-2xl border p-4 bg-[#14161b] transition-all ${
              c.statut === "conforme"
                ? "border-emerald-500/20 hover:border-emerald-500/40"
                : c.statut === "avertissement"
                ? "border-amber-500/20 hover:border-amber-500/40"
                : "border-red-500/30 hover:border-red-500/50"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {c.statut === "conforme" && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                )}
                {c.statut === "avertissement" && (
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                {c.statut === "non_conforme" && (
                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                )}
                <h4 className="text-xs font-bold text-white">{c.titre}</h4>
              </div>
              <span
                className={`text-3xs font-semibold uppercase px-2 py-0.5 rounded-full ${
                  c.statut === "conforme"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : c.statut === "avertissement"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {c.valeurConstatee}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 mt-2">
              <p className="text-3xs font-medium text-gray-400">
                {c.regleDtu}
              </p>
              {c.sourceNormative && (
                <span className="shrink-0 rounded bg-sky-950/40 px-1.5 py-0.5 text-3xs font-mono text-sky-400 border border-sky-800/40">
                  {c.sourceNormative}
                </span>
              )}
            </div>

            <div className="mt-2.5 rounded-xl bg-black/30 p-2.5 border border-white/5">
              <p className="text-3xs text-gray-300">
                <span className="font-semibold text-gray-400">Action recommandée :</span> {c.recommandation}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
