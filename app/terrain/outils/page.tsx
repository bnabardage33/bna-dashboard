// app/terrain/outils/page.tsx
"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Mic, Sparkles, Wrench } from "lucide-react";

export default function OutilsPage() {
  const OUTILS = [
    {
      id: "notes",
      titre: "Notes Vocales du Patron",
      description:
        "Dictaphone intelligent avec transcription automatique Whisper et synthèse IA des comptes-rendus de chantier.",
      href: "/terrain/notes",
      icon: Mic,
      badge: "IA Whisper",
    },
    {
      id: "fiches-techniques",
      titre: "Fiches Techniques & DTU",
      description:
        "Bibliothèque de notices fabricants, règles professionnelles DTU, avis techniques CSTB et documents PDF.",
      href: "/terrain/fiche-technique",
      icon: BookOpen,
      badge: "DTU & Normes",
    },
    {
      id: "metre-ia",
      titre: "Métré IA & Vocal",
      description:
        "Chiffrage rapide à la voix ou au texte pour préparer vos métrés et devis directement depuis le terrain.",
      href: "/terrain/metre-ia",
      icon: Sparkles,
      badge: "Assistant IA",
    },
  ];

  return (
    <div className="min-h-screen bg-[#120F0D] pb-24 text-[#F5EFEA]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* En-tête blanc unifié */}
        <header className="rounded-2xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 shadow-xs">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#D96B27]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#D96B27]">
            <Wrench className="h-3.5 w-3.5" />
            BNA Pilotage BTP · Boîte à Outils Transverses
          </div>
          <h1 className="mt-2 text-xl font-bold text-[#F5EFEA] sm:text-2xl">
            Boîte à Outils Professionnelle
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#B8A99E]">
            Outils transverses de terrain : dictaphone IA Whisper, bibliothèque DTU / notices fabricants et métré vocal.
          </p>
        </header>

        {/* Grille des 3 Outils transverses */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OUTILS.map((outil) => {
            const Icon = outil.icon;
            return (
              <Link
                key={outil.id}
                href={outil.href}
                className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-[#1B1511] p-5 shadow-xs transition-all hover:border-[#D96B27]/50 hover:shadow-sm"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27] transition-transform group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-white/10 bg-[#120F0D] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#B8A99E]">
                      {outil.badge}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-base font-bold text-[#F5EFEA] group-hover:text-[#D96B27] transition-colors">
                      {outil.titre}
                    </h2>
                    <p className="mt-1.5 text-xs text-[#B8A99E] leading-relaxed">
                      {outil.description}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-1.5 text-xs font-bold text-[#D96B27] group-hover:translate-x-1 transition-transform">
                  <span>Accéder</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
