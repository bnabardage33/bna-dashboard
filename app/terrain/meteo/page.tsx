
"use client";

import { useEffect, useState } from "react";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import ChantiersMeteoCards from "@/components/ChantiersMeteoCards";
import BoutonMicroNote from "@/components/BoutonMicroNote";
import { supabase } from "@/lib/supabase";
import { Mic, Cloud, Sun, Wind, CloudRain, ListTodo, FileText, ArrowRight, Activity, Building } from "lucide-react";
import Link from "next/link";

const COULEURS = {
  vert: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  jaune: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  rouge: "border-red-500/40 bg-red-500/10 text-red-400",
} as const;

const EMOJIS = { vert: "🟢", jaune: "🟡", orange: "🟠", rouge: "🔴" } as const;

type Note = {
  id: string;
  titre: string | null;
  contenu: string;
  created_at: string;
};

export default function HomeTerrainPage() {
  // Météo
  const [ville, setVille] = useState("Bordeaux");
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loadingMeteo, setLoadingMeteo] = useState(true);
  
  // Notes / IA
  const [dernieresNotes, setDernieresNotes] = useState<Note[]>([]);
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    async function chargerData() {
      // 1. Charger météo
      try {
        const data = await fetchMeteo(ville);
        setMeteo(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingMeteo(false);
      }
      
      // 2. Charger dernières notes du patron
      const { data: notesData } = await supabase
        .from("notes_patron")
        .select("id, titre, contenu, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      if (notesData) setDernieresNotes(notesData);
    }
    chargerData();
  }, [ville]);

  // Handler de l'IA Vocale
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

        {/* COLONNE DROITE : Météo Globale */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 h-full flex flex-col">
            <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
              <CloudRain className="h-5 w-5 text-sky-400" />
              Météo — {ville}
            </h2>
            
            {loadingMeteo ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              </div>
            ) : meteo ? (
              <div className="space-y-4 flex-1">
                <div className={`rounded-xl border p-4 ${COULEURS[meteo.alerte.niveau]}`}>
                  <p className="font-semibold text-sm">
                    {EMOJIS[meteo.alerte.niveau]} {meteo.alerte.motif}
                  </p>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Matin</p>
                      <p className="text-2xl font-black text-white">{meteo.matin.temp}°C</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-sky-200">Vent : <span className="font-bold">{meteo.matin.vent}</span> km/h</p>
                      <p className="text-[10px] text-sky-400/70 mt-0.5">Rafales : {meteo.matin.rafales} km/h</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Après-midi</p>
                      <p className="text-2xl font-black text-white">{meteo.apresMidi.temp}°C</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-sky-200">Vent : <span className="font-bold">{meteo.apresMidi.vent}</span> km/h</p>
                      <p className="text-[10px] text-sky-400/70 mt-0.5">Rafales : {meteo.apresMidi.rafales} km/h</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Météo indisponible.</p>
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
