"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Grid3X3, HardHat, Home, Sparkles } from "lucide-react";
import BnaCopilotMiniPanel from "@/components/BnaCopilotMiniPanel";

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  if (pathname?.startsWith("/espace-client") || pathname === "/login") {
    return null;
  }

  const estAccueil = pathname === "/" || pathname === "/terrain/accueil";
  const estChantiers =
    pathname === "/terrain/chantier" ||
    pathname?.startsWith("/terrain/chantier/") ||
    pathname?.startsWith("/terrain/terrasse") ||
    pathname?.startsWith("/terrain/cloture");
  const estCalepinage = pathname?.startsWith("/calepinage");

  return (
    <>
      <nav
        aria-label="Raccourcis mobiles"
        className="fixed bottom-0 inset-x-0 z-[90] md:hidden border-t border-white/10 bg-[#161311]/95 backdrop-blur-md px-2 py-1.5 print:hidden"
      >
        <div className="mx-auto flex max-w-md items-center justify-around">
          <Link
            href="/"
            className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition-colors ${
              estAccueil ? "text-[#D96B27]" : "text-gray-400 hover:text-white"
            }`}
          >
            <Home className="h-4 w-4" />
            <span>Accueil</span>
          </Link>

          <Link
            href="/terrain/chantier"
            className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition-colors ${
              estChantiers ? "text-[#D96B27]" : "text-gray-400 hover:text-white"
            }`}
          >
            <HardHat className="h-4 w-4" />
            <span>Chantiers</span>
          </Link>

          <Link
            href="/calepinage"
            className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition-colors ${
              estCalepinage ? "text-[#D96B27]" : "text-gray-400 hover:text-white"
            }`}
          >
            <Grid3X3 className="h-4 w-4" />
            <span>Calepinage</span>
          </Link>

          <button
            type="button"
            onClick={() => setAiDrawerOpen(true)}
            className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-bold text-[#F59E0B] hover:bg-[#D96B27]/15 transition-colors"
            aria-label="Ouvrir BNA AI"
          >
            <Sparkles className="h-4 w-4 text-[#D96B27]" />
            <span>BNA AI</span>
          </button>
        </div>
      </nav>

      {/* Tiroir glissant depuis le bas : Copilote BNA AI */}
      {aiDrawerOpen && (
        <div
          className="fixed inset-0 z-[220] md:hidden flex items-end bg-black/80 backdrop-blur-sm"
          onClick={() => setAiDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[88vh] rounded-t-3xl overflow-hidden shadow-2xl"
          >
            <BnaCopilotMiniPanel
              onClose={() => setAiDrawerOpen(false)}
              className="rounded-b-none border-b-0"
            />
          </div>
        </div>
      )}
    </>
  );
}
