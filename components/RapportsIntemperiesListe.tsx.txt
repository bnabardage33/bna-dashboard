"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    async function charger() {
      setLoading(true);
      const { data, error } = await supabase
        .from("rapports_intemperies")
        .select("id, numero, vigilance_officielle, jour_arrete, a_valider, ampleur_impact, motif, cree_le, cree_par")
        .eq("chantier_id", chantierId)
        .order("cree_le", { ascending: false });

      if (!error && data) setRapports(data as RapportResume[]);
      setLoading(false);
    }
    charger();
  }, [chantierId]);

  if (loading) {
    return <p className="text-sm text-slate-400">Chargement des rapports…</p>;
  }

  if (rapports.length === 0) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-500">
        Aucun rapport intempéries pour ce chantier pour l&apos;instant. Les rapports se génèrent
        automatiquement en cas de vigilance ou de conditions dégradées constatées.
      </div>
    );
  }

  const aValiderCount = rapports.filter((r) => r.a_valider).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Rapports intempéries ({rapports.length})
        </p>
        {aValiderCount > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-400">
            {aValiderCount} à valider
          </span>
        )}
      </div>

      <div className="space-y-2">
        {rapports.map((r) => (
          <Link
            key={r.id}
            href={`/rapports-intemperies/${r.id}`}
            className={`block rounded-lg border bg-slate-900/50 p-3 ${COULEUR_BORDURE[r.vigilance_officielle] ?? "border-slate-700"}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{EMOJI_VIGILANCE[r.vigilance_officielle] ?? "⚪"}</span>
                <span className="font-medium text-white">{r.numero}</span>
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
    </div>
  );
}
