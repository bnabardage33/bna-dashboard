"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fetchMeteo } from "@/lib/meteo";
import { evaluerAlerteChantier, Materiau, Acces } from "@/lib/meteoAlerte";

// NB : la génération des rapports intempéries ne se fait plus ici.
// Elle tourne côté serveur, une fois par jour en fin de journée, via
// l'Edge Function supabase/functions/generer-rapports-intemperies
// (planifiée par cron_rapports_intemperies.sql). Ce composant se contente
// d'afficher le risque technique en temps réel quand quelqu'un ouvre l'appli.

type ChantierMeteo = {
  id: string;
  nom: string | null;
  adresse: string | null;
  materiau: Materiau;
  acces: Acces;
  niveau: "vert" | "jaune" | "orange" | "rouge" | "inconnu";
  motif: string;
  rafales: number | null;
  temp: number | null;
};

const COULEURS: Record<string, string> = {
  vert: "border-emerald-500/40 bg-emerald-500/10",
  jaune: "border-amber-500/40 bg-amber-500/10",
  orange: "border-orange-500/40 bg-orange-500/10",
  rouge: "border-red-500/40 bg-red-500/10",
  inconnu: "border-slate-600 bg-slate-800",
};

const EMOJIS: Record<string, string> = {
  vert: "🟢",
  jaune: "🟡",
  orange: "🟠",
  rouge: "🔴",
  inconnu: "⚪",
};

export default function ChantiersMeteoCards() {
  const [chantiers, setChantiers] = useState<ChantierMeteo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function charger() {
      setLoading(true);

      const { data, error } = await supabase
        .from("chantiers")
        .select("id, nom, adresse_chantier, materiau_structurel, moyen_acces, statut")
        .neq("statut", "termine");

      if (error || !data) {
        console.error(error);
        setLoading(false);
        return;
      }

      const resultats = await Promise.all(
        data.map(async (ch: any) => {
          const adresse = ch.adresse_chantier as string | null;
          if (!adresse) {
            return {
              id: ch.id,
              nom: ch.nom,
              adresse: null,
              materiau: ch.materiau_structurel,
              acces: ch.moyen_acces,
              niveau: "inconnu" as const,
              motif: "Pas d'adresse renseignée pour ce client.",
              rafales: null,
              temp: null,
            };
          }

          try {
            const jour = await fetchMeteo(adresse);
            const rafalesMax = Math.max(jour.matin.rafales, jour.apresMidi.rafales);
            const tempMax = Math.max(jour.matin.temp, jour.apresMidi.temp);
            const pluieCumul = jour.heures.reduce((s, h) => s + h.pluie, 0);

            const alerte = evaluerAlerteChantier(ch.materiau_structurel, ch.moyen_acces, {
              rafalesMax,
              tempMax,
              pluieCumul,
            });

            return {
              id: ch.id,
              nom: ch.nom,
              adresse,
              materiau: ch.materiau_structurel,
              acces: ch.moyen_acces,
              niveau: alerte.niveau,
              motif: alerte.motif,
              rafales: rafalesMax,
              temp: tempMax,
            };
          } catch {
            return {
              id: ch.id,
              nom: ch.nom,
              adresse,
              materiau: ch.materiau_structurel,
              acces: ch.moyen_acces,
              niveau: "inconnu" as const,
              motif: "Météo indisponible pour cette adresse.",
              rafales: null,
              temp: null,
            };
          }
        })
      );

      setChantiers(resultats);
      setLoading(false);
    }

    charger();
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">Chargement des chantiers…</p>;
  }

  if (chantiers.length === 0) {
    return <p className="text-sm text-slate-500">Aucun chantier actif pour l&apos;instant.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {chantiers.map((ch) => (
        <Link
          key={ch.id}
          href={`/terrain/chantier/${ch.id}`}
          className={`rounded-xl border p-4 ${COULEURS[ch.niveau]}`}
        >
          <div className="flex items-center justify-between">
            <p className="font-medium text-white">{ch.nom || "Chantier"}</p>
            <span>{EMOJIS[ch.niveau]}</span>
          </div>
          {ch.adresse && <p className="text-xs text-slate-400">{ch.adresse}</p>}
          <p className="mt-2 text-sm text-slate-300">{ch.motif}</p>
          {ch.rafales !== null && (
            <p className="mt-1 text-xs text-slate-500">
              Rafales {ch.rafales} km/h · {ch.temp}°C max
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
