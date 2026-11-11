"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Menu, X, CloudSun, FolderOpen, HardHat, Wrench, CircleDollarSign, Users, Settings, LogOut, Truck, ChevronDown, BookOpen } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { LucideIcon } from "lucide-react";

/**
 * Navigation globale unique de l'application (PHASE 2).
 *
 * Le hamburger est désormais la SEULE navigation principale : `BureauNav` et la
 * barre `SubNav` de `app/terrain/layout.tsx` ont été retirés (lot 2). Chaque
 * groupe se déplie sur place, ce qui évite d'ajouter une route par section.
 *
 * Les URL sont celles qui EXISTENT déjà dans `app/`. Aucune n'est renommée :
 * c'est la contrainte retenue en phase 2 — « la navigation change, pas
 * l'architecture des fichiers ». Les chemins écrits en base (champ
 * `notifications.lien`) restent donc valides sans migration de données.
 *
 * `href` est porté par les ENTRÉES DE SECOND NIVEAU. Une entrée de premier
 * niveau sans `href` est un simple en-tête de groupe : elle ne doit jamais
 * rendre la navigation ambiguë (c'était le reproche fait aux anciens onglets).
 */
type SousEntree = { href: string; label: string };

type EntreeNav = {
  /** Absent pour un groupe : l'entrée ne navigue pas, elle déplie. */
  href?: string;
  label: string;
  icon: LucideIcon;
  children?: SousEntree[];
};

const NAV_ITEMS: EntreeNav[] = [
  { href: "/terrain/accueil", label: "Accueil Chantier", icon: HardHat },
  { href: "/terrain/meteo", label: "Accueil Météo", icon: CloudSun },
  {
    label: "Études / Commercial",
    icon: FolderOpen,
    children: [
      { href: "/bureau/clients", label: "Clients" },
      { href: "/bureau/devis-factures", label: "Devis" },
      { href: "/bureau/factures", label: "Factures" },
    ],
  },
  {
    label: "Catalogues",
    icon: BookOpen,
    children: [
      { href: "/bureau/catalogue", label: "Catalogue Bardage" },
      { href: "/bureau/catalogue-terrasse", label: "Catalogue Terrasse" },
    ],
  },
  {
    label: "Chantiers",
    icon: HardHat,
    children: [
      { href: "/terrain/chantier", label: "Liste des chantiers" },
      // La météo générale a une entrée dédiée en tête de navigation ; ce
      // groupe conserve les fonctions de veille et de rapports d'intempéries.
      { href: "/bureau/meteo", label: "Météo & intempéries" },
      { href: "/bureau/rapports-intemperies", label: "Rapports intempéries" },
      { href: "/bureau/fin-chantier", label: "Fin de chantier / PV" },
      { href: "/bureau/sav", label: "SAV & Garantie" },
    ],
  },
  {
    label: "Finance & Pilotage",
    icon: CircleDollarSign,
    children: [
      // Les six premières sont sous /finance/** et restent couvertes par
      // FinancePinGate. Les deux dernières en sont HORS, volontairement :
      // /bureau/dashboard-patron et /bureau/documents-compta ne sont pas
      // déplacés et ne doivent surtout pas hériter du garde PIN.
      { href: "/finance", label: "Tableau financier" },
      { href: "/finance/saisie/depense", label: "Dépenses" },
      { href: "/finance/saisie/pointage", label: "Pointage" },
      { href: "/finance/saisie/feuille-heures", label: "Feuille d'heures" },
      { href: "/finance/saisie/frais-interim", label: "Frais d'intérim" },
      { href: "/finance/historique", label: "Historique" },
      { href: "/bureau/dashboard-patron", label: "Trésorerie patron" },
      { href: "/bureau/documents-compta", label: "Documents comptables" },
    ],
  },
  {
    label: "Fournisseurs",
    icon: Truck,
    children: [
      // Les trois entrées du cahier des charges correspondent aux trois
      // onglets internes de la MÊME page (useState local, non sérialisable).
      // `?tab=` est lu par la page pour que chaque entrée soit un deep-link
      // réel — trois liens vers une page sans distinction seraient de la
      // navigation factice, exactement ce que la refonte supprime.
      { href: "/bureau/fournisseurs", label: "Fournisseurs & commandes" },
      { href: "/bureau/fournisseurs?tab=commandes", label: "Suivi des commandes" },
      { href: "/bureau/fournisseurs?tab=fournisseurs", label: "Contacts fournisseurs" },
    ],
  },
  {
    label: "Boîte à outils",
    icon: Wrench,
    children: [
      { href: "/terrain/metre-ia", label: "Métré IA" },
      { href: "/terrain/notes", label: "Notes Patron" },
      { href: "/terrain/fiche-technique", label: "Fiches DTU" },
      { href: "/terrain/outils", label: "Outils métier" },
    ],
  },
  {
    label: "Espace client",
    icon: Users,
    children: [
      { href: "/bureau/portails-clients", label: "Portails clients" },
      { href: "/bureau/photos-chantier", label: "Photos chantier" },
    ],
  },
];

