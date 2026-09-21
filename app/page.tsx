"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { Mic, FileText, ArrowRight, LogIn } from "lucide-react";
import BoutonMicroNote from "@/components/BoutonMicroNote";
import { supabase } from "@/lib/supabase";

type Note = {
  id: string;
  titre: string | null;
  contenu: string;
  created_at: string | null;
  epingle?: boolean;
  updated_at?: string | null;
};

export default function Home() {
  const [dernieieresNotes, setDernieresNotes] = useState<Note[]>([]);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ notes: 0, chantiers: 0, devis: 0 });
  // null = session en cours de vérification ; true/false = session présente/absente.
  const [sessionActive, setSessionActive] = useState<boolean | null>(null);
  // Évite de déclencher les fetches plusieurs fois (getSession + onAuthStateChange).
  const aCharge = useRef(false);

  async function chargerStats() {
    try {
      const [notesRes, chantiersRes, devisRes] = await Promise.all([
        supabase.from("notes_patron").select("*", { count: "exact", head: true }),
        supabase.from("chantiers").select("*", { count: "exact", head: true }).in("statut", ["en_cours", "En cours", "prevu", "Actif", "Préparation", "preparation", "nouveau"]),
        supabase.from("devis").select("*", { count: "exact", head: true }),
      ]);
      setStats({
        notes: notesRes.count || 0,
        chantiers: chantiersRes.count || 0,
        devis: devisRes.count || 0,
      });
    } catch {
      // stats restent à 0 si erreur
    }
  }

  async function chargerNotes() {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("notes_patron")
        .select("id, titre, contenu, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      if (err) throw err;
      if (data) setDernieresNotes(data);
    } catch (err) {
      setError((err as Error).message || "Erreur lors du chargement des notes");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let actif = true;

    // Les données affichées (notes_patron, chantiers, devis) sont PRIVÉES :
    // on ne lance AUCUN fetch sans session active. Sans session, la page
    // affiche un CTA de connexion — la RLS reste la barrière de sécurité réelle.
    const gererSession = (session: Session | null) => {
      if (!actif) return;
      setSessionActive(session !== null);
      if (!session) {
        aCharge.current = false; // relance les fetches à la prochaine connexion
        return;
      }
      if (aCharge.current) return;
      aCharge.current = true;
      chargerNotes();
      chargerStats();
    };

    supabase.auth.getSession().then(({ data }) => gererSession(data.session));

    const { data: abonnement } = supabase.auth.onAuthStateChange(
      (_evenement, session) => gererSession(session)
    );

    return () => {
      actif = false;
      abonnement.subscription.unsubscribe();
    };
  }, []);

  async function handleTexteReformule(texte: string) {
    setIsSavingNote(true);
    const titreExtrait = texte.split(".")[0].slice(0, 40) + "...";

    try {
      const { data, error } = await supabase.from("notes_patron").insert({
        titre: titreExtrait,
        contenu: texte,
      }).select();

      if (!error && data) {
        setDernieresNotes((prev) => [data[0], ...prev].slice(0, 3));
      }
      await chargerStats();
    } catch (err) {
      setError((err as Error).message || "Erreur lors de la sauvegarde");
      console.error(err);
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <div className="relative overflow-hidden w-full">
      <div className="absolute top-0 inset-x-0 h-[380px] bg-[radial-gradient(ellipse_at_top,_rgba(227,6,19,0.15),transparent_60%)] pointer-events-none z-0" />

      <main className="relative z-10 px-4 pt-6 pb-[20px] flex flex-col gap-8">
        {sessionActive === null ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-4 h-24 animate-pulse"
              />
            ))}
          </div>
        ) : sessionActive === false ? (
          <section className="rounded-2xl border border-white/10 bg-[#1A1D24] p-8 text-center shadow-lg">
            <LogIn className="w-10 h-10 mx-auto text-[#E30613] mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              Connectez-vous pour accéder au tableau de bord
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              Vos notes, chantiers et devis sont chargés une fois la session active.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-[#E30613] px-6 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors"
            >
              Se connecter <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : (
          <>
            {/* Stats rapides */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-4 text-center">
                <p className="text-2xl font-black text-white">{stats.notes}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Notes récentes</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-4 text-center">
                <p className={`text-2xl font-black ${isSavingNote ? "text-[#E30613]" : "text-gray-500"}`}>{isSavingNote ? "✓" : "○"}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Micro</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-4 text-center">
                <p className="text-2xl font-black text-white">{stats.chantiers}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Chantiers</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-4 text-center">
                <p className="text-2xl font-black text-white">{stats.devis}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Devis</p>
              </div>
            </div>

            {/* Assistant Vocal (IA) */}
            <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-6 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                <Mic className="w-48 h-48 text-white" />
              </div>

              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2 relative z-10">
                <Mic className="h-5 w-5 text-[#E30613]" />
                Assistant Vocal (IA)
              </h2>
              <p className="text-sm text-gray-400 mb-6 relative z-10">
                Dictez une idée, un rappel ou un compte-rendu. L'IA reformulera votre note et l'enregistrera automatiquement.
              </p>

              <div className="flex flex-col items-center justify-center p-6 bg-black/20 rounded-xl border border-white/5 relative z-10">
                <BoutonMicroNote
                  onTexteReformule={handleTexteReformule}
                  onErreur={(msg) => alert("Erreur IA: " + msg)}
                />
                <p className="mt-4 text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  {isSavingNote ? "Enregistrement de la note..." : "Appuyez pour parler"}
                </p>
              </div>
            </div>

            {/* Dernières Notes */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#E30613]" />
                  Dernières Notes
                </h3>
                <Link href="/terrain/notes" className="text-xs font-bold text-[#E30613] hover:text-red-400 flex items-center gap-1 transition-colors">
                  Tout voir <ArrowRight className="h-3 w-3" />
                </Link>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-center text-red-300 text-sm">
                  {error}
                </div>
              )}

              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-xl border border-white/10 bg-[#1A1D24] p-6 h-32 animate-pulse">
                      <div className="h-4 bg-white/10 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-white/5 rounded w-full mb-1"></div>
                      <div className="h-3 bg-white/5 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {dernieieresNotes.map(n => (
                      <Link key={n.id} href="/terrain/notes" className="group rounded-xl border border-white/10 bg-[#1A1D24] p-4 hover:border-[#E30613]/50 hover:bg-[#1A1D24]/80 transition-all duration-200 flex flex-col h-32">
                        <h4 className="font-semibold text-white text-sm mb-2 truncate group-hover:text-[#E30613] transition-colors">{n.titre || "Note sans titre"}</h4>
                        <p className="text-xs text-gray-400 line-clamp-3">{n.contenu}</p>
                        <span className="mt-auto pt-2 text-[10px] text-gray-500 font-medium">
                          {n.created_at ? new Date(n.created_at).toLocaleDateString("fr-FR") : ""}
                        </span>
                      </Link>
                    ))}
                    {dernieieresNotes.length === 0 && !error && (
                      <div className="col-span-3 rounded-xl border border-dashed border-white/10 bg-[#1A1D24] p-8 text-center text-gray-500 text-sm">
                        Aucune note récente. Utilisez le micro ci-dessus !
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}