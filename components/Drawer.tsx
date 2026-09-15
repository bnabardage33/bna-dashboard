"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X, Home, FolderOpen, HardHat, Wrench, CircleDollarSign, Users, Settings, Camera, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const NAV_ITEMS = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/bureau", label: "Bureau d'études", icon: FolderOpen },
  { href: "/terrain/chantier", label: "Chantiers", icon: HardHat },
  { href: "/terrain/outils", label: "Boîte à outils", icon: Wrench },
  { href: "/finance", label: "Finance & Pilotage", icon: CircleDollarSign },
  { href: "/bureau/portails-clients", label: "Espace Client", icon: Users },
  { href: "/bureau/photos-chantier", label: "Photos Chantier", icon: Camera },
];

export default function Drawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  // Masquer le drawer sur l'espace client
  if (pathname?.startsWith("/espace-client") || pathname?.startsWith("/demo-client")) {
    return null;
  }

  return (
    <>
      {/* HAMBURGER BUTTON */}
      <button
        onClick={() => setOpen(true)}
        className="relative z-[200] w-10 h-10 flex items-center justify-center rounded-xl bg-white/15 border border-white/15 hover:bg-white/25 transition-all"
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        aria-controls="bna-drawer"
      >
        <Menu size={20} className="text-white" />
      </button>

      {/* OVERLAY */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-[50]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* DRAWER */}
        <aside
        id="bna-drawer"
        role="navigation"
        aria-label="Navigation principale"
        className={`fixed top-0 left-0 h-full w-[76vw] max-w-[300px] border-r border-white/[0.08] bg-[#0B0F19] flex flex-col shadow-2xl transition-transform duration-300 z-[100] ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* DRAWER HEADER */}
        <div className="flex items-center justify-between px-5 pt-12 pb-5 border-b border-white/[0.06]">
          <div>
            <p className="text-white font-black text-[15px] tracking-tight">BNA Bardage</p>
            <p className="text-white text-[11px] mt-0.5">Dashboard Pro</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.08] hover:bg-white/[0.12] transition-all"
            aria-label="Fermer le menu"
          >
            <X size={16} className="text-white/60" />
          </button>
        </div>

        {/* NAV LINKS */}
        <nav className="flex-1 px-3 pt-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            // Pour éviter les erreurs d'hydratation liées à usePathname() (middleware, rewrites, etc.)
            // On s'assure de n'appliquer le style actif qu'une fois le composant monté côté client,
            // ou on utilise suppressHydrationWarning pour tolérer les différences.
            const active = open || mounted ? isActive(item.href) : false;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                suppressHydrationWarning
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-medium text-[14px] ${
                  active
                    ? "bg-[#E30613]/15 border border-[#E30613]/30 text-white"
                    : "text-white/60 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                <div
                  suppressHydrationWarning
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    active ? "bg-[#E30613]/20" : "bg-white/[0.05]"
                  }`}
                >
                  <Icon
                    size={16}
                    className={active ? "text-[#ff5a5a]" : "text-white/40"}
                    strokeWidth={active ? 2.5 : 1.8}
                  />
                </div>
                <span suppressHydrationWarning className="flex-1">{item.label}</span>
                {active && (
                  <div suppressHydrationWarning className="w-1.5 h-1.5 rounded-full bg-[#ff5a5a] shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* FOOTER */}
        <div className="px-3 pb-10 pt-3 border-t border-white/[0.06] space-y-1">
          <Link
            href="/parametres"
            onClick={() => setOpen(false)}
            suppressHydrationWarning
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-medium text-[14px] ${
              (open || mounted ? isActive("/parametres") : false)
                ? "bg-[#E30613]/15 border border-[#E30613]/30 text-white"
                : "text-white/60 hover:text-white hover:bg-white/[0.06]"
             }`}
           >
             <div suppressHydrationWarning className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white/[0.05]">
               <Settings size={16} className={(open || mounted ? isActive("/parametres") : false) ? "text-[#ff5a5a]" : "text-white/60"} strokeWidth={1.8} />
             </div>
             <span suppressHydrationWarning>Parametres</span>
           </Link>
           <button
             onClick={handleLogout}
             className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-white/60 hover:text-white hover:bg-white/[0.06] transition-all font-medium text-[14px]"
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white/[0.05]">
              <LogOut size={16} className="text-white/60" strokeWidth={1.8} />
            </div>
            <span>Deconnexion</span>
          </button>
          <p className="text-white/30 text-[10px] text-center pt-3">© 2026 BNA Bardage</p>
        </div>
      </aside>
    </>
  );
}
