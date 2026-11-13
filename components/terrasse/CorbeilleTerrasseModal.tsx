"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Building,
  User,
  MapPin,
  Calendar,
  CheckCircle2,
  Layers3,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  recupererChantiersCorbeilleTerrasse,
  restaurerChantierTerrasse,
  supprimerDefinitivementChantierTerrasse,
  type ChantierCorbeilleItem,
} from "@/lib/terrasse/corbeilleService";
import ConfirmationSuppressionModal from "@/components/terrasse/ConfirmationSuppressionModal";

interface CorbeilleTerrasseModalProps {
  ouvert: boolean;
  onFermer: () => void;
  onActualiser: () => void;
}

export default function CorbeilleTerrasseModal({
  ouvert,
  onFermer,
  onActualiser,
}: CorbeilleTerrasseModalProps) {
  const [chantiers, setChantiers] = useState<ChantierCorbeilleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "succes" | "erreur"; message: string } | null>(
    null
  );

  // Modal de confirmation de suppression définitive
  const [chantierASupprimer, setChantierASupprimer] = useState<ChantierCorbeilleItem | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const chargerCorbeille = useCallback(async () => {
    setLoading(true);
    try {
      const data = await recupererChantiersCorbeilleTerrasse(supabase);
      setChantiers(data);
    } catch (err) {
      console.error("Erreur chargement corbeille terrasse:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ouvert) {
      chargerCorbeille();
      setFeedback(null);
    }
  }, [ouvert, chargerCorbeille]);

  if (!ouvert) return null;

  async function handleRestaurer(item: ChantierCorbeilleItem) {
    setFeedback(null);
    try {
      const res = await restaurerChantierTerrasse(supabase, item.id);
      setFeedback({ type: "succes", message: res.message });
      await chargerCorbeille();
      onActualiser();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur de restauration.";
      setFeedback({ type: "erreur", message: msg });
    }
  }

  async function handleConfirmerSuppressionDefinitive() {
    if (!chantierASupprimer) return;
    setSuppressionEnCours(true);
    setFeedback(null);

    try {
      const res = await supprimerDefinitivementChantierTerrasse(
        supabase,
        chantierASupprimer.id
      );
      setFeedback({ type: "succes", message: res.message });
      setChantierASupprimer(null);
      await chargerCorbeille();
      onActualiser();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur lors de la suppression définitive.";
      setFeedback({ type: "erreur", message: msg });
    } finally {
      setSuppressionEnCours(false);
    }
  }

  const formaterDate = (dateStr?: string | null) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      >
        <div
          className="relative flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white text-[#23272B] shadow-2xl animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. En-tête */}
          <div className="flex items-center justify-between border-b border-[#F0F0F0] bg-[#F8F9FA] px-6 py-5 shrink-0">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight text-[#23272B]">
                    Corbeille des Chantiers Terrasse
                  </h2>
                  <span className="rounded-full bg-[#B85B2B]/10 text-[#B85B2B] border border-[#B85B2B]/20 px-2 py-0.5 text-xs font-bold">
                    {chantiers.length}
                  </span>
                </div>
                <p className="text-xs text-[#777777]">
                  Restaurez vos projets ou supprimez-les définitivement en toute sécurité
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onFermer}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-[#23272B] transition-colors"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Feedback dynamique */}
          {feedback && (
            <div
              className={`mx-6 mt-4 flex items-center gap-2 rounded-xl p-3 text-xs font-semibold ${
                feedback.type === "succes"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {feedback.type === "succes" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* 2. Liste des chantiers supprimés */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-[#777777]">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#B85B2B] border-t-transparent mb-2" />
                <span>Chargement des chantiers dans la corbeille...</span>
              </div>
            ) : chantiers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#DCDCDC] bg-[#F8F9FA] p-10 text-center text-xs text-[#777777]">
                <Trash2 className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p className="font-bold text-sm text-[#23272B]">La corbeille est vide</p>
                <p className="mt-1">
                  Aucun chantier terrasse n&apos;est actuellement placé dans la corbeille.
                </p>
              </div>
            ) : (
              chantiers.map((ch) => {
                const estBardageLie = ch.metier_reel === "bardage";

                return (
                  <div
                    key={ch.id}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-xs hover:border-[#B85B2B]/40 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-[#23272B] truncate">
                            {ch.nom || "Chantier Terrasse"}
                          </h3>

                          {estBardageLie ? (
                            <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900 uppercase tracking-wider">
                              Rattaché Bardage
                            </span>
                          ) : (
                            <span className="rounded-md border border-[#B85B2B]/20 bg-[#B85B2B]/10 px-2 py-0.5 text-[10px] font-bold text-[#B85B2B] uppercase tracking-wider">
                              Terrasse
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#777777]">
                          <span className="flex items-center gap-1 font-semibold text-[#23272B]">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            {ch.clients?.nom || "Client inconnu"}{" "}
                            {ch.clients?.societe ? `(${ch.clients.societe})` : ""}
                          </span>

                          {ch.adresse_chantier && (
                            <span className="flex items-center gap-1 text-gray-500">
                              <MapPin className="h-3.5 w-3.5 text-[#B85B2B]" />
                              {ch.adresse_chantier}
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-[11px] font-medium text-red-600">
                          Supprimé le {formaterDate(ch.deleted_at)}
                        </p>
                      </div>
                    </div>

                    {/* Actions de carte corbeille */}
                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F0F0F0]">
                      <button
                        type="button"
                        onClick={() => handleRestaurer(ch)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-3.5 py-1.5 text-xs font-bold text-[#23272B] hover:text-[#B85B2B] transition-all shadow-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-[#B85B2B]" />
                        <span>Restaurer</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setChantierASupprimer(ch)}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                        title="Suppression définitive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Supprimer définitivement</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 3. Pied de modale */}
          <div className="flex items-center justify-between border-t border-[#F0F0F0] bg-[#F8F9FA] px-6 py-4 shrink-0 text-xs text-[#777777]">
            <span className="text-[11px]">
              La restauration conserve toutes les données techniques et relations intactes.
            </span>
            <button
              type="button"
              onClick={onFermer}
              className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2 text-xs font-bold text-[#23272B] hover:bg-gray-50 transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>

      {/* Modale de confirmation de suppression définitive */}
      {chantierASupprimer && (
        <ConfirmationSuppressionModal
          ouvert={Boolean(chantierASupprimer)}
          titre="Supprimer définitivement ce chantier ?"
          message={
            chantierASupprimer.metier_reel === "bardage"
              ? `Le projet "${chantierASupprimer.nom}" est un chantier Bardage possédant une configuration terrasse. La suppression définitive supprimera uniquement la configuration terrasse rattachée ; le chantier Bardage principal et ses zones resteront intacts.`
              : `Voulez-vous vraiment supprimer définitivement "${chantierASupprimer.nom}" ? Cette action effacera irrémédiablement le calepinage, les réservations et la fiche technique associés.`
          }
          nomChantier={chantierASupprimer.nom || "Chantier terrasse"}
          estDefinitif={true}
          enCours={suppressionEnCours}
          onConfirmer={handleConfirmerSuppressionDefinitive}
          onAnnuler={() => setChantierASupprimer(null)}
        />
      )}
    </>
  );
}
