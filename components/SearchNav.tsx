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

/**
 * État de la recherche.
 *
 * `idle`    : rien n'a encore été demandé (ou la saisie fait moins de
 *             2 caractères) → on n'affiche AUCUN message, surtout pas
 *             « Aucun résultat » qui laissait croire à un échec.
 * `loading` : requête en vol.
 * `erreur`  : le réseau ou le serveur a échoué → message DISTINCT, jamais
 *             confondu avec « aucun résultat ».
 * `ok`      : réponse valide, `results` fait foi.
 */
type EtatRecherche = "idle" | "loading" | "erreur" | "ok";

/**
 * Résultats de recherche — rendu PARTAGÉ par les deux présentations.
 *
 * Le panneau du header (desktop) et le panneau déroulant mobile affichent
 * exactement la même chose : un seul corps de rendu garantit qu'ils ne
 * divergent jamais. Les `onFermer` diffèrent (le mobile referme aussi son
 * volet), la liste non.
 */
function ListeResultats({
  etat,
  results,
  onFermer,
}: {
  etat: EtatRecherche;
  results: SearchResult | null;
  onFermer: () => void;
}) {
  if (etat === "loading") {
    return <div className="p-4 text-gray-500 text-sm">Recherche...</div>;
  }
  if (etat === "erreur") {
    return (
      <div className="p-4 text-sm text-center text-red-400/90">
        Recherche indisponible. Réessayez.
      </div>
    );
  }
  // `idle` : aucune requête n'a encore abouti → aucun message.
  if (etat === "idle") return null;
  // `ok` sans données (ou données vides) : la recherche a bien répondu, mais
  // sans résultat — c'est le seul cas où ce message est légitime.
  if (!results) {
    return <div className="p-4 text-gray-500 text-sm text-center">Aucun résultat</div>;
  }
  const total =
    results.clients.length + results.chantiers.length + results.devis.length + results.fournisseurs.length;
  if (total === 0) {
    return <div className="p-4 text-gray-500 text-sm text-center">Aucun résultat</div>;
  }
  return (
    <div className="py-2">
      {results.clients.length > 0 && (
        <div className="px-4 py-1 text-2xs text-gray-500 uppercase tracking-wider font-bold">Clients</div>
      )}
      {results.clients.map(c => (
        <Link key={c.id} href="/bureau/clients" onClick={onFermer} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-sm text-gray-300 transition-colors">
          <Users size={14} className="text-blue-400" />
          <div><p className="font-medium">{c.nom}</p><p className="text-xs text-gray-500">{c.societe || c.email}</p></div>
          <ChevronRight size={14} className="ml-auto text-gray-600" />
        </Link>
      ))}
      {results.chantiers.length > 0 && (
        <div className="px-4 py-1 text-2xs text-gray-500 uppercase tracking-wider font-bold mt-2">Chantiers</div>
      )}
      {results.chantiers.map(c => (
        <Link key={c.id} href={`/terrain/chantier/${c.id}`} onClick={onFermer} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-sm text-gray-300 transition-colors">
          <HardHat size={14} className="text-orange-400" />
          <div><p className="font-medium">{c.nom}</p><p className="text-xs text-gray-500">{c.adresse_chantier}</p></div>
          <ChevronRight size={14} className="ml-auto text-gray-600" />
        </Link>
      ))}
      {results.devis.length > 0 && (
        <div className="px-4 py-1 text-2xs text-gray-500 uppercase tracking-wider font-bold mt-2">Devis</div>
      )}
      {results.devis.map(d => (
        <Link key={d.id} href={`/bureau/devis-factures`} onClick={onFermer} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-sm text-gray-300 transition-colors">
          <FileText size={14} className="text-emerald-400" />
          <div><p className="font-medium">{d.numero}</p><p className="text-xs text-gray-500">{d.statut}</p></div>
          <ChevronRight size={14} className="ml-auto text-gray-600" />
        </Link>
      ))}
      {results.fournisseurs.length > 0 && (
        <div className="px-4 py-1 text-2xs text-gray-500 uppercase tracking-wider font-bold mt-2">Fournisseurs</div>
      )}
      {results.fournisseurs.map(f => (
        <Link key={f.id} href={`/bureau/fournisseurs`} onClick={onFermer} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 text-sm text-gray-300 transition-colors">
          <Package size={14} className="text-purple-400" />
          <div><p className="font-medium">{f.nom}</p><p className="text-xs text-gray-500">{f.email}</p></div>
          <ChevronRight size={14} className="ml-auto text-gray-600" />
        </Link>
      ))}
    </div>
  );
}

