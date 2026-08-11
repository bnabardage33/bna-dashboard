"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Terrain", emoji: "🛠️", href: "/terrain" },
  { label: "Bureau", emoji: "🏢", href: "/bureau" },
  { label: "Finance", emoji: "💰", href: "/finance", locked: true },
  { label: "Réglages", emoji: "⚙️", href: "/parametres" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-700 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo-bna.png" alt="BNA Bardage" className="h-8 w-auto" />
          <span className="hidden text-sm font-semibold text-slate-100 sm:inline">
            BNA Bardage
          </span>
        </Link>
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-red-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span>{tab.emoji}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.locked && (
                  <span className="ml-1 text-xs opacity-60">🔒</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
