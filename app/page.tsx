"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, FileText, ArrowRight } from "lucide-react";
import Drawer from "@/components/Drawer";
import BoutonMicroNote from "@/components/BoutonMicroNote";
import { supabase } from "@/lib/supabase";

type Note = {
  id: string;
  titre: string | null;
  contenu: string;
  created_at: string;
};

export default function Home() {
  const [dernieresNotes, setDernieresNotes] = useState<Note[]>([]);
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    async function chargerNotes() {
      const { data } = await supabase
        .from("notes_patron")
        .select("id, titre, contenu, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      if (data) setDernieresNotes(data);
    }
    chargerNotes();
  }, []);

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
    <div className="relative overflow-hidden w-full">
      <div className="absolute top-0 inset-x-0 h-[380px] bg-[radial-gradient(ellipse_at_top,_rgba(120,20,20,0.28),transparent_60%)] pointer-events-none z-0" />

      <header className="relative z-10 bg-black rounded-[22px] mx-4 mt-4 h-[145px] flex items-center justify-between px-5 border border-white/5 overflow-hidden">
        <Drawer />
        <img src="/logo-bna.png" alt="BNA Bardage" className="absolute left-1/2 -translate-x-1/2 h-auto max-h-[115px] w-[90%] object-contain scale-[2.2] pointer-events-none" />
        <div className="w-10" />
      </header>

      <main className="relative z-10 px-4 pt-6 pb-[20px] space-y-6">
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-slate-800 to-cyan-950/20 p-6 shadow-lg shadow-cyan-900/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <Mic className="w-48 h-48" />
          </div>

          <h2 className="text-xl font-bold text-slate-100 mb-2 flex items-center gap-2 relative z-10">
            <Mic className="h-5 w-5 text-cyan-400" />
            Assistant Vocal (IA Groq)
          </h2>
          <p className="text-sm text-slate-400 mb-6 relative z-10">
            Dictez une idee, un rappel ou un compte-rendu. L'IA reformulera votre note et l'enregistrera automatiquement.
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

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-400" />
              Dernieres Notes
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
                Aucune note recente. Utilisez le micro ci-dessus !
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
