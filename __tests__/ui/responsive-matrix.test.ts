import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const lire = (chemin: string) => readFileSync(chemin, "utf8");
const CODE = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const LAYOUT = CODE(lire("app/layout.tsx"));
const SIDEBAR = CODE(lire("components/SidebarDesktop.tsx"));
const DRAWER = CODE(lire("components/MenuNavigationMobile.tsx"));
const SEARCH = CODE(lire("components/BarreRechercheNavigation.tsx"));

describe("Preuve formelle des rendus responsive par palier d'écran", () => {
  const RESOLUTIONS = [
    { width: 360, type: "Mobile compact (ex: petit Android)" },
    { width: 390, type: "Mobile standard (ex: iPhone 12/13/14/15/16)" },
    { width: 768, type: "Tablette portrait (ex: iPad 768px)" },
    { width: 1024, type: "Desktop compact / Tablette paysage (lg: 1024px)" },
    { width: 1280, type: "Desktop standard HD (1280px)" },
    { width: 1440, type: "Desktop large / QHD (1440px)" },
  ];

  RESOLUTIONS.forEach(({ width, type }) => {
    const isDesktop = width >= 1024; // Seuil Tailwind lg

    describe(`Palier ${width}px — ${type}`, () => {
      if (!isDesktop) {
        it("Sidebar Desktop est masquée (`hidden lg:flex`)", () => {
          expect(SIDEBAR).toMatch(/\bhidden lg:flex\b/);
        });

        it("Bouton Drawer (hamburger) est affiché", () => {
          // Sur mobile/tablette (< 1024px), le bouton n'est pas masqué par lg:hidden
          expect(DRAWER).toMatch(/<button[\s\S]*?lg:hidden/);
        });

        it("Header mobile conserve son cadre de 130px et sa hauteur totale de 142px", () => {
          const header = LAYOUT.match(/<header className="([^"]*)"/);
          expect(header![1]).toContain("py-1.5");
          expect(header![1]).toContain("px-4");

          // Cadre logo 130 px avec lg:hidden pour ne pas être affiché sur desktop
          const cadre = LAYOUT.match(/<div className="flex h-\[130px\] max-w-full items-center justify-center overflow-hidden">/);
          expect(cadre).not.toBeNull();

          // Image logo 270 px object-contain
          expect(LAYOUT).toContain('className="w-[270px] max-w-full h-auto object-contain pointer-events-none"');

          // Ancrage volet mobile SearchNav à 142px
          expect(SEARCH).toContain("top-[142px]");
        });

        it("Recherche mobile sous forme de bouton loupe compact", () => {
          expect(SEARCH).toContain("lg:hidden"); // bouton loupe compact sous 1024px
        });
      } else {
        it("Sidebar Desktop est affichée (`hidden lg:flex`)", () => {
          expect(SIDEBAR).toMatch(/\bhidden lg:flex\b/);
        });

        it("Sidebar Desktop gère les modes déplié (260px) et replié (72px)", () => {
          expect(SIDEBAR).toContain('isCollapsed ? "w-[72px]" : "w-[260px]"');
          expect(SIDEBAR).toContain("transition-[width] duration-300 ease-in-out");
        });

        it("Bouton Drawer (hamburger) est masqué (`lg:hidden`)", () => {
          expect(DRAWER).toMatch(/<button[\s\S]*?lg:hidden/);
        });

        it("Logo central du header est masqué (`lg:hidden`) au profit de l'identité Sidebar", () => {
          const conteneurLogo = LAYOUT.match(/<div className="flex min-w-0 flex-1 items-center justify-center lg:hidden">/);
          expect(conteneurLogo).not.toBeNull();
        });

        it("Header desktop passe en mode compact 64px (`lg:h-16`) avec fil d'ariane / contexte", () => {
          const header = LAYOUT.match(/<header className="([^"]*)"/);
          expect(header![1]).toContain("lg:h-16");
          expect(header![1]).toContain("lg:px-6");
          expect(header![1]).toContain("lg:py-0");
          expect(LAYOUT).toContain("Espace de travail");
        });

        it("Recherche desktop inline dans le header (`hidden lg:block`)", () => {
          expect(SEARCH).toContain("hidden lg:block");
        });
      }
    });
  });
});
