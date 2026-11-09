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
} from "lucide-react";
import { Surface } from '@/components/ui/Surface';

const COULEURS = {
  vert:   "border-white/10 bg-white/5 text-gray-400",
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
    case "clear-day":    return <Sun {...props} className={`${props.className} text-yellow-300`} />;
    case "clear-night":  return <Sun {...props} className={`${props.className} text-gray-400`} />;
    case "partly-cloudy-day":
      return pluie
        ? <CloudRain {...props} className={`${props.className} text-gray-400`} />
        : <CloudSun  {...props} className={`${props.className} text-gray-400`} />;
    case "partly-cloudy-night": return <Cloud {...props} className={`${props.className} text-gray-400`} />;
    case "cloudy":
      if (orage) return <CloudRain {...props} className={`${props.className} text-gray-400`} />;
      if (neige) return <Snowflake {...props} className={`${props.className} text-gray-300`} />;
      if (pluie) return <CloudRain {...props} className={`${props.className} text-gray-400`} />;
      return <Cloud {...props} className={`${props.className} text-gray-400`} />;
    case "rain":  return <CloudRain {...props} className={`${props.className} text-gray-400`} />;
    case "snow":  return <Snowflake {...props} className={`${props.className} text-gray-300`} />;
    case "fog":   return <CloudFog  {...props} className={`${props.className} text-gray-400`} />;
    case "wind":  return <Wind {...props} className={`${props.className} text-gray-400`} />;
    default:
      if (orage) return <CloudRain {...props} className={`${props.className} text-gray-400`} />;
      if (neige) return <Snowflake {...props} className={`${props.className} text-gray-300`} />;
      if (pluie) return <CloudRain {...props} className={`${props.className} text-gray-400`} />;
      return <Cloud {...props} className={`${props.className} text-gray-400`} />;
  }
}

