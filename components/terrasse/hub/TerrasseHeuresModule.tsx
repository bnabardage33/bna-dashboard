"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  User,
  Calendar,
  Layers3,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { validerPointageAvecMeteo, supprimerPointageGlob } from "@/app/actions/pointage";

export interface TerrasseHeuresModuleProps {
  chantierId: string;
  onTotalHeuresChange?: (total: number) => void;
}

interface ProfileOuvrier {
  id: string;
  full_name: string;
  role: string | null;
}

interface PointageTerrasseRow {
  id: string;
  date: string;
  heures: number;
  phase: string | null;
  commentaire?: string | null;
  meteo_relevee?: string | null;
  user_nom?: string;
}

const PHASES_TERRASSE_HEURES = [
  { id: "terrassement_support", label: "1. Terrassement, sol & géotextile" },
  { id: "structure_plots_lambourdes", label: "2. Pose des plots & lambourdage" },
  { id: "pose_platelage", label: "3. Pose et fixation des lames" },
  { id: "finitions_rives", label: "4. Finitions, rives, marches & SAV" },
] as const;

export default function TerrasseHeuresModule({
  chantierId,
  onTotalHeuresChange,
}: TerrasseHeuresModuleProps) {
  const [ouvriers, setOuvriers] = useState<ProfileOuvrier[]>([]);
  const [pointages, setPointages] = useState<PointageTerrasseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Formulaire de saisie
  const [ouvrierId, setOuvrierId] = useState("");
  const [datePointage, setDatePointage] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [heures, setHeures] = useState<number>(7);
  const [phaseSelectionnee, setPhaseSelectionnee] = useState<string>(
    "structure_plots_lambourdes"
  );
  const [notes, setNotes] = useState("");

  const chargerDonnees = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Profils ouvriers / poseurs
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, role");
      if (profs) {
        const liste = profs.filter((p) => p.full_name && p.full_name.trim() !== "");
        setOuvriers(liste);
        if (liste.length > 0 && !ouvrierId) {
          setOuvrierId(liste[0].id);
        }
      }

      // 2. Historique des pointages du chantier
      const { data: ptgGlobaux } = await supabase
        .from("pointages_globaux")
        .select("id, date_saisie, volume_heures_declare, meteo_relevee, commentaire, user_id")
        .eq("chantier_id", chantierId)
        .order("date_saisie", { ascending: false });

      if (ptgGlobaux) {
        const formates: PointageTerrasseRow[] = ptgGlobaux.map((p) => {
          // Extraire la phase si présente dans le commentaire formaté
          let phaseNom = "Intervention générale";
          const matchPhase = (p.commentaire || "").match(/^\[Phase: (.*?)\]/);
          if (matchPhase) {
            phaseNom = matchPhase[1];
          }

          const ouvrierTrouve = (profs || []).find((u) => u.id === p.user_id);

          return {
            id: p.id,
            date: p.date_saisie,
            heures: Number(p.volume_heures_declare) || 0,
            phase: phaseNom,
            commentaire: (p.commentaire || "").replace(/^\[Phase: .*?\]\s*/, ""),
            meteo_relevee: p.meteo_relevee,
            user_nom: ouvrierTrouve ? ouvrierTrouve.full_name : "Équipe collective",
          };
        });

        setPointages(formates);
        const total = formates.reduce((acc, curr) => acc + curr.heures, 0);
        onTotalHeuresChange?.(total);
      }
    } catch (err) {
      console.error("Erreur chargement pointages terrasse :", err);
    } finally {
      setLoading(false);
    }
  }, [chantierId, onTotalHeuresChange, ouvrierId]);

  useEffect(() => {
    chargerDonnees();
  }, [chargerDonnees]);

  async function handleValiderPointage(e: React.FormEvent) {
    e.preventDefault();
    if (heures <= 0 || !datePointage) return;

    setSubmitting(true);
    const phaseLabel =
      PHASES_TERRASSE_HEURES.find((p) => p.id === phaseSelectionnee)?.label ||
      "Terrasse";
    const commentaireComplet = `[Phase: ${phaseLabel}] ${notes.trim()}`.trim();

    const res = await validerPointageAvecMeteo(
      chantierId,
      ouvrierId || "",
      heures,
      datePointage,
      commentaireComplet
    );

    setSubmitting(false);

    if (res.success) {
      setNotes("");
      chargerDonnees();
    } else {
      alert("Erreur lors de la validation du pointage : " + (res.error || ""));
    }
  }

  async function handleSupprimerPointage(id: string) {
    if (!window.confirm("Voulez-vous supprimer ce pointage d'heures ?")) return;
    const res = await supprimerPointageGlob(id);
    if (res.success) {
      chargerDonnees();
    } else {
      alert("Erreur suppression : " + res.error);
    }
  }

  const totalHeures = pointages.reduce((acc, p) => acc + p.heures, 0);

  // Répartition par phase
  const heuresParPhase = PHASES_TERRASSE_HEURES.map((p) => {
    const totalP = pointages
      .filter((pt) => pt.phase?.includes(p.label.split(". ")[1] || ""))
      .reduce((acc, curr) => acc + curr.heures, 0);
    return { ...p, total: totalP };
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Synthèse des heures pointées */}
      <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#F0F0F0] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <Clock className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[2px] text-[#B85B2B]">
                Gestion du Temps & Productivité
              </p>
              <h3 className="text-xl font-bold text-[#23272B]">
                Suivi des Heures — Chantier Terrasse
              </h3>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] px-4 py-2 text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#777777]">Total heures pointées</p>
            <p className="text-2xl font-bold tracking-tight text-[#B85B2B]">
              {totalHeures.toFixed(1)} h
            </p>
          </div>
        </div>

        {/* Répartition par phase terrasse */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {heuresParPhase.map((ph) => (
            <div
              key={ph.id}
              className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-3 text-left"
            >
              <p className="text-[11px] font-semibold text-[#777777] truncate">{ph.label}</p>
              <p className="mt-1 text-lg font-bold text-[#23272B]">
                {ph.total.toFixed(1)} <span className="text-xs font-normal text-[#777777]">h</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Formulaire de saisie d'un pointage */}
      <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <p className="mb-4 text-xs font-bold uppercase tracking-wider text-[#B85B2B]">
          Pointer des heures sur ce chantier
        </p>

        <form onSubmit={handleValiderPointage} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#777777]">Compagnon / Poseur</label>
              <select
                value={ouvrierId}
                onChange={(e) => setOuvrierId(e.target.value)}
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
              >
                <option value="">Pointage collectif (Équipe)</option>
                {ouvriers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#777777]">Date d&apos;intervention</label>
              <input
                type="date"
                required
                value={datePointage}
                onChange={(e) => setDatePointage(e.target.value)}
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#777777]">Heures effectuées</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                required
                value={heures}
                onChange={(e) => setHeures(Number(e.target.value))}
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm font-bold text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#777777]">Phase Terrasse</label>
              <select
                value={phaseSelectionnee}
                onChange={(e) => setPhaseSelectionnee(e.target.value)}
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
              >
                {PHASES_TERRASSE_HEURES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-[#777777]">
              Commentaire / Tâches réalisées (optionnel)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex : Réglage au laser de 45 plots et pose des bandes EPDM..."
              className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-gray-500">
              Prise en compte météo automatique pour les ratios de rentabilité
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#D97732] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {submitting ? "Validation..." : "Enregistrer le pointage"}
            </button>
          </div>
        </form>
      </section>

      {/* 3. Historique des pointages du chantier */}
      <section className="rounded-[24px] border border-[#E5E5E5] bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#777777]">
          Journal des Interventions ({pointages.length})
        </h4>

        {loading ? (
          <p className="py-6 text-center text-xs text-gray-400">Chargement des heures...</p>
        ) : pointages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-xs text-gray-500">
            Aucun pointage n&apos;a été saisi pour l&apos;instant sur ce chantier terrasse.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#E5E5E5]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F7F6] text-[#777777]">
                <tr>
                  <th className="px-4 py-2.5 font-bold">Date</th>
                  <th className="px-4 py-2.5 font-bold">Compagnon</th>
                  <th className="px-4 py-2.5 font-bold">Phase Terrasse</th>
                  <th className="px-4 py-2.5 font-bold">Heures</th>
                  <th className="px-4 py-2.5 font-bold">Météo constatée</th>
                  <th className="px-4 py-2.5 font-bold">Commentaire</th>
                  <th className="px-4 py-2.5 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0] text-[#23272B]">
                {pointages.map((pt) => (
                  <tr key={pt.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3 font-semibold">
                      {new Date(pt.date).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 font-medium">{pt.user_nom}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-[#B85B2B]/20 bg-[#B85B2B]/10 px-2 py-0.5 text-[11px] font-bold text-[#B85B2B]">
                        {pt.phase}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-[#23272B]">{pt.heures} h</td>
                    <td className="px-4 py-3 text-gray-600">{pt.meteo_relevee || "Normale"}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                      {pt.commentaire || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleSupprimerPointage(pt.id)}
                        className="rounded p-1 text-gray-400 hover:text-red-600"
                        title="Supprimer ce pointage"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
