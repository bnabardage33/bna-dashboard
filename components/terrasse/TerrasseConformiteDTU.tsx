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
    <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all">
      {/* 1. Synthèse globale & En-tête cliquable (Volet déroulant / Accordéon) */}
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full text-left flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between group cursor-pointer focus:outline-hidden"
        aria-expanded={ouvert}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B] group-hover:bg-[#B85B2B]/15 transition">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#B85B2B]">
                Audit Normatif & DTU 51.4
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-3xs font-bold ${
                  statutGlobal === "conforme"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : statutGlobal === "avertissement"
                    ? "bg-amber-50 text-amber-900 border border-amber-200"
                    : "bg-red-50 text-red-900 border border-red-200"
                }`}
              >
                {statutGlobal === "conforme"
                  ? "✓ Conforme DTU 51.4"
                  : statutGlobal === "avertissement"
                  ? "⚠️ Avertissement"
                  : "✕ Non Conforme"}
              </span>
            </div>
            <p className="text-xs font-semibold text-[#23272B] truncate mt-0.5">
              {statutGlobal === "conforme"
                ? "Tous les points de conception respectent les exigences du DTU 51.4"
                : statutGlobal === "avertissement"
                ? "Points d'attention recommandés sur la conception"
                : "Non-conformités critiques à corriger"}
            </p>
          </div>
        </div>

        {/* Compteurs & Déclencheur du volet */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F0F0F0]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-2xs font-bold text-emerald-800 border border-emerald-200">
              <CheckCircle2 size={11} />
              {nbConformes} conformes
            </span>
            {nbAvertissements > 0 && (
              <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-2xs font-bold text-amber-900 border border-amber-200">
                <AlertTriangle size={11} />
                {nbAvertissements} attention
              </span>
            )}
            {nbNonConformes > 0 && (
              <span className="flex items-center gap-1 rounded-lg bg-red-50 px-2 py-0.5 text-2xs font-bold text-red-900 border border-red-200">
                <XCircle size={11} />
                {nbNonConformes} non-conf.
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-xs font-bold text-[#777777] group-hover:text-[#B85B2B] transition pl-2">
            <span className="hidden md:inline text-3xs uppercase tracking-wider">
              {ouvert ? "Masquer" : "Détails"}
            </span>
            <ChevronDown
              size={16}
              className={`transform transition-transform duration-200 ${
                ouvert ? "rotate-180 text-[#B85B2B]" : ""
              }`}
            />
          </div>
        </div>
      </button>

      {/* 2. Volet déroulant : Les 7 règles DTU présentées en lignes compactes sans sous-cartes */}
      {ouvert && (
        <div className="mt-4 pt-3 border-t border-[#F0F0F0] space-y-2 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-3xs font-semibold uppercase text-[#777777] px-2">
            <span>Points de contrôle ({controles.length})</span>
            <span>Valeur constatée / Exigence DTU</span>
          </div>

          <div className="divide-y divide-[#F0F0F0] rounded-xl border border-[#E5E5E5] bg-[#FBFBFA] overflow-hidden">
            {controles.map((c) => (
              <div
                key={c.id}
                className="p-3 sm:px-4 sm:py-3 transition-colors hover:bg-white"
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
                        <h4 className="text-xs font-bold text-[#23272B]">{c.titre}</h4>
                        {c.sourceNormative && (
                          <span className="rounded bg-white px-1.5 py-0.5 text-3xs font-mono text-[#777777] border border-[#E5E5E5]">
                            {c.sourceNormative}
                          </span>
                        )}
                      </div>
                      <p className="text-3xs text-[#777777] mt-0.5 leading-relaxed">
                        {c.regleDtu}
                      </p>
                    </div>
                  </div>

                  {/* Badge de valeur mesurée */}
                  <span
                    className={`shrink-0 text-3xs font-bold px-2 py-1 rounded-md border ${
                      c.statut === "conforme"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : c.statut === "avertissement"
                        ? "bg-amber-50 text-amber-900 border-amber-200"
                        : "bg-red-50 text-red-900 border-red-200"
                    }`}
                  >
                    {c.valeurConstatee}
                  </span>
                </div>

                {/* Ligne d'action recommandée (compacte) */}
                <div className="mt-2 pl-6.5 text-3xs text-[#555555]">
                  <span className="font-bold text-[#23272B]">Action recommandée : </span>
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