export default function SearchNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [etat, setEtat] = useState<EtatRecherche>("idle");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  /**
   * Recherche MOBILE ouverte.
   *
   * Le champ « Rechercher… » du header était en `hidden md:block` : sous 768 px
   * il disparaissait purement et simplement, et au-delà de 768 px il cohabitait
   * avec le bouton loupe (`lg:hidden`, donc visible jusqu'à 1024 px) — les deux
   * recherches s'affichaient ENSEMBLE dans l'intervalle 768–1024 px, ordinateurs
   * inclus.
   *
   * Les deux présentations partagent donc désormais UN SEUL seuil, `lg` :
   *   · champ inline  → `hidden lg:block` (≥ 1024 px) ;
   *   · bouton + volet → `lg:hidden` (< 1024 px).
   * Une seule est active à la fois, quelle que soit la largeur.
   *
   * Sous 1024 px, un BOUTON LOUPE compact de 44 px déplie un volet `fixed`
   * ancré au viewport : largeur fiable, jamais écrasée par la rangée étroite
   * des boutons, et jamais de débordement horizontal.
   */
  const [rechercheMobileOuverte, setRechercheMobileOuverte] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const champMobileRef = useRef<HTMLInputElement>(null);
  /** Enveloppe du volet mobile : permet au clic extérieur de le refermer. */
  const rechercheMobileRef = useRef<HTMLDivElement>(null);
  /** Bouton loupe : un clic dessus NE doit PAS refermer le volet qu'il ouvre. */
  const boutonLoupeRef = useRef<HTMLButtonElement>(null);

  const isClientPage = pathname?.startsWith("/espace-client");

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
  // SearchNav reste absent de `/espace-client`.
  useEffect(() => {
    if (isClientPage) return;
    chargerNotifications();
    const interval = setInterval(chargerNotifications, 30000);
    return () => clearInterval(interval);
  }, [isClientPage]);

  useEffect(() => {
    if (isClientPage) return;
    function handleClick(e: MouseEvent) {
      const cible = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(cible)) setOpen(false);
      if (notifRef.current && !notifRef.current.contains(cible)) setNotifOpen(false);
      // Le volet mobile est dans le flux du header : un clic dans l'un OU
      // l'autre de ses deux conteneurs (bouton loupe et panneau) le laisse
      // ouvert, un clic ailleurs le referme. Le choix d'un résultat referme
      // explicitement le volet via le `onFermer` de `ListeResultats`.
      const dansMobile =
        (rechercheMobileRef.current?.contains(cible) ?? false) ||
        (boutonLoupeRef.current?.contains(cible) ?? false);
      if (!dansMobile) setRechercheMobileOuverte(false);
    }
    function handleKey(e: KeyboardEvent) {
      // Échap referme les trois surfaces, y compris le volet mobile.
      if (e.key === "Escape") {
        setOpen(false);
        setNotifOpen(false);
        setRechercheMobileOuverte(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
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

  /**
   * Recherche — IMPLÉMENTATION UNIQUE, partagée par le champ desktop et le
   * champ mobile. Les deux passent obligatoirement par ici : impossible qu'ils
   * interrogent une route différente ou appliquent un seuil différent.
   *
   * `valeur` est passée EXPLICITEMENT (et non lue dans `query`) : `setQuery`
   * est asynchrone, et `query` porterait encore l'ancienne valeur au moment de
   * l'appel — la toute première frappe ne déclenchait alors aucune requête.
   *
   * Seuil de 2 caractères, route `/api/search`, paramètres `q` et `limit=8`
   * et format de réponse : strictement inchangés. Seul l'ÉTAT affiché devient
   * explicite (`idle` / `loading` / `erreur` / `ok`), pour ne plus montrer
   * « Aucun résultat » avant la fin d'une recherche ni masquer une panne.
   */
  function lancerRecherche(valeur: string) {
    if (valeur.length < 2) {
      setResults(null);
      setEtat("idle");
      return;
    }
    setEtat("loading");
    fetch(`/api/search?q=${encodeURIComponent(valeur)}&limit=8`)
      .then((res) => res.json())
      .then((data) => {
        if (data.results) {
          setResults(data.results);
          setEtat("ok");
        } else {
          setResults(null);
          setEtat("erreur");
        }
      })
      .catch(() => {
        setResults(null);
        setEtat("erreur");
      });
  }

  /** Saisie dans l'un OU l'autre champ : met à jour la requête puis cherche. */
  function chercherTexte(valeur: string) {
    setQuery(valeur);
    lancerRecherche(valeur);
  }

  // Return conditionnel APRÈS tous les hooks (cf. commentaire O3-B6 ci-dessus).
  if (isClientPage) return null;

  return (
    <div className="flex items-center gap-3 relative">
      {/* SEARCH — champ complet, à partir de `lg` (≥ 1024 px) seulement.
          MÊME breakpoint que le bouton loupe ci-dessous, qui est `lg:hidden` :
          les deux présentations ne peuvent donc JAMAIS être visibles ensemble,
          y compris autour de la largeur de transition. L'intervalle 768–1024 px
          affichait auparavant le champ ET la loupe côte à côte. */}
      <div ref={searchRef} className="relative hidden lg:block">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={query}
            onChange={(e) => { setOpen(true); chercherTexte(e.target.value); }}
            onFocus={() => { if (query.length >= 2) lancerRecherche(query); }}
            className="bg-[#1E1E1E] border border-white/10 rounded-xl px-4 py-2 pl-9 text-sm text-white placeholder-gray-500 w-40 focus:w-56 focus:outline-none focus:border-[#B85B2B]/50 transition-all"
          />
        </div>
        {open && (query.length >= 2) && (
          <Surface className="absolute top-full right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] shadow-2xl overflow-hidden z-50">
            <ListeResultats etat={etat} results={results} onFermer={() => { setOpen(false); setQuery(""); }} />
          </Surface>
        )}
      </div>

      {/* BOUTON LOUPE — mobile et tablette (< 1024 px), quand le champ inline
          n'est pas disponible. Même cible tactile de 44 px que le menu et la
          cloche ; il appelle la MÊME `lancerRecherche` que le champ desktop. */}
      <button
        type="button"
        ref={boutonLoupeRef}
        onClick={() => {
          const suivant = !rechercheMobileOuverte;
          setRechercheMobileOuverte(suivant);
          if (suivant) requestAnimationFrame(() => champMobileRef.current?.focus());
        }}
        className="relative min-h-11 min-w-11 w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.07] hover:bg-white/15 border border-white/10 transition-all lg:hidden"
        aria-label="Rechercher"
        aria-expanded={rechercheMobileOuverte}
        aria-controls="recherche-mobile"
      >
        <Search size={14} className="text-white/60" />
      </button>

      {/* VOLET DE RECHERCHE MOBILE — `<fixed>` et non `<absolute>`.

          Le parent direct est la rangée des boutons (`flex items-center gap-3`),
          large d'environ 90 px : un volet `absolute left-0 right-0` héritait de
          CETTE largeur, d'où le champ écrasé et les résultats illisibles. Le
          volet ne peut pas non plus se positionner par rapport au `<header>`
          (qui n'est pas son ancêtre direct).

          `fixed` l'ancre au VIEWPORT : il prend une largeur maîtrisée,
          indépendante du bouton. `left-4 right-4` l'aligne sur le padding du
          header (16 px) et `max-w-[calc(100vw-2rem)]` garantit qu'il ne dépasse
          jamais la fenêtre : AUCUN débordement horizontal, même si un ancêtre
          impose un contexte étroit.

          `top-[142px]` = hauteur exacte du header (`py-1.5` = 12 px + cadre
          logo 130 px). Le volet se pose donc JUSTE sous le header, sans le
          chevaucher. `lg:hidden` le supprime dès que le champ inline reprend la
          main. */}
      {rechercheMobileOuverte && (
        <div
          id="recherche-mobile"
          ref={rechercheMobileRef}
          className="fixed left-4 right-4 top-[142px] z-50 mx-auto max-w-[calc(100vw-2rem)] lg:hidden"
        >
          <Surface className="overflow-hidden shadow-2xl">
            <form
              className="relative p-2"
              onSubmit={(e) => { e.preventDefault(); lancerRecherche(query); }}
            >
              <Search size={16} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                ref={champMobileRef}
                type="text"
                placeholder="Rechercher..."
                value={query}
                onChange={(e) => { setOpen(true); chercherTexte(e.target.value); }}
                className="w-full rounded-lg border border-white/10 bg-[#1E1E1E] py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 outline-none focus:border-[#B85B2B]/50"
              />
            </form>
            {query.length >= 2 && (
              <div className="max-h-[60vh] overflow-y-auto border-t border-white/[0.06]">
                <ListeResultats
                  etat={etat}
                  results={results}
                  onFermer={() => { setRechercheMobileOuverte(false); setQuery(""); }}
                />
              </div>
            )}
          </Surface>
        </div>
      )}

      {/* NOTIFICATIONS

          Même traitement que le hamburger : carré visuel de 36 px
          (`w-9 h-9`) centré dans une zone tactile de 44 px
          (`min-h-11 min-w-11`), icône réduite de 16 à 14 px et fond de
          `bg-white/10` à `bg-white/[0.07]` pour un rendu plus discret.
          La destination, le compteur et le panneau sont inchangés. */}
      <div ref={notifRef} className="relative flex">
        <button
          onClick={() => { setNotifOpen(!notifOpen); setOpen(false); }}
          className="relative min-h-11 min-w-11 w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.07] hover:bg-white/15 border border-white/10 transition-all"
          aria-label="Notifications"
        >
          <Bell size={14} className="text-white/60" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#B85B2B] text-white text-2xs font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </button>
        {notifOpen && (
          <Surface className="absolute top-full right-0 mt-2 w-80 shadow-2xl overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={() => marquerLu(notifications.filter(n => !n.lu).map(n => n.id))} className="text-2xs text-[#B85B2B] hover:text-red-400 font-medium">Tout marquer lu</button>
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
