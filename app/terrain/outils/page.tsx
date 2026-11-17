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
    <div className="min-h-screen bg-[#F3F3F1] pb-24 text-[#23272B]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* En-tête blanc unifié */}
        <header className="rounded-2xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-xs">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#B85B2B]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#B85B2B]">
            <Wrench className="h-3.5 w-3.5" />
            BNA Pilotage BTP · Boîte à Outils Transverses
          </div>
          <h1 className="mt-2 text-xl font-bold text-[#23272B] sm:text-2xl">
            Boîte à Outils Professionnelle
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#666666]">
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
                className="group flex flex-col justify-between rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-xs transition-all hover:border-[#B85B2B]/50 hover:shadow-sm"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B] transition-transform group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full border border-[#E5E5E5] bg-[#F8F9FA] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#666666]">
                      {outil.badge}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-base font-bold text-[#23272B] group-hover:text-[#B85B2B] transition-colors">
                      {outil.titre}
                    </h2>
                    <p className="mt-1.5 text-xs text-[#666666] leading-relaxed">
                      {outil.description}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-1.5 text-xs font-bold text-[#B85B2B] group-hover:translate-x-1 transition-transform">
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
