import Link from 'next/link';
import { ArrowLeft, CalendarDays, HardHat } from 'lucide-react';

export default function PlanningPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 text-white">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#D96B27] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour à l&apos;accueil
        </Link>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1B1511]/90 p-6 sm:p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D96B27]/15 border border-[#D96B27]/40">
            <CalendarDays className="h-5 w-5 text-[#D96B27]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#D96B27]">
              Module Terrain &amp; Bureau
            </p>
            <h1 className="text-xl font-bold text-white">Planning chantiers &amp; interventions</h1>
          </div>
        </div>

        <p className="text-sm text-white/70 leading-relaxed mb-6">
          L&apos;espace planning centralisé (vue calendrier des équipes, pose bardage, terrasse,
          clôture et interventions SAV) est prêt à être connecté au module complet.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/terrain/chantier"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#D96B27] to-[#B85316] px-4 py-2.5 text-xs font-semibold text-white hover:from-[#E57732] hover:to-[#C95D1B] transition-all"
          >
            <HardHat className="h-4 w-4" />
            Voir les chantiers en cours
          </Link>
          <Link
            href="/terrain/meteo"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#120F0D] px-4 py-2.5 text-xs font-semibold text-white/85 hover:border-[#D96B27]/60 transition-colors"
          >
            Consulter la météo chantier
          </Link>
        </div>
      </div>
    </div>
  );
}
