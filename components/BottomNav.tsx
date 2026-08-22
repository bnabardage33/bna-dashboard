// components/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HardHat, Building2, ShoppingCart, Wrench, TrendingUp } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  const NAV_ITEMS = [
    {
      id: "chantiers",
      label: "Chantiers",
      href: "/terrain/chantier",
      icon: HardHat,
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
      isActive: (path: string) =>
        path.startsWith("/bureau") && !path.startsWith("/bureau/fournisseurs"),
    },
    {
      id: "achats",
      label: "Achats",
      href: "/bureau/fournisseurs",
      icon: ShoppingCart,
      isActive: (path: string) => path.startsWith("/bureau/fournisseurs"),
    },
    {
      id: "outils",
      label: "Outils",
      href: "/terrain/outils",
      icon: Wrench,
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

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`group flex flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-all ${
                active
                  ? "text-sky-400 font-bold"
                  : "text-slate-400 hover:text-slate-200 font-medium"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                  active
                    ? "bg-sky-500/15 text-sky-400 scale-105 shadow-sm shadow-sky-500/20"
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
