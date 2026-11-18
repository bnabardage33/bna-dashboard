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
  TrendingUp,
} from "lucide-react";

export type ModuleClotureKey =
  | "general"
  | "avancement"
  | "calepinage"
  | "heures"
  | "meteo"
  | "photos"
  | "rapport"
  | "documents";

export interface ClotureCardNavigationProps {
  onSelectionnerModule: (cle: ModuleClotureKey) => void;
  avancementPct?: number;
  phaseEnCours?: string;
  lineaireTotalM?: number;
  totalHeures?: number;
  devisCount?: number;
  photosCount?: number;
}

export default function ClotureCardNavigation({
  onSelectionnerModule,
  avancementPct = 0,
  phaseEnCours = "Implantation",
  lineaireTotalM = 0,
  totalHeures = 0,
  devisCount = 0,
  photosCount = 0,
}: ClotureCardNavigationProps) {
  const MODULES: {
    cle: ModuleClotureKey;
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
        "Coordonnées du chantier, dates clés, organisation terrain et évaluation intégrée des trajets.",
      icone: Building2,
      indicateur: {
        label: "Trajet & organisation",
        couleur: "cuivre",
      },
    },
    {
      cle: "avancement",
      titre: "Avancement & Tronçons",
      sousTitre: "4 phases métier Clôture",
      description:
        "Suivi chronologique : implantation & scellements, poteaux/soubassements, lames/panneaux et portillons.",
      icone: CheckCircle2,
      indicateur: {
        label: `${avancementPct}% validé · ${phaseEnCours}`,
        couleur: avancementPct >= 100 ? "vert" : "cuivre",
      },
    },
    {
      cle: "calepinage",
      titre: "Métrés & Calepinage Clôture",
      sousTitre: "Plan 2D, Vue 3D, redans & chiffrage",
      description:
        "Calcul 1 à 4 côtés, poteaux sans doublon, plaques de soubassement, portillons, redans et export quantitatif.",
      icone: SlidersHorizontal,
      indicateur: {
        label: lineaireTotalM > 0 ? `${lineaireTotalM.toFixed(1)} ml configurés` : "Calepinage 2D/3D",
        couleur: "cuivre",
      },
    },
    {
      cle: "heures",
      titre: "Heures & Pointages",
      sousTitre: "Main-d'œuvre & suivi des temps",
      description:
        "Saisie des heures passées par phase et comparaison avec le temps théorique calculé.",
      icone: Clock,
      indicateur: {
        label: totalHeures > 0 ? `${totalHeures.toFixed(1)} h pointées` : "Aucun pointage",
        couleur: totalHeures > 0 ? "vert" : "gris",
      },
    },
    {
      cle: "meteo",
      titre: "Météo & Intempéries",
      sousTitre: "Vent, pluie & arrêts de chantier",
      description:
        "Vigilance vent/pluie sur site et génération des rapports d'intempéries pour le dossier client.",
      icone: CloudSun,
      indicateur: {
        label: "Prévisions & vigilance",
        couleur: "bleu",
      },
    },
    {
      cle: "photos",
      titre: "Photos & Notes",
      sousTitre: "Journal de chantier horodaté",
      description:
        "Photos avant/pendant/après pose, notes techniques terrain et suivi des points singuliers.",
      icone: Camera,
      indicateur: {
        label: photosCount > 0 ? `${photosCount} média(s)` : "Photothèque chantier",
        couleur: photosCount > 0 ? "vert" : "gris",
      },
    },
    {
      cle: "rapport",
      titre: "Rapport Client",
      sousTitre: "Compte-rendu visuel automatisé",
      description:
        "Synthèse claire d'avancement destinée au maître d'ouvrage et partage via l'espace client.",
      icone: FileText,
      indicateur: {
        label: "Portail client actif",
        couleur: "bleu",
      },
    },
    {
      cle: "documents",
      titre: "Documents & Facturation",
      sousTitre: "Devis, situations & factures",
      description:
        "Accès direct aux devis, factures d'acompte/solde et pièces administratives rattachées au chantier.",
      icone: FileSpreadsheet,
      indicateur: {
        label: devisCount > 0 ? `${devisCount} document(s)` : "Devis & facturation",
        couleur: devisCount > 0 ? "vert" : "gris",
      },
    },
  ];

  const badgeCouleur = (c: "cuivre" | "vert" | "bleu" | "gris") => {
    switch (c) {
      case "cuivre":
        return "border-[#D96B27]/25 bg-[#D96B27]/10 text-[#D96B27]";
      case "vert":
        return "border-emerald-200 bg-emerald-500/15 text-emerald-300";
      case "bleu":
        return "border-sky-200 bg-sky-50 text-sky-700";
      default:
        return "border-white/10 bg-[#221B17] text-[#B8A99E]";
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {MODULES.map((m) => {
        const Icon = m.icone;
        return (
          <button
            key={m.cle}
            type="button"
            onClick={() => onSelectionnerModule(m.cle)}
            className="group text-left flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-1 hover:border-[#D96B27]/60 hover:shadow-[0_15px_35px_rgba(184,91,43,0.08)]"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27] transition-colors group-hover:bg-[#D96B27] group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-[#8E7F74] transition-transform group-hover:translate-x-1 group-hover:text-[#D96B27]" />
              </div>

              <h3 className="text-sm font-extrabold text-[#F5EFEA]">{m.titre}</h3>
              <p className="text-[11px] font-semibold text-[#D96B27] mt-0.5">
                {m.sousTitre}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[#B8A99E]">
                {m.description}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${badgeCouleur(m.indicateur.couleur)}`}
              >
                <TrendingUp className="h-3 w-3" />
                {m.indicateur.label}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
