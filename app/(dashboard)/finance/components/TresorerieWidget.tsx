"use client";

import { useState } from "react";
import { useTresorerie, useParametreFinance } from "@/hooks/useFinance";
import { fmtEuro, fmtDate } from "@/lib/financeCalculs";
import { Landmark, AlertTriangle, PenLine } from "lucide-react";

export default function TresorerieWidget() {
  const { factures, achats, masseSalariale, isLoading: tresoLoading } = useTresorerie();
  const { valeur: soldeBancaire, updateValeur, isLoading: paramLoading } = useParametreFinance("solde_bancaire");

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const isLoading = tresoLoading || paramLoading;

  if (isLoading) {
    return <div className="animate-pulse h-64 rounded-xl border border-slate-700 bg-slate-800/50"></div>;
  }

  const handleSave = async () => {
    const val = parseFloat(inputValue);
    if (!isNaN(val)) {
      await updateValeur(val);
    }
    setIsEditing(false);
  };

  const totalEntrees = factures.reduce((sum, f) => sum + f.montant_ttc, 0);
  const totalSortiesAchats = achats.reduce((sum, a) => sum + a.montant_ttc, 0);
  const estimationUrssaf = masseSalariale * 0.47;
  const totalSorties = totalSortiesAchats + estimationUrssaf;

  const soldeInitial = soldeBancaire ?? 0;
  const soldePrevisionnel = soldeInitial + totalEntrees - totalSorties;
  const enDecouvert = soldePrevisionnel < 0;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 flex flex-col h-full">
      <div className="flex items-center gap-3 border-b border-slate-700 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
          <Landmark className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-100">
          Trésorerie prévisionnelle
        </h2>
      </div>

      <div className="flex flex-col gap-4 p-5 flex-1">
        {/* Solde actuel */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Solde actuel</span>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="w-24 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-400"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  className="text-xs rounded-md bg-cyan-500/20 text-cyan-400 px-2 py-1 font-medium hover:bg-cyan-500/30"
                >
                  OK
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-slate-100">
                  {soldeBancaire === null ? "—" : fmtEuro(soldeBancaire)}
                </span>
                <button
                  onClick={() => {
                    setInputValue(soldeBancaire === null ? "" : soldeBancaire.toString());
                    setIsEditing(true);
                  }}
                  className="text-slate-500 hover:text-cyan-400 transition-colors"
                  title="Saisir le solde"
                >
                  {soldeBancaire === null ? (
                    <span className="text-xs rounded-md bg-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-600">Saisir</span>
                  ) : (
                    <PenLine className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Flux 30j */}
        <div className="rounded-lg bg-slate-900/50 p-3 space-y-3">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Flux à 30 jours</h3>
          
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">Entrées (Factures)</span>
              <span className="text-emerald-400 font-medium">+{fmtEuro(totalEntrees)}</span>
            </div>
            {factures.slice(0, 3).map((f) => (
              <div key={f.id} className="flex justify-between text-xs text-slate-500 pl-2 gap-2">
                <span className="truncate max-w-[110px]">{f.client_nom}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {f.statut === "payee" && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Payée
                    </span>
                  )}
                  <span>{f.date_echeance ? fmtDate(f.date_echeance) : ""}</span>
                </span>
              </div>
            ))}
            {factures.length > 3 && (
              <div className="text-xs text-slate-600 pl-2">...et {factures.length - 3} autre(s)</div>
            )}
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-700/50">
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">Sorties (Achats + URSSAF)</span>
              <span className="text-rose-400 font-medium">-{fmtEuro(totalSorties)}</span>
            </div>
          </div>
        </div>

        <div className="my-1 border-t border-slate-700"></div>

        {/* Solde prévisionnel */}
        <div className="flex items-end justify-between">
          <span className="text-sm font-semibold uppercase text-slate-400">
            Solde prévisionnel
          </span>
          <span className={`text-2xl font-bold ${enDecouvert ? 'text-rose-400' : 'text-emerald-400'}`}>
            {fmtEuro(soldePrevisionnel)}
          </span>
        </div>

        {/* Alerte */}
        {enDecouvert && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-medium text-rose-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>Découvert prévisionnel de {fmtEuro(Math.abs(soldePrevisionnel))}</span>
          </div>
        )}
      </div>
    </div>
  );
}
