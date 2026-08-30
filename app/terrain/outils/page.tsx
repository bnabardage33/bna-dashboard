// app/terrain/outils/page.tsx
"use client";

import Link from "next/link";
import { CloudSun, Mic, BookOpen, AlertTriangle, ArrowRight } from "lucide-react";

export default function OutilsPage() {
  const OUTILS = [
    {
      id: "meteo",
      titre: "Météo & Vigilance Chantier",
      description:
        "Vigilance officielle Météo-France DPVigilance, vitesse du vent, rafales max, pluie horaire et alertes sécurité travail en hauteur.",
      href: "/terrain/meteo",
      icon: CloudSun,
      couleur: "border-red-600/40 bg-sky-950/20 text-gray-300",
      badge: "Météo-France",
    },
    {
      id: "notes",
      titre: "Notes Vocales du Patron",
      description:
        "Dictaphone intelligent avec transcription automatique Whisper et synthèse IA des comptes-rendus de chantier.",
      href: "/terrain/notes",
      icon: Mic,
      couleur: "border-white/10 bg-white/5 text-gray-400",
      badge: "IA Whisper",
    },
    {
      id: "fiches-techniques",
      titre: "Fiches Techniques & DTU",
      description:
        "Guides de pose certifiés, règles professionnelles DTU 41.2 / DTU 31.2, avis techniques CSTB et notices d'entretien des fabricants.",
      href: "/terrain/fiche-technique",
      icon: BookOpen,
      couleur: "border-white/10 bg-white/5 text-gray-400",
      badge: "DTU & Normes",
    },
    {
      id: "rapports-intemperies",
      titre: "Rapports d'Intempéries",
      description:
        "Génération des procès-verbaux d'arrêt intempéries avec justificatifs Météo-France officiels et décompte des jours d'arrêt.",
      href: "/bureau/rapports-intemperies",
      icon: AlertTriangle,
      couleur: "border-white/10 bg-white/5 text-gray-400",
      badge: "Arrêts Justifiés",
    },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête de la section */}
      <div>
        <h1 className="text-xl font-bold text-white">Boîte à Outils Professionnelle</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Outils d&apos;aide à la décision, météo réglementaire, notes vocales et documentation technique BTP.
        </p>
      </div>

      {/* Grille des 4 Outils */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {OUTILS.map((outil) => {
          const Icon = outil.icon;
          return (
            <Link
              key={outil.id}
              href={outil.href}
              className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-[#1A1D24] p-5 shadow-lg transition-all hover:border-red-600 hover:bg-[#1A1D24] hover:shadow-red-600/10"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl border p-2.5 shadow-inner transition-transform group-hover:scale-105 ${outil.couleur}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full border border-white/10 bg-transparent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-300">
                    {outil.badge}
                  </span>
                </div>

                <div>
                  <h2 className="text-base font-bold text-white group-hover:text-gray-300 transition-colors">
                    {outil.titre}
                  </h2>
                  <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                    {outil.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-1.5 text-xs font-semibold text-gray-300 group-hover:translate-x-1 transition-transform">
                <span>Accéder</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
