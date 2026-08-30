"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Plus, Wrench, CheckCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function SAVPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState("tous");
  const [recherche, setRecherche] = useState("");

  const fetchTickets = async () => {
    setLoading(true);
    let q = supabase
      .from("tickets_sav")
      .select("*, chantiers(nom, clients(nom))")
      .order("created_at", { ascending: false });

    if (filtre === "ouvert") q = q.eq("statut", "ouvert");
    if (filtre === "cloture") q = q.eq("statut", "cloture");
    if (filtre === "garantie") q = q.eq("sous_garantie", true);
    if (filtre === "hors_garantie") q = q.eq("sous_garantie", false);

    const { data } = await q;
    
    if (data) {
      let filtered = data;
      if (recherche) {
        filtered = data.filter(t => 
          t.chantiers?.nom?.toLowerCase().includes(recherche.toLowerCase()) ||
          t.chantiers?.clients?.nom?.toLowerCase().includes(recherche.toLowerCase()) ||
          t.type_sinistre?.toLowerCase().includes(recherche.toLowerCase())
        );
      }
      setTickets(filtered);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();
  }, [filtre]);

  return (
    <div className="p-4 sm:p-8 space-y-8 pb-32">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wrench className="h-6 w-6 text-sky-400" />
            SAV & Garantie
          </h1>
          <p className="text-gray-400 text-sm mt-1">Gérez vos interventions SAV et protégez-vous juridiquement.</p>
        </div>

        <Link
          href="/bureau/sav/nouveau"
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white px-4 py-2 rounded-xl font-bold shadow-lg shadow-sky-600/20 transition-all"
        >
          <Plus size={18} />
          Nouveau Ticket SAV
        </Link>
      </div>

      <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher un chantier ou client..."
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onBlur={fetchTickets}
            onKeyDown={(e) => e.key === 'Enter' && fetchTickets()}
            className="w-full bg-transparent border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "tous", label: "Tous" },
            { id: "ouvert", label: "Ouverts" },
            { id: "cloture", label: "Clôturés" },
            { id: "garantie", label: "Sous Garantie" },
            { id: "hors_garantie", label: "Hors Garantie" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltre(f.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filtre === f.id
                  ? "bg-[#1A1D24] text-white shadow-sm border border-slate-600"
                  : "text-gray-400 hover:bg-[#1A1D24] hover:text-gray-200 border border-transparent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center p-12 text-gray-400 animate-pulse">Chargement des tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="bg-[#1A1D24]/50 border border-white/10/50 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-[#1A1D24]/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-200">Aucun SAV en cours</h3>
          <p className="text-gray-400 text-sm mt-2 max-w-sm mx-auto">
            Vos chantiers se portent à merveille. Profitez-en !
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tickets.map((ticket) => (
            <Link
              href={`/bureau/sav/${ticket.id}`}
              key={ticket.id}
              className="group bg-[#1A1D24] border border-white/10 rounded-2xl p-5 hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-500/10 transition-all flex flex-col justify-between h-48"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      ticket.statut === "ouvert"
                        ? "bg-white/5 text-gray-400 border border-white/10"
                        : ticket.statut === "planifie"
                        ? "bg-white/5 text-gray-400 border border-white/10"
                        : "bg-white/5 text-gray-400 border border-white/10"
                    }`}
                  >
                    {ticket.statut}
                  </span>
                  {ticket.sous_garantie === false && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-950/30 px-2 py-1 rounded-lg border border-red-500/20">
                      <AlertTriangle size={12} /> Hors Garantie
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold text-white truncate">
                  {ticket.chantiers?.clients?.nom || "Client"}
                </h3>
                <p className="text-sm text-gray-400 truncate">
                  {ticket.chantiers?.nom || "Chantier introuvable"}
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10/50 flex justify-between items-end">
                <div>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Problème</p>
                  <p className="text-sm font-medium text-gray-300 truncate max-w-[180px]">
                    {ticket.type_sinistre || "Non défini"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Date</p>
                  <p className="text-sm font-bold text-gray-300">
                    {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString("fr-FR") : "-"}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
