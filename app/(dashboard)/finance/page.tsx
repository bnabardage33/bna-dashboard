"use client";

import KpiGrid from "./components/KpiGrid";
import ChantierRentabilite from "./components/ChantierRentabilite";
import TvaWidget from "./components/TvaWidget";
import TresorerieWidget from "./components/TresorerieWidget";
import UrsaafWidget from "./components/UrsaafWidget";
import Link from "next/link";
import { Clock, Receipt, TrendingUp, FileText, History, Download, Users } from "lucide-react";
import CaEvolutionChart from "./components/charts/CaEvolutionChart";
import CoutRepartitionChart from "./components/charts/CoutRepartitionChart";
import TresoreriePrevisionChart from "./components/charts/TresoreriePrevisionChart";
import MargeParTypeChart from "./components/charts/MargeParTypeChart";
import RapportMensuelPDF from "./components/exports/RapportMensuelPDF";
import { useState } from "react";
import { genererExportComptaCSV } from "@/lib/csvExport";

export default function FinanceDashboard() {
  const [printingRapport, setPrintingRapport] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [selectedMois, setSelectedMois] = useState(
    new Date().toISOString().slice(0, 7)
  );

  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      await genererExportComptaCSV(selectedMois);
    } catch (error) {
      console.error("Erreur export CSV:", error);
      alert("Erreur lors de l'export CSV");
    } finally {
      setExportingCsv(false);
    }
  };

  const moisAffiche = new Date(selectedMois + "-01").toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 text-slate-100">
      {printingRapport && (
        <div className="hidden print:block">
          <RapportMensuelPDF onReady={() => {
            window.print();
            setPrintingRapport(false);
          }} />
        </div>
      )}
      
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold text-slate-100">
              Finance & Pilotage
            </h1>
            <div className="flex items-center gap-4 mt-2">
              <input
                type="month"
                value={selectedMois}
                onChange={(e) => setSelectedMois(e.target.value)}
                className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 outline-none focus:border-cyan-400"
              />
              <button
                onClick={() => setPrintingRapport(true)}
                disabled={printingRapport}
                className="flex items-center gap-2 rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                Rapport mensuel
              </button>
              <button
                onClick={handleExportCsv}
                disabled={exportingCsv}
                className="flex items-center gap-2 rounded border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                title="Export Tableur pour le Comptable"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/finance/historique"
              className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
              title="Historique & Corrections"
            >
              <History className="h-4 w-4" />
              Historique
            </Link>
            <Link
              href="/finance/saisie/pointage"
              className="flex items-center gap-2 rounded-lg border border-slate-600 bg-cyan-600/10 px-4 py-2 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-600/20"
            >
              <Clock className="h-4 w-4" />
              + Pointage
            </Link>
            <Link
              href="/finance/saisie/feuille-heures"
              className="flex items-center gap-2 rounded-lg border border-slate-600 bg-emerald-600/10 px-4 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-600/20"
            >
              <Users className="h-4 w-4" />
              Feuille d'heures
            </Link>
            <Link
              href="/finance/saisie/depense"
              className="flex items-center gap-2 rounded-lg border border-slate-600 bg-rose-600/10 px-4 py-2 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-600/20"
            >
              <Receipt className="h-4 w-4" />
              + Dépense
            </Link>
            <Link
              href="/finance/saisie/avancement"
              className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              <TrendingUp className="h-4 w-4" />
              Avancement
            </Link>
          </div>
        </header>

        <section>
          <KpiGrid mois={selectedMois} />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChantierRentabilite />
          </div>
          <div className="flex flex-col gap-6">
            <TvaWidget mois={selectedMois} />
            <TresorerieWidget />
            <UrsaafWidget mois={selectedMois} />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Analyses & Tendances</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CaEvolutionChart endMois={selectedMois} />
            <CoutRepartitionChart mois={selectedMois} />
            <TresoreriePrevisionChart />
            <MargeParTypeChart />
          </div>
        </section>
      </div>
    </div>
  );
}
