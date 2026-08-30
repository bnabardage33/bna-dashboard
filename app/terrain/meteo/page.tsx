"use client";

import { useEffect, useState } from "react";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import ChantiersMeteoCards from "@/components/ChantiersMeteoCards";
import { Search, Sun, Cloud, CloudSun, CloudFog, Snowflake, Wind, CloudRain, Building } from "lucide-react";

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
    case "wind":  return <Wind      {...props} className={`${props.className} text-gray-400`} />;
    default:
      if (orage) return <CloudRain {...props} className={`${props.className} text-gray-400`} />;
      if (neige) return <Snowflake {...props} className={`${props.className} text-gray-300`} />;
      if (pluie) return <CloudRain {...props} className={`${props.className} text-gray-400`} />;
      return <Cloud {...props} className={`${props.className} text-gray-400`} />;
  }
}

function nomJour(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  const jour = date.toLocaleDateString("fr-FR", { weekday: "long" });
  return jour.charAt(0).toUpperCase() + jour.slice(1);
}

export default function MeteoPage() {
  const [villeInput, setVilleInput]     = useState("Bordeaux");
  const [ville, setVille]               = useState("Bordeaux");
  const [meteo, setMeteo]               = useState<JourMeteo | null>(null);
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
    if (villeInput.trim()) setVille(villeInput.trim());
  }

  return (
    <div className="space-y-8 p-2 lg:p-6 text-white">

      {/* CARTE MÉTÉO PRINCIPALE */}
      <div className="max-w-md mx-auto w-full">
        <div className="rounded-2xl border border-white/10 bg-[#1A1D24] overflow-hidden flex flex-col shadow-lg">

          {/* RECHERCHE */}
          <form onSubmit={handleRechercherVille} className="p-4 border-b border-white/[0.06] flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                type="text"
                value={villeInput}
                onChange={(e) => setVilleInput(e.target.value)}
                placeholder="Rechercher une ville..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 outline-none focus:border-[#E30613]/50 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-red-600 hover:bg-red-700 transition-colors px-4 py-2 text-xs font-bold text-white"
            >
              OK
            </button>
          </form>

          {/* DONNÉES */}
          {loadingMeteo ? (
            <div className="flex-1 flex items-center justify-center p-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#E30613] border-t-transparent" />
            </div>
          ) : meteo ? (
            <div className="flex-1 flex flex-col">

              {/* VILLE + TEMPÉRATURE */}
              <div className="p-5 text-center border-b border-white/[0.06]">
                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-2">{ville}</p>
                <div className="flex items-center justify-center gap-3">
                  <IconeMeteo icon={meteo.icon} conditions={meteo.conditions} className="h-14 w-14" />
                  <div className="text-left">
                    <p className="text-4xl font-black text-white leading-none">{meteo.tempActuelle}°</p>
                    <p className="text-sm text-gray-400 mt-1">
                      <span className="text-white font-semibold">{meteo.tempMaxJour}°</span>
                      {" / "}
                      <span className="text-gray-500 font-semibold">{meteo.tempMinJour}°</span>
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2 capitalize">{meteo.conditions}</p>
              </div>

              {/* ALERTE CHANTIER */}
              <div className="px-4 pt-4">
                <div className={`rounded-xl border p-3 ${COULEURS[meteo.alerte.niveau]}`}>
                  <p className="font-semibold text-xs">{EMOJIS[meteo.alerte.niveau]} {meteo.alerte.motif}</p>
                </div>
              </div>

              {/* MATIN / APRÈS-MIDI */}
              <div className="px-4 pt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Matin</p>
                  <p className="text-lg font-black text-white">{meteo.matin.temp}°C</p>
                  <p className="text-[10px] text-gray-400">Rafales {meteo.matin.rafales} km/h</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Après-midi</p>
                  <p className="text-lg font-black text-white">{meteo.apresMidi.temp}°C</p>
                  <p className="text-[10px] text-gray-400">Rafales {meteo.apresMidi.rafales} km/h</p>
                </div>
              </div>

              {/* PRÉVISIONS 4 JOURS */}
              <div className="mt-4 px-2 pb-4 grid grid-cols-4 gap-1">
                {meteo.prochainsJours.map((j) => (
                  <div key={j.date} className="flex flex-col items-center gap-1 rounded-lg py-3 px-1 hover:bg-white/[0.04] transition-colors">
                    <p className="text-[10px] font-bold text-gray-400 truncate w-full text-center">
                      {nomJour(j.date).slice(0, 3)}
                    </p>
                    <IconeMeteo icon={j.icon} conditions={j.conditions} className="h-6 w-6" />
                    <p className="text-xs font-bold text-white">{j.tempMax}°</p>
                    <p className="text-[10px] text-gray-500">{j.tempMin}°</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 p-6 text-center">Météo indisponible pour cette ville.</p>
          )}
        </div>
      </div>

      {/* MÉTÉO CHANTIERS */}
      <div className="pt-4 border-t border-white/[0.06]">
        <h2 className="mb-4 text-lg font-bold text-gray-200 flex items-center gap-2">
          <Building className="h-5 w-5 text-gray-400" />
          Météo &amp; Impact sur vos Chantiers Actifs
        </h2>
        <ChantiersMeteoCards />
      </div>
    </div>
  );
}
