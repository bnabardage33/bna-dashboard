"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  NATURES_CONFIG,
  type UnifiedPlanningItem,
} from "@/lib/services/planningService";
import {
  basculerStatutRendezVous,
  mettreAJourDatesChantier,
  supprimerRendezVous,
} from "@/lib/services/rendezVousService";

interface PlanningItemModalProps {
  item: UnifiedPlanningItem | null;
  onClose: () => void;
  onChanged: () => void;
}

export function PlanningItemModal({
  item,
  onClose,
  onChanged,
}: PlanningItemModalProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [datesSaved, setDatesSaved] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    setError(null);
    setDatesSaved(false);
    if (item) {
      setDateDebut(item.dateDebut);
      setDateFin(item.dateFin ?? item.dateDebut);
    }
  }, [item]);

  if (!item) return null;

  const natureCfg = NATURES_CONFIG[item.natureKey] ?? NATURES_CONFIG.autre;

  const handleToggleRdv = async () => {
    setBusy(true);
    setError(null);
    try {
      await basculerStatutRendezVous(supabase, item.rawId, item.statut);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de mise à jour");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRdv = async () => {
    setBusy(true);
    setError(null);
    try {
      await supprimerRendezVous(supabase, item.rawId);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de suppression");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveChantierDates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.chantierId) return;
    setBusy(true);
    setError(null);
    try {
      await mettreAJourDatesChantier(
        supabase,
        item.chantierId,
        dateDebut || null,
        dateFin || null
      );
      setDatesSaved(true);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur sauvegarde dates");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#1B1511] p-5 shadow-2xl text-white space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span
              className="mt-1.5 h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: item.dotColor }}
            />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white leading-snug">
                {item.titre}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${natureCfg.badgeClass}`}
                >
                  {natureCfg.label}
                </span>
                {item.metier && (
                  <span className="inline-block rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/75">
                    {item.metier}
                  </span>
                )}
                <span className="inline-block rounded-full border border-white/15 bg-[#120F0D] px-2 py-0.5 text-[10px] font-semibold text-amber-200/80">
                  {item.statutLabel}
                </span>
              </div>
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

        <div className="space-y-2.5 text-xs text-white/80">
          {item.sousTitre && (
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-white/45 shrink-0 mt-0.5" />
              <span>{item.sousTitre}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#D96B27] shrink-0" />
            <span>
              <strong className="text-white">{item.dateDebut}</strong>
              {item.dateFin && item.dateFin !== item.dateDebut && (
                <>
                  {" "}
                  au <strong className="text-white">{item.dateFin}</strong>
                </>
              )}
              {item.heure && (
                <>
                  {" "}
                  · <strong className="text-amber-200">{item.heure}</strong>
                </>
              )}
            </span>
          </div>

          {item.lieu && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-white/45 shrink-0 mt-0.5" />
              <span>{item.lieu}</span>
            </div>
          )}

          {item.avancement !== undefined && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-[11px] font-semibold">
                <span className="text-white/70">Avancement chantier</span>
                <span className="text-[#F59E0B]">{item.avancement}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-black/40 border border-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#D96B27] to-[#F59E0B]"
                  style={{ width: `${item.avancement}%` }}
                />
              </div>
            </div>
          )}

          {item.notes && (
            <div className="rounded-xl border border-white/10 bg-[#120F0D] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/45 mb-1">
                Consignes &amp; Notes
              </p>
              <p className="text-xs leading-relaxed text-white/85">{item.notes}</p>
            </div>
          )}
        </div>

        {/* Édition rapide des dates pour un chantier */}
        {item.type === "chantier" && item.chantierId && (
          <form
            onSubmit={handleSaveChantierDates}
            className="rounded-xl border border-white/10 bg-[#120F0D] p-3 space-y-2.5"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#D96B27]">
              <Calendar className="h-3.5 w-3.5" />
              <span>Ajuster les dates du chantier</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-white/55 mb-1">Début</label>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-full h-9 rounded-lg border border-white/15 bg-[#1B1511] px-2 text-xs text-white focus:border-[#D96B27] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-white/55 mb-1">Fin prévue</label>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-full h-9 rounded-lg border border-white/15 bg-[#1B1511] px-2 text-xs text-white focus:border-[#D96B27] focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              {datesSaved ? (
                <span className="text-[11px] text-emerald-300 font-semibold">
                  Dates enregistrées
                </span>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={busy}
                className="h-8 px-3 rounded-lg bg-[#D96B27] hover:bg-[#E57732] text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>Mettre à jour</span>
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/50 p-2.5 text-xs text-red-200">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            {item.type === "rdv" && !confirmDelete && (
              <>
                <button
                  type="button"
                  onClick={handleToggleRdv}
                  disabled={busy}
                  className="h-9 px-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-semibold text-emerald-200 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>
                    {item.statut === "effectue" ? "Marquer planifié" : "Marquer effectué"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="h-9 px-3 rounded-xl border border-red-500/35 bg-red-950/30 hover:bg-red-950/60 text-xs font-semibold text-red-300 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Supprimer</span>
                </button>
              </>
            )}

            {item.type === "rdv" && confirmDelete && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeleteRdv}
                  disabled={busy}
                  className="h-9 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Confirmer suppression</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-9 px-2.5 rounded-xl border border-white/15 text-xs text-white/70 hover:text-white cursor-pointer"
                >
                  Annuler
                </button>
              </div>
            )}

            {item.chantierId && (
              <Link
                href={`/terrain/chantier/${item.chantierId}`}
                onClick={onClose}
                className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-[#D96B27] to-[#B85316] hover:from-[#E57732] hover:to-[#C95D1B] text-xs font-semibold text-white inline-flex items-center gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Ouvrir le chantier</span>
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-xl border border-white/15 bg-[#120F0D] text-xs font-semibold text-white/75 hover:text-white cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
