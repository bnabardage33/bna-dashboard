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
      materiau_structurel: materiauStructurel || undefined,
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
    <div className="space-y-5 pt-44">
      {/* En-tête principal */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Hub Chantiers</h1>
          <p className="text-xs text-gray-400">
            Suivi des chantiers, métrés de bardage, calepinage &amp; avancement
          </p>
        </div>

        <button
          onClick={() => setModalOuvert(true)}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 transition-all hover:bg-red-700"
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
          className="w-full rounded-xl border border-white/10 bg-[#1A1D24] px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:border-red-600 focus:outline-none shadow-sm"
        />
      </div>

      {/* Liste des Chantiers en Cartes Mobiles Modernes */}
      {loading ? (
        <div className="rounded-2xl border border-white/10/60 bg-[#1A1D24]/40 p-12 text-center text-xs text-gray-400">
          Chargement des chantiers en cours…
        </div>
      ) : chantiersFiltres.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#1A1D24]/30 p-12 text-center space-y-3">
          <HardHat className="mx-auto h-10 w-10 text-gray-500" />
          <p className="text-sm font-medium text-gray-400">Aucun chantier trouvé.</p>
          
          <div className="flex items-center gap-2 bg-[#1A1D24] p-1 rounded-lg border border-white/10">
            <button
              onClick={() => setVue("liste")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${vue === "liste" ? "bg-red-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              <List className="h-4 w-4" /> Liste
            </button>
            <button
              onClick={() => setVue("planning")}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${vue === "planning" ? "bg-red-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
            >
              <Calendar className="h-4 w-4" /> Planning
            </button>
          </div>
          <button
            onClick={() => setModalOuvert(true)}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
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
                className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-[#1A1D24] p-4.5 shadow-md transition-all hover:border-red-600/60 hover:bg-[#1A1D24] hover:shadow-red-600/5"
              >
                <Link href={`/terrain/chantier/${ch.id}`} className="block space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-white group-hover:text-gray-300 transition-colors">
                        {ch.nom || nomClient}
                      </h2>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
                        <Building className="h-3.5 w-3.5 text-gray-500" />
                        <span>{nomClient}</span>
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        ch.statut === "en_cours"
                          ? "border border-red-600/40 bg-sky-950/40 text-gray-400"
                          : ch.statut === "termine"
                          ? "border border-white/10 bg-white/5 text-gray-400"
                          : "border border-white/10 bg-transparent text-gray-300"
                      }`}
                    >
                      {ch.statut.replace("_", " ")}
                    </span>
                  </div>

                  {ch.adresse_chantier && (
                    <p className="flex items-center gap-1.5 text-xs text-gray-400 truncate">
                      <MapPin className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                      <span className="truncate">{ch.adresse_chantier}</span>
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/10/60 text-xs text-gray-400">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <Calendar className="h-3.5 w-3.5 text-gray-500" />
                      <span>
                        {ch.date_debut ? new Date(ch.date_debut).toLocaleDateString("fr-FR") : "Début non fixé"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 font-semibold text-gray-300 group-hover:translate-x-0.5 transition-transform text-xs">
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
                    className="absolute bottom-4 right-20 z-10 flex items-center gap-1 rounded-lg bg-[#1A1D24]/80 px-2 py-1 text-[10px] font-bold text-gray-300 hover:bg-red-700 hover:text-white transition-all backdrop-blur-sm"
                  >
                    {copiedId === ch.id ? <Check size={12} /> : <Copy size={12} />}
                    {copiedId === ch.id ? "Copié" : "Lien client"}
                  </button>
                )}

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/10/40">
                  {ch.adresse_chantier ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        ch.adresse_chantier
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-medium text-gray-300 hover:text-gray-400 flex items-center gap-1"
                    >
                      🗺️ GPS Itinéraire
                    </a>
                  ) : (
                    <span />
                  )}

                  <button
                    onClick={(e) => supprimerChantier(e, ch)}
                    disabled={deleting === ch.id}
                    className="text-[11px] font-medium text-gray-500 hover:text-red-400 flex items-center gap-1 transition-colors"
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
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl shadow-red-600/10 transition-transform active:scale-95 hover:scale-105 hover:bg-red-700"
      >
        <Plus className="h-7 w-7 stroke-[2.5]" />
      </button>

      {/* Bottom Sheet / Modal pour Nouveau Chantier */}
      {modalOuvert && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-32 bg-black/80 backdrop-blur-sm"
          onClick={() => setModalOuvert(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1D24] w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-white/10 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
              <div>
                <h2 className="text-base font-bold text-white">Nouveau Chantier de Bardage</h2>
                <p className="text-xs text-gray-400">Renseignez les détails du nouveau projet</p>
              </div>
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-300">Nom du chantier</label>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex. Bardage Clin Bois — Villa Arcachon"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-red-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300">Client associé *</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
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
                <label className="text-xs font-semibold text-gray-300">Adresse du site des travaux</label>
                <input
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                  placeholder="Ex. 14 Route des Plages, 33120 Arcachon"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-red-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300">Matériau prédominant</label>
                <select
                  value={materiauStructurel}
                  onChange={(e) => setMateriauStructurel(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
                >
                  <option value="Bois / Mélèze">Bois Naturel / Mélèze</option>
                  <option value="Panneaux HPL Trespa">Panneaux HPL (Trespa / Fundermax)</option>
                  <option value="Composite Fibres-Ciment">Composite / Fibres-Ciment (Cedral)</option>
                  <option value="Cassettes Métalliques Alu">Cassettes Métalliques / Zinc / Alu</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-300">Date début prévue</label>
                  <input
                    type="date"
                    value={dateDebut}
                    onChange={(e) => setDateDebut(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-300">Date fin estimée</label>
                  <input
                    type="date"
                    value={dateFin}
                    onChange={(e) => setDateFin(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end gap-3 mt-auto shrink-0 bg-[#1A1D24] rounded-b-xl z-10">
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="rounded-xl border border-white/10 bg-[#1A1D24] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
              >
                Annuler
              </button>

              <button
                type="submit"
                disabled={creationEnCours}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 shadow-md"
              >
                {creationEnCours ? "Création..." : "Enregistrer le Chantier"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
