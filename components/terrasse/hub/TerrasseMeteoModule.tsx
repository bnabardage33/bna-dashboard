"use client";

import React, { useState, useEffect } from "react";
import {
  CloudSun,
  CloudRain,
  Snowflake,
  Wind,
  Thermometer,
  ShieldAlert,
  MapPin,
  CalendarDays,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import RapportsIntemperiesListe from "@/components/RapportsIntemperiesListe";
import { texteDegre, texteKmh, texteMm } from "@/components/TableauPrecipitations";

interface TerrasseMeteoModuleProps {
  chantierId: string;
  adresseChantier: string | null;
}

export default function TerrasseMeteoModule({
  chantierId,
  adresseChantier,
}: TerrasseMeteoModuleProps) {
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  // Extraire la ville de l'adresse du chantier
  const ville = React.useMemo(() => {
    if (!adresseChantier) return "Bordeaux";
    const parties = adresseChantier.split(",");
    const dernierePartie = parties[parties.length - 1].trim();
    const sansCodePostal = dernierePartie.replace(/^\d{5}\s*/, "").trim();
    return sansCodePostal || "Bordeaux";
  }, [adresseChantier]);

  useEffect(() => {
    async function chargerMeteo() {
      setLoading(true);
      setErreur(null);
      try {
        const data = await fetchMeteo(ville);
        setMeteo(data);
      } catch (err) {
        console.error("Erreur météo terrasse :", err);
        setErreur("Impossible de charger les prévisions météo locales.");
      } finally {
        setLoading(false);
      }
    }
    chargerMeteo();
  }, [ville]);

  // Analyse des vigilances spécifiques Terrasse (DTU 51.4)
  const tempActuelle = meteo?.tempActuelle ?? 15;
  const ventActuel = meteo?.apresMidi?.vent ?? meteo?.matin?.vent ?? 10;
  const pluiePrevue = (meteo?.cumulPluie ?? 0) > 0.5;
  const risqueGel = tempActuelle < 5;
  const risqueForteChaleur = tempActuelle > 33;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Conditions Météo du Site Terrasse */}
      <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#F0F0F0] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <CloudSun className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[2px] text-[#B85B2B]">
                Conditions Météo sur le Site
              </p>
              <h3 className="text-xl font-bold text-[#23272B]">
                {adresseChantier ? `Chantier à ${ville}` : "Météo Locale Terrasse"}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-[#F8F9FA] px-3.5 py-1.5 border border-[#E5E5E5]">
            <MapPin className="h-4 w-4 text-[#B85B2B]" />
            <span className="text-xs font-semibold text-[#23272B] truncate max-w-xs">
              {adresseChantier || "Adresse non configurée"}
            </span>
          </div>
        </div>

        {loading ? (
          <p className="py-6 text-center text-xs text-gray-400">Chargement des données météo...</p>
        ) : erreur ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {erreur}
          </div>
        ) : meteo ? (
          <div className="mt-5 space-y-5">
            {/* Cartouches Météo du jour */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-4 text-center">
                <Thermometer className="mx-auto h-5 w-5 text-amber-600 mb-1" />
                <p className="text-[11px] font-semibold text-[#777777]">Température</p>
                <p className="text-2xl font-bold text-[#23272B]">{texteDegre(tempActuelle)}</p>
              </div>

              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-4 text-center">
                <CloudRain className="mx-auto h-5 w-5 text-sky-600 mb-1" />
                <p className="text-[11px] font-semibold text-[#777777]">Précipitations</p>
                <p className="text-2xl font-bold text-[#23272B]">
                  {texteMm(meteo.cumulPluie ?? 0)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-4 text-center">
                <Wind className="mx-auto h-5 w-5 text-teal-600 mb-1" />
                <p className="text-[11px] font-semibold text-[#777777]">Vent max</p>
                <p className="text-2xl font-bold text-[#23272B]">{texteKmh(ventActuel)}</p>
              </div>

              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-4 text-center">
                <CloudSun className="mx-auto h-5 w-5 text-[#B85B2B] mb-1" />
                <p className="text-[11px] font-semibold text-[#777777]">Conditions</p>
                <p className="text-sm font-bold text-[#23272B] mt-1">{meteo.conditions}</p>
              </div>
            </div>

            {/* Vigilance Spécifique DTU 51.4 Terrasse */}
            <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="h-4 w-4 text-[#B85B2B]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
                  Vigilance Pose Terrasse & DTU 51.4
                </h4>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {/* Pluie */}
                <div
                  className={`rounded-xl border p-3 ${
                    pluiePrevue
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-emerald-200 bg-emerald-50/50 text-emerald-900"
                  }`}
                >
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    {pluiePrevue ? "⚠️ Pluie détectée" : "✓ Hygrométrie favorable"}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                    {pluiePrevue
                      ? "Humidité du bois > 18% : risque de retrait et gauchissement. Interdiction de scellement chimique."
                      : "Conditions optimales de vissage et fixation des lames."}
                  </p>
                </div>

                {/* Gel */}
                <div
                  className={`rounded-xl border p-3 ${
                    risqueGel
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-emerald-200 bg-emerald-50/50 text-emerald-900"
                  }`}
                >
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    {risqueGel ? "❄️ Température < 5°C" : "✓ Hors gel respecté"}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                    {risqueGel
                      ? "Fragilisation des clips composites et contrainte de pose sur plots réglables."
                      : "Température conforme aux spécifications des fabricants de clips et plots."}
                  </p>
                </div>

                {/* Chaleur / Dilatation */}
                <div
                  className={`rounded-xl border p-3 ${
                    risqueForteChaleur
                      ? "border-orange-200 bg-orange-50 text-orange-950"
                      : "border-emerald-200 bg-emerald-50/50 text-emerald-900"
                  }`}
                >
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    {risqueForteChaleur ? "☀️ Forte chaleur (>33°C)" : "✓ Dilatation normale"}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                    {risqueForteChaleur
                      ? "Dilatation maximale des lames composites. Prévoir impérativement 6 à 7 mm de jeu en bout de lame."
                      : "Jeux de dilatation standards (4 à 5 mm) applicables."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* 2. Rapports Officiels d'Intempéries BTP rattachés à ce chantier */}
      <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#777777]">
          Arrêts de Travail & Déclarations Intempéries BTP du Chantier
        </h4>
        <RapportsIntemperiesListe chantierId={chantierId} variante="clair" />
      </section>
    </div>
  );
}
