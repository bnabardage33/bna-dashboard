"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, Loader2, AlertTriangle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { obtenirContexteEntreprise } from "@/lib/contexteEntreprise";

type RapportListe = {
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
  chantiers: { nom: string | null } | null;
};

type RapportIntemperieRow = {
  id: string;
  numero: string | null;
  chantier_id: string | null;
  vigilance_officielle: string | null;
  risque_technique_niveau: string | null;
  jour_arrete: boolean | null;
  a_valider: boolean | null;
  ampleur_impact: "complete" | "partielle" | null;
  motif: string | null;
  cree_le: string | null;
  cree_par: string | null;
};

const EMOJI_VIGILANCE: Record<string, string> = {
  vert: "🟢",
  jaune: "🟡",
  orange: "🟠",
  rouge: "🔴",
  indisponible: "⚪",
};

const COULEUR_BORDURE: Record<string, string> = {
  vert: "border-white/10",
  jaune: "border-white/10",
  orange: "border-white/10",
  rouge: "border-red-500/40",
  indisponible: "border-white/10",
};

// Libellés du RISQUE TECHNIQUE (distinct de la vigilance officielle).
const LABEL_RISQUE_TECHNIQUE: Record<string, string> = {
  vert: "aucun dépassement mesuré",
  jaune: "dépassement modéré mesuré",
  orange: "dépassement important mesuré",
  rouge: "dépassement critique mesuré",
};

function labelStatut(r: RapportListe) {
  if (r.jour_arrete) return r.ampleur_impact === "partielle" ? "Impact partiel" : "Journée arrêtée";
  if (r.a_valider) return "À valider";
  return "Constaté";
}

type Filtre = "tous" | "a_valider" | "arretes";

