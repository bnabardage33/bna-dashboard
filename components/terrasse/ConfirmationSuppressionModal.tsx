"use client";

import React from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface ConfirmationSuppressionModalProps {
  ouvert: boolean;
  titre: string;
  message: string;
  nomChantier: string;
  estDefinitif?: boolean;
  enCours?: boolean;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

export default function ConfirmationSuppressionModal({
  ouvert,
  titre,
  message,
  nomChantier,
  estDefinitif = false,
  enCours = false,
  onConfirmer,
  onAnnuler,
}: ConfirmationSuppressionModalProps) {
  if (!ouvert) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1050] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white text-[#23272B] shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-[#F0F0F0] bg-[#F8F9FA] px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                estDefinitif
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]"
              }`}
            >
              {estDefinitif ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
            </span>
            <div>
              <h3 className="text-base font-bold text-[#23272B]">{titre}</h3>
              <p className="text-[11px] font-semibold text-[#777777]">
                {estDefinitif ? "Action irréversible" : "Mise à la corbeille"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAnnuler}
            disabled={enCours}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#23272B] transition-colors"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps */}
        <div className="space-y-3 p-5 sm:p-6 text-xs text-[#777777] leading-relaxed">
          <div className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-3 text-[#23272B]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">
              Chantier concerné
            </p>
            <p className="mt-0.5 text-sm font-bold text-[#23272B]">{nomChantier}</p>
          </div>

          <p>{message}</p>

          {estDefinitif && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900 font-medium">
              ⚠️ Attention : Toutes les données techniques, le calepinage et les informations associées seront définitivement détruites.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[#F0F0F0] bg-[#F8F9FA] px-5 py-4">
          <button
            type="button"
            onClick={onAnnuler}
            disabled={enCours}
            className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2 text-xs font-bold text-[#23272B] hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={onConfirmer}
            disabled={enCours}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-all active:scale-[0.98] ${
              estDefinitif
                ? "bg-red-600 hover:bg-red-700 disabled:bg-red-400"
                : "bg-[#B85B2B] hover:bg-[#D97732] disabled:bg-[#B85B2B]/50"
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>
              {enCours
                ? "Traitement..."
                : estDefinitif
                ? "Supprimer définitivement"
                : "Mettre à la corbeille"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
