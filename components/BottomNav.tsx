// components/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HardHat, Building2, ShoppingCart, Wrench, TrendingUp } from "lucide-react";

const COULEURS = {
  orange: { bg: "bg-orange-500/15", text: "text-orange-400", shadow: "shadow-orange-500/20" },
  sky: { bg: "bg-sky-500/15", text: "text-sky-400", shadow: "shadow-sky-500/20" },
  pink: { bg: "bg-pink-500/15", text: "text-pink-400", shadow: "shadow-pink-500/20" },
  amber: { bg: "bg-amber-500/15", text: "text-amber-400", shadow: "shadow-amber-500/20" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-400", shadow: "shadow-emerald-500/20" },
} as const;

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname?.startsWith('/espace-client') || pathname?.startsWith('/demo-client')) {
    return null;
  }

  const NAV_ITEMS = [
    {
      id: "chantiers",
      label: "Chantiers",
      href: "/terrain/chantier",
      icon: HardHat,
      couleur: "orange" as const,
      isActive: (path: string) =>
        path === "/" ||
        path.startsWith("/terrain/chantier") ||
        (path.startsWith("/terrain") &&
          !path.startsWith("/terrain/outils") &&
          !path.startsWith("/terrain/meteo") &&
          !path.startsWith("/terrain/notes") &&
          !path.startsWith("/terrain/fiche-technique")),
    },
    {
      id: "bureau",
      label: "Bureau",
      href: "/bureau",
      icon: Building2,
      couleur: "sky" as const,
      isActive: (path: string) =>
        path.startsWith("/bureau") && !path.startsWith("/bureau/fournisseurs"),
    },
    {
      id: "achats",
      label: "Achats",
      href: "/bureau/fournisseurs",
      icon: ShoppingCart,
      couleur: "pink" as const,
      isActive: (path: string) => path.startsWith("/bureau/fournisseurs"),
    },
    {
      id: "outils",
      label: "Outils",
      href: "/terrain/outils",
      icon: Wrench,
      couleur: "amber" as const,
      isActive: (path: string) =>
        path.startsWith("/terrain/outils") ||
        path.startsWith("/terrain/meteo") ||
        path.startsWith("/terrain/notes") ||
        path.startsWith("/terrain/fiche-technique") ||
        path.startsWith("/rapports-intemperies") ||
        path.startsWith("/bureau/rapports-intemperies"),
    },
    {
      id: "finance",
      label: "Finance",
      href: "/finance",
      icon: TrendingUp,
      couleur: "emerald" as const,
      isActive: (path: string) => path.startsWith("/finance"),
    },
  ];

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-700 bg-slate-800/95 backdrop-blur-lg shadow-2xl safe-area-inset-bottom"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;
          const c = COULEURS[item.couleur];

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`group flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-all ${
                active
                  ? `${c.text} font-bold`
                  : "text-slate-400 hover:text-slate-200 font-medium"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                  active
                    ? `${c.bg} ${c.text} scale-105 shadow-sm ${c.shadow}`
                    : "text-slate-400 group-hover:bg-slate-700/50 group-hover:text-slate-200"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
              </div>
              <span className="text-[11px] tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
