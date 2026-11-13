// components/RapportsIntemperiesListe.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Trash2, Loader2, AlertTriangle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export async function supprimerRapportIntemperie(
  supabaseClient: typeof supabase,
  rapportId: string,
  chantierId: string
): Promise<{ success: boolean; error?: string }> {
  if (!rapportId || !chantierId) {
    return { success: false, error: "Identifiant du rapport ou du chantier manquant" };
  }
  const { error } = await supabaseClient
    .from("rapports_intemperies")
    .delete()
    .eq("id", rapportId)
    .eq("chantier_id", chantierId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

type RapportResume = {
  id: string;
  numero: string;
  vigilance_officielle: string;
  risque_technique_niveau: string | null;
  jour_arrete: boolean;
  a_valider: boolean;
  ampleur_impact: "complete" | "partielle" | null;
  motif: string;
  cree_le: string;
  cree_par: string;
};

const EMOJI_VIGILANCE: Record<string, string> = {
  vert: "🟢",
  jaune: "🟡",
  orange: "🟠",
  rouge: "🔴",
  indisponible: "⚪",
};

const COULEUR_BORDURE: Record<string, string> = {
  vert: "border-emerald-500/40",
  jaune: "border-amber-500/40",
  orange: "border-orange-500/40",
  rouge: "border-red-500/40",
  indisponible: "border-slate-600/50",
};

const VIGILANCE_CARTE_STYLE: Record<
  string,
  {
    borderLeft: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
  }
> = {
  vert: {
    borderLeft: "border-l-emerald-500",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-800",
    badgeBorder: "border-emerald-200",
  },
  jaune: {
    borderLeft: "border-l-amber-400",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-900",
    badgeBorder: "border-amber-200",
  },
  orange: {
    borderLeft: "border-l-orange-500",
    badgeBg: "bg-orange-50",
    badgeText: "text-orange-900",
    badgeBorder: "border-orange-200",
  },
  rouge: {
    borderLeft: "border-l-red-500",
    badgeBg: "bg-red-50",
    badgeText: "text-red-900",
    badgeBorder: "border-red-200",
  },
  indisponible: {
    borderLeft: "border-l-slate-300",
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
  },
};

const COULEUR_BORDURE_CLAIR: Record<string, string> = {
  vert: "border-emerald-300/80 hover:border-emerald-500 bg-white shadow-2xs hover:shadow-xs",
  jaune: "border-amber-300/80 hover:border-amber-500 bg-white shadow-2xs hover:shadow-xs",
  orange: "border-orange-300/80 hover:border-orange-500 bg-white shadow-2xs hover:shadow-xs",
  rouge: "border-red-300/80 hover:border-red-500 bg-white shadow-2xs hover:shadow-xs",
  indisponible: "border-[#E5E5E5] hover:border-[#CCCCCC] bg-white shadow-2xs hover:shadow-xs",
};

const LABEL_VIGILANCE: Record<string, string> = {
  vert: "Pas de vigilance",
  jaune: "Vigilance jaune",
  orange: "Vigilance orange",
  rouge: "Vigilance rouge",
  indisponible: "Vigilance officielle indisponible",
};

// Libellés du RISQUE TECHNIQUE (seuils matériau/accès), distincts de la
// vigilance officielle. Les deux niveaux ne sont jamais fusionnés à l'affichage.
const LABEL_RISQUE_TECHNIQUE: Record<string, string> = {
  vert: "Aucun dépassement mesuré",
  jaune: "Dépassement modéré mesuré",
  orange: "Dépassement important mesuré",
  rouge: "Dépassement critique mesuré",
};

function labelStatut(r: RapportResume) {
  if (r.jour_arrete) {
    return r.ampleur_impact === "partielle"
      ? "Impact partiel"
      : "Journée arrêtée";
  }

  return "Vigilance constatée";
}

function labelVigilance(niveau: string) {
  return LABEL_VIGILANCE[niveau] ?? "Vigilance inconnue";
}

// Niveau du risque technique, affiché SÉPARÉMENT de la vigilance officielle.
function labelRisqueTechnique(niveau: string | null) {
  if (!niveau) return null;
  return LABEL_RISQUE_TECHNIQUE[niveau] ?? `Risque technique ${niveau}`;
}

export default function RapportsIntemperiesListe({
  chantierId,
  variante = "clair",
}: {
  chantierId: string;
  variante?: "sombre" | "clair";
}) {
  const estClair = variante === "clair";
  const [rapports, setRapports] = useState<RapportResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [generationEnCours, setGenerationEnCours] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<string | null>(null);
  const [rapportASupprimer, setRapportASupprimer] = useState<RapportResume | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("rapports_intemperies")
      .select(
        "id, numero, vigilance_officielle, risque_technique_niveau, jour_arrete, a_valider, ampleur_impact, motif, cree_le, cree_par"
      )
      .eq("chantier_id", chantierId)
      .order("cree_le", { ascending: false });

    if (!error && data) {
      setRapports(data as RapportResume[]);
    } else if (error) {
      console.error("Erreur chargement rapports intempéries :", error);
      setRapports([]);
    }

    setLoading(false);
  }, [chantierId]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function genererRapportAujourdhui() {
    setGenerationEnCours(true);
    setMessageFeedback(null);

    try {
      const res = await fetch("/api/rapports-intemperies/generer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chantierId,
          force: true,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessageFeedback("✓ Rapport intempéries généré avec succès !");
        await charger();
      } else {
        const message = data.resultats?.[0]?.erreur || data.error || "Impossible de générer le rapport";
        setMessageFeedback(`❌ ${message}`);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erreur inconnue";

      setMessageFeedback(`❌ Erreur réseau : ${message}`);
    } finally {
      setGenerationEnCours(false);
    }
  }

  async function executerSuppression() {
    if (!rapportASupprimer) return;
    setSuppressionEnCours(true);
    setMessageFeedback(null);

    try {
      const res = await supprimerRapportIntemperie(
        supabase,
        rapportASupprimer.id,
        chantierId
      );

      if (!res.success) {
        setMessageFeedback(`❌ Erreur lors de la suppression : ${res.error}`);
        setRapportASupprimer(null);
        return;
      }

      setRapports((prev) => prev.filter((r) => r.id !== rapportASupprimer.id));
      setMessageFeedback(
        `✓ Rapport ${rapportASupprimer.numero} supprimé définitivement du chantier.`
      );
      setRapportASupprimer(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur inattendue";
      setMessageFeedback(`❌ Erreur réseau : ${message}`);
      setRapportASupprimer(null);
    } finally {
      setSuppressionEnCours(false);
    }
  }

  const aValiderCount = rapports.filter((r) => r.a_valider).length;

  return (
    <div className="space-y-3">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F0F0] pb-3">
        <div className="flex items-center gap-2.5">
          <p
            className={
              estClair
                ? "text-xs font-bold uppercase tracking-wider text-[#23272B]"
                : "text-xs font-semibold uppercase tracking-wide text-slate-400"
            }
          >
            Rapports intempéries ({rapports.length})
          </p>

          {aValiderCount > 0 ? (
            <span
              className={
                estClair
                  ? "rounded-full bg-[#B85B2B]/10 border border-[#B85B2B]/20 px-2.5 py-0.5 text-xs font-bold text-[#B85B2B]"
                  : "rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400"
              }
            >
              {aValiderCount} à valider
            </span>
          ) : rapports.length > 0 ? (
            <span
              className={
                estClair
                  ? "rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"
                  : "rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400"
              }
            >
              Tous validés
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={genererRapportAujourdhui}
          disabled={generationEnCours}
          className={
            estClair
              ? "flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#a04e24] px-3.5 py-2 text-xs font-bold text-white transition-all active:scale-[0.98] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              : "flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {generationEnCours
            ? "⏳ Analyse Météo..."
            : "⚡ Générer le rapport du jour"}
        </button>
      </div>

      {/* Message de retour */}
      {messageFeedback && (
        <div
          className={
            estClair
              ? `rounded-xl p-3 text-xs font-semibold ${
                  messageFeedback.startsWith("✓")
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border border-red-200 bg-red-50 text-red-900"
                }`
              : `rounded-lg p-2.5 text-xs font-medium ${
                  messageFeedback.startsWith("✓")
                    ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border border-red-500/30 bg-red-500/10 text-red-300"
                }`
          }
        >
          {messageFeedback}
        </div>
      )}

      {/* Chargement */}
      {loading ? (
        <div
          className={
            estClair
              ? "rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-6 text-center"
              : "rounded-lg border border-slate-700 bg-slate-900/50 p-4"
          }
        >
          <p className={estClair ? "text-xs font-medium text-[#777777]" : "text-sm text-slate-400"}>
            Chargement des rapports d&apos;intempéries…
          </p>
        </div>
      ) : rapports.length === 0 ? (
        /* Aucun rapport */
        <div
          className={
            estClair
              ? "rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-6 text-xs text-[#777777] leading-relaxed text-center sm:text-left"
              : "rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400"
          }
        >
          Aucun rapport pour ce chantier. Cliquez sur{" "}
          <strong className={estClair ? "text-[#23272B] font-bold" : "text-slate-200"}>
            « Générer le rapport du jour »
          </strong>{" "}
          pour analyser les conditions météo et créer le document officiel.
        </div>
      ) : (
        /* Liste */
        <div className="space-y-3">
          {rapports.map((r) => {
            const vigilanceInfo =
              VIGILANCE_CARTE_STYLE[r.vigilance_officielle] ??
              VIGILANCE_CARTE_STYLE.indisponible;

            if (!estClair) {
              return (
                <Link
                  key={r.id}
                  href={`/rapports-intemperies/${r.id}`}
                  className={`block rounded-lg border bg-slate-900/50 p-3 transition-colors hover:bg-slate-800 ${
                    COULEUR_BORDURE[r.vigilance_officielle] ?? "border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-base">
                        {EMOJI_VIGILANCE[r.vigilance_officielle] ?? "⚪"}
                      </span>
                      <span className="truncate font-semibold text-white">
                        {r.numero}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.a_valider && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-2xs font-semibold uppercase text-amber-400">
                          À valider
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {new Date(r.cree_le).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-slate-300">{labelStatut(r)}</p>
                    <span className="text-slate-700">·</span>
                    <p className="text-xs text-slate-500">{labelVigilance(r.vigilance_officielle)}</p>
                    {labelRisqueTechnique(r.risque_technique_niveau) && (
                      <>
                        <span className="text-slate-700">·</span>
                        <p className="text-xs text-slate-500">{labelRisqueTechnique(r.risque_technique_niveau)}</p>
                      </>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-400">{r.motif}</p>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 text-2xs text-slate-600">
                    <span>{r.cree_par === "auto" ? "⚡ Généré automatiquement" : "✎ Manuel"}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRapportASupprimer(r);
                      }}
                      title={`Supprimer le rapport ${r.numero}`}
                      aria-label={`Supprimer le rapport ${r.numero}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Link>
              );
            }

            return (
              <Link
                key={r.id}
                href={`/rapports-intemperies/${r.id}`}
                className={`group relative block rounded-2xl border border-[#E5E5E5] border-l-4 ${vigilanceInfo.borderLeft} bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-r-[#B85B2B]/30 hover:border-t-[#B85B2B]/30 hover:border-b-[#B85B2B]/30 transition-all duration-150`}
              >
                {/* Ligne principale : Numéro, Badge Vigilance, Badge Statut & Date */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="shrink-0 text-base">
                      {EMOJI_VIGILANCE[r.vigilance_officielle] ?? "⚪"}
                    </span>
                    <span className="font-mono font-bold text-sm sm:text-base text-[#23272B] tracking-tight group-hover:text-[#B85B2B] transition-colors">
                      {r.numero}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-semibold border ${vigilanceInfo.badgeBg} ${vigilanceInfo.badgeText} ${vigilanceInfo.badgeBorder}`}
                    >
                      {labelVigilance(r.vigilance_officielle)}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {r.a_valider ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#B85B2B]/10 border border-[#B85B2B]/25 px-2.5 py-0.5 text-2xs font-bold text-[#B85B2B]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#B85B2B]" />
                        À valider
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-2xs font-semibold text-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        Validé
                      </span>
                    )}

                    <span className="text-xs font-semibold text-[#777777] font-mono">
                      {new Date(r.cree_le).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </div>

                {/* Statut + Risque Technique */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-2xs font-bold ${
                      r.jour_arrete
                        ? "bg-red-50 text-red-800 border border-red-200"
                        : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    }`}
                  >
                    {labelStatut(r)}
                  </span>

                  {labelRisqueTechnique(r.risque_technique_niveau) && (
                    <>
                      <span className="text-[#CCCCCC]">·</span>
                      <span className="text-xs font-semibold text-[#777777]">
                        {labelRisqueTechnique(r.risque_technique_niveau)}
                      </span>
                    </>
                  )}
                </div>

                {/* Motif */}
                {r.motif && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#555555]">
                    {r.motif}
                  </p>
                )}

                {/* Pied de carte : Origine & Action */}
                <div className="mt-3 flex items-center justify-between border-t border-[#F0F0F0] pt-2.5 text-[11px] text-[#777777]">
                  <span>
                    {r.cree_par === "auto" ? "⚡ Relevé automatique" : "✎ Saisie manuelle"}
                  </span>
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <span className="font-bold text-[#B85B2B] group-hover:translate-x-0.5 transition-transform">
                      Consulter le rapport →
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRapportASupprimer(r);
                      }}
                      title={`Supprimer le rapport ${r.numero}`}
                      aria-label={`Supprimer le rapport ${r.numero}`}
                      className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50/70 text-rose-600 hover:bg-rose-100 hover:text-rose-700 hover:border-rose-300 transition-colors active:scale-95 shadow-2xs"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Modale de confirmation de suppression */}
      {rapportASupprimer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="suppression-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-[#E5E5E5] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête modale */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50 border border-rose-200 text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="suppression-modal-title"
                    className="text-base font-bold text-[#23272B]"
                  >
                    Supprimer ce rapport d'intempéries ?
                  </h3>
                  <p className="text-xs text-[#777777]">
                    Cette action est irréversible.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !suppressionEnCours && setRapportASupprimer(null)}
                disabled={suppressionEnCours}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Détails du rapport ciblé */}
            <div className="rounded-xl border border-slate-100 bg-[#F9F9F8] p-3.5 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#777777]">Rapport :</span>
                <span className="font-mono font-bold text-[#23272B]">
                  {rapportASupprimer.numero}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#777777]">Date :</span>
                <span className="font-medium text-[#23272B]">
                  {new Date(rapportASupprimer.cree_le).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#777777]">Vigilance :</span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#23272B]">
                  {EMOJI_VIGILANCE[rapportASupprimer.vigilance_officielle] ?? "⚪"}
                  {labelVigilance(rapportASupprimer.vigilance_officielle)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#777777]">Statut :</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-2xs font-bold ${
                    rapportASupprimer.jour_arrete
                      ? "bg-red-50 text-red-800 border border-red-200"
                      : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  }`}
                >
                  {labelStatut(rapportASupprimer)}
                </span>
              </div>
              {rapportASupprimer.motif && (
                <div className="pt-1 border-t border-slate-200/60">
                  <span className="font-semibold text-[#777777] block mb-0.5">Motif :</span>
                  <p className="text-slate-600 italic line-clamp-2">
                    {rapportASupprimer.motif}
                  </p>
                </div>
              )}
            </div>

            {/* Avertissement */}
            <p className="text-xs text-rose-600 bg-rose-50/50 p-2.5 rounded-lg border border-rose-100 leading-relaxed">
              ⚠️ Attention : La suppression est définitive. Les données météorologiques enregistrées pour ce rapport ne pourront pas être récupérées.
            </p>

            {/* Actions modale */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRapportASupprimer(null)}
                disabled={suppressionEnCours}
                className="h-10 px-4 rounded-xl border border-[#E5E5E5] bg-white text-xs font-semibold text-[#555555] hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={executerSuppression}
                disabled={suppressionEnCours}
                className="inline-flex h-10 items-center justify-center gap-2 px-4 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 active:scale-98 transition-all disabled:opacity-50 shadow-sm"
              >
                {suppressionEnCours ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Suppression...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Supprimer définitivement
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
