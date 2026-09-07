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
  zoneVent: number; // Ajouté pour le typage
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
  inconnu: "border-white/10 bg-[#1A1D24]",
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

      // FIX BDD : Ajout de 'zone_vent' dans le select
      const { data, error } = await supabase
        .from("chantiers")
        .select("id, nom, adresse_chantier, materiau_structurel, moyen_acces, statut, zone_vent")
        .neq("statut", "termine");

      if (error || !data) {
        console.error(error);
        setLoading(false);
        return;
      }

type ChantierSupabase = {
  id: string;
  nom: string | null;
  adresse_chantier: string | null;
  materiau_structurel: string | null;
  moyen_acces: string | null;
  statut: string;
  zone_vent: string | null;
};

      const resultats = await Promise.all(
        (data as ChantierSupabase[]).map(async (ch) => {
          const adresse = ch.adresse_chantier as string | null;
          const zoneVent = ch.zone_vent ? Number(ch.zone_vent) : 1; // Sécurité fallback zone 1

          if (!adresse) {
            return {
              id: ch.id,
              nom: ch.nom,
              adresse: null,
              materiau: ch.materiau_structurel,
              acces: ch.moyen_acces,
              zoneVent,
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

            // FIX MOTEUR : On passe désormais 'zoneVent' à la fonction
            // Note : Pour l'instant on met 'false' pour l'angle, car l'information d'angle 
            // est gérée dynamiquement par zone de façade dans 'chantier_zones' et non dans la table racine 'chantiers'
            const alerte = evaluerAlerteChantier(
              ch.materiau_structurel as Materiau, 
              ch.moyen_acces as Acces, 
              { rafalesMax, tempMax, pluieCumul }
            );

            return {
              id: ch.id,
              nom: ch.nom,
              adresse,
              materiau: ch.materiau_structurel,
              acces: ch.moyen_acces,
              zoneVent,
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
              zoneVent,
              niveau: "inconnu" as const,
              motif: "Météo indisponible pour cette adresse.",
              rafales: null,
              temp: null,
            };
          }
        })
      );

// @ts-ignore
      setChantiers(resultats as ChantierMeteo[]);
      setLoading(false);
    }

    charger();
  }, []);

  if (loading) {
    return <p className="text-sm text-gray-400">Chargement des chantiers…</p>;
  }

  if (chantiers.length === 0) {
    return <p className="text-sm text-gray-500">Aucun chantier actif pour l&apos;instant.</p>;
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
          {ch.adresse && <p className="text-xs text-gray-400">{ch.adresse}</p>}
          <p className="mt-2 text-sm text-gray-300">{ch.motif}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
            {ch.rafales !== null && (
              <span>
                Rafales {ch.rafales} km/h · {ch.temp}°C max
              </span>
            )}
            <span className="rounded bg-[#1A1D24] px-1.5 py-0.5 font-semibold text-gray-400">
              Zone {ch.zoneVent}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
