"use client";

import { useEffect, useState } from "react";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import ChantiersMeteoCards from "@/components/ChantiersMeteoCards";
import { Search, Sun, Cloud, CloudSun, CloudFog, Snowflake, Wind, CloudRain, Building } from "lucide-react";

const COULEURS = {
  vert: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  jaune: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  rouge: "border-red-500/40 bg-red-500/10 text-red-400",
} as const;

const EMOJIS = { vert: "🟢", jaune: "🟡", orange: "🟠", rouge: "🔴" } as const;

function IconeMeteo({ icon, conditions, className }: { icon: string; conditions?: string; className?: string }) {
  const props = { className: className || "h-8 w-8" };
  const conditionsBasses = (conditions || "").toLowerCase();
  const contientPluie = conditionsBasses.includes("rain") || conditionsBasses.includes("shower") || conditionsBasses.includes("drizzle");
  const contientOrage = conditionsBasses.includes("thunder") || conditionsBasses.includes("storm");
  const contientNeige = conditionsBasses.includes("snow");

  switch (icon) {
    case "clear-day":
      return <Sun {...props} className={`${props.className} text-amber-400`} />;
    case "clear-night":
      return <Sun {...props} className={`${props.className} text-slate-400`} />;
    case "partly-cloudy-day":
      return contientPluie
        ? <CloudRain {...props} className={`${props.className} text-sky-400`} />
        : <CloudSun {...props} className={`${props.className} text-amber-300`} />;
    case "partly-cloudy-night":
      return <Cloud {...props} className={`${props.className} text-slate-400`} />;
    case "cloudy":
      if (contientOrage) return <CloudRain {...props} className={`${props.className} text-indigo-400`} />;
      if (contientNeige) return <Snowflake {...props} className={`${props.className} text-sky-200`} />;
      if (contientPluie) return <CloudRain {...props} className={`${props.className} text-sky-400`} />;
      return <Cloud {...props} className={`${props.className} text-slate-400`} />;
    case "rain":
      return <CloudRain {...props} className={`${props.className} text-sky-400`} />;
    case "snow":
      return <Snowflake {...props} className={`${props.className} text-sky-200`} />;
    case "fog":
      return <CloudFog {...props} className={`${props.className} text-slate-400`} />;
    case "wind":
      return <Wind {...props} className={`${props.className} text-slate-400`} />;
    default:
      if (contientOrage) return <CloudRain {...props} className={`${props.className} text-indigo-400`} />;
      if (contientNeige) return <Snowflake {...props} className={`${props.className} text-sky-200`} />;
      if (contientPluie) return <CloudRain {...props} className={`${props.className} text-sky-400`} />;
      return <Cloud {...props} className={`${props.className} text-slate-400`} />;
  }
}

function nomJour(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const jour = date.toLocaleDateString("fr-FR", { weekday: "long" });
  return jour.charAt(0).toUpperCase() + jour.slice(1);
}

export default function MeteoPage() {
  const [villeInput, setVilleInput] = useState("Bordeaux");
  const [ville, setVille] = useState("Bordeaux");
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loadingMeteo, setLoadingMeteo] = useState(true);

  useEffect(() => {
    async function chargerMeteo() {
      setLoadingMeteo(true);
      try {
        const data = await fetchMeteo(ville);
        setMeteo(data);
      } catch (err) {
        console.error(err);
        setMeteo(null);
      } finally {
        setLoadingMeteo(false);
      }
    }
    chargerMeteo();
  }, [ville]);

  function handleRechercherVille(e: React.FormEvent) {
    e.preventDefault();
    if (villeInput.trim()) {
      setVille(villeInput.trim());
    }
  }

  return (
    <div className="space-y-8 p-2 lg:p-6 text-slate-100 min-h-screen">
      <div className="max-w-md mx-auto w-full">
        <div className="rounded-2xl border border-slate-700 bg-gradient-to-b from-sky-950/40 to-slate-800 overflow-hidden flex flex-col">

          <form onSubmit={handleRechercherVille} className="p-4 border-b border-slate-700/60 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={villeInput}
                onChange={(e) => setVilleInput(e.target.value)}
                placeholder="Rechercher une ville..."
                className="w-full bg-slate-900/60 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-400"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-sky-500/20 border border-sky-500/40 px-3 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/30 transition-colors"
            >
              OK
            </button>
          </form>

          {loadingMeteo ? (
            <div className="flex-1 flex items-center justify-center p-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            </div>
          ) : meteo ? (
            <div className="flex-1 flex flex-col">
              <div className="p-5 text-center border-b border-slate-700/40">
                <p className="text-xs uppercase tracking-widest text-sky-300/70 font-bold mb-2">{ville}</p>
                <div className="flex items-center justify-center gap-3">
                  <IconeMeteo icon={meteo.icon} conditions={meteo.conditions} className="h-14 w-14" />
                  <div className="text-left">
                    <p className="text-4xl font-black text-white leading-none">{meteo.tempActuelle}°</p>
                    <p className="text-sm text-slate-400 mt-1">
                      <span className="text-orange-300 font-semibold">{meteo.tempMaxJour}°</span>
                      {" / "}
                      <span className="text-sky-300 font-semibold">{meteo.tempMinJour}°</span>
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2 capitalize">{meteo.conditions}</p>
              </div>

              <div className="px-4 pt-4">
                <div className={`rounded-xl border p-3 ${COULEURS[meteo.alerte.niveau]}`}>
                  <p className="font-semibold text-xs">
                    {EMOJIS[meteo.alerte.niveau]} {meteo.alerte.motif}
                  </p>
                </div>
              </div>

              <div className="px-4 pt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Matin</p>
                  <p className="text-lg font-black text-white">{meteo.matin.temp}°C</p>
                  <p className="text-[10px] text-sky-400/70">Rafales {meteo.matin.rafales} km/h</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Apres-midi</p>
                  <p className="text-lg font-black text-white">{meteo.apresMidi.temp}°C</p>
                  <p className="text-[10px] text-sky-400/70">Rafales {meteo.apresMidi.rafales} km/h</p>
                </div>
              </div>

              <div className="mt-4 px-2 pb-4 grid grid-cols-4 gap-1">
                {meteo.prochainsJours.map((j) => (
                  <div key={j.date} className="flex flex-col items-center gap-1 rounded-lg py-3 px-1 hover:bg-slate-700/30 transition-colors">
                    <p className="text-[10px] font-bold text-slate-400 truncate w-full text-center">
                      {nomJour(j.date).slice(0, 3)}
                    </p>
                    <IconeMeteo icon={j.icon} conditions={j.conditions} className="h-6 w-6" />
                    <p className="text-xs font-bold text-white">{j.tempMax}°</p>
                    <p className="text-[10px] text-slate-500">{j.tempMin}°</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 p-6 text-center">Meteo indisponible pour cette ville.</p>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800">
        <h2 className="mb-4 text-lg font-bold text-slate-200 flex items-center gap-2">
          <Building className="h-5 w-5 text-emerald-400" />
          Meteo & Impact sur vos Chantiers Actifs
        </h2>
        <ChantiersMeteoCards />
      </div>
    </div>
  );
}
