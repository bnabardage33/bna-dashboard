"use client";

// app/terrain/meteo/page.tsx
// Météo GÉNÉRALE — page complète restaurée (état historique f6366a5).
//
// Cette page porte les prévisions par ville : recherche, température du jour,
// matin / après-midi, détail heure par heure et jours à venir (J+1 à J+4,
// fenêtre API actuelle — pas d'élargissement à sept jours).
//
// Elle ne remplace PAS la veille des intempéries (`/bureau/meteo`) ni les
// cartes opérationnelles par chantier (`ChantiersMeteoCards`, montées sur
// l'accueil) : ce sont trois fonctions distinctes, et le lien d'en-tête
// ci-dessous rend la navigation explicite au lieu d'une redirection.
//
// Les corrections du durcissement météo (dates Europe/Paris calculées côté
// route, localisation validée, coordonnées explicites, repli de source) vivent
// dans `lib/meteo`, `lib/meteoLocalisation` et `app/api/meteo` : cette page
// reste un client de `fetchMeteo`, qui propage les erreurs de la route.

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import TableauPrecipitations, { texteDegre, texteKmh, texteMm, texteNature } from "@/components/TableauPrecipitations";
import {
  Search,
  Sun,
  Cloud,
  CloudSun,
  CloudFog,
  Snowflake,
  Wind,
  CloudRain,
  ArrowRight,
  Droplets,
  MapPin,
  ShieldAlert,
  HardHat,
  Thermometer,
  Gauge,
  Clock,
  CalendarDays,
} from "lucide-react";
import { Surface } from "@/components/ui/Surface";

const COULEURS = {
  vert:   "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  jaune:  "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  orange: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  rouge:  "border-red-500/40 bg-red-900/20 text-red-400",
} as const;

const EMOJIS = { vert: "🟢", jaune: "🟡", orange: "🟠", rouge: "🔴" } as const;

function IconeMeteo({ icon, conditions, className }: { icon: string; conditions?: string; className?: string }) {
  const props = { className: className || "h-8 w-8" };
  const c = (conditions || "").toLowerCase();
  const pluie = c.includes("rain") || c.includes("shower") || c.includes("drizzle") || c.includes("pluie");
  const orage = c.includes("thunder") || c.includes("storm") || c.includes("orage");
  const neige = c.includes("snow") || c.includes("neige");

  switch (icon) {
    case "clear-day":
      return <Sun {...props} className={`${props.className} text-amber-400`} />;
    case "clear-night":
      return <Sun {...props} className={`${props.className} text-gray-400`} />;
    case "partly-cloudy-day":
      return pluie
        ? <CloudRain {...props} className={`${props.className} text-sky-400`} />
        : <CloudSun  {...props} className={`${props.className} text-amber-300`} />;
    case "partly-cloudy-night":
      return <Cloud {...props} className={`${props.className} text-gray-400`} />;
    case "cloudy":
      if (orage) return <CloudRain {...props} className={`${props.className} text-amber-300`} />;
      if (neige) return <Snowflake {...props} className={`${props.className} text-sky-200`} />;
      if (pluie) return <CloudRain {...props} className={`${props.className} text-sky-400`} />;
      return <Cloud {...props} className={`${props.className} text-gray-300`} />;
    case "rain":
      return <CloudRain {...props} className={`${props.className} text-sky-400`} />;
    case "snow":
      return <Snowflake {...props} className={`${props.className} text-sky-200`} />;
    case "fog":
      return <CloudFog  {...props} className={`${props.className} text-gray-400`} />;
    case "wind":
      return <Wind {...props} className={`${props.className} text-teal-300`} />;
    default:
      if (orage) return <CloudRain {...props} className={`${props.className} text-amber-300`} />;
      if (neige) return <Snowflake {...props} className={`${props.className} text-sky-200`} />;
      if (pluie) return <CloudRain {...props} className={`${props.className} text-sky-400`} />;
      return <Cloud {...props} className={`${props.className} text-gray-300`} />;
  }
}

function nomJour(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const j = d.toLocaleDateString("fr-FR", { weekday: "long" });
  return j.charAt(0).toUpperCase() + j.slice(1);
}

