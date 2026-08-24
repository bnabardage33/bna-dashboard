// app/terrain/chantier/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Plus, MapPin, Calendar, HardHat, Building, Trash2, X, ArrowRight, List, LayoutGrid, Copy, Check } from "lucide-react";

type Client = { id: string; nom: string; societe: string | null };

type Chantier = {
  id: string;
  nom: string | null;
  client_id: string;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  materiau_structurel?: string | null;
  clients: { nom: string; societe: string | null } | null;
  code_acces: string | null;
};

export default function ChantiersPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [vue, setVue] = useState<"liste" | "planning">("liste");

  // Formulaire nouveau chantier
  const [nom, setNom] = useState("");
  const [clientId, setClientId] = useState("");
  const [adresse, setAdresse] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [materiauStructurel, setMateriauStructurel] = useState("Bois / Mélèze");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [creationEnCours, setCreationEnCours] = useState(false);

  async function fetchClients() {
    const { data } = await supabase
      .from("clients")
      .select("id, nom, societe")
      .order("nom");
    if (data) setClients(data as Client[]);
  }

  async function fetchChantiers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("chantiers")
      .select("*, clients(nom, societe)")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setChantiers(data as Chantier[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchClients();
    fetchChantiers();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setCreationEnCours(true);

    const { error } = await supabase.from("chantiers").insert({
      nom: nom || null,
      client_id: clientId,
      adresse_chantier: adresse || null,
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
      materiau_structurel: materiauStructurel || null,
      statut: "prevu",
      code_acces: "BNA-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      checklist: { tasseaux: false, pare_pluie: false, pose: false, finition: false },
    });

    setCreationEnCours(false);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setNom("");
    setClientId("");
    setAdresse("");
    setDateDebut("");
    setDateFin("");
    setModalOuvert(false);
    fetchChantiers();
  }

  async function supprimerChantier(e: React.MouseEvent, ch: Chantier) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Supprimer le chantier "${ch.nom || ch.clients?.nom}" ?`)) return;
    setDeleting(ch.id);
    const { error } = await supabase.from("chantiers").delete().eq("id", ch.id);
    setDeleting(null);
    if (error) {
      alert("Erreur : " + error.message);
      return;
    }
    fetchChantiers();
  }

  const chantiersFiltres = chantiers.filter((ch) => {
    if (!recherche.trim()) return true;
    const q = recherche.toLowerCase();
    return (
      ch.nom?.toLowerCase().includes(q) ||
      ch.clients?.nom?.toLowerCase().includes(q) ||
      ch.clients?.societe?.toLowerCase().includes(q) ||
      ch.adresse_chantier?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* En-tête principal */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Hub Chantiers</h1>
          <p className="text-xs text-slate-400">
            Suivi des chantiers, métrés de bardage, calepinage &amp; avancement
          </p>
        </div>

        <button
          onClick={() => setModalOuvert(true)}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          <span>Nouveau Chantier</span>
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="w-full">
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher par nom de chantier, client, adresse..."
          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none shadow-sm"
        />
      </div>

      {/* Liste des Chantiers en Cartes Mobiles Modernes */}
      {loading ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-12 text-center text-xs text-slate-400">
          Chargement des chantiers en cours…
        </div>
      ) : chantiersFiltres.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-12 text-center space-y-3">
          <HardHat className="mx-auto h-10 w-10 text-slate-500" />
          <p className="text-sm font-medium text-slate-400">Aucun chantier trouvé.</p>
          
          <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setVue("liste")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${vue === "liste" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              <List className="h-4 w-4" /> Liste
            </button>
            <button
              onClick={() => setVue("planning")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${vue === "planning" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              <Calendar className="h-4 w-4" /> Planning
            </button>
          </div>
          <button
            onClick={() => setModalOuvert(true)}
            className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
          >
            + Créer un premier chantier
          </button>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {chantiersFiltres.map((ch) => {
            const nomClient = ch.clients?.societe || ch.clients?.nom || "Client direct";
            return (
              <div
                key={ch.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-700 bg-slate-800 p-4.5 shadow-md transition-all hover:border-sky-500/60 hover:bg-slate-750 hover:shadow-sky-500/5"
              >
                <Link href={`/terrain/chantier/${ch.id}`} className="block space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-100 group-hover:text-sky-400 transition-colors">
                        {ch.nom || nomClient}
                      </h2>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <Building className="h-3.5 w-3.5 text-slate-500" />
                        <span>{nomClient}</span>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        ch.statut === "en_cours"
                          ? "border border-sky-500/40 bg-sky-950/40 text-sky-300"
                          : ch.statut === "termine"
                          ? "border border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                          : "border border-slate-600 bg-slate-900 text-slate-300"
                      }`}
                    >
                      {ch.statut.replace("_", " ")}
                    </span>
                  </div>

                  {ch.adresse_chantier && (
                    <p className="flex items-center gap-1.5 text-xs text-slate-400 truncate">
                      <MapPin className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                      <span className="truncate">{ch.adresse_chantier}</span>
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/60 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Calendar className="h-3.5 w-3.5 text-slate-500" />
                      <span>
                        {ch.date_debut ? new Date(ch.date_debut).toLocaleDateString("fr-FR") : "Début non fixé"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 font-semibold text-sky-400 group-hover:translate-x-0.5 transition-transform text-xs">
                      <span>Ouvrir</span>
                      <ArrowRight className="h-3 w-3" />
                    </div>
                  </div>
                </Link>

                {ch.code_acces && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const link = `${window.location.origin}/espace-client/${ch.code_acces}`;
                      navigator.clipboard.writeText(link);
                      setCopiedId(ch.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    className="absolute bottom-4 right-20 z-10 flex items-center gap-1 rounded-lg bg-slate-700/80 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-sky-600 hover:text-white transition-all backdrop-blur-sm"
                  >
                    {copiedId === ch.id ? <Check size={12} /> : <Copy size={12} />}
                    {copiedId === ch.id ? "Copié" : "Lien client"}
                  </button>
                )}

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-700/40">
                  {ch.adresse_chantier ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        ch.adresse_chantier
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1"
                    >
                      🗺️ GPS Itinéraire
                    </a>
                  ) : (
                    <span />
                  )}

                  <button
                    onClick={(e) => supprimerChantier(e, ch)}
                    disabled={deleting === ch.id}
                    className="text-[11px] font-medium text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>{deleting === ch.id ? "Suppression…" : "Supprimer"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bouton Flottant FAB (+) */}
      <button
        onClick={() => setModalOuvert(true)}
        aria-label="Ajouter un chantier"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-2xl shadow-amber-500/40 transition-transform active:scale-95 hover:scale-105 hover:bg-amber-400"
      >
        <Plus className="h-7 w-7 stroke-[2.5]" />
      </button>

      {/* Bottom Sheet / Modal pour Nouveau Chantier */}
      {modalOuvert && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl space-y-4 max-h-[85vh] sm:max-h-[90dvh] overflow-y-auto animate-in fade-in slide-in-from-bottom-6">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-100">Nouveau Chantier de Bardage</h2>
                <p className="text-xs text-slate-400">Renseignez les détails du nouveau projet</p>
              </div>
              <button
                onClick={() => setModalOuvert(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 pb-20 sm:pb-6">
              <div>
                <label className="text-xs font-semibold text-slate-300">Nom du chantier</label>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex. Bardage Clin Bois — Villa Arcachon"
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Client associé *</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  <option value="">— Sélectionner un client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.societe ? `${c.societe} (${c.nom})` : c.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Adresse du site des travaux</label>
                <input
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder="Ex. 14 Route des Plages, 33120 Arcachon"
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Matériau prédominant</label>
                <select
                  value={materiauStructurel}
                  onChange={(e) => setMateriauStructurel(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3.5 py-2.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  <option value="Bois / Mélèze">Bois Naturel / Mélèze</option>
                  <option value="Panneaux HPL Trespa">Panneaux HPL (Trespa / Fundermax)</option>
                  <option value="Composite Fibres-Ciment">Composite / Fibres-Ciment (Cedral)</option>
                  <option value="Cassettes Métalliques Alu">Cassettes Métalliques / Zinc / Alu</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Date début prévue</label>
                  <input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Date fin estimée</label>
                  <input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="sticky bottom-0 z-10 -mx-6 -mb-6 bg-slate-800 px-6 py-3 border-t border-slate-700 flex items-center justify-end gap-3 shadow-lg">
                <button
                  type="button"
                  onClick={() => setModalOuvert(false)}
                  className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={creationEnCours}
                  className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 shadow-md"
                >
                  {creationEnCours ? "Création..." : "Enregistrer le Chantier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
