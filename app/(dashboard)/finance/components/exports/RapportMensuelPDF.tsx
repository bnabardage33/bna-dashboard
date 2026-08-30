"use client";

import { useEffect } from "react";
import {
  useKpiMensuel,
  useRentabiliteChantiers,
  useTvaMensuelle,
  useTresoreriePrevision,
} from "@/hooks/useFinance";
import { fmtEuro, fmtPct } from "@/lib/financeCalculs";

export default function RapportMensuelPDF({ onReady }: { onReady: () => void }) {
  const { kpis, isLoading: kpiLoading } = useKpiMensuel();
  const { rentabilites, isLoading: rentLoading } = useRentabiliteChantiers();
  const { tva, isLoading: tvaLoading } = useTvaMensuelle();
  const { data: tresoData, isLoading: tresoLoading } = useTresoreriePrevision(30);

  const isLoading = kpiLoading || rentLoading || tvaLoading || tresoLoading;

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        onReady();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, onReady]);

  if (isLoading || !kpis) return null;

  const moisAffiche = new Date().toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const soldeActuel = tresoData && tresoData.length > 0 ? tresoData[0].solde : 0;
  const soldePrevisionnel = tresoData && tresoData.length > 0 ? tresoData[tresoData.length - 1].solde : 0;

  return (
    <div id="document-pdf-content" className="mx-auto max-w-4xl bg-[#1A1D24] p-8 text-white text-sm leading-relaxed font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">Rapport Financier</h1>
          <p className="text-gray-500 font-medium capitalize">{moisAffiche}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-white tracking-tighter">BNA BARDAGE</div>
          <p className="text-xs text-gray-500">Édité le {new Date().toLocaleDateString("fr-FR")}</p>
        </div>
      </div>

      {/* Section KPIs */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-300 mb-3 uppercase tracking-wide border-b border-white/10 pb-1">Indicateurs Clés (Mois en cours)</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-transparent p-4 rounded-lg border border-white/10">
            <p className="text-xs text-gray-500 font-semibold mb-1">CA Facturé HT</p>
            <p className="text-xl font-black text-white">{fmtEuro(kpis.ca_facture_ht)}</p>
          </div>
          <div className="bg-transparent p-4 rounded-lg border border-white/10">
            <p className="text-xs text-gray-500 font-semibold mb-1">Dépenses</p>
            <p className="text-xl font-black text-rose-600">-{fmtEuro(kpis.depenses_total)}</p>
          </div>
          <div className="bg-transparent p-4 rounded-lg border border-white/10">
            <p className="text-xs text-gray-500 font-semibold mb-1">Marge Brute</p>
            <p className="text-xl font-black text-red-400">{fmtEuro(kpis.marge_brute)}</p>
            <p className="text-xs font-bold text-red-400">{fmtPct(kpis.taux_marge_pct)}</p>
          </div>
          <div className="bg-transparent p-4 rounded-lg border border-white/10">
            <p className="text-xs text-gray-500 font-semibold mb-1">Reste à facturer</p>
            <p className="text-xl font-black text-white">{fmtEuro(kpis.reste_a_facturer)}</p>
          </div>
        </div>
      </div>

      {/* Section Rentabilité */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-300 mb-3 uppercase tracking-wide border-b border-white/10 pb-1">Rentabilité des Chantiers Actifs</h2>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-transparent text-slate-600">
              <th className="p-2 font-bold border-b border-slate-300">Chantier</th>
              <th className="p-2 font-bold border-b border-slate-300">Client</th>
              <th className="p-2 font-bold border-b border-slate-300 text-right">Prix Vente HT</th>
              <th className="p-2 font-bold border-b border-slate-300 text-right">Coût Direct</th>
              <th className="p-2 font-bold border-b border-slate-300 text-right">Marge Brute</th>
              <th className="p-2 font-bold border-b border-slate-300 text-right">Taux</th>
            </tr>
          </thead>
          <tbody>
            {rentabilites?.map((r, i) => (
              <tr key={i} className="border-b border-white/10">
                <td className="p-2 font-semibold">{r.nom}</td>
                <td className="p-2 text-slate-600">{r.client_nom}</td>
                <td className="p-2 text-right">{fmtEuro(r.prix_vente_ht)}</td>
                <td className="p-2 text-right text-rose-600">-{fmtEuro(r.cout_direct_total)}</td>
                <td className="p-2 text-right font-bold">{fmtEuro(r.marge_brute)}</td>
                <td className="p-2 text-right font-bold text-red-400">{fmtPct(r.taux_marge_pct)}</td>
              </tr>
            ))}
            {(!rentabilites || rentabilites.length === 0) && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">Aucun chantier actif trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Grid 2 colonnes: TVA et Trésorerie */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h2 className="text-lg font-bold text-gray-300 mb-3 uppercase tracking-wide border-b border-white/10 pb-1">TVA Mensuelle</h2>
          {tva && (
            <div className="bg-transparent p-4 rounded-lg border border-white/10 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Collectée (20%)</span>
                <span className="font-semibold">{fmtEuro(tva.collectee_20)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Collectée (10%)</span>
                <span className="font-semibold">{fmtEuro(tva.collectee_10)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Collectée (5.5%)</span>
                <span className="font-semibold">{fmtEuro(tva.collectee_5_5)}</span>
              </div>
              <div className="pt-2 border-t border-slate-300 flex justify-between font-bold">
                <span>Total Collectée</span>
                <span>{fmtEuro(tva.collectee_total)}</span>
              </div>
              <div className="flex justify-between text-rose-600 font-bold">
                <span>Total Déductible</span>
                <span>-{fmtEuro(tva.deductible_total)}</span>
              </div>
              <div className="pt-2 border-t border-slate-300 flex justify-between font-black text-sm">
                <span>Solde ({tva.type_solde === "a_payer" ? "À Payer" : "Crédit"})</span>
                <span className={tva.type_solde === "a_payer" ? "text-rose-600" : "text-red-400"}>
                  {fmtEuro(tva.solde)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold text-gray-300 mb-3 uppercase tracking-wide border-b border-white/10 pb-1">Trésorerie Prévisionnelle (30j)</h2>
          <div className="bg-transparent p-4 rounded-lg border border-white/10 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Solde Actuel</span>
              <span className="font-bold text-sm">{fmtEuro(soldeActuel)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Entrées & Sorties (30j)</span>
              <span className="font-semibold">{fmtEuro(soldePrevisionnel - soldeActuel)}</span>
            </div>
            <div className="pt-2 border-t border-slate-300 flex justify-between font-black text-sm">
              <span>Solde Prévisionnel</span>
              <span className={soldePrevisionnel < 0 ? "text-rose-600" : "text-red-400"}>
                {fmtEuro(soldePrevisionnel)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 pt-4 border-t-2 border-slate-900 text-center text-xs text-gray-400 font-medium">
        Document généré automatiquement par BNA Dashboard — Confidentiel
      </div>
    </div>
  );
}
