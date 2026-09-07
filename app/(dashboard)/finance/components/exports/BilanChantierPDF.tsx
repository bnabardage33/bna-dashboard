"use client";

import { useEffect } from "react";
import { fmtEuro, fmtPct } from "@/lib/financeCalculs";
import type { ChantierBilan } from "@/types/finance";

export default function BilanChantierPDF({
  chantier,
  onReady,
}: {
  chantier: ChantierBilan;
  onReady: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onReady();
    }, 500);
    return () => clearTimeout(timer);
  }, [onReady]);

  if (!chantier) return null;

  const dateStr = new Date().toLocaleDateString("fr-FR");

  return (
    <div id="document-pdf-content" className="mx-auto max-w-4xl bg-[#1A1D24] p-8 text-white text-sm leading-relaxed font-sans">
      {/* En-tête */}
      <div className="flex justify-between items-start mb-8 border-b-2 border-slate-900 pb-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Bilan Analytique</h1>
          <p className="text-lg text-slate-600 font-semibold mt-1">Chantier : {chantier.nom}</p>
          <p className="text-sm text-gray-500 mt-1">Client : {chantier.client_nom}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-white">BNA BARDAGE</div>
          <p className="text-sm text-gray-500">Édité le {dateStr}</p>
        </div>
      </div>

      {/* Synthèse */}
      <h2 className="text-base font-bold text-gray-300 uppercase border-b border-white/10 pb-1 mb-4">Synthèse Financière</h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-transparent p-4 border border-white/10 rounded">
          <p className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wide">Recettes</p>
          <div className="flex justify-between items-end">
            <span className="text-gray-400">Prix de Vente HT</span>
            <span className="text-xl font-bold text-white">{fmtEuro(chantier.prix_vente_ht)}</span>
          </div>
        </div>
        <div className="bg-transparent p-4 border border-white/10 rounded">
          <p className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wide">Dépenses</p>
          <div className="flex justify-between items-end">
            <span className="text-gray-400">Coût Direct Total</span>
            <span className="text-xl font-bold text-rose-600">-{fmtEuro(chantier.cout_direct_total)}</span>
          </div>
        </div>
      </div>

      {/* Marge */}
      <div className="bg-transparent p-4 border border-slate-300 rounded mb-8 flex justify-between items-center">
        <div>
          <p className="text-sm font-bold text-gray-400 uppercase">Marge Brute Dégagée</p>
          <p className="text-3xl font-black text-red-400 mt-1">{fmtEuro(chantier.marge_brute)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-gray-400 uppercase">Taux de Marge</p>
          <p className="text-3xl font-black text-red-400 mt-1">{fmtPct(chantier.taux_marge_pct)}</p>
        </div>
      </div>

      {/* Détail des Coûts */}
      <h2 className="text-base font-bold text-gray-300 uppercase border-b border-white/10 pb-1 mb-4">Détail des Coûts Directs</h2>
      <table className="w-full text-left text-sm border-collapse mb-12">
        <thead>
          <tr className="bg-transparent border-b border-slate-300">
            <th className="p-2 font-semibold">Poste de Dépense</th>
            <th className="p-2 font-semibold text-right">Montant HT</th>
            <th className="p-2 font-semibold text-right">% du coût total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-white/10">
            <td className="p-2">Matériaux</td>
            <td className="p-2 text-right">{fmtEuro(chantier.cout_materiaux)}</td>
            <td className="p-2 text-right text-gray-500">{fmtPct((chantier.cout_materiaux / chantier.cout_direct_total) * 100)}</td>
          </tr>
          <tr className="border-b border-white/10">
            <td className="p-2">Main d'œuvre</td>
            <td className="p-2 text-right">{fmtEuro(chantier.cout_main_oeuvre)}</td>
            <td className="p-2 text-right text-gray-500">{fmtPct((chantier.cout_main_oeuvre / chantier.cout_direct_total) * 100)}</td>
          </tr>
          <tr className="border-b border-white/10">
            <td className="p-2">Sous-traitance</td>
            <td className="p-2 text-right">{fmtEuro(chantier.cout_sous_traitance)}</td>
            <td className="p-2 text-right text-gray-500">{fmtPct((chantier.cout_sous_traitance / chantier.cout_direct_total) * 100)}</td>
          </tr>
          <tr className="border-b border-white/10">
            <td className="p-2">Location</td>
            <td className="p-2 text-right">{fmtEuro(chantier.cout_location)}</td>
            <td className="p-2 text-right text-gray-500">{fmtPct((chantier.cout_location / chantier.cout_direct_total) * 100)}</td>
          </tr>
          <tr className="border-b border-slate-300 font-bold">
            <td className="p-2 uppercase text-gray-400">Total</td>
            <td className="p-2 text-right text-rose-600">{fmtEuro(chantier.cout_direct_total)}</td>
            <td className="p-2 text-right">100.0%</td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-gray-400 font-medium">
        Document analytique interne — Ne pas diffuser
      </div>
    </div>
  );
}
