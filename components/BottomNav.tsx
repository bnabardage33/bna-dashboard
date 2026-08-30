"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FolderOpen, MessageSquare, User } from "lucide-react";

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
      id: "projets",
      label: "Projets",
      href: "/terrain/chantier",
      icon: FolderOpen,
      isActive: (path: string) => path.startsWith("/terrain") || path.startsWith("/bureau"),
    },
    {
      id: "messages",
      label: "Messages",
      href: "/messages",
      icon: MessageSquare,
      isActive: (path: string) => path.startsWith("/messages"),
    },
    {
      id: "profil",
      label: "Profil",
      href: "/parametres",
      icon: User,
      isActive: (path: string) => path.startsWith("/parametres"),
    },
  ];

  return (
    <nav className="fixed bottom-5 left-4 right-4 h-[72px] bg-[#1c1f2e]/85 backdrop-blur-2xl border border-white/10 rounded-[20px] flex justify-around items-center z-50">
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
            <div className="flex h-8 w-8 items-center justify-center">
              <Icon size={24} strokeWidth={active ? 2.5 : 1.5} />
            </div>
            <span className="text-[10.5px] tracking-tight font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
