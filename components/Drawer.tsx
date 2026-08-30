"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Home, BookOpen, HardHat, Wrench, CircleDollarSign } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/bureau-etudes", label: "Bureau d'études", icon: BookOpen },
  { href: "/chantiers", label: "Chantiers", icon: HardHat },
  { href: "/boite-a-outils", label: "Boîte à outils", icon: Wrench },
  { href: "/finance", label: "Finance", icon: CircleDollarSign },
];

export default function Drawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <>
      {/* HAMBURGER BUTTON */}
      <button
        onClick={() => setOpen(true)}
        className="relative z-20 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 transition-all"
        aria-label="Ouvrir le menu"
      >
        <Menu size={20} className="text-white" />
      </button>

      {/* OVERLAY */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* DRAWER */}
      <aside
        className={`fixed top-0 left-0 h-full w-[76vw] max-w-[300px] bg-[#0B0F19] border-r border-white/[0.08] z-50 flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* DRAWER HEADER */}
        <div className="flex items-center justify-between px-5 pt-12 pb-6 border-b border-white/[0.06]">
          <div>
            <p className="text-white font-black text-[15px] tracking-tight">BNA Bardage</p>
            <p className="text-white/40 text-[11px] mt-0.5">Dashboard Pro</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.08] hover:bg-white/[0.12] transition-all"
          >
            <X size={16} className="text-white/60" />
          </button>
        </div>

        {/* NAV LINKS */}
        <nav className="flex-1 px-3 pt-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-medium text-[14px] ${
                  active
                    ? "bg-[#E30613]/15 border border-[#E30613]/30 text-white"
                    : "text-white/50 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    active ? "bg-[#E30613]/20" : "bg-white/[0.05]"
                  }`}
                >
                  <Icon
                    size={16}
                    className={active ? "text-[#ff5a5a]" : "text-white/40"}
                    strokeWidth={active ? 2.5 : 1.8}
                  />
                </div>
                {item.label}
                {active && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#ff5a5a]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* FOOTER */}
        <div className="px-5 pb-10 pt-4 border-t border-white/[0.06]">
          <p className="text-white/20 text-[10px] text-center">© 2026 BNA Bardage</p>
        </div>
      </aside>
    </>
  );
}
