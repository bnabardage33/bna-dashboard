import KpiGrid from "./components/KpiGrid";
import ChantierRentabilite from "./components/ChantierRentabilite";
import TvaWidget from "./components/TvaWidget";
import TresorerieWidget from "./components/TresorerieWidget";
import UrsaafWidget from "./components/UrsaafWidget";
import Link from "next/link";
import { Clock, Receipt, TrendingUp } from "lucide-react";

export default function FinanceDashboard() {
  const moisAffiche = new Date().toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold text-slate-100">
              Finance & Pilotage
            </h1>
            <p className="text-sm font-medium text-slate-400 capitalize">
              {moisAffiche}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/finance/saisie/pointage"
              className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              <Clock className="h-4 w-4" />
              + Pointage
            </Link>
            <Link
              href="/finance/saisie/depense"
              className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
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
          <KpiGrid />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChantierRentabilite />
          </div>
          <div className="flex flex-col gap-6">
            <TvaWidget />
            <TresorerieWidget />
            <UrsaafWidget />
          </div>
        </section>
      </div>
    </div>
  );
}
