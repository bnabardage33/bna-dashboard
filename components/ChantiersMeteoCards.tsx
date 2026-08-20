"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fetchMeteo } from "@/lib/meteo";
import {
  evaluerAlerteChantier,
  evaluerJourChantier,
  Materiau,
  Acces,
} from "@/lib/meteoAlerte";
import { fetchVigilance } from "@/lib/meteoVigilance";
import { adresseVersDepartement } from "@/lib/departement";

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

// Génère le prochain numéro de rapport intempéries (RI-2026-001, ...).
async function prochainNumeroRapport(): Promise<string> {
  const annee = new Date().getFullYear();
  const { data, error } = await supabase
    .from("rapports_intemperies")
    .select("numero")
    .ilike("numero", `RI-${annee}-%`);

  if (error) {
    console.error(error);
    return `RI-${annee}-001`;
  }

  const nums = (data ?? []).map((d) => parseInt(d.numero.split("-")[2]) || 0);
  const suivant = (nums.length ? Math.max(...nums) : 0) + 1;
  return `RI-${annee}-${String(suivant).padStart(3, "0")}`;
}

// Vérifie si un rapport auto existe déjà aujourd'hui pour ce chantier,
// et l'insère sinon. Ne bloque jamais l'affichage de la carte en cas d'échec.
async function genererRapportSiNecessaire(
  chantierId: string,
  decision: ReturnType<typeof evaluerJourChantier> extends infer T ? T : never,
  meteoJour: { rafalesMax: number; tempMax: number; pluieCumul: number },
  materiau: Materiau,
  acces: Acces,
  departement: string | null,
  heures: { heure: string; temp: number; vent: number; rafales: number; pluie: number }[]
) {
  const doitGenerer = decision.jourArrete || decision.aValider;
  if (!doitGenerer) return;

  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);

  const { data: existant, error: errCheck } = await supabase
    .from("rapports_intemperies")
    .select("id")
    .eq("chantier_id", chantierId)
    .eq("cree_par", "auto")
    .gte("cree_le", debutJour.toISOString())
    .maybeSingle();

  if (errCheck) {
    console.error(errCheck);
    return;
  }
  if (existant) return; // déjà généré aujourd'hui

  const numero = await prochainNumeroRapport();

  const { error: errInsert } = await supabase
    .from("rapports_intemperies")
    .insert({
      numero,
      chantier_id: chantierId,
      vigilance_officielle: decision.vigilanceOfficielle,
      jour_arrete: decision.jourArrete,
      a_valider: decision.aValider,
      pluie_continue: decision.pluieContinue,
      motif: decision.motif,
      risque_technique_niveau: decision.risqueTechnique.niveau,
      risque_technique_motif: decision.risqueTechnique.motif,
      temp_max: meteoJour.tempMax,
      rafales_max: meteoJour.rafalesMax,
      pluie_cumul: meteoJour.pluieCumul,
      materiau,
      acces,
      departement,
      releve_horaire: heures,
      cree_par: "auto",
    });

  if (errInsert) {
    console.error(errInsert);
  }
}

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

            // Risque technique maison — affiché sur la carte, comme avant.
            const alerte = evaluerAlerteChantier(ch.materiau_structurel, ch.moyen_acces, {
              rafalesMax,
              tempMax,
              pluieCumul,
            });

            // Vigilance officielle + décision jour d'arrêt — pour le rapport.
            const departement = adresseVersDepartement(adresse);
            if (departement) {
              try {
                const vigilance = await fetchVigilance(departement);
                const decision = evaluerJourChantier(
                  ch.materiau_structurel,
                  ch.moyen_acces,
                  { rafalesMax, tempMax, pluieCumul },
                  jour.heures,
                  vigilance
                );

                await genererRapportSiNecessaire(
                  ch.id,
                  decision,
                  { rafalesMax, tempMax, pluieCumul },
                  ch.materiau_structurel,
                  ch.moyen_acces,
                  departement,
                  jour.heures
                );
              } catch (errVigilance) {
                // La vigilance officielle est indisponible (clé API pas
                // encore configurée, panne, etc.) : on n'empêche pas
                // l'affichage de la carte, on génère juste pas de rapport.
                console.error("Vigilance météo indisponible:", errVigilance);
              }
            }

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
