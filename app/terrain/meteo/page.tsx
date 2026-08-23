"use client";

import { useEffect, useState } from "react";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import ChantiersMeteoCards from "@/components/ChantiersMeteoCards";
import BoutonMicroNote from "@/components/BoutonMicroNote";
import { supabase } from "@/lib/supabase";
import { Mic, CloudRain, FileText, ArrowRight, Activity, Building, Search, Sun, Cloud, CloudSun, CloudFog, Snowflake, Wind } from "lucide-react";
import Link from "next/link";

const COULEURS = {
  vert: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  jaune: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  rouge: "border-red-500/40 bg-red-500/10 text-red-400",
} as const;

const EMOJIS = { vert: "🟢", jaune: "🟡", orange: "🟠", rouge: "🔴" } as const;

// Mappe les codes icône Visual Crossing vers une icône Lucide
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

type Note = {
  id: string;
  titre: string | null;
  contenu: string;
  created_at: string;
};

export default function HomeTerrainPage() {
  // Météo
  const [villeInput, setVilleInput] = useState("Bordeaux");
  const [ville, setVille] = useState("Bordeaux");
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loadingMeteo, setLoadingMeteo] = useState(true);

  // Notes / IA
  const [dernieresNotes, setDernieresNotes] = useState<Note[]>([]);
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    async function chargerData() {
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

      const { data: notesData } = await supabase
        .from("notes_patron")
        .select("id, titre, contenu, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      if (notesData) setDernieresNotes(notesData);
    }
    chargerData();
  }, [ville]);

  function handleRechercherVille(e: React.FormEvent) {
    e.preventDefault();
    if (villeInput.trim()) {
      setVille(villeInput.trim());
    }
  }

  async function handleTexteReformule(texte: string) {
    setIsSavingNote(true);
    const titreExtrait = texte.split(".")[0].slice(0, 40) + "...";

    const { data, error } = await supabase.from("notes_patron").insert({
      titre: titreExtrait,
      contenu: texte,
    }).select();

    if (!error && data) {
      setDernieresNotes((prev) => [data[0], ...prev].slice(0, 3));
    }
    setIsSavingNote(false);
  }

  return (
    <div className="space-y-8 p-2 lg:p-6 text-slate-100 min-h-screen">

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
            <Activity className="h-8 w-8 text-cyan-400" />
            Tableau de bord
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Votre centre de contrôle quotidien : météo, notes rapides et chantiers actifs.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* COLONNE GAUCHE : IA & Notes */}
        <div className="lg:col-span-2 space-y-6">

          {/* Bloc Assistant IA */}
          <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-800 to-cyan-950/20 p-6 shadow-lg shadow-cyan-900/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
              <Mic className="w-48 h-48" />
            </div>

            <h2 className="text-xl font-bold text-slate-100 mb-2 flex items-center gap-2 relative z-10">
              <Mic className="h-5 w-5 text-cyan-400" />
              Assistant Vocal (IA Groq)
            </h2>
            <p className="text-sm text-slate-400 mb-6 relative z-10">
              Dictez une idée, un rappel ou un compte-rendu. L'IA reformulera votre note et l'enregistrera automatiquement.
            </p>

            <div className="flex flex-col items-center justify-center p-6 bg-slate-900/50 rounded-xl border border-slate-700/50 relative z-10">
              <BoutonMicroNote
                onTexteReformule={handleTexteReformule}
                onErreur={(msg) => alert("Erreur IA: " + msg)}
              />
              <p className="mt-4 text-xs font-semibold text-slate-500 uppercase tracking-widest">
                {isSavingNote ? "Enregistrement de la note..." : "Appuyez pour parler"}
              </p>
            </div>
          </div>

          {/* Dernières notes */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-400" />
                Dernières Notes
              </h3>
              <Link href="/terrain/notes" className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                Tout voir <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dernieresNotes.map(n => (
                <Link key={n.id} href="/terrain/notes" className="group rounded-xl border border-slate-700 bg-slate-800/80 p-4 hover:border-amber-500/50 transition-colors flex flex-col h-32">
                  <h4 className="font-semibold text-slate-200 text-sm mb-2 truncate group-hover:text-amber-400">{n.titre || "Note sans titre"}</h4>
                  <p className="text-xs text-slate-400 line-clamp-3">{n.contenu}</p>
                  <span className="mt-auto pt-2 text-[10px] text-slate-500 font-medium">
                    {new Date(n.created_at).toLocaleDateString("fr-FR")}
                  </span>
                </Link>
              ))}
              {dernieresNotes.length === 0 && (
                <div className="col-span-3 rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500 text-sm">
                  Aucune note récente. Utilisez le micro ci-dessus !
                </div>
              )}
            </div>
          </div>

        </div>

        {/* COLONNE DROITE : Météo style JT */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-700 bg-gradient-to-b from-sky-950/40 to-slate-800 overflow-hidden h-full flex flex-col">

            {/* Barre de recherche ville */}
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

                {/* Jour principal (aujourd'hui) */}
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

                {/* Alerte */}
                <div className="px-4 pt-4">
                  <div className={`rounded-xl border p-3 ${COULEURS[meteo.alerte.niveau]}`}>
                    <p className="font-semibold text-xs">
                      {EMOJIS[meteo.alerte.niveau]} {meteo.alerte.motif}
                    </p>
                  </div>
                </div>

                {/* Matin / Après-midi */}
                <div className="px-4 pt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Matin</p>
                    <p className="text-lg font-black text-white">{meteo.matin.temp}°C</p>
                    <p className="text-[10px] text-sky-400/70">Rafales {meteo.matin.rafales} km/h</p>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Après-midi</p>
                    <p className="text-lg font-black text-white">{meteo.apresMidi.temp}°C</p>
                    <p className="text-[10px] text-sky-400/70">Rafales {meteo.apresMidi.rafales} km/h</p>
                  </div>
                </div>

                {/* Prochains jours - bandeau style JT */}
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
              <p className="text-sm text-slate-500 p-6 text-center">Météo indisponible pour cette ville.</p>
            )}
          </div>
        </div>
      </div>

      {/* SECTION DU BAS : Chantiers Actifs & Intempéries */}
      <div className="pt-4 border-t border-slate-800">
        <h2 className="mb-4 text-lg font-bold text-slate-200 flex items-center gap-2">
          <Building className="h-5 w-5 text-emerald-400" />
          Météo & Impact sur vos Chantiers Actifs
        </h2>
        <ChantiersMeteoCards />
      </div>

    </div>
  );
}
