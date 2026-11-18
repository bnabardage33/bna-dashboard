"use client";

import React, { useState, useEffect } from "react";
import {
  CloudSun,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Wind,
  Droplets,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { fetchMeteo, JourMeteo, maxConnu, sommeConnue } from "@/lib/meteo";
import { Materiau, Acces, LABELS_MATERIAU, LABELS_ACCES } from "@/lib/meteoAlerte";
import TableauPrecipitations, {
  texteDegre,
  texteKmh,
  texteMm,
} from "@/components/TableauPrecipitations";
import RapportsIntemperiesListe from "@/components/RapportsIntemperiesListe";

export interface BardageMeteoModuleProps {
  chantierId: string;
  adresseChantier: string | null;
  materiauStructurel: Materiau;
  moyenAcces: Acces;
  horaires: string | null;
}

export default function BardageMeteoModule({
  chantierId,
  adresseChantier,
  materiauStructurel,
  moyenAcces,
  horaires,
}: BardageMeteoModuleProps) {
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let actif = true;
    async function charger() {
      setLoading(true);
      try {
        const data = await fetchMeteo(
          adresseChantier || "Ajaccio",
          {
            materiau: materiauStructurel,
            acces: moyenAcces,
            horaires: horaires ?? undefined,
          }
        );
        if (actif) setMeteo(data);
      } catch (e) {
        console.error("Erreur météo bardage:", e);
      } finally {
        if (actif) setLoading(false);
      }
    }
    charger();
    return () => {
      actif = false;
    };
  }, [adresseChantier, materiauStructurel, moyenAcces, horaires]);

  return (
    <div className="space-y-6">
      {/* 1. Météo en direct & Décision de Pose */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27]">
              <CloudSun className="h-6 w-6" />
            </div>
            <div>
              <p className="text-3xs font-bold uppercase tracking-wider text-[#D96B27]">
                Relevé en Temps Réel & Sécurité Chantier
              </p>
              <h3 className="text-base sm:text-lg font-bold text-[#F5EFEA] tracking-tight">
                Météo Site · {adresseChantier || "Adresse non renseignée"}
              </h3>
              <p className="text-xs text-[#8E7F74]">
                Matériau : <strong>{LABELS_MATERIAU[materiauStructurel]}</strong> · Accès :{" "}
                <strong>{LABELS_ACCES[moyenAcces]}</strong>
              </p>
            </div>
          </div>

          {meteo && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide border ${
                meteo.alerte.niveau === "rouge"
                  ? "bg-red-500/15 text-red-900 border-red-200"
                  : meteo.alerte.niveau === "orange"
                  ? "bg-amber-500/15 text-amber-900 border-amber-200"
                  : meteo.alerte.niveau === "jaune"
                  ? "bg-yellow-50 text-yellow-900 border-yellow-200"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-200"
              }`}
            >
              {meteo.alerte.niveau === "rouge"
                ? "🔴 Alerte Rouge"
                : meteo.alerte.niveau === "orange"
                ? "🟠 Vigilance Orange"
                : meteo.alerte.niveau === "jaune"
                ? "🟡 Vigilance Jaune"
                : "🟢 Conditions Favorables"}
            </span>
          )}
        </div>

        {loading ? (
          <p className="py-6 text-center text-xs text-[#8E7F74]">
            Chargement des relevés météo en temps réel...
          </p>
        ) : meteo ? (
          <div className="space-y-4">
            {/* Alerte générale */}
            <div
              className={`rounded-xl border p-3.5 text-xs font-semibold ${
                meteo.alerte.niveau === "rouge"
                  ? "border-red-200 bg-red-500/15 text-red-900"
                  : meteo.alerte.niveau === "orange"
                  ? "border-amber-200 bg-amber-500/15 text-amber-900"
                  : meteo.alerte.niveau === "jaune"
                  ? "border-yellow-200 bg-yellow-50 text-yellow-900"
                  : "border-emerald-200 bg-emerald-500/15 text-emerald-900"
              }`}
            >
              {meteo.alerte.motif}
            </div>

            {/* Décision de Pose sur les horaires du chantier */}
            {meteo.pose && (
              <div
                className={`rounded-xl border p-4 text-xs ${
                  meteo.pose.statut === "non_determine"
                    ? "border-white/10 bg-[#120F0D] text-[#8E7F74]"
                    : meteo.pose.niveau === "rouge"
                    ? "border-red-200 bg-red-500/15 text-red-900"
                    : meteo.pose.niveau === "orange"
                    ? "border-amber-200 bg-amber-500/15 text-amber-900"
                    : meteo.pose.niveau === "jaune"
                    ? "border-yellow-200 bg-yellow-50 text-yellow-900"
                    : "border-emerald-200 bg-emerald-500/15 text-emerald-900"
                }`}
              >
                <p className="text-3xs uppercase font-bold tracking-wider text-[#8E7F74]">
                  Décision de pose sur les horaires du chantier
                </p>
                <p className="mt-1 font-bold">
                  {meteo.pose.statut === "non_determine"
                    ? "— Non déterminé · "
                    : meteo.pose.niveau === "rouge"
                    ? "🔴 Pose interdite · "
                    : meteo.pose.niveau === "orange"
                    ? "🟠 Pose déconseillée · "
                    : meteo.pose.niveau === "jaune"
                    ? "🟡 Pose sous surveillance · "
                    : "🟢 Pose possible · "}
                  {meteo.pose.motif}
                </p>
                {meteo.pose.horairesStatut === "non_configuree" && (
                  <p className="mt-1.5 text-3xs text-[#8E7F74]">
                    Renseignez vos horaires de travail dans le module « Photos & Notes » pour affiner cette décision.
                  </p>
                )}
              </div>
            )}

            {/* Avertissements Matériaux */}
            {meteo.pose && meteo.pose.avertissements.length > 0 && (
              <ul className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-500/15/50 p-3.5">
                {meteo.pose.avertissements.map((a) => (
                  <li key={a} className="text-xs text-amber-900 flex items-center gap-2">
                    <span className="shrink-0">⚠️</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* KPIs synthétiques */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/10 bg-[#120F0D] p-3 text-center">
                <p className="text-3xs uppercase font-semibold text-[#8E7F74]">Matin</p>
                <p className="text-lg font-bold text-[#F5EFEA]">{texteDegre(meteo.matin.temp)}</p>
                <p className="text-3xs text-[#8E7F74]">Rafales {texteKmh(meteo.matin.rafales)}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#120F0D] p-3 text-center">
                <p className="text-3xs uppercase font-semibold text-[#8E7F74]">Après-midi</p>
                <p className="text-lg font-bold text-[#F5EFEA]">{texteDegre(meteo.apresMidi.temp)}</p>
                <p className="text-3xs text-[#8E7F74]">Rafales {texteKmh(meteo.apresMidi.rafales)}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#120F0D] p-3 text-center">
                <p className="text-3xs uppercase font-semibold text-[#D96B27]">Rafales Max</p>
                <p className="text-lg font-bold text-[#D96B27]">
                  {texteKmh(maxConnu(meteo.matin.rafales, meteo.apresMidi.rafales))}
                </p>
                <p className="text-3xs text-[#8E7F74]">Sur la journée</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#120F0D] p-3 text-center">
                <p className="text-3xs uppercase font-semibold text-[#8E7F74]">Précipitations</p>
                <p className="text-lg font-bold text-[#F5EFEA]">
                  {texteMm(meteo.cumulPluie ?? sommeConnue(meteo.heures.map((h) => h.pluie)))}
                </p>
                <p className="text-3xs text-[#8E7F74]">Cumul journalier</p>
              </div>
            </div>

            {/* Tableau heure par heure */}
            <div className="pt-2">
              <TableauPrecipitations heures={meteo.heures} variante="clair" />
            </div>
          </div>
        ) : (
          <p className="py-4 text-xs text-amber-300">
            Impossible de charger les données météo pour cette adresse.
          </p>
        )}
      </div>

      {/* 2. Liste & Déclarations des Rapports d'Intempéries BTP */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
          <ShieldAlert className="h-5 w-5 text-[#D96B27]" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#F5EFEA]">
            Arrêts de Travail &amp; Déclarations Intempéries BTP du Chantier
          </h4>
        </div>
        <RapportsIntemperiesListe chantierId={chantierId} variante="clair" />
      </div>
    </div>
  );
}