export default function Drawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // CHOIX EXPLICITE de l'utilisateur, par groupe :
  //   `true`  → l'utilisateur a demandé l'ouverture ;
  //   `false` → l'utilisateur a demandé la fermeture ;
  //   absent  → on suit la catégorie courante (deep-link).
  //
  // Le défaut qu'un simple `Set<string>` des groupes ouverts ne pouvait pas
  // représenter : « ouvert parce que l'utilisateur a cliqué » et « ouvert
  // parce que c'est la catégorie courante » y sont le même état. Comme
  // l'affichage faisait `groupesOuverts.has(label) || groupeActif`, un clic sur
  // la catégorie COURANTE ne pouvait jamais la refermer — le second clic ne
  // faisait rien de visible. Un `Map` sépare les deux intentions, ce qui rend
  // chaque clic un vrai basculement.
  const [choixGroupes, setChoixGroupes] = useState<Map<string, boolean>>(new Map());
  // Onglet courant de l'URL (`?tab=`), lu UNE fois au montage.
  //
  // Il n'est nécessaire que pour désigner les trois entrées Fournisseurs,
  // qui partagent le chemin `/bureau/fournisseurs` et ne diffèrent que par
  // `?tab=` : sans lui, les trois seraient marquées actives en même temps.
  //
  // On ne compare QUE `tab`, jamais la requête entière : l'URL
  // `/bureau/fournisseurs?retard=<id>` — celle des notifications de retard —
  // ne porte pas de `tab` et doit donc allumer l'entrée par défaut, pas
  // n'allumer aucune.
  //
  // `useSearchParams()` n'est pas employé : il impose une frontière
  // `<Suspense>` à la compilation, et le Drawer est rendu par le layout racine
  // — l'envelopper ici impacterait `/login` et l'Espace Client. L'URL n'est
  // lue quaprès montage, donc jamais pendant le rendu serveur.
  const [ongletUrl, setOngletUrl] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    setOngletUrl(new URLSearchParams(window.location.search).get("tab"));
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const cheminDe = (href: string) => href.split("?")[0];

  /**
   * Une entrée est active si le chemin correspond ET, lorsqu'elle porte une
   * requête, si cette requête correspond à celle de l'URL.
   *
   * Le cas inverse compte autant : l'entrée SANS requête
   * (`/bureau/fournisseurs`) doit devenir inerte dès que l'URL porte un
   * `?tab=`, sinon elle reste allumée en même temps que sa spécialisation.
   */
  const estActif = (href: string) => {
    const cible = cheminDe(href);
    // Comparaison bornée au séparateur : `/bureau/catalogue-terrasse` ne doit
    // PAS allumer `/bureau/catalogue`. Les pages détail restent couvertes
    // (`/bureau/clients/123` commence bien par `/bureau/clients/`).
    if (
      !(cible === "/"
        ? pathname === "/"
        : pathname === cible || pathname?.startsWith(`${cible}/`))
    )
      return false;

    const requeteHref = href.includes("?") ? href.slice(href.indexOf("?")) : "";
    if (!requeteHref) return ongletUrl === null;
    return ongletUrl === new URLSearchParams(requeteHref).get("tab");
  };

  // Un groupe est « courant » si l'une de ses entrées correspond au chemin.
  const groupeEstActif = (entree: EntreeNav) =>
    entree.children?.some((e) => estActif(e.href)) ?? estActif(entree.href ?? "");

  /**
   * Bascule un groupe : le nouvel état est l'inverse de l'état AFFICHÉ.
   *
   * `actuellementOuvert` est passé par l'appelant parce que l'état affiché
   * n'est pas toujours le choix mémorisé : un groupe sans choix explicite est
   * ouvert s'il est la catégorie courante. Basculer sur le choix mémorisé
   * (`!prec.get(label)`) rouvrirait donc cette catégorie au lieu de la
   * refermer — c'est-à-dire exactement le bug.
   */
  const basculerGroupe = (label: string, actuellementOuvert: boolean) => {
    setChoixGroupes((prec) => {
      const suivant = new Map(prec);
      suivant.set(label, !actuellementOuvert);
      return suivant;
    });
  };

  // Masquer le drawer sur l'espace client et la page de connexion
  if (pathname?.startsWith("/espace-client") || pathname === "/login") {
    return null;
  }

  return (
    <>
      {/* HAMBURGER BUTTON

          Carré visuel discret (`w-10 h-10` = 40 px) posé dans une zone
          tactile de 44 px (`min-h-11 min-w-11`) : le doigt vise 44 px, l'œil
          voit 40 px. L'icône passe de 20 à 17 px et le fond de `bg-white/15`
          à `bg-white/10` pour un remplissage plus léger. */}
      <button
        onClick={() => setOpen(true)}
        className="relative z-[200] min-h-11 min-w-11 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 transition-all"
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        aria-controls="bna-drawer"
      >
        <Menu size={17} className="text-white" />
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
        className={`fixed top-0 left-0 h-full w-[76vw] max-w-[300px] border-r border-white/[0.08] bg-[#1A1A1A] flex flex-col shadow-2xl transition-transform duration-300 z-[100] ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* DRAWER HEADER */}
        <div className="flex items-center justify-between px-5 pt-12 pb-5 border-b border-white/[0.06]">
          <div>
            <p className="text-white font-black text-[15px] tracking-tight">BNA Bardage</p>
            <p className="text-[#BDBDBD] text-3xs mt-0.5">Dashboard Pro</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.08] hover:bg-white/[0.12] transition-all"
            aria-label="Fermer le menu"
          >
            <X size={16} className="text-[#D0D0D0]" />
          </button>
        </div>

        {/* NAV LINKS */}
        <nav className="flex-1 px-3 pt-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            // Pour éviter les erreurs d'hydratation liées à usePathname()
            // (middleware, rewrites, etc.) on n'applique le style actif qu'une
            // fois le composant monté côté client, ou on utilise
            // suppressHydrationWarning pour tolérer les différences.
            const Icon = item.icon;

            // ── Feuille : entrée simple, sans groupe ────────────────────
            if (!item.children) {
              const active = (open || mounted) && estActif(item.href ?? "/");
              return (
                <Link
                  key={item.label}
                  href={item.href ?? "/"}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  suppressHydrationWarning
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-medium text-[14px] ${
                    active
                      ? "bg-[#B85B2B]/15 border border-[#B85B2B]/30 text-white"
                      : "text-[#BDBDBD] hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  <div
                    suppressHydrationWarning
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      active ? "bg-[#B85B2B]/20" : "bg-white/[0.05]"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={active ? "text-[#B85B2B]" : "text-[#D0D0D0]"}
                      strokeWidth={active ? 2.5 : 1.8}
                    />
                  </div>
                  <span suppressHydrationWarning className="flex-1">{item.label}</span>
                  {active && (
                    <div suppressHydrationWarning className="w-1.5 h-1.5 rounded-full bg-[#B85B2B] shrink-0" />
                  )}
                </Link>
              );
            }

            // ── Groupe : bouton d discloses + liste de second niveau ───
            const groupeActif = (open || mounted) && groupeEstActif(item);
            // Le groupe se déplie tout seul s'il est la catégorie courante :
            // sans cela, arriver par deep-link sur /bureau/clients laisserait
            // l'utilisateur devant un menu qui ne montre pas sa page.
            // `??` et pas `||` : c'est tout le correctif. `false` est une
            // fermeture demandée par l'utilisateur et doit être respecté ;
            // `undefined` signifie « aucun choix », et l'on suit alors la
            // catégorie courante, comme avant.
            const ouvert =
              (open || mounted) && (choixGroupes.get(item.label) ?? groupeActif);
            const ChildrenId = `bna-drawer-groupe-${item.label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")}`;

            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => basculerGroupe(item.label, ouvert)}
                  aria-expanded={ouvert}
                  aria-controls={ChildrenId}
                  suppressHydrationWarning
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-medium text-[14px] text-left ${
                    groupeActif
                      ? "bg-[#B85B2B]/15 border border-[#B85B2B]/30 text-white"
                      : "text-[#BDBDBD] hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  <div
                    suppressHydrationWarning
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      groupeActif ? "bg-[#B85B2B]/20" : "bg-white/[0.05]"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={groupeActif ? "text-[#B85B2B]" : "text-[#D0D0D0]"}
                      strokeWidth={groupeActif ? 2.5 : 1.8}
                    />
                  </div>
                  <span suppressHydrationWarning className="flex-1">{item.label}</span>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`shrink-0 transition-transform duration-200 ${
                      ouvert ? "rotate-180 text-[#BDBDBD]" : "text-[#BDBDBD]/60"
                    }`}
                  />
                </button>

                {ouvert && (
                  <ul id={ChildrenId} className="mt-1 mb-2 ml-4 pl-4 border-l border-white/[0.08] space-y-0.5">
                    {item.children.map((enfant) => {
                      const enfantActif =
                        (open || mounted) && estActif(enfant.href);
                      return (
                        <li key={enfant.href}>
                          <Link
                            href={enfant.href}
                            onClick={() => setOpen(false)}
                            aria-current={enfantActif ? "page" : undefined}
                            suppressHydrationWarning
                            className={`block py-2.5 px-3 rounded-xl transition-all text-[13px] ${
                              enfantActif
                                ? "bg-[#B85B2B]/15 text-white font-medium"
                                : "text-[#BDBDBD] hover:text-white hover:bg-white/[0.06]"
                            }`}
                          >
                            {enfant.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
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
              (open || mounted ? estActif("/parametres") : false)
                ? "bg-[#B85B2B]/15 border border-[#B85B2B]/30 text-white"
                : "text-[#BDBDBD] hover:text-white hover:bg-white/[0.06]"
             }`}
           >
             <div suppressHydrationWarning className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white/[0.05]">
               <Settings size={16} className={(open || mounted ? estActif("/parametres") : false) ? "text-[#ff5a5a]" : "text-white/60"} strokeWidth={1.8} />
             </div>
             <span suppressHydrationWarning>Parametres</span>
           </Link>
           <button
             onClick={handleLogout}
             className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-white/60 hover:text-white hover:bg-white/[0.06] transition-all font-medium text-[14px]"
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-white/[0.05]">
              <LogOut size={16} className="text-[#D0D0D0]" strokeWidth={1.8} />
            </div>
            <span>Deconnexion</span>
          </button>
          <p className="text-white/30 text-2xs text-center pt-3">© 2026 BNA Bardage</p>
        </div>
      </aside>
    </>
  );
}
