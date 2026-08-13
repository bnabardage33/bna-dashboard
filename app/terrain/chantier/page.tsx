"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Client = { id: string; nom: string; societe: string | null };

type Chantier = {
  id: string;
  nom: string | null;
  client_id: string;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  clients: { nom: string; societe: string | null } | null;
};

export default function ChantiersPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [nom, setNom] = useState("");
  const [clientId, setClientId] = useState("");
  const [adresse, setAdresse] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

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

    const { error } = await supabase.from("chantiers").insert({
      nom: nom || null,
      client_id: clientId,
      adresse_chantier: adresse || null,
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
      statut: "prevu",
      checklist: { tasseaux: false, pare_pluie: false, pose: false, finition: false },
    });

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setNom("");
    setClientId("");
    setAdresse("");
    setDateDebut("");
    setDateFin("");
    fetchChantiers();
  }

  async function supprimerChantier(ch: Chantier) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Chantiers</h1>
        <p className="text-sm text-slate-400">Suivi de la pose et du bardage</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-4"
      >
        <h2 className="font-medium text-white">Nouveau chantier</h2>
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom du chantier (ex. Bardage bois — hangar)"
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">-- Choisir un client --</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.societe ? `${c.societe} (${c.nom})` : c.nom}
            </option>
          ))}
        </select>
        <input
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="Adresse du chantier (site des travaux)"
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Date début
            </label>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Date fin
            </label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
        >
          Créer le chantier
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : chantiers.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun chantier pour l&apos;instant.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {chantiers.map((ch) => (
            <div
              key={ch.id}
              className="rounded-xl border border-slate-700 bg-slate-800 p-4 hover:border-red-600/40"
            >
              <Link href={`/terrain/chantier/${ch.id}`}>
                <p className="font-medium text-white">
                  {ch.nom || ch.clients?.nom || "Chantier sans nom"}
                </p>
                <p className="text-sm text-slate-400">
                  {ch.clients?.societe || ch.clients?.nom}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {ch.date_debut || "?"} → {ch.date_fin || "?"}
                </p>
                <span className="mt-2 inline-block rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300">
                  {ch.statut}
                </span>
              </Link>
              {ch.adresse_chantier && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    ch.adresse_chantier
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-3 block text-xs font-medium text-sky-400 hover:text-sky-300"
                >
                  📍 {ch.adresse_chantier}
                </a>
              )}
              <button
                onClick={() => supprimerChantier(ch)}
                disabled={deleting === ch.id}
                className="mt-3 text-xs font-medium text-slate-500 hover:text-red-400"
              >
                {deleting === ch.id ? "Suppression…" : "🗑️ Supprimer"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
