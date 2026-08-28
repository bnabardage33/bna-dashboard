"use client";

import { useState, useEffect } from "react";
import { Users, Link as LinkIcon, ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function PortailsClientsPage() {
  const [isCopied, setIsCopied] = useState("");
  const [chantiers, setChantiers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPortails = async () => {
      const { data, error } = await supabase
        .from("chantiers")
        .select(`
          id,
          nom,
          code_acces,
          statut,
          created_at,
          clients ( nom )
        `)
        .not("code_acces", "is", null)
        .order("created_at", { ascending: false });

      if (data) {
        setChantiers(data);
      }
      setIsLoading(false);
    };

    fetchPortails();
  }, []);

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/espace-client/${code}`;
    navigator.clipboard.writeText(url);
    setIsCopied(code);
    setTimeout(() => setIsCopied(""), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
              <Users className="h-8 w-8 text-purple-400" />
              Gestion des Espaces Clients
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Gérez les accès de vos clients à leur portail de suivi de chantier.
            </p>
          </div>
          <Link href="/terrain/chantier" className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 transition-colors">
            <Plus className="h-4 w-4" />
            Créer un portail
          </Link>
        </header>

        <div className="grid gap-4 mt-8">
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">Chargement des portails...</div>
          ) : chantiers.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-xl border border-slate-700/50">
              Aucun espace client actif. Générez un code d'accès depuis une fiche chantier.
            </div>
          ) : (
            chantiers.map((chantier) => (
              <div key={chantier.id} className="flex flex-col sm:flex-row items-center justify-between p-5 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-purple-500/50 transition-colors">
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-lg text-slate-200">{chantier.nom}</h3>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${chantier.statut === "terminé" ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"}`}>
                      {chantier.statut || "En cours"}
                    </span>
                  </div>
                  <div className="text-sm text-slate-400 flex items-center gap-4">
                    <span>{chantier.clients?.nom || "Client inconnu"}</span>
                    <span className="flex items-center gap-1 font-mono text-cyan-400 bg-slate-900 px-2 py-0.5 rounded">
                      Code: {chantier.code_acces}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4 sm:mt-0 w-full sm:w-auto">
                  <button 
                    onClick={() => copyLink(chantier.code_acces)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium transition-colors"
                  >
                    <LinkIcon className="h-4 w-4" />
                    {isCopied === chantier.code_acces ? "Lien copié !" : "Copier le lien"}
                  </button>
                  <Link 
                    href={`/espace-client/${chantier.code_acces}`}
                    target="_blank"
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold transition-colors"
                  >
                    Voir
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
