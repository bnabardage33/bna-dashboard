"use client";

import React from "react";
import {
  Building2,
  CheckCircle2,
  SlidersHorizontal,
  Clock,
  CloudSun,
  Camera,
  FileText,
  FileSpreadsheet,
  ArrowRight,
  MapPin,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export type ModuleTerrasseKey =
  | "general"
  | "avancement"
  | "calepinage"
  | "heures"
  | "meteo"
  | "photos"
  | "rapport"
  | "documents";

export interface TerrasseCardNavigationProps {
  onSelectionnerModule: (cle: ModuleTerrasseKey) => void;
  // Métadonnées d'indicateurs dynamiques
  avancementPct?: number;
  phaseEnCours?: string;
  surfaceM2?: number;
  totalHeures?: number;
  distanceKm?: number;
  devisCount?: number;
  photosCount?: number;
}

export default function TerrasseCardNavigation({
  onSelectionnerModule,
  avancementPct = 0,
  phaseEnCours = "Support & Implantation",
  surfaceM2 = 24.0,
  totalHeures = 0,
  distanceKm = 0,
  devisCount = 0,
  photosCount = 0,
}: TerrasseCardNavigationProps) {
  const MODULES: {
    cle: ModuleTerrasseKey;
    titre: string;
    sousTitre: string;
    description: string;
    icone: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    indicateur: { label: string; couleur: "cuivre" | "vert" | "bleu" | "gris" };
  }[] = [
    {
      cle: "general",
      titre: "Général & Déplacements",
      sousTitre: "Identité, accès & frais kilométriques",
      description:
        "Coordonnées du chantier, dates clés, organisation terrain et évaluation intégrée des trajets et frais de déplacement.",
      icone: Building2,
      indicateur: {
        label: distanceKm > 0 ? `${distanceKm} km A/R évalués` : "Trajet & organisation",
        couleur: "cuivre",
      },
    },
    {
      cle: "avancement",
      titre: "Avancement & 6 Phases",
      sousTitre: "Suivi normatif DTU 51.4",
      description:
        "Contrôle chronologique : support, nivellement, plots, lambourdage, platelage et finitions avec jauge globale.",
      icone: CheckCircle2,
      indicateur: {
        label: `${avancementPct}% validé · ${phaseEnCours}`,
        couleur: avancementPct >= 100 ? "vert" : "cuivre",
      },
    },
    {
      cle: "calepinage",
      titre: "Calepinage Terrasse Pro",
      sousTitre: "Conception 2D/3D & quantitatif",
      description:
        "Plan 2D interactif, rendu 3D, calcul précis des lames, lambourdes, plots, réservations (trappes/arbres) et validation DTU.",
      icone: SlidersHorizontal,
      indicateur: {
        label: `${surfaceM2.toFixed(1)} m² calculés`,
        couleur: "cuivre",
      },
    },
    {
      cle: "heures",
      titre: "Heures & Temps",
      sousTitre: "Pointages par phase terrasse",
      description:
        "Suivi des heures d'intervention compagnons réparties entre terrassement, structure lambourdes, platelage et finitions.",
      icone: Clock,
      indicateur: {
        label: `${totalHeures.toFixed(1)} h pointées`,
        couleur: "bleu",
      },
    },
    {
      cle: "meteo",
      titre: "Météo & Intempéries",
      sousTitre: "Vigilance site & arrêts BTP",
      description:
        "Surveillance pluie et gel critique (<5°C) selon les exigences DTU 51.4 et déclarations légales d'arrêts de travail BTP.",
      icone: CloudSun,
      indicateur: {
        label: "Seuils pluie & gel DTU",
        couleur: "gris",
      },
    },
    {
      cle: "photos",
      titre: "Photos & Notes",
      sousTitre: "Journal visuel avant / après",
      description:
        "Prises de vues terrain étiquetées par phase (#Support, #Structure, #Lames, #Rives) et consignes d'intervention horodatées.",
      icone: Camera,
      indicateur: {
        label: `${photosCount} photo${photosCount > 1 ? "s" : ""}`,
        couleur: "gris",
      },
    },
    {
      cle: "rapport",
      titre: "Rapport Client",
      sousTitre: "Compte-rendu d'intervention",
      description:
        "Synthèse d'activité et avancement transmise au maître d'ouvrage avec résumé automatique IA adapté au vocabulaire terrasse.",
      icone: FileText,
      indicateur: {
        label: "Rapport automatisé",
        couleur: "cuivre",
      },
    },
    {
      cle: "documents",
      titre: "Documents & Facturation",
      sousTitre: "Devis, situations & garanties",
      description:
        "Création de devis depuis le quantitatif calepinage, suivi des factures d'acomptes, situations et retenue de garantie (5%).",
      icone: FileSpreadsheet,
      indicateur: {
        label: `${devisCount} document${devisCount > 1 ? "s" : ""}`,
        couleur: "bleu",
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[2px] text-[#D96B27]">
            Navigation Intérieure
          </p>
          <h2 className="text-lg font-bold text-[#F5EFEA] sm:text-xl">
            Modules du Chantier Terrasse
          </h2>
        </div>
        <span className="text-xs font-medium text-[#8E7F74]">
          Sélectionnez une carte pour ouvrir son espace
        </span>
      </div>

      <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MODULES.map((m) => {
          const Icone = m.icone;
          return (
            <button
              key={m.cle}
              type="button"
              onClick={() => onSelectionnerModule(m.cle)}
              className="group relative flex flex-col text-left rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-1 hover:border-[#D96B27]/60 hover:shadow-[0_15px_35px_rgba(184,91,43,0.08)] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]"
            >
              {/* En-tête de carte */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27] transition-colors group-hover:bg-[#D96B27] group-hover:text-white">
                  <Icone className="h-5 w-5" strokeWidth={1.9} />
                </span>

                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    m.indicateur.couleur === "vert"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-200"
                      : m.indicateur.couleur === "bleu"
                      ? "bg-sky-50 text-sky-800 border border-sky-200"
                      : m.indicateur.couleur === "cuivre"
                      ? "bg-[#D96B27]/10 text-[#D96B27] border border-[#D96B27]/20"
                      : "bg-[#120F0D] text-[#8E7F74] border border-white/10"
                  }`}
                >
                  {m.indicateur.label}
                </span>
              </div>

              {/* Contenu */}
              <h3 className="text-base font-bold text-[#F5EFEA] transition-colors group-hover:text-[#D96B27]">
                {m.titre}
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-[#D96B27]">
                {m.sousTitre}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#8E7F74] line-clamp-3">
                {m.description}
              </p>

              {/* Action / Flèche */}
              <div className="mt-auto pt-4 flex items-center justify-between border-t border-white/10 text-xs font-bold text-[#8E7F74] transition-colors group-hover:text-[#D96B27]">
                <span>Accéder au module</span>
                <ArrowRight className="h-4 w-4 text-[#D96B27] transition-transform duration-200 group-hover:translate-x-1" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