function nomJour(dateStr: string): string {
  // `dateStr` est déjà une date du calendrier parisien (calculée par la route
  // via `lib/dateParis`). On la formate à midi pour ne jamais glisser d'un
  // jour au passage minuit.
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
        // `fetchMeteo` propage le message exact de la route — notamment
        // « localisation non validée » (422) introduit par le durcissement
        // géographique : on l'affiche tel quel plutôt qu'un message générique.
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
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 text-gray-100 sm:space-y-6 sm:py-7">
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)] lg:items-end">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl">
            <CloudSun className="h-7 w-7 shrink-0 text-[#B85B2B]" />
            Accueil Météo
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Conditions actuelles et prévisions disponibles pour {ville}.
          </p>
        </div>
        <form
          onSubmit={handleRechercherVille}
          aria-label="Rechercher la météo d’une ville"
          className="flex min-w-0 gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-3"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <label htmlFor="ville-meteo-detaillee" className="sr-only">Rechercher une ville</label>
            <input
              id="ville-meteo-detaillee"
              type="text"
              value={villeInput}
              onChange={(e) => setVilleInput(e.target.value)}
              placeholder="Rechercher une ville..."
              className="min-h-11 w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-gray-200 outline-none transition-colors focus:border-[#B85B2B]/50"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 shrink-0 rounded-lg bg-[#B85B2B] px-4 text-sm font-bold text-white transition-colors hover:bg-red-700"
          >
            Rechercher
          </button>
        </form>
      </header>

      {loadingMeteo ? (
        <Surface className="flex min-h-64 items-center justify-center" radius="2xl" aria-label="Chargement météo">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B85B2B] border-t-transparent" />
        </Surface>
      ) : meteo ? (
        <div className="space-y-5 sm:space-y-6">
          <section aria-label="Conditions actuelles" className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <Surface className="p-4 sm:p-6 xl:col-span-5" radius="2xl">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">{ville} · conditions actuelles</p>
              <div className="mt-4 flex flex-wrap items-center gap-4 sm:gap-6">
                <IconeMeteo icon={meteo.icon} conditions={meteo.conditions} className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" />
                <div>
                  <p className="text-5xl font-black leading-none text-white sm:text-6xl">{meteo.tempActuelle}°</p>
                  <p className="mt-2 text-sm font-medium text-gray-300 capitalize">{meteo.conditions}</p>
                  <p className="mt-1 text-sm text-gray-400">
                    Maximum <span className="font-semibold text-white">{meteo.tempMaxJour}°</span>
                    {" · "}Minimum <span className="font-semibold text-gray-300">{meteo.tempMinJour}°</span>
                  </p>
                </div>
              </div>
              <div className={`mt-5 rounded-xl border p-3 sm:p-4 ${COULEURS[meteo.alerte.niveau]}`}>
                <p className="text-xs font-bold uppercase tracking-wider">Vigilance météo · {meteo.alerte.niveau}</p>
                <p className="mt-1 text-sm font-semibold">{EMOJIS[meteo.alerte.niveau]} {meteo.alerte.motif}</p>
              </div>
            </Surface>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-7">
              {[
                { label: "Matin", periode: meteo.matin },
                { label: "Après-midi", periode: meteo.apresMidi },
              ].map(({ label, periode }) => (
                <Surface key={label} className="p-4 sm:p-5" radius="2xl">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="mt-3 text-3xl font-black text-white">{texteDegre(periode.temp)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-3 text-sm">
                    <span className="flex items-center gap-2 text-gray-400"><Wind className="h-4 w-4" />Vent</span>
                    <span className="text-right font-semibold text-gray-200">{texteKmh(periode.vent)}</span>
                    <span className="text-gray-400">Rafales</span>
                    <span className="text-right font-semibold text-gray-200">{texteKmh(periode.rafales)}</span>
                  </div>
                </Surface>
              ))}
              <Surface className="p-4 sm:col-span-2 sm:p-5" radius="2xl">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                  <Droplets className="h-4 w-4 text-sky-300" /> Précipitations prévues
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[
                    { label: "Aujourd’hui", valeur: meteo.cumulPluie },
                    { label: "Demain", valeur: meteo.prochainsJours[0]?.cumulPluie },
                    { label: "Après-demain", valeur: meteo.prochainsJours[1]?.cumulPluie },
                  ].map(({ label, valeur }) => (
                    <div key={label} className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="mt-1 text-lg font-bold text-white">{texteMm(valeur)}</p>
                    </div>
                  ))}
                </div>
              </Surface>
            </div>
          </section>

          <section aria-labelledby="previsions-horaires" className="space-y-3">
            <div>
              <h2 id="previsions-horaires" className="text-lg font-bold text-white sm:text-xl">Prévisions horaires</h2>
              <p className="mt-1 text-xs text-gray-500">Les valeurs absentes restent indiquées par un tiret.</p>
            </div>
            {meteo.heures.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {meteo.heures.map((h) => (
                  <Surface key={h.heure} className="min-w-0 p-3" radius="xl">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-white">{h.heure}</p>
                      <span className="truncate text-[10px] text-gray-500">{texteNature(h.nature)}</span>
                    </div>
                    <p className="mt-3 text-2xl font-black text-white">{texteDegre(h.temp)}</p>
                    <div className="mt-3 space-y-1 border-t border-white/[0.08] pt-2 text-xs">
                      <p className="flex justify-between gap-2 text-gray-400"><span>Vent</span><span className="text-gray-200">{texteKmh(h.vent)}</span></p>
                      <p className="flex justify-between gap-2 text-gray-400"><span>Rafales</span><span className="text-gray-200">{texteKmh(h.rafales)}</span></p>
                      <p className="flex justify-between gap-2 text-gray-400"><span>Pluie</span><span className="text-gray-200">{texteMm(h.pluie)}</span></p>
                    </div>
                  </Surface>
                ))}
              </div>
            ) : (
              <Surface className="p-4 text-sm text-gray-400">Aucune prévision horaire disponible.</Surface>
            )}
            <TableauPrecipitations heures={meteo.heures} />
          </section>

          <section aria-labelledby="previsions-jours" className="space-y-3">
            <div>
              <h2 id="previsions-jours" className="text-lg font-bold text-white sm:text-xl">Prévisions sur plusieurs jours</h2>
              <p className="mt-1 text-xs text-gray-500">Prévisions journalières renvoyées par la source météo.</p>
            </div>
            {meteo.prochainsJours.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {meteo.prochainsJours.map((j) => (
                  <Surface key={j.date} className="flex min-w-0 flex-col p-4 sm:p-5" radius="2xl">
                    <p className="truncate text-sm font-bold text-gray-300">{nomJour(j.date)}</p>
                    <IconeMeteo icon={j.icon} conditions={j.conditions} className="my-3 h-9 w-9" />
                    <p className="text-sm capitalize text-gray-400">{j.conditions}</p>
                    <p className="mt-3 text-lg font-bold text-white">{j.tempMax}° <span className="text-sm font-medium text-gray-500">/ {j.tempMin}°</span></p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                      <Droplets className="h-3.5 w-3.5 text-sky-300" /> Pluie : {texteMm(j.cumulPluie)}
                    </p>
                  </Surface>
                ))}
              </div>
            ) : (
              <Surface className="p-4 text-sm text-gray-400">Aucune prévision journalière disponible.</Surface>
            )}
          </section>

          <nav aria-label="Autres vues météo et chantier" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link href="/bureau/meteo" className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-gray-200 transition-colors hover:border-[#B85B2B]/50">
              Veille des intempéries <ArrowRight className="h-4 w-4 shrink-0 text-[#B85B2B]" />
            </Link>
            <Link href="/terrain/accueil" className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-semibold text-gray-200 transition-colors hover:border-[#B85B2B]/50">
              Impact météo sur les chantiers <ArrowRight className="h-4 w-4 shrink-0 text-[#B85B2B]" />
            </Link>
          </nav>
        </div>
      ) : (
        <Surface className="p-6 text-center text-sm text-gray-400" radius="2xl">
          {erreurMeteo ?? "Météo indisponible pour cette ville."}
        </Surface>
      )}
    </div>
  );
}
