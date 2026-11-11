"use client";

// app/terrain/meteo/page.tsx
// Météo GÉNÉRALE — page complète alignée sur la nouvelle identité visuelle claire (/login).
//
// Palette claire :
// - Fond : #F3F3F1
// - Cartes : blanc pur bg-white, bordures #E5E5E5, ombres légères
// - Titres & textes : #23272B (anthracite) et #777777
// - Accents & boutons : #B85B2B (cuivre) et #D97732

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import { texteDegre, texteKmh, texteMm, texteNature } from "@/components/TableauPrecipitations";
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

const COULEURS = {
  vert:   "border-emerald-200 bg-emerald-50 text-emerald-900",
  jaune:  "border-amber-200 bg-amber-50 text-amber-900",
  orange: "border-orange-200 bg-orange-50 text-orange-950",
  rouge:  "border-red-200 bg-red-50 text-red-950",
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
      return <Sun {...props} className={`${props.className} text-amber-500`} />;
    case "clear-night":
      return <Sun {...props} className={`${props.className} text-gray-400`} />;
    case "partly-cloudy-day":
      return pluie
        ? <CloudRain {...props} className={`${props.className} text-sky-500`} />
        : <CloudSun  {...props} className={`${props.className} text-amber-500`} />;
    case "partly-cloudy-night":
      return <Cloud {...props} className={`${props.className} text-gray-400`} />;
    case "cloudy":
      if (orage) return <CloudRain {...props} className={`${props.className} text-amber-600`} />;
      if (neige) return <Snowflake {...props} className={`${props.className} text-sky-400`} />;
      if (pluie) return <CloudRain {...props} className={`${props.className} text-sky-500`} />;
      return <Cloud {...props} className={`${props.className} text-gray-500`} />;
    case "rain":
      return <CloudRain {...props} className={`${props.className} text-sky-500`} />;
    case "snow":
      return <Snowflake {...props} className={`${props.className} text-sky-400`} />;
    case "fog":
      return <CloudFog  {...props} className={`${props.className} text-gray-400`} />;
    case "wind":
      return <Wind {...props} className={`${props.className} text-teal-600`} />;
    default:
      if (orage) return <CloudRain {...props} className={`${props.className} text-amber-600`} />;
      if (neige) return <Snowflake {...props} className={`${props.className} text-sky-400`} />;
      if (pluie) return <CloudRain {...props} className={`${props.className} text-sky-500`} />;
      return <Cloud {...props} className={`${props.className} text-gray-500`} />;
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
    <div className="-mt-4 -mb-12 min-h-screen bg-[#F3F3F1] text-[#23272B] selection:bg-[#D97732]/20 selection:text-[#B85B2B] px-4 py-6 sm:py-8 transition-colors">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* ── SECTION A. EN-TÊTE MÉTÉO & RECHERCHE ─────────────────────────────── */}
        <header className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-center">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#B85B2B]/10 border border-[#B85B2B]/20 text-[#B85B2B]">
                  <CloudSun className="h-6 w-6" />
                </span>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-[#23272B] sm:text-2xl md:text-3xl">
                    Accueil Météo
                  </h1>
                  <p className="text-xs sm:text-sm text-[#777777]">
                    Conditions actuelles et prévisions disponibles pour{" "}
                    <span className="font-semibold text-[#23272B]">{ville}</span>.
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleRechercherVille}
              aria-label="Rechercher la météo d’une ville"
              className="flex min-w-0 items-center gap-2 rounded-2xl border border-[#D8D8D8] bg-[#F8F9FA] p-1.5 focus-within:border-[#D97732] focus-within:ring-2 focus-within:ring-[#D97732]/20 focus-within:bg-white transition-all"
            >
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#999999]" />
                <label htmlFor="ville-meteo-detaillee" className="sr-only">
                  Rechercher une ville
                </label>
                <input
                  id="ville-meteo-detaillee"
                  type="text"
                  value={villeInput}
                  onChange={(e) => setVilleInput(e.target.value)}
                  placeholder="Rechercher une ville (ex. Bordeaux, Mérignac)..."
                  className="h-11 w-full rounded-xl bg-transparent py-2 pl-10 pr-3 text-sm text-[#23272B] placeholder:text-[#999999] outline-none"
                />
              </div>
              <button
                type="submit"
                className="h-11 shrink-0 rounded-xl bg-[#D97732] hover:bg-[#B85B2B] active:scale-[0.98] px-5 text-sm font-bold text-white transition-all shadow-sm"
              >
                Rechercher
              </button>
            </form>
          </div>
        </header>

        {loadingMeteo ? (
          <div
            className="flex min-h-72 items-center justify-center rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]"
            aria-label="Chargement météo"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#D97732] border-t-transparent" />
              <p className="text-sm font-medium text-[#777777]">Chargement des données météo pour {ville}...</p>
            </div>
          </div>
        ) : meteo ? (
          <div className="space-y-6">
            {/* ── SECTION B. CONDITIONS ACTUELLES ───────────────────────────────── */}
            <section aria-label="Conditions actuelles">
              <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-6 sm:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  {/* Bloc principal température et état */}
                  <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-1 text-xs font-semibold tracking-wide text-[#23272B]">
                      <MapPin className="h-3.5 w-3.5 text-[#B85B2B]" />
                      <span>{ville}</span>
                      <span className="text-[#CCCCCC]">·</span>
                      <span className="text-[#777777]">Conditions actuelles</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 sm:gap-7">
                      <div className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-2xl bg-[#F3F3F1] border border-[#E5E5E5] shadow-xs">
                        <IconeMeteo
                          icon={meteo.icon}
                          conditions={meteo.conditions}
                          className="h-14 w-14 sm:h-16 sm:w-16 drop-shadow-xs"
                        />
                      </div>
                      <div>
                        <div className="flex items-baseline gap-3">
                          <span className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight text-[#23272B]">
                            {meteo.tempActuelle}°
                          </span>
                          <span className="text-lg sm:text-xl font-medium text-[#777777] capitalize">
                            {meteo.conditions}
                          </span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F8F9FA] border border-[#E5E5E5] px-3 py-1 text-[#23272B]">
                            <Thermometer className="h-3.5 w-3.5 text-amber-500" />
                            Max <strong className="text-[#23272B] font-bold">{meteo.tempMaxJour}°</strong>
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F8F9FA] border border-[#E5E5E5] px-3 py-1 text-[#777777]">
                            <Thermometer className="h-3.5 w-3.5 text-sky-500" />
                            Min <strong className="text-[#23272B] font-bold">{meteo.tempMinJour}°</strong>
                          </span>
                          {typeof meteo.cumulPluie === "number" && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 border border-sky-200 px-3 py-1 font-semibold text-[#0284C7]">
                              <Droplets className="h-3.5 w-3.5 text-sky-500" />
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
                      className={`rounded-2xl border p-5 transition-all shadow-xs ${
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
              </div>
            </section>

            {/* ── SECTION C. PRÉVISIONS HORAIRES ───────────────────────────────── */}
            <section aria-labelledby="previsions-horaires" className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#B85B2B]/10 text-[#B85B2B]">
                    <Clock className="h-4 w-4" />
                  </span>
                  <h2 id="previsions-horaires" className="text-lg font-bold text-[#23272B] sm:text-xl">
                    Prévisions horaires
                  </h2>
                </div>
                <span className="text-xs text-[#777777] hidden sm:inline font-medium">
                  Défilement horizontal disponible
                </span>
              </div>

              {meteo.heures.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-3 pt-1 scrollbar-thin snap-x snap-mandatory sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6">
                  {meteo.heures.map((h) => (
                    <div
                      key={h.heure}
                      className="w-[142px] shrink-0 snap-start sm:w-auto p-4 flex flex-col justify-between rounded-2xl border border-[#E5E5E5] bg-white hover:border-[#D97732]/50 hover:shadow-md transition-all shadow-xs"
                    >
                      <div className="flex items-center justify-between border-b border-[#F0F0F0] pb-2">
                        <span className="text-sm font-bold text-[#23272B]">{h.heure}</span>
                        <span className="text-[10px] uppercase font-semibold text-[#777777]">
                          {texteNature(h.nature)}
                        </span>
                      </div>
                      <div className="my-3">
                        <p className="text-2xl font-black tracking-tight text-[#23272B]">
                          {texteDegre(h.temp)}
                        </p>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-1 text-[#777777]">
                          <span className="flex items-center gap-1.5">
                            <Wind className="h-3.5 w-3.5 text-teal-600" /> Vent
                          </span>
                          <span className="font-semibold text-[#23272B]">{texteKmh(h.vent)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-1 text-[#777777]">
                          <span className="flex items-center gap-1.5">
                            <Gauge className="h-3.5 w-3.5 text-amber-500" /> Rafales
                          </span>
                          <span className="font-semibold text-[#23272B]">{texteKmh(h.rafales)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-1 text-[#777777]">
                          <span className="flex items-center gap-1.5">
                            <Droplets className="h-3.5 w-3.5 text-sky-500" /> Pluie
                          </span>
                          <span className="font-semibold text-[#0284C7]">{texteMm(h.pluie)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#E5E5E5] bg-white p-5 text-sm text-[#777777] shadow-xs">
                  Aucune prévision horaire disponible.
                </div>
              )}
            </section>

            {/* ── SECTION D. PRÉVISIONS SUR PLUSIEURS JOURS ─────────────────────── */}
            <section aria-labelledby="previsions-jours" className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#B85B2B]/10 text-[#B85B2B]">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div>
                  <h2 id="previsions-jours" className="text-lg font-bold text-[#23272B] sm:text-xl">
                    Prévisions sur plusieurs jours
                  </h2>
                  <p className="text-xs text-[#777777]">
                    Prévisions journalières renvoyées par la source météo.
                  </p>
                </div>
              </div>

              {meteo.prochainsJours.length > 0 ? (
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                  {meteo.prochainsJours.map((j) => (
                    <div
                      key={j.date}
                      className="flex min-w-0 flex-col justify-between p-5 rounded-2xl border border-[#E5E5E5] bg-white hover:border-[#D97732]/50 hover:shadow-md transition-all shadow-xs"
                    >
                      <div>
                        <p className="truncate text-sm font-bold text-[#23272B]">
                          {nomJour(j.date)}
                        </p>
                        <div className="my-3 flex items-center justify-center rounded-2xl bg-[#F8F9FA] border border-[#E5E5E5] p-3">
                          <IconeMeteo
                            icon={j.icon}
                            conditions={j.conditions}
                            className="h-10 w-10 sm:h-12 sm:w-12 drop-shadow-xs"
                          />
                        </div>
                        <p className="truncate text-xs capitalize text-[#777777] font-medium">
                          {j.conditions}
                        </p>
                      </div>

                      <div className="mt-4 border-t border-[#F0F0F0] pt-3">
                        <div className="flex items-baseline justify-between">
                          <span className="text-lg font-bold text-[#23272B]">{j.tempMax}°</span>
                          <span className="text-sm font-medium text-[#777777]">/ {j.tempMin}°</span>
                        </div>
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#0284C7]">
                          <Droplets className="h-3.5 w-3.5 shrink-0" />
                          Pluie : {texteMm(j.cumulPluie)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-[#E5E5E5] bg-white p-5 text-sm text-[#777777] shadow-xs">
                  Aucune prévision journalière disponible.
                </div>
              )}
            </section>

            {/* ── SECTION E. DÉTAILS MÉTÉOROLOGIQUES (MATIN / APRÈS-MIDI / PRÉCIPITATIONS) ── */}
            <section aria-labelledby="details-meteorologiques" className="space-y-3">
              <h2 id="details-meteorologiques" className="text-lg font-bold text-[#23272B] sm:text-xl">
                Détails météorologiques
              </h2>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {/* Matin */}
                <div className="p-5 sm:p-6 rounded-2xl border border-[#E5E5E5] bg-white shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#777777]">Matin</span>
                    <Sun className="h-5 w-5 text-amber-500" />
                  </div>
                  <p className="mt-2 text-3xl font-black text-[#23272B]">
                    {texteDegre(meteo.matin.temp)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#F0F0F0] pt-3 text-sm">
                    <span className="flex items-center gap-1.5 text-[#777777]">
                      <Wind className="h-4 w-4 text-teal-600" /> Vent
                    </span>
                    <span className="text-right font-semibold text-[#23272B]">
                      {texteKmh(meteo.matin.vent)}
                    </span>
                    <span className="flex items-center gap-1.5 text-[#777777]">
                      <Gauge className="h-4 w-4 text-amber-500" /> Rafales
                    </span>
                    <span className="text-right font-semibold text-[#23272B]">
                      {texteKmh(meteo.matin.rafales)}
                    </span>
                  </div>
                </div>

                {/* Après-midi */}
                <div className="p-5 sm:p-6 rounded-2xl border border-[#E5E5E5] bg-white shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#777777]">Après-midi</span>
                    <CloudSun className="h-5 w-5 text-[#B85B2B]" />
                  </div>
                  <p className="mt-2 text-3xl font-black text-[#23272B]">
                    {texteDegre(meteo.apresMidi.temp)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#F0F0F0] pt-3 text-sm">
                    <span className="flex items-center gap-1.5 text-[#777777]">
                      <Wind className="h-4 w-4 text-teal-600" /> Vent
                    </span>
                    <span className="text-right font-semibold text-[#23272B]">
                      {texteKmh(meteo.apresMidi.vent)}
                    </span>
                    <span className="flex items-center gap-1.5 text-[#777777]">
                      <Gauge className="h-4 w-4 text-amber-500" /> Rafales
                    </span>
                    <span className="text-right font-semibold text-[#23272B]">
                      {texteKmh(meteo.apresMidi.rafales)}
                    </span>
                  </div>
                </div>

                {/* Précipitations prévues */}
                <div className="p-5 sm:p-6 sm:col-span-2 lg:col-span-1 rounded-2xl border border-[#E5E5E5] bg-white shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#777777]">
                      <Droplets className="h-4 w-4 text-sky-500" /> Précipitations prévues
                    </span>
                  </div>
                  <div className="mt-3.5 grid grid-cols-3 gap-2">
                    {[
                      { label: "Aujourd’hui", valeur: meteo.cumulPluie },
                      { label: "Demain", valeur: meteo.prochainsJours[0]?.cumulPluie },
                      { label: "Après-demain", valeur: meteo.prochainsJours[1]?.cumulPluie },
                    ].map(({ label, valeur }) => (
                      <div
                        key={label}
                        className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-2.5 text-center"
                      >
                        <p className="text-[11px] font-medium text-[#777777]">{label}</p>
                        <p className="mt-1 text-base sm:text-lg font-bold text-[#23272B]">
                          {texteMm(valeur)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── SECTION F. ACTIONS MÉTIER & OUTILS OPÉRATIONNELS ──────────────── */}
            <section aria-label="Actions métier et outils opérationnels" className="space-y-3 pt-2">
              <h2 className="text-lg font-bold text-[#23272B] sm:text-xl">
                Actions métier & suivi opérationnel
              </h2>

              {/* Veille intempéries & Impact chantiers */}
              <nav aria-label="Autres vues météo et chantier" className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <Link
                  href="/bureau/meteo"
                  className="group flex min-h-[76px] items-center justify-between gap-4 rounded-2xl border border-[#E5E5E5] bg-white p-4.5 text-[#23272B] transition-all hover:border-[#D97732] hover:shadow-md shadow-xs"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#B85B2B]/10 border border-[#B85B2B]/20 text-[#B85B2B] group-hover:bg-[#B85B2B] group-hover:text-white transition-colors">
                      <ShieldAlert className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#23272B]">
                        Veille des intempéries
                      </p>
                      <p className="text-xs text-[#777777]">
                        Relevés officiels, arrêts chantier et attestations
                      </p>
                    </div>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FA] text-[#B85B2B] group-hover:bg-[#D97732] group-hover:text-white transition-all">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>

                <Link
                  href="/terrain/accueil"
                  className="group flex min-h-[76px] items-center justify-between gap-4 rounded-2xl border border-[#E5E5E5] bg-white p-4.5 text-[#23272B] transition-all hover:border-[#D97732] hover:shadow-md shadow-xs"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#B85B2B]/10 border border-[#B85B2B]/20 text-[#B85B2B] group-hover:bg-[#B85B2B] group-hover:text-white transition-colors">
                      <HardHat className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#23272B]">
                        Impact météo sur les chantiers
                      </p>
                      <p className="text-xs text-[#777777]">
                        Vue opérationnelle par chantier et conditions d'accès
                      </p>
                    </div>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FA] text-[#B85B2B] group-hover:bg-[#D97732] group-hover:text-white transition-all">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </nav>
            </section>
          </div>
        ) : (
          <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-8 text-center text-sm text-[#777777] shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <p className="text-base font-semibold text-[#23272B]">
              {erreurMeteo ?? "Météo indisponible pour cette ville."}
            </p>
            <p className="mt-1 text-xs text-[#999999]">
              Vérifiez l'orthographe du nom de la commune ou réessayez avec une ville voisine.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
