import Link from 'next/link';
import { ArrowRight, Building2, Fence, Layers3, Sparkles } from 'lucide-react';

const METIERS = [
  {
    nom: 'Bardage',
    description: 'Accéder aux chantiers existants depuis le hub commun.',
    icone: Building2,
    href: '/terrain/chantier',
    action: 'Chantiers existants · hub commun',
    accent: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    nom: 'Terrasse',
    description: 'Hub dédié, calepinage 2D/3D DTU 51.4 et suivi d’exécution.',
    icone: Layers3,
    href: '/terrain/terrasse',
    action: 'Chantiers terrasse · hub dédié',
    accent: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    nom: 'Clôture',
    description: 'Hub dédié, calepinage 1 à 4 côtés 2D/3D, redans, soubassement et portillons.',
    icone: Fence,
    href: '/terrain/cloture',
    action: 'Chantiers clôture · hub dédié',
    accent: 'bg-[#B85B2B]/10 text-[#B85B2B] border-[#B85B2B]/25',
  },
] as const;

/** Accueil commun, sans chargement de données métier ni hypothèses de spécialité. */
export default function AccueilProfessionnel({
  titre = 'Accueil',
}: {
  titre?: string;
}) {
  return (
    <div className="space-y-5">
      {/* En-tête blanc unifié */}
      <section
        aria-labelledby="accueil-titre"
        className="rounded-2xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-xs lg:flex lg:items-center lg:justify-between lg:gap-6"
      >
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#B85B2B]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#B85B2B]">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            BNA Pilotage BTP · Accueil Chantier
          </div>
          <h1 id="accueil-titre" className="mt-2 text-2xl font-bold tracking-tight text-[#23272B] sm:text-3xl">
            {titre}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#666666]">
            Retrouvez vos trois corps d’état, vos chantiers à préparer et vos alertes du jour.
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <div className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">Session active</p>
            <p className="text-xs font-bold text-[#23272B]">Espace Terrain &amp; Bureau</p>
          </div>
        </div>
      </section>

      {/* Bloc 2 : Vos Métiers & Pilotage IA (2x2 mobile/tablette, 4 colonnes grand écran) */}
      <section aria-labelledby="metiers-titre">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#777777]">Vos activités</p>
            <h2 id="metiers-titre" className="text-lg font-bold text-[#23272B] sm:text-xl">
              Vos Métiers &amp; Pilotage IA
            </h2>
          </div>
          <span className="text-xs text-[#777777]">Accès direct aux hubs chantiers</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          {METIERS.map(({ nom, description, icone: Icone, href, action, accent }) => (
            <Link
              key={nom}
              href={href}
              aria-label={`${nom} — chantiers existants, hub commun`}
              className="group block min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B]"
            >
              <div className="flex h-full min-h-40 flex-col rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-xs transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-[#B85B2B]/50 group-hover:shadow-sm">
                <span className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border ${accent}`}>
                  <Icone aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span className="text-lg font-bold text-[#23272B]">{nom}</span>
                <span className="mt-1 text-xs leading-5 text-[#666666]">{description}</span>
                <span className="mt-auto flex items-center gap-1.5 pt-4 text-xs font-bold text-[#B85B2B]">
                  {action}
                  <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}

          {/* Carte 4 : BNA-IA Centre de contrôle IA */}
          <Link
            href="/terrain/bna-ia"
            aria-label="BNA-IA — Centre de contrôle IA"
            className="group block min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B]"
          >
            <div className="flex h-full min-h-40 flex-col rounded-2xl border border-[#B85B2B]/35 bg-white p-5 shadow-xs transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-[#B85B2B] group-hover:shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#B85B2B]/25 bg-[#B85B2B]/10 text-[#B85B2B]">
                  <Sparkles aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  Copilote IA Connecté
                </span>
              </div>
              <span className="text-base font-bold text-[#23272B]">
                BNA-IA · Centre de contrôle IA
              </span>
              <span className="mt-1 text-xs leading-5 text-[#666666]">
                Pilotage intelligent, assistants métiers, alertes proactives et dictée Whisper.
              </span>
              <span className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#B85B2B] px-3 py-2 text-xs font-bold text-white shadow-xs transition-colors group-hover:bg-[#9E4B20] mt-4">
                Ouvrir BNA-IA
                <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
