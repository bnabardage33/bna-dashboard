"use client";

import React, { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  NAV_ITEMS,
  type EntreeNav,
  type SousEntree,
  estLienActif,
  groupeEstActif,
} from "@/lib/navigation";

function SearchParamsSync({ onTabChange }: { onTabChange: (tab: string | null) => void }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  useEffect(() => {
    onTabChange(tab);
  }, [tab, onTabChange]);

  return null;
}

export default function SidebarDesktop() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [choixGroupes, setChoixGroupes] = useState<Map<string, boolean>>(new Map());
  const [ongletUrl, setOngletUrl] = useState<string | null>(null);

  // Initialisation localStorage sécurisée pour SSR / Hydratation
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("bna_sidebar_collapsed");
      if (saved !== null) {
        setIsCollapsed(saved === "true");
      }
    } catch {
      // Ignorer les restrictions de stockage local
    }
  }, []);

  const collapsedEffectif = mounted ? isCollapsed : false;
  const ongletEffectif = mounted ? ongletUrl : null;

  const appliquerCollapsed = (valeur: boolean) => {
    setIsCollapsed(valeur);
    try {
      localStorage.setItem("bna_sidebar_collapsed", String(valeur));
    } catch {}
  };

  const toggleSidebar = () => {
    appliquerCollapsed(!isCollapsed);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const basculerGroupe = (label: string, actuellementOuvert: boolean) => {
    setChoixGroupes((prec) => {
      const suivant = new Map(prec);
      suivant.set(label, !actuellementOuvert);
      return suivant;
    });
  };

  // Masquer complètement la Sidebar sur la page de connexion, l'espace client et à l'impression
  if (pathname?.startsWith("/espace-client") || pathname === "/login") {
    return null;
  }

  return (
    <aside
      id="bna-desktop-sidebar"
      role="navigation"
      aria-label="Navigation principale ordinateur"
      className={`hidden lg:flex flex-col shrink-0 border-r border-white/[0.08] bg-[#1A1A1A] text-gray-300 select-none print:hidden transition-[width] duration-300 ease-in-out relative z-30 min-h-screen ${
        collapsedEffectif ? "w-[72px]" : "w-[260px]"
      }`}
    >
      <Suspense fallback={null}>
        <SearchParamsSync onTabChange={setOngletUrl} />
      </Suspense>
      {/* ── EN-TÊTE SIDEBAR : LOGO & BOUTON RÉDUCTION ───────────────────── */}
      {collapsedEffectif ? (
        <div className="py-2.5 px-2 flex flex-col items-center gap-2 border-b border-white/[0.06]">
          <Link
            href="/terrain/accueil"
            className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden group hover:border-[#B85B2B]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B]"
            title="BNA Bardage — Accueil"
          >
            <Image
              src="/icon-192.png"
              alt="BNA"
              width={32}
              height={32}
              className="w-7 h-7 object-contain"
              priority
            />
          </Link>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Déplier le menu latéral"
            title="Déplier le menu"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B] shrink-0"
          >
            <PanelLeftOpen size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="h-16 flex items-center justify-between px-3.5 border-b border-white/[0.06]">
          <Link
            href="/terrain/accueil"
            className="flex items-center min-w-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B] rounded-xl p-1"
            title="BNA Bardage — Accueil"
          >
            <Image
              src="/logo-bna.png"
              alt="BNA Bardage"
              width={160}
              height={40}
              className="h-8 w-auto max-w-[155px] object-contain group-hover:opacity-90 transition-opacity"
              priority
            />
          </Link>

          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Rétracter le menu latéral"
            title="Rétracter le menu"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B] shrink-0"
          >
            <PanelLeftClose size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── LISTE DE NAVIGATION PRINCIPALE ─────────────────────────────── */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-1 scrollbar-thin scrollbar-thumb-white/10"
        aria-label="Sections de navigation"
      >
        {NAV_ITEMS.map((item) => {
          const Icone = item.icon;
          const aDesEnfants = Boolean(item.children && item.children.length > 0);

          // 1. Entrée directe sans enfants (ex: Accueil Chantier, Accueil Météo)
          if (!aDesEnfants && item.href) {
            const actif = estLienActif(item.href, pathname, ongletEffectif);

            return (
              <div key={item.href} className="relative group">
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl transition-all font-medium text-[13px] relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B] ${
                    collapsedEffectif ? "h-11 w-11 mx-auto justify-center" : "px-3 py-2.5"
                  } ${
                    actif
                      ? "bg-[#B85B2B]/20 border border-[#B85B2B]/40 text-white font-semibold shadow-xs"
                      : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
                  }`}
                  aria-current={actif ? "page" : undefined}
                >
                  <Icone
                    size={18}
                    className={`shrink-0 transition-colors ${
                      actif ? "text-[#ff5a5a]" : "text-gray-400 group-hover:text-white"
                    }`}
                    aria-hidden="true"
                  />
                  {!collapsedEffectif && <span className="truncate">{item.label}</span>}
                </Link>

                {/* Tooltip flottant au hover et au focus quand rétracté */}
                {collapsedEffectif && (
                  <div
                    role="tooltip"
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[#222222] border border-white/10 text-white text-xs rounded-lg shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50 whitespace-nowrap"
                  >
                    {item.label}
                  </div>
                )}
              </div>
            );
          }

          // 2. Groupe avec accordéon d'enfants
          const estGroupeActif = groupeEstActif(item, pathname, ongletEffectif);
          const choix = mounted ? choixGroupes.get(item.label) : undefined;
          // Ouvert par défaut si le groupe contient la page active, sauf si fermé explicitement
          const estOuvert = choix !== undefined ? choix : estGroupeActif;

          return (
            <div key={item.label} className="relative group">
              {/* Entête du groupe */}
              <button
                type="button"
                onClick={() => {
                  if (collapsedEffectif) {
                    // Si rétracté, cliquer déplie la sidebar pour voir le groupe
                    appliquerCollapsed(false);
                    basculerGroupe(item.label, false);
                  } else {
                    basculerGroupe(item.label, estOuvert);
                  }
                }}
                aria-expanded={!collapsedEffectif && estOuvert}
                aria-haspopup="true"
                className={`w-full flex items-center rounded-xl transition-all font-medium text-[13px] relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B] ${
                  collapsedEffectif
                    ? "h-11 w-11 mx-auto justify-center"
                    : "px-3 py-2.5 justify-between"
                } ${
                  estGroupeActif
                    ? "text-white bg-white/[0.04]"
                    : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
                }`}
                title={collapsedEffectif ? item.label : undefined}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icone
                    size={18}
                    className={`shrink-0 transition-colors ${
                      estGroupeActif ? "text-[#B85B2B]" : "text-gray-400 group-hover:text-white"
                    }`}
                    aria-hidden="true"
                  />
                  {!collapsedEffectif && (
                    <span className="truncate text-left">{item.label}</span>
                  )}
                </div>
                {!collapsedEffectif && (
                  <ChevronDown
                    size={14}
                    className={`shrink-0 text-gray-500 transition-transform duration-200 ${
                      estOuvert ? "rotate-180 text-gray-300" : ""
                    }`}
                    aria-hidden="true"
                  />
                )}
              </button>

              {/* SOUS-MENU DÉPLIÉ (Quand sidebar non rétractée) */}
              {!collapsedEffectif && estOuvert && item.children && (
                <ul className="mt-1 ml-4 pl-3 border-l border-white/[0.08] space-y-0.5">
                  {item.children.map((enfant) => {
                    const actif = estLienActif(enfant.href, pathname, ongletEffectif);
                    return (
                      <li key={enfant.href}>
                        <Link
                          href={enfant.href}
                          className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B] ${
                            actif
                              ? "bg-[#B85B2B]/20 text-white font-semibold border-l-2 border-[#B85B2B] -ml-[13px] pl-[11px]"
                              : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
                          }`}
                          aria-current={actif ? "page" : undefined}
                        >
                          <span className="truncate">{enfant.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* FLYOUT POPOVER AU HOVER / FOCUS (Quand sidebar rétractée) */}
              {collapsedEffectif && item.children && (
                <div
                  role="menu"
                  aria-label={item.label}
                  className="absolute left-full top-0 ml-2 w-52 bg-[#1E1E1E] border border-white/10 rounded-xl p-2 shadow-2xl pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50"
                >
                  <div className="px-2.5 py-1.5 text-2xs font-bold text-[#B85B2B] uppercase tracking-wider border-b border-white/[0.08] mb-1">
                    {item.label}
                  </div>
                  <ul className="space-y-0.5">
                    {item.children.map((enfant) => {
                      const actif = estLienActif(enfant.href, pathname, ongletEffectif);
                      return (
                        <li key={enfant.href}>
                          <Link
                            href={enfant.href}
                            role="menuitem"
                            className={`block px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B] ${
                              actif
                                ? "bg-[#B85B2B]/20 text-white font-semibold"
                                : "text-gray-300 hover:text-white hover:bg-white/[0.08]"
                            }`}
                            aria-current={actif ? "page" : undefined}
                          >
                            {enfant.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── PIED DE NAVIGATION : PARAMÈTRES & DÉCONNEXION ───────────────── */}
      <div className="p-2 border-t border-white/[0.06] space-y-1">
        {/* Paramètres */}
        <div className="relative group">
          <Link
            href="/parametres"
            className={`flex items-center gap-3 rounded-xl transition-all font-medium text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B85B2B] ${
              collapsedEffectif ? "h-10 w-10 mx-auto justify-center" : "px-3 py-2"
            } ${
              estLienActif("/parametres", pathname, ongletEffectif)
                ? "bg-[#B85B2B]/20 text-white font-semibold border border-[#B85B2B]/40"
                : "text-gray-400 hover:text-white hover:bg-white/[0.06]"
            }`}
            title={collapsedEffectif ? "Paramètres" : undefined}
          >
            <Settings size={18} className="shrink-0 text-gray-400 group-hover:text-white" />
            {!collapsedEffectif && <span className="truncate">Paramètres</span>}
          </Link>
          {collapsedEffectif && (
            <div
              role="tooltip"
              className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[#222222] border border-white/10 text-white text-xs rounded-lg shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50 whitespace-nowrap"
            >
              Paramètres
            </div>
          )}
        </div>

        {/* Déconnexion */}
        <div className="relative group">
          <button
            type="button"
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all font-medium text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
              collapsedEffectif ? "h-10 w-10 mx-auto justify-center" : "px-3 py-2"
            }`}
            title={collapsedEffectif ? "Déconnexion" : undefined}
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsedEffectif && <span className="truncate">Déconnexion</span>}
          </button>
          {collapsedEffectif && (
            <div
              role="tooltip"
              className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[#222222] border border-white/10 text-red-400 text-xs rounded-lg shadow-xl pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-50 whitespace-nowrap"
            >
              Déconnexion
            </div>
          )}
        </div>

        {/* Copyright discret */}
        {!collapsedEffectif && (
          <p className="text-white/20 text-2xs text-center pt-2">
            © 2026 BNA Bardage
          </p>
        )}
      </div>
    </aside>
  );
}