export default function MeteoPage() {
  const [villeInput, setVilleInput] = useState("Bordeaux");
  const [ville, setVille] = useState("Bordeaux");
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loadingMeteo, setLoadingMeteo] = useState(true);
  const [erreurMeteo, setErreurMeteo] = useState<string | null>(null);

  useEffect(() => {
    async function charger() {
      setLoadingMeteo(true);
      setErreurMeteo(null);
      try {
        const data = await fetchMeteo(ville);
        setMeteo(data);
      } catch (err) {
        console.error(err);
        setMeteo(null);
        setErreurMeteo(err instanceof Error ? err.message : "Erreur météo");
      } finally {
        setLoadingMeteo(false);
      }
    }
    charger();
  }, [ville]);

  function handleRechercherVille(e: React.FormEvent) {
    e.preventDefault();
    if (villeInput.trim()) setVille(villeInput.trim());
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-4 sm:py-6 text-gray-100">
      {/* ── SECTION A. EN-TÊTE MÉTÉO & RECHERCHE ─────────────────────────────── */}
      <header className="rounded-2xl border border-white/10 bg-[#1E1E1E] p-4 sm:p-6 shadow-lg">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B85B2B]/15 border border-[#B85B2B]/30 text-[#B85B2B]">
                <CloudSun className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl md:text-3xl">
                  Accueil Météo
                </h1>
                <p className="text-xs sm:text-sm text-gray-400">
                  Conditions actuelles et prévisions disponibles pour{" "}
                  <span className="font-semibold text-gray-200">{ville}</span>.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleRechercherVille}
            aria-label="Rechercher la météo d’une ville"
            className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1.5 focus-within:border-[#B85B2B]/60 transition-colors"
          >
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <label htmlFor="ville-meteo-detaillee" className="sr-only">
                Rechercher une ville
              </label>
              <input
                id="ville-meteo-detaillee"
                type="text"
                value={villeInput}
                onChange={(e) => setVilleInput(e.target.value)}
                placeholder="Rechercher une ville (ex. Bordeaux, Mérignac)..."
                className="h-11 w-full rounded-lg bg-transparent py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500 outline-none"
              />
            </div>
            <button
              type="submit"
              className="h-11 shrink-0 rounded-lg bg-[#B85B2B] hover:bg-[#8F431C] active:scale-[0.98] px-4 text-sm font-bold text-white transition-all shadow-sm"
            >
              Rechercher
            </button>
          </form>
        </div>
      </header>

      {loadingMeteo ? (
        <Surface
          className="flex min-h-72 items-center justify-center"
          radius="2xl"
          aria-label="Chargement météo"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#B85B2B] border-t-transparent" />
            <p className="text-sm font-medium text-gray-400">Chargement des données météo pour {ville}...</p>
          </div>
        </Surface>
      ) : meteo ? (
        <div className="space-y-6">
          {/* ── SECTION B. CONDITIONS ACTUELLES ───────────────────────────────── */}
          <section aria-label="Conditions actuelles">
            <Surface className="overflow-hidden border border-white/10 bg-gradient-to-br from-[#1E1E1E] to-[#161616] p-5 sm:p-7 shadow-xl" radius="2xl">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                {/* Bloc principal température et état */}
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold tracking-wide text-gray-300">
                    <MapPin className="h-3.5 w-3.5 text-[#B85B2B]" />
                    <span>{ville}</span>
                    <span className="text-gray-500">·</span>
                    <span className="text-gray-400">Conditions actuelles</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 sm:gap-7">
                    <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-2xl bg-white/[0.04] border border-white/5 shadow-inner">
                      <IconeMeteo
                        icon={meteo.icon}
                        conditions={meteo.conditions}
                        className="h-14 w-14 sm:h-16 sm:w-16 drop-shadow-md"
                      />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-white">
                          {meteo.tempActuelle}°
                        </span>
                        <span className="text-lg sm:text-xl font-medium text-gray-400 capitalize">
                          {meteo.conditions}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 text-gray-200">
                          <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                          Max <strong className="text-white font-bold">{meteo.tempMaxJour}°</strong>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 text-gray-300">
                          <Thermometer className="h-3.5 w-3.5 text-sky-400" />
                          Min <strong className="text-gray-100 font-bold">{meteo.tempMinJour}°</strong>
                        </span>
                        {typeof meteo.cumulPluie === "number" && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 border border-sky-500/20 px-2.5 py-1 text-sky-300">
                            <Droplets className="h-3.5 w-3.5" />
                            Cumul {texteMm(meteo.cumulPluie)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bandeau vigilance météo */}
                <div className="w-full lg:max-w-md">
                  <div
                    className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-sm ${
                      COULEURS[meteo.alerte.niveau]
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Vigilance météo · {meteo.alerte.niveau}
                        </span>
                      </div>
                      <span className="text-lg">{EMOJIS[meteo.alerte.niveau]}</span>
                    </div>
                    <p className="mt-2 text-sm sm:text-base font-semibold leading-snug">
                      {meteo.alerte.motif}
                    </p>
                  </div>
                </div>
              </div>
            </Surface>
          </section>

          {/* ── SECTION C. PRÉVISIONS HORAIRES ───────────────────────────────── */}
          <section aria-labelledby="previsions-horaires" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#B85B2B]" />
                <h2 id="previsions-horaires" className="text-lg font-bold text-white sm:text-xl">
                  Prévisions horaires
                </h2>
              </div>
              <span className="text-xs text-gray-400 hidden sm:inline">
                Défilement horizontal disponible
              </span>
            </div>

            {meteo.heures.length > 0 ? (
              <div className="flex gap-2.5 overflow-x-auto pb-2 pt-1 scrollbar-thin snap-x snap-mandatory sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6">
                {meteo.heures.map((h) => (
                  <Surface
                    key={h.heure}
                    className="w-[136px] shrink-0 snap-start sm:w-auto p-3.5 flex flex-col justify-between border border-white/10 bg-[#1E1E1E] hover:border-white/20 transition-all rounded-xl"
                  >
                    <div className="flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                      <span className="text-sm font-bold text-white">{h.heure}</span>
                      <span className="text-[10px] uppercase font-semibold text-gray-400">
                        {texteNature(h.nature)}
                      </span>
                    </div>
                    <div className="my-2.5">
                      <p className="text-2xl font-black tracking-tight text-white">
                        {texteDegre(h.temp)}
                      </p>
                    </div>
                    <div className="space-y-1.5 text-xs text-gray-300">
                      <div className="flex items-center justify-between gap-1 text-gray-400">
                        <span className="flex items-center gap-1">
                          <Wind className="h-3 w-3 text-teal-400" /> Vent
                        </span>
                        <span className="font-semibold text-gray-200">{texteKmh(h.vent)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 text-gray-400">
                        <span className="flex items-center gap-1">
                          <Gauge className="h-3 w-3 text-amber-400" /> Rafales
                        </span>
                        <span className="font-semibold text-gray-200">{texteKmh(h.rafales)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 text-gray-400">
                        <span className="flex items-center gap-1">
                          <Droplets className="h-3 w-3 text-sky-400" /> Pluie
                        </span>
                        <span className="font-semibold text-gray-200">{texteMm(h.pluie)}</span>
                      </div>
                    </div>
                  </Surface>
                ))}
              </div>
            ) : (
              <Surface className="p-4 text-sm text-gray-400">
                Aucune prévision horaire disponible.
              </Surface>
            )}
          </section>

          {/* ── SECTION D. PRÉVISIONS SUR PLUSIEURS JOURS ─────────────────────── */}
          <section aria-labelledby="previsions-jours" className="space-y-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[#B85B2B]" />
              <div>
                <h2 id="previsions-jours" className="text-lg font-bold text-white sm:text-xl">
                  Prévisions sur plusieurs jours
                </h2>
                <p className="text-xs text-gray-400">
                  Prévisions journalières renvoyées par la source météo.
                </p>
              </div>
            </div>

            {meteo.prochainsJours.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {meteo.prochainsJours.map((j) => (
                  <Surface
                    key={j.date}
                    className="flex min-w-0 flex-col justify-between p-4 sm:p-5 border border-white/10 bg-[#1E1E1E] hover:border-[#B85B2B]/30 transition-all"
                    radius="2xl"
                  >
                    <div>
                      <p className="truncate text-sm font-bold text-gray-200">
                        {nomJour(j.date)}
                      </p>
                      <div className="my-3 flex items-center justify-center rounded-xl bg-white/[0.03] p-2.5">
                        <IconeMeteo
                          icon={j.icon}
                          conditions={j.conditions}
                          className="h-10 w-10 sm:h-12 sm:w-12 drop-shadow-sm"
                        />
                      </div>
                      <p className="truncate text-xs capitalize text-gray-400 font-medium">
                        {j.conditions}
                      </p>
                    </div>

                    <div className="mt-4 border-t border-white/[0.08] pt-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-lg font-bold text-white">{j.tempMax}°</span>
                        <span className="text-sm font-medium text-gray-400">/ {j.tempMin}°</span>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-sky-300">
                        <Droplets className="h-3.5 w-3.5 shrink-0" />
                        Pluie : {texteMm(j.cumulPluie)}
                      </p>
                    </div>
                  </Surface>
                ))}
              </div>
            ) : (
              <Surface className="p-4 text-sm text-gray-400">
                Aucune prévision journalière disponible.
              </Surface>
            )}
          </section>

          {/* ── SECTION E. DÉTAILS MÉTÉOROLOGIQUES (MATIN / APRÈS-MIDI / PRÉCIPITATIONS) ── */}
          <section aria-labelledby="details-meteorologiques" className="space-y-3">
            <h2 id="details-meteorologiques" className="text-lg font-bold text-white sm:text-xl">
              Détails météorologiques
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Matin */}
              <Surface className="p-4 sm:p-5 border border-white/10 bg-[#1E1E1E]" radius="2xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Matin</span>
                  <Sun className="h-5 w-5 text-amber-400" />
                </div>
                <p className="mt-2 text-3xl font-black text-white">
                  {texteDegre(meteo.matin.temp)}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-3 text-sm">
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <Wind className="h-4 w-4 text-teal-400" /> Vent
                  </span>
                  <span className="text-right font-semibold text-gray-200">
                    {texteKmh(meteo.matin.vent)}
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <Gauge className="h-4 w-4 text-amber-400" /> Rafales
                  </span>
                  <span className="text-right font-semibold text-gray-200">
                    {texteKmh(meteo.matin.rafales)}
                  </span>
                </div>
              </Surface>

              {/* Après-midi */}
              <Surface className="p-4 sm:p-5 border border-white/10 bg-[#1E1E1E]" radius="2xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Après-midi</span>
                  <CloudSun className="h-5 w-5 text-[#B85B2B]" />
                </div>
                <p className="mt-2 text-3xl font-black text-white">
                  {texteDegre(meteo.apresMidi.temp)}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-3 text-sm">
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <Wind className="h-4 w-4 text-teal-400" /> Vent
                  </span>
                  <span className="text-right font-semibold text-gray-200">
                    {texteKmh(meteo.apresMidi.vent)}
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <Gauge className="h-4 w-4 text-amber-400" /> Rafales
                  </span>
                  <span className="text-right font-semibold text-gray-200">
                    {texteKmh(meteo.apresMidi.rafales)}
                  </span>
                </div>
              </Surface>

              {/* Précipitations prévues */}
              <Surface className="p-4 sm:p-5 sm:col-span-2 lg:col-span-1 border border-white/10 bg-[#1E1E1E]" radius="2xl">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-400">
                    <Droplets className="h-4 w-4 text-sky-400" /> Précipitations prévues
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { label: "Aujourd’hui", valeur: meteo.cumulPluie },
                    { label: "Demain", valeur: meteo.prochainsJours[0]?.cumulPluie },
                    { label: "Après-demain", valeur: meteo.prochainsJours[1]?.cumulPluie },
                  ].map(({ label, valeur }) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-2.5 text-center"
                    >
                      <p className="text-[11px] font-medium text-gray-400">{label}</p>
                      <p className="mt-1 text-base sm:text-lg font-bold text-white">
                        {texteMm(valeur)}
                      </p>
                    </div>
                  ))}
                </div>
              </Surface>
            </div>
          </section>

          {/* ── SECTION F. ACTIONS MÉTIER & OUTILS OPÉRATIONNELS ──────────────── */}
          <section aria-label="Actions métier et outils opérationnels" className="space-y-3 pt-2">
            <h2 className="text-lg font-bold text-white sm:text-xl">
              Actions métier & suivi opérationnel
            </h2>

            {/* Consultation des précipitations détaillées */}
            <Surface className="p-4 sm:p-5 border border-white/10 bg-[#1E1E1E]" radius="2xl">
              <TableauPrecipitations heures={meteo.heures} />
            </Surface>

            {/* Veille intempéries & Impact chantiers */}
            <nav aria-label="Autres vues météo et chantier" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                href="/bureau/meteo"
                className="group flex min-h-[72px] items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#1E1E1E] p-4 text-gray-200 transition-all hover:border-[#B85B2B]/60 hover:bg-[#252525] shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 group-hover:bg-[#B85B2B]/20 group-hover:border-[#B85B2B]/40 group-hover:text-[#B85B2B] transition-colors">
                    <ShieldAlert className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white group-hover:text-white">
                      Veille des intempéries
                    </p>
                    <p className="text-xs text-gray-400">
                      Relevés officiels, arrêts chantier et attestations
                    </p>
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[#B85B2B] group-hover:bg-[#B85B2B] group-hover:text-white transition-all">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>

              <Link
                href="/terrain/accueil"
                className="group flex min-h-[72px] items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#1E1E1E] p-4 text-gray-200 transition-all hover:border-[#B85B2B]/60 hover:bg-[#252525] shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#B85B2B]/10 border border-[#B85B2B]/20 text-[#B85B2B] group-hover:bg-[#B85B2B]/20 group-hover:border-[#B85B2B]/40 transition-colors">
                    <HardHat className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white group-hover:text-white">
                      Impact météo sur les chantiers
                    </p>
                    <p className="text-xs text-gray-400">
                      Vue opérationnelle par chantier et conditions d'accès
                    </p>
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[#B85B2B] group-hover:bg-[#B85B2B] group-hover:text-white transition-all">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </nav>
          </section>
        </div>
      ) : (
        <Surface className="p-8 text-center text-sm text-gray-400" radius="2xl">
          <p className="text-base font-semibold text-gray-300">
            {erreurMeteo ?? "Météo indisponible pour cette ville."}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Vérifiez l'orthographe du nom de la commune ou réessayez avec une ville voisine.
          </p>
        </Surface>
      )}
    </div>
  );
}
