"use client";

import { useEffect, useState } from "react";
import { fetchMeteo, JourMeteo, maxConnu } from "@/lib/meteo";
import { texteDegre, texteKmh, texteMm } from "@/components/TableauPrecipitations";
import {
  Search,
  Sun,
  Cloud,
  CloudSun,
  CloudFog,
  Snowflake,
  Wind,
  CloudRain,
  Droplets,
} from "lucide-react";
import { Surface } from '@/components/ui/Surface';

// Grille horaire de l'accueil : uniquement les heures de travail (06 h → 18 h
// incluses). Les relevés nocturnes restent dans la réponse de la route — ils
// servent au calcul matin / après-midi et aux alertes — mais n'encombrent plus
// la carte. Le filtre est PUREMENT d'affichage : aucune donnée n'est modifiée.
const HEURE_DEBUT = 6;
const HEURE_FIN = 18;

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
  const d = new Date(dateStr + "T12:00:00");
  const j = d.toLocaleDateString("fr-FR", { weekday: "long" });
  return j.charAt(0).toUpperCase() + j.slice(1);
}

/**
 * Un cumul de pluie journalier.
 *
 * La valeur est AFFICHÉE TELLE QUELLE : `cumulPluie` est déjà un total de
 * journée (fourni par la source pour J+1..J+3, calculé une seule fois à partir
 * des relevés horaires pour aujourd'hui). On ne l'additionne jamais. Si la
 * source ne le fournit pas, on affiche « — » plutôt qu'un 0 inventé.
 */
function CumulPluie({ label, valeur }: { label: string; valeur?: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-1.5 py-1.5 text-center">
      <p className="text-4xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-white">
        {typeof valeur === "number" ? `${valeur} mm` : "—"}
      </p>
    </div>
  );
}

