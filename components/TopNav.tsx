// components/TopNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, ShieldCheck } from "lucide-react";

export default function TopNav() {
  const pathname = usePathname();

  if (pathname?.startsWith('/espace-client') || pathname?.startsWith('/demo-client')) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-700 bg-slate-900/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
        {/* Logo et Nom de marque */}
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-90">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 border border-slate-700 p-1 shadow-sm">
            <img
              src="/logo-bna.png"
              alt="BNA Bardage Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-slate-100 leading-tight">
              BNA BARDAGE
            </span>
            <span className="text-xs font-semibold text-sky-400 tracking-wide">
              Gestion Chantier
            </span>
          </div>
        </Link>

        {/* Actions rapides droite (Paramètres & Badge actif) */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/30 px-3 py-1 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>DTU 41.2 / 31.2</span>
          </div>

          <Link
            href="/parametres"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 transition-colors hover:border-sky-500 hover:text-sky-400"
            title="Paramètres & Configuration"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
