import KpiGrid from "./components/KpiGrid";
import ChantierRentabilite from "./components/ChantierRentabilite";
import TvaWidget from "./components/TvaWidget";

export default function FinanceDashboard() {
  const moisAffiche = new Date().toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-slate-100">
            Finance & Pilotage
          </h1>
          <p className="text-sm font-medium text-slate-400 capitalize">
            {moisAffiche}
          </p>
        </header>

        <section>
          <KpiGrid />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChantierRentabilite />
          </div>
          <div>
            <TvaWidget />
          </div>
        </section>
      </div>
    </div>
  );
}
