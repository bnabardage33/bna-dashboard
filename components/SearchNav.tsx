"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Bell, FileText, HardHat, Users, Package, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Surface } from '@/components/ui/Surface';

type SearchResult = {
  clients: Array<{ id: string; nom: string; societe: string | null; email: string | null; tel: string | null }>;
  chantiers: Array<{ id: string; nom: string; adresse_chantier: string | null; statut: string | null }>;
  devis: Array<{ id: string; numero: string; client_id: string | null; statut: string | null }>;
  fournisseurs: Array<{ id: string; nom: string; email: string | null; tel: string | null }>;
};

type Notification = {
  id: string;
  type: string;
  titre: string;
  message: string | null;
  lu: boolean | null;
  created_at: string | null;
  lien: string | null;
};

export default function SearchNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const isClientPage = pathname?.startsWith("/espace-client") || pathname?.startsWith("/demo-client");

  // O3-B6 — RULES OF HOOKS (correction).
  //
  // Le `if (isClientPage) return null;` était placé AVANT les deux `useEffect`
  // (l.38-39 de la version précédente) : le NOMBRE DE HOOKS dépendait alors de
  // `pathname`. Or `usePathname()` change lors d'une navigation client SANS
  // remontage du layout racine. Passer de `/espace-client/[code_acces]` à une
  // page `/bureau/*` — par exemple le retour du navigateur après l'ouverture
  // d'un lien d'espace client — faisait basculer `isClientPage` et React levait
  // « Rendered fewer hooks than expected » : la page entrait en erreur.
  //
  // Aucun outil ne le voyait : `eslint.config.mjs` n'active ni eslint-plugin-react
  // ni eslint-plugin-react-hooks, et aucun test ne montait ce composant.
  //
  // Correction : le garde est appliqué à l'INTÉRIEUR des effets (pas de rendu,
  // pas de polling, pas d'écouteur sur les pages client) et le `return null` est
  // descendu APRÈS le dernier hook. Le comportement est strictement inchangé :
  // SearchNav reste absent de `/espace-client` et de `/demo-client`.
  useEffect(() => {
    if (isClientPage) return;
    chargerNotifications();
    const interval = setInterval(chargerNotifications, 30000);
    return () => clearInterval(interval);
  }, [isClientPage]);

  useEffect(() => {
    if (isClientPage) return;
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isClientPage]);

  async function chargerNotifications() {
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(20);
    if (data) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.lu).length);
    }
  }

  async function marquerLu(ids: string[]) {
    await supabase.from("notifications").update({ lu: true }).in("id", ids);
    setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, lu: true } : n));
    setUnreadCount(prev => Math.max(0, (prev || 0) - ids.length));
  }

  async function chercher() {
    if (query.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`);
      const data = await res.json();
      if (data.results) setResults(data.results);
    } catch { setResults(null); }
    finally { setLoading(false); }
  }

  // Return conditionnel APRÈS tous les hooks (cf. commentaire O3-B6 ci-dessus).
  if (isClientPage) return null;

  return (
    <div className="flex items-center gap-3 relative">
      {/* SEARCH - masqué sur mobile, visible sur desktop */}
      <div ref={searchRef} className="relative hidden md:block">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); chercher(); }}
            onFocus={() => { if (query.length >= 2) chercher(); }}
            className="bg-[#1A1D24] border border-white/10 rounded-xl px-4 py-2 pl-9 text-sm text-white placeholder-gray-500 w-40 focus:w-56 focus:outline-none focus:border-[#E30613]/50 transition-all"
          />
        </div>
        {open && (query.length >= 2) && (
          <Surface className="absolute top-full left-0 mt-2 w-80 shadow-2xl overflow-hidden z-50">
            {loading ? (
              <div className="p-4 text-gray-500 text-sm">Recherche...</div>
            ) : results && (results.clients.length + results.chantiers.length + results.devis.length + results.fournisseurs.length > 0) ? (
              <div className="py-2">
                {results.clients.length > 0 && (
                  <div className="px-4 py-1 text-2xs text-gray-500 uppercase tracking-wider font-bold">Clients</div>
                )}
                {results.clients.map(c => (
                  <Link key={c.id} href="/bureau/clients" onClick={() => { setOpen(false); setQuery(""); }} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-sm text-gray-300 transition-colors">
                    <Users size={14} className="text-blue-400" />
                    <div><p className="font-medium">{c.nom}</p><p className="text-xs text-gray-500">{c.societe || c.email}</p></div>
                    <ChevronRight size={14} className="ml-auto text-gray-600" />
                  </Link>
                ))}
                {results.chantiers.length > 0 && (
                  <div className="px-4 py-1 text-2xs text-gray-500 uppercase tracking-wider font-bold mt-2">Chantiers</div>
                )}
                {results.chantiers.map(c => (
                  <Link key={c.id} href={`/terrain/chantier/${c.id}`} onClick={() => { setOpen(false); setQuery(""); }} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-sm text-gray-300 transition-colors">
                    <HardHat size={14} className="text-orange-400" />
                    <div><p className="font-medium">{c.nom}</p><p className="text-xs text-gray-500">{c.adresse_chantier}</p></div>
                    <ChevronRight size={14} className="ml-auto text-gray-600" />
                  </Link>
                ))}
                {results.devis.length > 0 && (
                  <div className="px-4 py-1 text-2xs text-gray-500 uppercase tracking-wider font-bold mt-2">Devis</div>
                )}
                {results.devis.map(d => (
                  <Link key={d.id} href={`/bureau/devis-factures`} onClick={() => { setOpen(false); setQuery(""); }} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-sm text-gray-300 transition-colors">
                    <FileText size={14} className="text-emerald-400" />
                    <div><p className="font-medium">{d.numero}</p><p className="text-xs text-gray-500">{d.statut}</p></div>
                    <ChevronRight size={14} className="ml-auto text-gray-600" />
                  </Link>
                ))}
                {results.fournisseurs.length > 0 && (
                  <div className="px-4 py-1 text-2xs text-gray-500 uppercase tracking-wider font-bold mt-2">Fournisseurs</div>
                )}
                {results.fournisseurs.map(f => (
                  <Link key={f.id} href={`/bureau/fournisseurs`} onClick={() => { setOpen(false); setQuery(""); }} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-sm text-gray-300 transition-colors">
                    <Package size={14} className="text-purple-400" />
                    <div><p className="font-medium">{f.nom}</p><p className="text-xs text-gray-500">{f.email}</p></div>
                    <ChevronRight size={14} className="ml-auto text-gray-600" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-4 text-gray-500 text-sm text-center">Aucun résultat</div>
            )}
          </Surface>
        )}
      </div>

      {/* NOTIFICATIONS */}
      <div ref={notifRef} className="relative">
        <button
          onClick={() => { setNotifOpen(!notifOpen); setOpen(false); }}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition-all"
        >
          <Bell size={16} className="text-white/60" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#E30613] text-white text-2xs font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </button>
        {notifOpen && (
          <Surface className="absolute top-full right-0 mt-2 w-80 shadow-2xl overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={() => marquerLu(notifications.filter(n => !n.lu).map(n => n.id))} className="text-2xs text-[#E30613] hover:text-red-400 font-medium">Tout marquer lu</button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-gray-500 text-sm text-center">Aucune notification</div>
              ) : (
                notifications.map(n => (
                  <Link
                    key={n.id}
                    href={n.lien || "/"}
                    onClick={() => { marquerLu([n.id]); setNotifOpen(false); }}
                    className={`block px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors ${n.lu ? "opacity-60" : ""}`}
                  >
                    <p className="text-sm font-medium text-white">{n.titre}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                    <p className="text-2xs text-gray-600 mt-1">{n.created_at ? new Date(n.created_at).toLocaleDateString("fr-FR") : ""}</p>
                  </Link>
                ))
              )}
            </div>
          </Surface>
        )}
      </div>
    </div>
  );
}
