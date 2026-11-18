"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ModifierChantierClotureModalProps {
  chantier: {
    id: string;
    nom: string | null;
    adresse_chantier: string | null;
    statut: string;
    date_debut: string | null;
  } | null;
  onFermer: () => void;
  onMisAJour: () => void;
}

export default function ModifierChantierClotureModal({
  chantier,
  onFermer,
  onMisAJour,
}: ModifierChantierClotureModalProps) {
  const [nom, setNom] = useState(chantier?.nom ?? "");
  const [adresse, setAdresse] = useState(chantier?.adresse_chantier ?? "");
  const [statut, setStatut] = useState(chantier?.statut ?? "prevu");
  const [dateDebut, setDateDebut] = useState(chantier?.date_debut ?? "");
  const [saving, setSaving] = useState(false);

  if (!chantier) return null;

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!chantier) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("chantiers")
        .update({
          nom: nom.trim() || null,
          adresse_chantier: adresse.trim() || null,
          statut,
          date_debut: dateDebut || null,
        })
        .eq("id", chantier.id)
        .eq("metier", "cloture");
      if (error) {
        alert("Erreur mise à jour : " + error.message);
        return;
      }
      onMisAJour();
      onFermer();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-28 bg-black/60 backdrop-blur-xs"
      onClick={onFermer}
    >
      <form
        onSubmit={enregistrer}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[#1B1511] border border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-base font-bold text-[#F5EFEA]">
            Modifier le chantier Clôture
          </h2>
          <button
            type="button"
            onClick={onFermer}
            className="rounded-lg p-1 text-[#8E7F74] hover:text-[#F5EFEA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#B8A99E]">Nom du chantier</label>
            <input
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
            />
          </div>
          <div>
            <label className="font-semibold text-[#B8A99E]">Adresse</label>
            <input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#B8A99E]">Statut</label>
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
              >
                <option value="prevu">Prévu</option>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#B8A99E]">Date début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/10 p-4">
          <button
            type="button"
            onClick={onFermer}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-[#B8A99E]"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-[#D96B27] px-4 py-2 text-xs font-bold text-white"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}
