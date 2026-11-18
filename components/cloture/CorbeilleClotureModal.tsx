"use client";

import React, { useEffect, useState } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import {
  recupererChantiersCorbeilleCloture,
  restaurerChantierCloture,
  supprimerDefinitivementChantierCloture,
  type ChantierCorbeilleCloture,
} from "@/lib/cloture/corbeilleService";

interface CorbeilleClotureModalProps {
  ouvert: boolean;
  onFermer: () => void;
  onChange: () => void;
}

export default function CorbeilleClotureModal({
  ouvert,
  onFermer,
  onChange,
}: CorbeilleClotureModalProps) {
  const [items, setItems] = useState<ChantierCorbeilleCloture[]>([]);
  const [loading, setLoading] = useState(false);

  const charger = async () => {
    setLoading(true);
    const { data } = await recupererChantiersCorbeilleCloture();
    setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    if (ouvert) charger();
  }, [ouvert]);

  if (!ouvert) return null;

  return (
    <div
      className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-28 bg-black/60 backdrop-blur-xs"
      onClick={onFermer}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-[#1B1511] border border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-base font-bold text-[#F5EFEA]">
            Corbeille Chantiers Clôture
          </h2>
          <button
            type="button"
            onClick={onFermer}
            className="rounded-lg p-1 text-[#8E7F74] hover:text-[#F5EFEA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2 text-xs">
          {loading ? (
            <p className="text-center text-[#8E7F74] py-4">Chargement...</p>
          ) : items.length === 0 ? (
            <p className="text-center text-[#8E7F74] py-6">
              La corbeille Clôture est vide.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#120F0D] p-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-[#F5EFEA] truncate">
                    {item.nom || "Chantier Clôture"}
                  </p>
                  <p className="text-[11px] text-[#8E7F74] truncate">
                    {item.clients?.societe || item.clients?.nom || "Client"} ·{" "}
                    {item.adresse_chantier || "Sans adresse"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await restaurerChantierCloture(item.id);
                      await charger();
                      onChange();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restaurer
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Supprimer définitivement ce chantier Clôture ?")) return;
                      await supprimerDefinitivementChantierCloture(item.id);
                      await charger();
                      onChange();
                    }}
                    className="rounded-lg bg-red-600 p-1.5 text-white"
                    title="Supprimer définitivement"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
