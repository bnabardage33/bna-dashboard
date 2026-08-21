// components/RapportsIntemperiesListe.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type RapportResume = {
  id: string;
  numero: string;
  vigilance_officielle: string;
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
};

const COULEUR_BORDURE: Record<string, string> = {
  vert: "border-emerald-500/40",
  jaune: "border-amber-500/40",
  orange: "border-orange-500/40",
  rouge: "border-red-500/40",
};

function labelStatut(r: RapportResume) {
  if (r.jour_arrete) return r.ampleur_impact === "partielle" ? "Impact partiel" : "Journée arrêtée";
  if (r.a_valider) return "À valider";
  return "Constaté";
}

export default function RapportsIntemperiesListe({ chantierId }: { chantierId: string }) {
  const [rapports, setRapports] = useState<RapportResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [generationEnCours, setGenerationEnCours] = useState(false);
  const [messageFeedback, setMessageFeedback] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rapports_intemperies")
      .select("id, numero, vigilance_officielle, jour_arrete, a_valider, ampleur_impact, motif, cree_le, cree_par")
      .eq("chantier_id", chantierId)
      .order("cree_le", { ascending: false });

    if (!error && data) setRapports(data as RapportResume[]);
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chantierId, force: true }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessageFeedback("✓ Rapport intempéries généré avec succès !");
        await charger();
      } else {
        setMessageFeedback(`❌ ${data.error || "Impossible de générer le rapport"}`);
      }
    } catch (err: any) {
      setMessageFeedback(`❌ Erreur réseau : ${err.message}`);
    } finally {
      setGenerationEnCours(false);
    }
  }

  const aValiderCount = rapports.filter((r) => r.a_valider).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Rapports intempéries ({rapports.length})
          </p>
          {aValiderCount > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              {aValiderCount} à valider
            </span>
          )}
        </div>

        <button
          onClick={genererRapportAujourdhui}
          disabled={generationEnCours}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {generationEnCours ? "⏳ Analyse Météo..." : "⚡ Générer le rapport du jour"}
        </button>
      </div>

      {messageFeedback && (
        <div
          className={`rounded-lg p-2.5 text-xs font-medium ${
            messageFeedback.startsWith("✓")
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {messageFeedback}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Chargement des rapports…</p>
      ) : rapports.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-400">
          Aucun rapport pour ce chantier. Cliquez sur{" "}
          <strong className="text-slate-200">« Générer le rapport du jour »</strong> pour analyser les conditions météo et créer le document officiel.
        </div>
      ) : (
        <div className="space-y-2">
          {rapports.map((r) => (
            <Link
              key={r.id}
              href={`/rapports-intemperies/${r.id}`}
              className={`block rounded-lg border bg-slate-900/50 p-3 transition-colors hover:bg-slate-800 ${
                COULEUR_BORDURE[r.vigilance_officielle] ?? "border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{EMOJI_VIGILANCE[r.vigilance_officielle] ?? "⚪"}</span>
                  <span className="font-semibold text-white">{r.numero}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.a_valider && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                      À valider
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {new Date(r.cree_le).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-300">{labelStatut(r)}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">{r.motif}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
