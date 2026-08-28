"use client";

import { useState } from "react";
import { Users, Link as LinkIcon, ExternalLink, Plus } from "lucide-react";
import Link from "next/link";

export default function PortailsClientsPage() {
  const [isCopied, setIsCopied] = useState("");

  // Exemple statique pour le moment
  const chantiers = [
    {
      id: "1",
      nom: "Rénovation Façade Dupont",
      code: "DUPONT2026",
      statut: "En cours",
      date: "2026-08-15"
    },
    {
      id: "2",
      nom: "Extension Bois Martin",
      code: "MARTIN-EXT",
      statut: "Terminé",
      date: "2026-07-02"
    }
  ];

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
          <button className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 transition-colors">
            <Plus className="h-4 w-4" />
            Nouveau Portail
          </button>
        </header>

        <div className="grid gap-4 mt-8">
          {chantiers.map((chantier) => (
            <div key={chantier.id} className="flex flex-col sm:flex-row items-center justify-between p-5 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-purple-500/50 transition-colors">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-bold text-lg text-slate-200">{chantier.nom}</h3>
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${chantier.statut === "En cours" ? "bg-amber-400/10 text-amber-400" : "bg-emerald-400/10 text-emerald-400"}`}>
                    {chantier.statut}
                  </span>
                </div>
                <div className="text-sm text-slate-400 flex items-center gap-4">
                  <span>Créé le {chantier.date}</span>
                  <span className="flex items-center gap-1 font-mono text-cyan-400 bg-slate-900 px-2 py-0.5 rounded">
                    Code: {chantier.code}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4 sm:mt-0 w-full sm:w-auto">
                <button 
                  onClick={() => copyLink(chantier.code)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium transition-colors"
                >
                  <LinkIcon className="h-4 w-4" />
                  {isCopied === chantier.code ? "Lien copié !" : "Copier le lien"}
                </button>
                <Link 
                  href={`/espace-client/${chantier.code}`}
                  target="_blank"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold transition-colors"
                >
                  Voir
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
