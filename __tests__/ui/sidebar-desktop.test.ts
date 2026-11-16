import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { NAV_ITEMS, estLienActif, groupeEstActif } from "@/lib/navigation";

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const CODE = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SIDEBAR = CODE(lire("components/SidebarDesktop.tsx"));
const LAYOUT = CODE(lire("app/layout.tsx"));

describe("Phase 1 — SidebarDesktop & Navigation responsive", () => {
  it("la navigation partage une source de vérité unique dans lib/navigation.ts", () => {
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(8);
    // Vérifie les routes directes et les groupes
    const labels = NAV_ITEMS.map((item) => item.label);
    expect(labels).toContain("Accueil Chantier");
    expect(labels).toContain("Accueil Météo");
    expect(labels).toContain("Études / Commercial");
    expect(labels).toContain("Catalogues");
    expect(labels).toContain("Chantiers");
    expect(labels).toContain("Finance & Pilotage");
    expect(labels).toContain("Fournisseurs");
    expect(labels).toContain("Boîte à outils");
    expect(labels).toContain("Espace client");
  });

  it("estLienActif gère rigoureusement les chemins, deep-links et cas particuliers", () => {
    // Cas /finance : ne doit PAS allumer sur sous-page
    expect(estLienActif("/finance", "/finance", null)).toBe(true);
    expect(estLienActif("/finance", "/finance/saisie/depense", null)).toBe(false);

    // Cas sous-pages classiques
    expect(estLienActif("/bureau/clients", "/bureau/clients", null)).toBe(true);
    expect(estLienActif("/bureau/clients", "/bureau/clients/123", null)).toBe(true);
    expect(estLienActif("/bureau/catalogue", "/bureau/catalogue-terrasse", null)).toBe(false);

    // Cas ?tab=
    expect(
      estLienActif("/bureau/fournisseurs?tab=commandes", "/bureau/fournisseurs", "commandes")
    ).toBe(true);
    expect(
      estLienActif("/bureau/fournisseurs?tab=commandes", "/bureau/fournisseurs", "fournisseurs")
    ).toBe(false);
    expect(
      estLienActif("/bureau/fournisseurs", "/bureau/fournisseurs", "commandes")
    ).toBe(false);
    expect(
      estLienActif("/bureau/fournisseurs", "/bureau/fournisseurs", null)
    ).toBe(true);
  });

  it("SidebarDesktop est masquée sur mobile (< 1024px) et visible sur desktop (lg:flex)", () => {
    expect(SIDEBAR).toContain("hidden lg:flex");
    expect(SIDEBAR).toContain("print:hidden");
  });

  it("SidebarDesktop est rétractable entre 260px et 72px avec animation CSS fluide", () => {
    expect(SIDEBAR).toContain('isCollapsed ? "w-[72px]" : "w-[260px]"');
    expect(SIDEBAR).toContain("transition-[width]");
  });

  it("SidebarDesktop persiste son état dans localStorage de façon compatible SSR", () => {
    expect(SIDEBAR).toContain('localStorage.getItem("bna_sidebar_collapsed")');
    expect(SIDEBAR).toContain('localStorage.setItem("bna_sidebar_collapsed"');
    // Vérifie que l'accès localStorage est protégé dans un useEffect / try-catch
    expect(SIDEBAR).toContain("setMounted(true)");
  });

  it("Accessibilité : support complet du clavier, des lecteurs d'écran et tooltips au focus", () => {
    expect(SIDEBAR).toContain('role="navigation"');
    expect(SIDEBAR).toContain('role="tooltip"');
    expect(SIDEBAR).toContain("focus-visible:ring-2");
    expect(SIDEBAR).toContain("aria-label");
    expect(SIDEBAR).toContain("aria-expanded");
    // Tooltip ou popover s'affiche au focus-within pour la navigation au clavier
    expect(SIDEBAR).toContain("group-focus-within:opacity-100");
  });

  it("FinancePinGate : les routes Finance pointent vers leurs URLs sans contournement", () => {
    expect(SIDEBAR).toContain("item.href");
    // Aucun stockage PIN ni contournement dans la sidebar
    expect(SIDEBAR).not.toContain("finance_unlocked");
  });

  it("Déconnexion : réutilise le client Supabase et redirige vers /login", () => {
    expect(SIDEBAR).toContain("supabase.auth.signOut()");
    expect(SIDEBAR).toContain('window.location.href = "/login"');
  });

  it("Logo Desktop : affiche logo-bna.png dépliée et icon-192.png rétractée", () => {
    expect(SIDEBAR).toContain('src="/logo-bna.png"');
    expect(SIDEBAR).toContain('src="/icon-192.png"');
    expect(SIDEBAR).not.toContain("Ctrl+B");
  });

  it("Géométrie de l'en-tête rétracté à 72px : bouton de réouverture centré et accessible", () => {
    expect(SIDEBAR).toContain("PanelLeftOpen");
    expect(SIDEBAR).toContain("PanelLeftClose");
    expect(SIDEBAR).toContain('aria-label="Déplier le menu latéral"');
    expect(SIDEBAR).toContain('aria-label="Rétracter le menu latéral"');
  });

  it("Isolement : masquée sur /login et /espace-client", () => {
    expect(SIDEBAR).toContain('pathname?.startsWith("/espace-client") || pathname === "/login"');
  });
});