export default function MeteoGeneraleAccueil() {
  const [villeInput, setVilleInput] = useState("Bordeaux");
  const [ville, setVille] = useState("Bordeaux");
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loadingMeteo, setLoadingMeteo] = useState(true);
  const [erreurMeteo, setErreurMeteo] = useState<string | null>(null);
  const [detailOuvert, setDetailOuvert] = useState(false);

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

  // 06 h → 18 h incluses : `parseInt("06:00")` vaut 6 et `parseInt("18:00")`
  // vaut 18. `heures` est déjà trié par la route ; on conserve cet ordre.
  const heuresJour = meteo
    ? meteo.heures.filter((h) => {
        const hh = parseInt(h.heure, 10);
        return hh >= HEURE_DEBUT && hh <= HEURE_FIN;
      })
    : [];

  return (
    <Surface className="overflow-hidden">
      <form onSubmit={handleRechercherVille} className="flex gap-2 border-b border-white/[0.06] p-3 sm:p-4">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <label htmlFor="ville-meteo-accueil" className="sr-only">
            Rechercher une ville
          </label>
          <input
            id="ville-meteo-accueil"
            type="text"
            value={villeInput}
            onChange={(e) => setVilleInput(e.target.value)}
            placeholder="Rechercher une ville..."
            className="min-h-11 w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-gray-200 outline-none transition-colors focus:border-[#B85B2B]/50"
          />
        </div>
        {/* Loupe blanche sur fond rouge BNA : même emplacement, même alignement
            avec le champ, même cible tactile de 44 px. Le `type="submit"` est
            inchangé : la touche Entrée déclenche toujours le même `onSubmit`. */}
        <button
          type="submit"
          aria-label="Rechercher la ville"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#B85B2B] text-white transition-colors hover:bg-[#8f431c]"
        >
          <Search className="h-5 w-5" aria-hidden />
        </button>
      </form>

      {loadingMeteo ? (
        <div className="flex items-center justify-center p-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#B85B2B] border-t-transparent" />
        </div>
      ) : meteo ? (
        <div className="flex flex-col">
          {/* Résumé compact : ville, température, ciel et alerte du jour. */}
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="border-b border-white/[0.06] p-4 sm:border-b-0 sm:border-r">
              <p className="truncate text-2xs font-bold uppercase tracking-widest text-gray-400">{ville}</p>
              <div className="mt-2 flex items-center gap-3">
                <IconeMeteo icon={meteo.icon} conditions={meteo.conditions} className="h-12 w-12 shrink-0" />
                <div className="min-w-0">
                  <p className="text-3xl font-black leading-none text-white">{meteo.tempActuelle}°</p>
                  <p className="mt-1 text-xs text-gray-400">
                    <span className="font-semibold text-white">{meteo.tempMaxJour}°</span>
                    {" / "}
                    <span className="font-semibold text-gray-500">{meteo.tempMinJour}°</span>
                  </p>
                </div>
              </div>
              <p className="mt-1 truncate text-xs capitalize text-gray-400">{meteo.conditions}</p>

              <div className={`mt-3 flex items-start gap-1.5 rounded-lg border px-2 py-1.5 ${COULEURS[meteo.alerte.niveau]}`}>
                <span aria-hidden className="shrink-0">{EMOJIS[meteo.alerte.niveau]}</span>
                <p className="text-2xs font-semibold leading-snug">{meteo.alerte.motif}</p>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                  <p className="text-2xs font-bold uppercase tracking-wider text-gray-500">Matin</p>
                  <p className="text-lg font-black text-white">{texteDegre(meteo.matin.temp)}</p>
                  <p className="text-2xs text-gray-400">Rafales {texteKmh(meteo.matin.rafales)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                  <p className="text-2xs font-bold uppercase tracking-wider text-gray-500">Après-midi</p>
                  <p className="text-lg font-black text-white">{texteDegre(meteo.apresMidi.temp)}</p>
                  <p className="text-2xs text-gray-400">Rafales {texteKmh(meteo.apresMidi.rafales)}</p>
                </div>
              </div>

              {/* Cumuls JOURNALIERS : aujourd'hui, demain, après-demain. */}
              <div className="mt-3">
                <p className="flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-gray-500">
                  <Droplets className="h-3 w-3" aria-hidden />
                  Pluie prévue
                </p>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <CumulPluie label="Aujourd'hui" valeur={meteo.cumulPluie} />
                  <CumulPluie label="Demain" valeur={meteo.prochainsJours[0]?.cumulPluie} />
                  <CumulPluie label="Après-demain" valeur={meteo.prochainsJours[1]?.cumulPluie} />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/[0.06] px-4 py-1">
            <button
              type="button"
              onClick={() => setDetailOuvert((v) => !v)}
              className="flex min-h-11 items-center text-xs font-medium text-gray-400 hover:text-gray-200"
            >
              {detailOuvert ? "▲ Masquer le détail heure par heure" : "▼ Afficher le détail heure par heure"}
            </button>
          </div>

          {detailOuvert && (
            <div className="border-t border-white/[0.06] px-3 pb-3 pt-2">
              <p className="mb-1.5 text-4xs text-gray-500">
                V = vent moyen · R = rafales, en km/h — heures de 06 h à 18 h.
              </p>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-7">
                {heuresJour.map((h) => (
                  <div key={h.heure} className="rounded-lg border border-white/10 bg-white/[0.03] px-1 py-1.5 text-center">
                    <p className="text-4xs text-gray-500">{h.heure}</p>
                    <p className="text-sm font-bold text-white">{texteDegre(h.temp)}</p>
                    <p
                      className="text-4xs leading-tight text-gray-400"
                      title={`Vent moyen ${texteKmh(h.vent)}, rafales ${texteKmh(h.rafales)}`}
                    >
                      {texteKmh(h.vent)} · {texteKmh(h.rafales)}
                    </p>
                    {/* Une heure sans relevé affiche un tiret : « 0 mm » se
                        lirait comme une garantie de temps sec. */}
                    <p className="text-4xs leading-tight text-gray-500">{texteMm(h.pluie)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* J+1 à J+4 : la fenêtre de l'API reste inchangée. */}
          <div className="grid grid-cols-4 gap-1 border-t border-white/[0.06] px-2 py-2">
            {meteo.prochainsJours.map((j) => (
              <div key={j.date} className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 transition-colors hover:bg-white/[0.04]">
                <p className="w-full truncate text-center text-2xs font-bold text-gray-400">
                  {nomJour(j.date).slice(0, 3)}
                </p>
                <IconeMeteo icon={j.icon} conditions={j.conditions} className="h-6 w-6" />
                <p className="text-xs font-bold text-white">{j.tempMax}°</p>
                <p className="text-2xs text-gray-500">{j.tempMin}°</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="p-4 text-center text-sm text-gray-400">
          {erreurMeteo ?? "Météo indisponible pour cette ville."}
        </p>
      )}
    </Surface>
  );
}
