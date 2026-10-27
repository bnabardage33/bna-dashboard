import Link from 'next/link';
import { ArrowRight, Building2, Fence, Layers3 } from 'lucide-react';
import { Surface } from '@/components/ui/Surface';

const METIERS = [
  {
    nom: 'Bardage',
    description: 'Accéder aux chantiers existants depuis le hub commun.',
    icone: Building2,
    href: '/terrain/chantier',
    action: 'Chantiers existants · hub commun',
  },
  {
    nom: 'Terrasse',
    description: 'L’entrée chantier Terrasse dédiée reste à développer.',
    icone: Layers3,
    href: null,
    action: null,
  },
  {
    nom: 'Clôture',
    description: 'Cet espace métier reste à développer.',
    icone: Fence,
    href: null,
    action: null,
  },
] as const;

const ACCES_TRANSVERSES = [
  { href: '/terrain/chantier', libelle: 'Chantiers' },
  { href: '/bureau/clients', libelle: 'Clients' },
  { href: '/bureau/devis-factures', libelle: 'Devis' },
  { href: '/bureau/catalogue', libelle: 'Catalogue Bardage' },
  { href: '/bureau/catalogue-terrasse', libelle: 'Catalogue Terrasse' },
  { href: '/finance', libelle: 'Finance' },
] as const;

/** Accueil commun, sans chargement de données métier ni hypothèses de spécialité. */
export default function AccueilProfessionnel({
  titre = 'Accueil',
}: {
  titre?: string;
}) {
  return (
    <div className="space-y-7 sm:space-y-9">
      <section
        aria-labelledby="accueil-titre"
        className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#242424] via-[#1E1E1E] to-[#191919] p-4 shadow-lg sm:p-6"
      >
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6F60]">
            BNA Dashboard · Pilotage BTP
          </p>
          <h1 id="accueil-titre" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {titre}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400 sm:text-base">
            Retrouvez vos métiers, vos chantiers et les outils de gestion de votre activité.
          </p>
        </div>
      </section>

      <section aria-labelledby="metiers-titre">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 sm:mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Vos activités</p>
            <h2 id="metiers-titre" className="mt-1 text-xl font-bold text-white sm:text-2xl">
              Choisir un métier
            </h2>
          </div>
          <span className="text-xs text-gray-500">Accès au suivi commun des chantiers</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 sm:gap-4">
          {METIERS.map(({ nom, description, icone: Icone, href, action }) => {
            const contenu = (
              <Surface className={`flex h-full min-h-44 flex-col p-4 sm:min-h-48 sm:p-5 ${
                href ? 'transition-colors group-hover:border-[#E53935]/50 group-hover:bg-[#252525]' : ''
              }`}>
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#E53935]/25 bg-[#E53935]/10 text-[#FF6F60]">
                  <Icone aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span className="text-lg font-bold text-white">{nom}</span>
                <span className="mt-1 text-sm leading-5 text-gray-400">{description}</span>
                {action && (
                  <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-gray-300 transition-colors group-hover:text-white">
                    {action}
                    <ArrowRight aria-hidden="true" className="h-4 w-4 text-[#FF6F60] transition-transform group-hover:translate-x-1" />
                  </span>
                )}
              </Surface>
            );

            return href ? (
              <Link
                key={nom}
                href={href}
                aria-label={`${nom} — chantiers existants, hub commun`}
                className="group block min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#E53935] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]"
              >
                {contenu}
              </Link>
            ) : (
              <article key={nom} aria-label={`${nom} — ${description}`} className="min-w-0">
                {contenu}
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="acces-transverses-titre">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Socle commun</p>
          <h2 id="acces-transverses-titre" className="mt-1 text-lg font-bold text-white">
            Accès rapides
          </h2>
        </div>
        <nav aria-label="Fonctionnalités communes" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {ACCES_TRANSVERSES.map(({ href, libelle }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-12 items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:border-[#E53935]/40 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E53935]"
            >
              <span>{libelle}</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-500" />
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
