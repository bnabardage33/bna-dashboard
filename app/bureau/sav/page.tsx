"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Wrench,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { TicketSav } from "@/types/finance";
import {
  LIBELLES_GARANTIE,
  REFERENTIELS_NORMATIFS_SAV,
  type MetierSav,
  type TypeGarantieSav,
} from "@/lib/savGaranties";

const BADGE_METIER: Record<MetierSav, string> = {
  bardage: "border-blue-200 bg-sky-500/15 text-sky-300",
  terrasse: "border-amber-200 bg-amber-500/15 text-amber-300",
  cloture: "border-[#D96B27]/30 bg-[#D96B27]/10 text-[#D96B27]",
};

export default function SAVPage() {
  const [tickets, setTickets] = useState<TicketSav[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [filtreMetier, setFiltreMetier] = useState<"tous" | MetierSav>("tous");
  const [filtreOrigine, setFiltreOrigine] = useState<
    "tous" | "chantier_bna" | "client_externe"
  >("tous");
  const [recherche, setRecherche] = useState("");

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tickets_sav")
      .select(
        "*, chantiers(nom, metier, adresse_chantier, clients(id, nom, societe)), clients(id, nom, societe), pv_receptions(id, numero, date_reception)"
      )
      .order("created_at", { ascending: false });

    if (!error && data) {
      setTickets(data as unknown as TicketSav[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const ticketsFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return tickets.filter((t) => {
      const metierEff = (t.metier || t.chantiers?.metier || "bardage") as MetierSav;
      const origineEff = t.type_origine || "chantier_bna";

      if (filtreMetier !== "tous" && metierEff !== filtreMetier) return false;
      if (filtreOrigine !== "tous" && origineEff !== filtreOrigine) return false;

      if (filtreStatut === "ouvert" && t.statut !== "ouvert") return false;
      if (filtreStatut === "cloture" && t.statut !== "cloture") return false;
      if (filtreStatut === "garantie" && !t.sous_garantie) return false;
      if (filtreStatut === "hors_garantie" && t.sous_garantie !== false) return false;

      if (!q) return true;
      const nomClient =
        t.clients?.societe ||
        t.clients?.nom ||
        t.chantiers?.clients?.societe ||
        t.chantiers?.clients?.nom ||
        "";
      return (
        (t.chantiers?.nom || "").toLowerCase().includes(q) ||
        nomClient.toLowerCase().includes(q) ||
        (t.type_sinistre || "").toLowerCase().includes(q)
      );
    });
  }, [tickets, filtreStatut, filtreMetier, filtreOrigine, recherche]);

  return (
    <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#120F0D] text-[#F5EFEA] px-4 py-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl space-y-6 pb-24">
        {/* En-tête blanc épuré + accents Terracotta #B85B2B */}
        <section className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27]">
                  <Wrench className="h-5 w-5" />
                </span>
                <p className="text-xs font-bold uppercase tracking-[2.5px] text-[#D96B27]">
                  BNA Pilotage BTP · Multi-Métiers
                </p>
              </div>
              <h1 className="mt-2 text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[#F5EFEA]">
                SAV &amp; Garanties
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#8E7F74]">
                Suivi des garanties légales (GPA, Biennale, Décennale) sur chantiers BNA et dépannages clients externes.
              </p>
            </div>

            <Link
              href="/bureau/sav/nouveau"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D96B27] hover:bg-[#E07A38] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all"
            >
              <Plus size={18} />
              Nouveau Ticket SAV
            </Link>
          </div>

          {/* Barre de recherche et filtres */}
          <div className="mt-6 space-y-3 pt-5 border-t border-white/10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8E7F74]" />
                <input
                  type="text"
                  placeholder="Rechercher un chantier, client ou sinistre..."
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#120F0D] pl-10 pr-4 py-2.5 text-sm text-[#F5EFEA] placeholder:text-[#8E7F74] focus:border-[#D96B27] focus:bg-[#1E1916] focus:outline-none"
                />
              </div>

              {/* Filtre Métier */}
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#120F0D] p-1">
                {(
                  [
                    { id: "tous", label: "Tous métiers" },
                    { id: "bardage", label: "Bardage" },
                    { id: "terrasse", label: "Terrasse" },
                    { id: "cloture", label: "Clôture" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setFiltreMetier(m.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      filtreMetier === m.id
                        ? "bg-[#1B1511] text-[#D96B27] shadow-xs"
                        : "text-[#8E7F74] hover:text-[#F5EFEA]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Filtre Origine */}
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#120F0D] p-1">
                {(
                  [
                    { id: "tous", label: "Toutes origines" },
                    { id: "chantier_bna", label: "Chantiers BNA" },
                    { id: "client_externe", label: "Clients Externes" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setFiltreOrigine(o.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      filtreOrigine === o.id
                        ? "bg-[#1B1511] text-[#F5EFEA] shadow-xs"
                        : "text-[#8E7F74] hover:text-[#F5EFEA]"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Filtre Statut / Garantie */}
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#120F0D] p-1">
                {[
                  { id: "tous", label: "Tous" },
                  { id: "ouvert", label: "Ouverts" },
                  { id: "cloture", label: "Clôturés" },
                  { id: "garantie", label: "Sous Garantie" },
                  { id: "hors_garantie", label: "Hors Garantie" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltreStatut(f.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      filtreStatut === f.id
                        ? "bg-[#1B1511] text-[#F5EFEA] shadow-xs"
                        : "text-[#8E7F74] hover:text-[#F5EFEA]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Liste des tickets SAV */}
        {loading ? (
          <div className="flex min-h-60 items-center justify-center rounded-2xl border border-white/10 bg-[#1B1511] p-10">
            <div className="h-9 w-9 animate-spin rounded-full border-3 border-[#D96B27] border-t-transparent" />
          </div>
        ) : ticketsFiltres.length === 0 ? (
          <section className="rounded-2xl sm:rounded-3xl border border-dashed border-[#DCDCDC] bg-[#1B1511] p-12 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D96B27]/10 text-[#D96B27]">
              <CheckCircle className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#F5EFEA]">
              Aucun ticket SAV correspondant
            </h3>
            <p className="mt-1 text-xs text-[#8E7F74]">
              Créez un ticket rattaché à un chantier BNA ou une intervention externe facturable.
            </p>
          </section>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ticketsFiltres.map((ticket) => {
              const metier = (ticket.metier || ticket.chantiers?.metier || "bardage") as MetierSav;
              const estExterne = ticket.type_origine === "client_externe";
              const nomClient =
                ticket.clients?.societe ||
                ticket.clients?.nom ||
                ticket.chantiers?.clients?.societe ||
                ticket.chantiers?.clients?.nom ||
                "Client";
              const regime = (ticket.type_garantie ||
                (estExterne ? "hors_garantie_externe" : "decennale_10ans")) as TypeGarantieSav;

              return (
                <Link
                  href={`/bureau/sav/${ticket.id}`}
                  key={ticket.id}
                  className="group flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-1 hover:border-[#D96B27]/60"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-1.5 mb-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${BADGE_METIER[metier] ?? BADGE_METIER.bardage}`}
                        >
                          {REFERENTIELS_NORMATIFS_SAV[metier]?.libelleMetier || metier}
                        </span>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                            estExterne
                              ? "border-purple-200 bg-purple-50 text-purple-700"
                              : "border-white/10 bg-[#221B17] text-[#B8A99E]"
                          }`}
                        >
                          {estExterne ? "Client Externe" : "Chantier BNA"}
                        </span>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          ticket.statut === "cloture"
                            ? "border border-emerald-200 bg-emerald-500/15 text-emerald-300"
                            : "border border-amber-200 bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {ticket.statut}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-[#F5EFEA] truncate group-hover:text-[#D96B27]">
                      {nomClient}
                    </h3>
                    <p className="text-xs text-[#8E7F74] truncate mt-0.5">
                      {estExterne
                        ? "Intervention indépendante hors chantier BNA"
                        : ticket.chantiers?.nom || "Chantier BNA"}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {ticket.sous_garantie ? (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                          <ShieldCheck size={12} />
                          Sous Garantie · {LIBELLES_GARANTIE[regime] || "Garantie"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-300">
                          <AlertTriangle size={12} />
                          Hors Garantie
                        </span>
                      )}

                      {(ticket.facturable || !ticket.sous_garantie) && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-[#D96B27]/30 bg-[#D96B27]/10 px-2 py-1 text-[11px] font-bold text-[#D96B27]">
                          <Receipt size={12} /> Facturable
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3.5 border-t border-white/10 flex justify-between items-end text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="text-[10px] text-[#8E7F74] uppercase font-bold">Sinistre</p>
                      <p className="font-semibold text-[#F5EFEA] truncate">
                        {ticket.type_sinistre || "Non défini"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-[#8E7F74] uppercase font-bold">Créé le</p>
                      <p className="font-bold text-[#B8A99E]">
                        {ticket.created_at
                          ? new Date(ticket.created_at).toLocaleDateString("fr-FR")
                          : "-"}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
