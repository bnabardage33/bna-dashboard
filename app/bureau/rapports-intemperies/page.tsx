"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type RapportListe = {
  id: string;
  numero: string;
  vigilance_officielle: string;
  jour_arrete: boolean;
  a_valider: boolean;
  ampleur_impact: "complete" | "partielle" | null;
  motif: string;
  cree_le: string;
  cree_par: string;
  chantiers: { nom: string | null } | null;
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

  async function charger() {
    setLoading(true);
    const { data, error } = await supabase
      .from("rapports_intemperies")
      .select(
        "id, numero, vigilance_officielle, jour_arrete, a_valider, ampleur_impact, motif, cree_le, cree_par, chantiers(nom)"
      )
      .order("cree_le", { ascending: false });

    if (error) console.error(error);
    else setRapports((data as unknown as RapportListe[]) ?? []);
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
    } catch (err: any) {
      setMessageFeedback(`❌ Erreur réseau : ${err.message}`);
    } finally {
      setGenerationEnCours(false);
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
          <p className="text-sm text-slate-400">
            Tous les rapports générés automatiquement ou manuellement, tous chantiers confondus.
          </p>
        </div>

        <button
          onClick={genererRapportsActifs}
          disabled={generationEnCours}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {generationEnCours ? "⏳ Analyse Météo..." : "⚡ Vérifier & Générer pour les chantiers"}
        </button>
      </div>

      {messageFeedback && (
        <div
          className={`rounded-lg p-3 text-xs font-medium ${
            messageFeedback.startsWith("✓")
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {messageFeedback}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setFiltre("tous")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            filtre === "tous" ? "bg-red-600 text-white" : "border border-slate-600 text-slate-300"
          }`}
        >
          Tous ({rapports.length})
        </button>
        <button
          onClick={() => setFiltre("a_valider")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            filtre === "a_valider" ? "bg-amber-500 text-slate-950" : "border border-slate-600 text-slate-300"
          }`}
        >
          À valider ({aValiderCount})
        </button>
        <button
          onClick={() => setFiltre("arretes")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            filtre === "arretes" ? "bg-slate-600 text-white" : "border border-slate-600 text-slate-300"
          }`}
        >
          Journées arrêtées
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : rapportsFiltres.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun rapport pour ce filtre.</p>
      ) : (
        <div className="space-y-2">
          {rapportsFiltres.map((r) => (
            <Link
              key={r.id}
              href={`/rapports-intemperies/${r.id}`}
              className={`block rounded-xl border bg-slate-800 p-4 hover:border-red-600/40 ${
                COULEUR_BORDURE[r.vigilance_officielle] ?? "border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{EMOJI_VIGILANCE[r.vigilance_officielle] ?? "⚪"}</span>
                  <span className="font-semibold text-white">{r.numero}</span>
                  <span className="text-sm text-slate-400">
                    {r.chantiers?.nom || "Chantier"}
                  </span>
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
              <p className="mt-1 text-xs text-slate-400">{labelStatut(r)}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r.motif}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
