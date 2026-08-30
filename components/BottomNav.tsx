"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HardHat, Building2, ShoppingCart, Wrench, TrendingUp, Home } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname?.startsWith('/espace-client') || pathname?.startsWith('/demo-client')) {
    return null;
  }

  const NAV_ITEMS = [
    {
      id: "accueil",
      label: "Accueil",
      href: "/",
      icon: Home,
      isActive: (path: string) => path === "/",
    },
    {
      id: "chantiers",
      label: "Chantiers",
      href: "/terrain/chantier",
      icon: HardHat,
      isActive: (path: string) =>
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
      className="fixed bottom-4 left-4 right-4 bg-[#1c1e26]/80 backdrop-blur-2xl border border-white/10 rounded-[20px] h-[72px] flex items-center justify-around px-2 z-50 safe-area-inset-bottom"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname || "");
        const Icon = item.icon;

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 transition-all ${
              active ? "text-[#ff5a5a]" : "text-white/50 hover:text-white/80"
            }`}
          >
            <div
              className={`flex h-10 w-10 items-center justify-center transition-all ${
                active ? "bg-[#ff5a5a]/15 rounded-full" : ""
              }`}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} />
            </div>
            <span className="text-[10px] tracking-tight font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
