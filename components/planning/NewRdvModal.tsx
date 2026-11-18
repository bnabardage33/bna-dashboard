"use client";

import React, { useState } from "react";
import { CalendarPlus, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  creerRendezVous,
  type RendezVousRow,
} from "@/lib/services/rendezVousService";
import { formatYMD, NATURES_CONFIG, type NatureKey } from "@/lib/services/planningService";

interface ChantierOption {
  id: string;
  nom: string | null;
  adresse_chantier: string | null;
}

interface ClientOption {
  id: string;
  nom: string;
}

interface NewRdvModalProps {
  isOpen: boolean;
  onClose: () => void;
  chantiers: ChantierOption[];
  clients: ClientOption[];
  entrepriseId: string | null;
  onCreated: (rdv: RendezVousRow) => void;
}

const NATURE_OPTIONS: Array<{ key: NatureKey; label: string }> = [
  { key: "technique", label: NATURES_CONFIG.technique.label },
  { key: "client", label: NATURES_CONFIG.client.label },
  { key: "reception", label: NATURES_CONFIG.reception.label },
  { key: "travaux", label: NATURES_CONFIG.travaux.label },
  { key: "administratif", label: NATURES_CONFIG.administratif.label },
  { key: "autre", label: NATURES_CONFIG.autre.label },
];

export function NewRdvModal({
  isOpen,
  onClose,
  chantiers,
  clients,
  entrepriseId,
  onCreated,
}: NewRdvModalProps) {
  const [titre, setTitre] = useState("");
  const [nature, setNature] = useState<NatureKey>("technique");
  const [date, setDate] = useState(() => formatYMD(new Date()));
  const [heureDebut, setHeureDebut] = useState("09:00");
  const [heureFin, setHeureFin] = useState("10:30");
  const [chantierId, setChantierId] = useState("");
  const [clientId, setClientId] = useState("");
  const [lieu, setLieu] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChantierChange = (selectedId: string) => {
    setChantierId(selectedId);
    const found = chantiers.find((c) => c.id === selectedId);
    if (found?.adresse_chantier && !lieu) {
      setLieu(found.adresse_chantier);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim() || !date) {
      setError("Veuillez renseigner un titre et une date.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const created = await creerRendezVous(supabase, {
        entreprise_id: entrepriseId,
        chantier_id: chantierId || null,
        client_id: clientId || null,
        titre: titre.trim(),
        nature,
        date,
        heure_debut: heureDebut || null,
        heure_fin: heureFin || null,
        lieu: lieu.trim() || null,
        notes: notes.trim() || null,
        statut: "planifie",
      });
      setTitre("");
      setNotes("");
      setLieu("");
      setChantierId("");
      setClientId("");
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#1B1511] p-5 sm:p-6 shadow-2xl text-white max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D96B27]/15 border border-[#D96B27]/40">
              <CalendarPlus className="h-4 w-4 text-[#D96B27]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Nouveau RDV / Jalon</h2>
              <p className="text-[11px] text-white/55">
                Synchronisé directement sur le planning BNA
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-semibold text-white/75 mb-1">
              Titre du rendez-vous ou jalon *
            </label>
            <input
              type="text"
              required
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Ex : Visite technique pare-pluie & équerres"
              className="w-full h-11 rounded-xl border border-white/15 bg-[#120F0D] px-3.5 text-sm text-white placeholder:text-white/35 focus:border-[#D96B27] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/75 mb-1">
                Catégorie / Nature
              </label>
              <select
                value={nature}
                onChange={(e) => setNature(e.target.value as NatureKey)}
                className="w-full h-11 rounded-xl border border-white/15 bg-[#120F0D] px-3 text-sm text-white focus:border-[#D96B27] focus:outline-none"
              >
                {NATURE_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-white/75 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 rounded-xl border border-white/15 bg-[#120F0D] px-3 text-sm text-white focus:border-[#D96B27] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/75 mb-1">
                Heure début
              </label>
              <input
                type="time"
                value={heureDebut}
                onChange={(e) => setHeureDebut(e.target.value)}
                className="w-full h-11 rounded-xl border border-white/15 bg-[#120F0D] px-3 text-sm text-white focus:border-[#D96B27] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/75 mb-1">
                Heure fin
              </label>
              <input
                type="time"
                value={heureFin}
                onChange={(e) => setHeureFin(e.target.value)}
                className="w-full h-11 rounded-xl border border-white/15 bg-[#120F0D] px-3 text-sm text-white focus:border-[#D96B27] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-white/75 mb-1">
                Chantier associé
              </label>
              <select
                value={chantierId}
                onChange={(e) => handleChantierChange(e.target.value)}
                className="w-full h-11 rounded-xl border border-white/15 bg-[#120F0D] px-3 text-sm text-white focus:border-[#D96B27] focus:outline-none"
              >
                <option value="">— Aucun chantier —</option>
                {chantiers.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.nom || "Chantier sans nom"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-white/75 mb-1">
                Client associé
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full h-11 rounded-xl border border-white/15 bg-[#120F0D] px-3 text-sm text-white focus:border-[#D96B27] focus:outline-none"
              >
                <option value="">— Aucun client —</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/75 mb-1">
              Lieu / Adresse
            </label>
            <input
              type="text"
              value={lieu}
              onChange={(e) => setLieu(e.target.value)}
              placeholder="Ex : Mérignac / Adresse du chantier"
              className="w-full h-11 rounded-xl border border-white/15 bg-[#120F0D] px-3.5 text-sm text-white placeholder:text-white/35 focus:border-[#D96B27] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/75 mb-1">
              Consignes / Notes terrain
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Détails techniques, points DTU à vérifier..."
              className="w-full rounded-xl border border-white/15 bg-[#120F0D] p-3 text-sm text-white placeholder:text-white/35 focus:border-[#D96B27] focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/50 p-3 text-xs text-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-white/15 bg-[#120F0D] text-xs font-semibold text-white/75 hover:text-white cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 px-5 rounded-xl bg-gradient-to-r from-[#D96B27] to-[#B85316] hover:from-[#E57732] hover:to-[#C95D1B] text-xs font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Enregistrer au planning</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
