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
} from "lucide-react";

export type ModuleBardageKey =
  | "general"
  | "avancement"
  | "calepinage"
  | "heures"
  | "meteo"
  | "photos"
  | "rapport"
  | "documents";

export interface BardageCardNavigationProps {
  onSelectionnerModule: (cle: ModuleBardageKey) => void;
  // Métadonnées d'indicateurs dynamiques
  avancementPct?: number;
  phaseEnCours?: string;
  surfaceM2?: number;
  totalHeures?: number;
  distanceKm?: number;
  devisCount?: number;
  photosCount?: number;
}

export default function BardageCardNavigation({
  onSelectionnerModule,
  avancementPct = 0,
  phaseEnCours = "En cours",
  surfaceM2 = 0,
  totalHeures = 0,
  distanceKm = 0,
  devisCount = 0,
  photosCount = 0,
}: BardageCardNavigationProps) {
  const MODULES: {
    cle: ModuleBardageKey;
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
        "Coordonnées du chantier, dates clés, sécurité PPSPS IA, moyen d'accès en hauteur et évaluation des trajets.",
      icone: Building2,
      indicateur: {
        label: distanceKm > 0 ? `${distanceKm} km A/R évalués` : "Trajet & organisation",
        couleur: "cuivre",
      },
    },
    {
      cle: "avancement",
      titre: "Avancement & Façades",
      sousTitre: "Suivi par façade Nord, Sud, Est, Ouest",
      description:
        "Avancement chronologique des couches (ossature, isolation, bardage, finitions) et dictée vocale IA.",
      icone: CheckCircle2,
      indicateur: {
        label: `${avancementPct}% validé · ${phaseEnCours}`,
        couleur: avancementPct >= 100 ? "vert" : "cuivre",
      },
    },
    {
      cle: "calepinage",
      titre: "Métrés & Calepinage Bardage",
      sousTitre: "Conception 2D/3D & quantitatif",
      description:
        "Configuration technique, métré des zones, pignons, ouvertures, calepinage lames/plaques, 3D et quincaillerie.",
      icone: SlidersHorizontal,
      indicateur: {
        label: `${surfaceM2.toFixed(1)} m² nets`,
        couleur: "cuivre",
      },
    },
    {
      cle: "heures",
      titre: "Heures & Pointages",
      sousTitre: "Pointages compagnons & rentabilité",
      description:
        "Suivi des heures d'intervention, temps de calepinage budget vs consommés et tableau de rentabilité.",
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
        "Relevés en temps réel, rafales vent, décision horaire de pose et déclarations légales d'intempéries BTP.",
      icone: CloudSun,
      indicateur: {
        label: "Seuils vent & gel façade",
        couleur: "gris",
      },
    },
    {
      cle: "photos",
      titre: "Photos & Notes",
      sousTitre: "Journal visuel avant / après",
      description:
        "Prises de vues terrain étiquetées avant/pendant/après, notes de chantier et horaires réels de pose.",
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
        "Synthèse d'activité et avancement transmise au maître d'ouvrage avec résumé automatique IA.",
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
        "Devis clients (signature SMS), factures, PV de réception fin de chantier, retenue de garantie 5% et commandes fournisseurs.",
      icone: FileSpreadsheet,
      indicateur: {
        label: `${devisCount} devis rattaché${devisCount > 1 ? "s" : ""}`,
        couleur: "cuivre",
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* En-tête de section des cartes */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#23272B] tracking-tight">
            Modules d&apos;Exploitation Chantier Bardage
          </h2>
          <p className="text-xs text-[#777777]">
            Sélectionnez une carte pour accéder aux outils opérationnels du chantier.
          </p>
        </div>
      </div>

      {/* Grille responsive des 8 modules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MODULES.map((m) => {
          const Icone = m.icone;
          return (
            <button
              key={m.cle}
              type="button"
              onClick={() => onSelectionnerModule(m.cle)}
              className="group relative flex flex-col justify-between text-left rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_14px_35px_rgba(184,91,43,0.08)] hover:border-[#B85B2B]/40 transition-all duration-200 cursor-pointer overflow-hidden"
            >
              {/* Effet visuel au survol */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#B85B2B]/5 to-transparent rounded-bl-full pointer-events-none group-hover:from-[#B85B2B]/10 transition-all" />

              <div>
                {/* Icône + Badge indicateur */}
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B] group-hover:scale-105 group-hover:bg-[#B85B2B]/15 transition-all">
                    <Icone className="h-6 w-6" strokeWidth={2.2} />
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-3xs font-bold tracking-wide border ${
                      m.indicateur.couleur === "cuivre"
                        ? "bg-[#B85B2B]/10 text-[#B85B2B] border-[#B85B2B]/20"
                        : m.indicateur.couleur === "vert"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : m.indicateur.couleur === "bleu"
                        ? "bg-sky-50 text-sky-800 border-sky-200"
                        : "bg-[#F3F3F1] text-[#777777] border-[#E5E5E5]"
                    }`}
                  >
                    {m.indicateur.label}
                  </span>
                </div>

                {/* Titre & Sous-titre */}
                <h3 className="text-sm font-bold text-[#23272B] group-hover:text-[#B85B2B] transition-colors leading-snug">
                  {m.titre}
                </h3>
                <p className="mt-0.5 text-xs font-semibold text-[#B85B2B]/80">
                  {m.sousTitre}
                </p>

                {/* Description */}
                <p className="mt-2 text-xs text-[#777777] line-clamp-3 leading-relaxed">
                  {m.description}
                </p>
              </div>

              {/* Pied de carte : Action d'ouverture */}
              <div className="mt-5 pt-3 border-t border-[#F0F0F0] flex items-center justify-between text-xs font-bold text-[#777777] group-hover:text-[#B85B2B] transition-colors">
                <span className="text-3xs uppercase tracking-wider">Ouvrir le module</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#F8F9FA] group-hover:bg-[#B85B2B] group-hover:text-white transition-all">
                  <ArrowRight size={13} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
