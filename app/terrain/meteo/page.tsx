"use client";

import { useEffect, useState } from "react";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import ChantiersMeteoCards from "@/components/ChantiersMeteoCards";
import ChantiersMeteoCards from "@/components/ChantiersMeteoCards";

const COULEURS = {
  vert: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  jaune: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  rouge: "border-red-500/40 bg-red-500/10 text-red-400",
} as const;

const EMOJIS = { vert: "🟢", jaune: "🟡", orange: "🟠", rouge: "🔴" } as const;

export default function MeteoPage() {
  const [ville, setVille] = useState("Bordeaux");
  const [recherche, setRecherche] = useState("Bordeaux");
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [detailOuvert, setDetailOuvert] = useState(false);

  useEffect(() => {
    async function charger() {
      setLoading(true);
      setErreur("");
      try {
        const data = await fetchMeteo(ville);
        setMeteo(data);
      } catch {
        setErreur("Impossible de récupérer la météo pour cette ville.");
      } finally {
        setLoading(false);
      }
    }
    charger();
  }, [ville]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (recherche.trim()) setVille(recherche.trim());
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une ville…"
          className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
        >
          Rechercher
        </button>
      </form>

      {loading && <p className="text-sm text-slate-400">Chargement de la météo…</p>}
      {erreur && <p className="text-sm text-red-400">{erreur}</p>}

      {meteo && !loading && (
        <>
          <div className={`rounded-xl border p-4 ${COULEURS[meteo.alerte.niveau]}`}>
            <p className="font-semibold">
              {EMOJIS[meteo.alerte.niveau]} {meteo.alerte.motif}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <BlocPeriode titre="Matin" data={meteo.matin} />
            <BlocPeriode titre="Après-midi" data={meteo.apresMidi} />
          </div>

          <button
            onClick={() => setDetailOuvert((v) => !v)}
            className="text-sm font-medium text-slate-400 hover:text-slate-200"
          >
            {detailOuvert ? "▲" : "▼"} Heure par heure
          </button>

          <div className="pt-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Chantiers actifs
        </h2>
        <ChantiersMeteoCards />
      </div>

      <div className="pt-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Chantiers actifs
        </h2>
        <ChantiersMeteoCards />
      </div>

      {detailOuvert && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {meteo.heures.map((h) => (
                <div
                  key={h.heure}
                  className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-center"
                >
                  <p className="text-xs text-slate-500">{h.heure}</p>
                  <p className="text-sm font-semibold text-white">{h.temp}°</p>
                  <p className="text-xs text-slate-400">
                    {h.vent}·{h.rafales} km/h
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BlocPeriode({
  titre,
  data,
}: {
  titre: string;
  data: { temp: number; vent: number; rafales: number };
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titre}</p>
      <p className="mt-1 text-3xl font-bold text-white">{data.temp}°C</p>
      <p className="mt-1 text-xs text-slate-400">
        Vent {data.vent} km/h · Rafales {data.rafales} km/h
      </p>
    </div>
  );
}