export default function BureauRapportsIntemperiesPage() {
  const [rapports, setRapports] = useState<RapportListe[]>([]);
  const [loading, setLoading] = useState(true);
  const [generationEnCours, setGenerationEnCours] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [rapportASupprimer, setRapportASupprimer] = useState<RapportListe | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);

  async function charger() {
    setLoading(true);
    const [rapportsRes, chantiersRes] = await Promise.all([
      supabase
        .from("rapports_intemperies")
        .select(
          "id, numero, chantier_id, vigilance_officielle, risque_technique_niveau, jour_arrete, a_valider, ampleur_impact, motif, cree_le, cree_par"
        )
        .order("cree_le", { ascending: false }),
      supabase
        .from("chantiers")
        .select("id, nom, adresse_chantier"),
    ]);

    if (rapportsRes.error) {
      console.error("Erreur chargement rapports intempéries:", rapportsRes.error);
      setMessageFeedback(
        `❌ Erreur chargement rapports (${rapportsRes.error.code ?? "SQL"}) : ${rapportsRes.error.message}`
      );
      setLoading(false);
      return;
    }

    if (chantiersRes.error) {
      console.error("Erreur chargement chantiers (intempéries):", chantiersRes.error);
      setMessageFeedback(
        `❌ Erreur chargement chantiers (${chantiersRes.error.code ?? "SQL"}) : ${chantiersRes.error.message}`
      );
    }

    const chantiersMap = new Map<string, string>();
    if (chantiersRes.data) {
      for (const ch of chantiersRes.data) {
        chantiersMap.set(ch.id, ch.nom || ch.adresse_chantier || "Chantier");
      }
    }

    const formatted: RapportListe[] = (
      ((rapportsRes.data as RapportIntemperieRow[] | null) ?? []).map((r) => ({
      id: r.id,
      numero: r.numero ?? "",
      vigilance_officielle: r.vigilance_officielle ?? "indisponible",
      risque_technique_niveau: r.risque_technique_niveau ?? null,
      jour_arrete: r.jour_arrete ?? false,
      a_valider: r.a_valider ?? false,
      ampleur_impact: r.ampleur_impact,
      motif: r.motif ?? "",
      cree_le: r.cree_le ?? "",
      cree_par: r.cree_par ?? "",
      chantiers: {
        nom: chantiersMap.get(r.chantier_id ?? "") || "Chantier",
      },
    })));

    setRapports(formatted);
    setLoading(false);
  }

  useEffect(() => {
    charger();
  }, []);

  async function genererRapportsActifs() {
    setGenerationEnCours(true);
    setMessageFeedback(null);
    try {
      const res = await fetch("/api/rapports-intemperies/generer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessageFeedback(`✓ ${data.total} rapport(s) analysé(s) / mis à jour avec succès.`);
        await charger();
      } else {
        setMessageFeedback(`❌ ${data.error || "Erreur lors de la génération"}`);
      }
    } catch (err) {
      setMessageFeedback(`❌ Erreur réseau : ${(err as Error).message}`);
    } finally {
      setGenerationEnCours(false);
    }
  }

  async function executerSuppression() {
    if (!rapportASupprimer) return;
    setSuppressionEnCours(true);
    setMessageFeedback(null);

    try {
      const entrepriseId = await obtenirContexteEntreprise();
      const { error } = await supabase
        .from("rapports_intemperies")
        .delete()
        .eq("id", rapportASupprimer.id)
        .eq("entreprise_id", entrepriseId);

      if (error) {
        console.error("[rapports-intemperies] Erreur suppression :", error);
        setMessageFeedback(
          `❌ Impossible de supprimer ${rapportASupprimer.numero || "ce rapport"} (${error.code ?? "RLS"}) : ${error.message}`
        );
        return;
      }

      setRapports((prev) => prev.filter((item) => item.id !== rapportASupprimer.id));
      setMessageFeedback(
        `✓ Rapport ${rapportASupprimer.numero || ""} supprimé avec succès.`
      );
      setRapportASupprimer(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      console.error("[rapports-intemperies] Exception suppression :", err);
      setMessageFeedback(`❌ Erreur lors de la suppression : ${msg}`);
    } finally {
      setSuppressionEnCours(false);
    }
  }

  const rapportsFiltres = rapports.filter((r) => {
    if (filtre === "a_valider") return r.a_valider;
    if (filtre === "arretes") return r.jour_arrete;
    return true;
  });

  const aValiderCount = rapports.filter((r) => r.a_valider).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Rapports Intempéries</h1>
          <p className="text-sm text-gray-400">
            Tous les rapports générés automatiquement ou manuellement, tous chantiers confondus.
          </p>
        </div>

        <button
          onClick={genererRapportsActifs}
          disabled={generationEnCours}
          className="flex items-center gap-1.5 rounded-xl bg-[#D96B27] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#E07A38] disabled:opacity-50 transition-colors"
        >
          {generationEnCours ? "⏳ Analyse Météo..." : "⚡ Vérifier & Générer pour les chantiers"}
        </button>
      </div>

      {messageFeedback && (
        <div
          className={`rounded-xl p-3 text-xs font-medium ${
            messageFeedback.startsWith("✓")
              ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-200"
              : "border border-red-500/40 bg-red-950/30 text-red-200"
          }`}
        >
          {messageFeedback}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFiltre("tous")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            filtre === "tous"
              ? "bg-[#D96B27] text-white"
              : "border border-white/10 bg-[#1B1511] text-gray-300 hover:border-[#D96B27]/40"
          }`}
        >
          Tous ({rapports.length})
        </button>
        <button
          onClick={() => setFiltre("a_valider")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            filtre === "a_valider"
              ? "bg-[#D96B27] text-white"
              : "border border-white/10 bg-[#1B1511] text-gray-300 hover:border-[#D96B27]/40"
          }`}
        >
          À valider ({aValiderCount})
        </button>
        <button
          onClick={() => setFiltre("arretes")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            filtre === "arretes"
              ? "bg-[#D96B27] text-white"
              : "border border-white/10 bg-[#1B1511] text-gray-300 hover:border-[#D96B27]/40"
          }`}
        >
          Journées arrêtées
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : rapportsFiltres.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun rapport pour ce filtre.</p>
      ) : (
        <div className="space-y-2.5">
          {rapportsFiltres.map((r) => (
            <Link
              key={r.id}
              href={`/rapports-intemperies/${r.id}`}
              className={`block rounded-xl border bg-[#1B1511] p-4 transition-colors hover:border-[#D96B27]/50 ${
                COULEUR_BORDURE[r.vigilance_officielle] ?? "border-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span>{EMOJI_VIGILANCE[r.vigilance_officielle] ?? "⚪"}</span>
                  <span className="font-semibold text-white">{r.numero}</span>
                  <span className="truncate text-sm text-gray-400">
                    {r.chantiers?.nom || "Chantier"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.a_valider && (
                    <span className="rounded-full border border-[#D96B27]/40 bg-[#D96B27]/15 px-2 py-0.5 text-2xs font-semibold uppercase text-[#F59E0B]">
                      À valider
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {new Date(r.cree_le).toLocaleDateString("fr-FR")}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRapportASupprimer(r);
                    }}
                    title={`Supprimer ${r.numero || "ce rapport"}`}
                    aria-label={`Supprimer le rapport ${r.numero || r.id}`}
                    className="rounded-lg border border-white/10 bg-[#120F0D] p-1.5 text-gray-400 transition-colors hover:border-red-500/50 hover:bg-red-950/40 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-400">{labelStatut(r)}</p>
              <p className="mt-1 text-xs text-gray-400">
                Vigilance officielle :{" "}
                {r.vigilance_officielle === "indisponible"
                  ? "indisponible"
                  : r.vigilance_officielle}
                {r.risque_technique_niveau
                  ? ` · Risque technique : ${
                      LABEL_RISQUE_TECHNIQUE[r.risque_technique_niveau] ??
                      r.risque_technique_niveau
                    }`
                  : ""}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-gray-500">{r.motif}</p>
            </Link>
          ))}
        </div>
      )}

      {rapportASupprimer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => {
            if (!suppressionEnCours) setRapportASupprimer(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#D96B27]/30 bg-[#1B1511] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-950/40 text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Supprimer le rapport {rapportASupprimer.numero || ""} ?
                  </h2>
                  <p className="text-xs text-gray-400">
                    {rapportASupprimer.chantiers?.nom || "Chantier"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={suppressionEnCours}
                onClick={() => setRapportASupprimer(null)}
                aria-label="Fermer"
                className="rounded-lg p-1 text-gray-400 hover:bg-[#120F0D] hover:text-white disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 rounded-xl border border-white/10 bg-[#120F0D] p-3 text-xs text-gray-300">
              Cette action est définitive. Le rapport{" "}
              <span className="font-semibold text-white">
                {rapportASupprimer.numero || rapportASupprimer.id}
              </span>{" "}
              sera supprimé de la base de données.
            </p>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={suppressionEnCours}
                onClick={() => setRapportASupprimer(null)}
                className="rounded-xl border border-white/10 bg-[#120F0D] px-3.5 py-2 text-xs font-semibold text-gray-300 hover:border-white/20 hover:text-white disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={suppressionEnCours}
                onClick={executerSuppression}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {suppressionEnCours ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Suppression…</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Supprimer définitivement</span>
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
