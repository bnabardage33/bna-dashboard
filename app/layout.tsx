import Image from "next/image";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Drawer from "@/components/MenuNavigationMobile";
import SearchNav from "@/components/BarreRechercheNavigation";
import EnregistrementServiceWorker from "@/components/EnregistrementServiceWorker";
import InactivityLogout from "@/components/DeconnexionInactivite";
import SidebarDesktop from "@/components/SidebarDesktop";
import HeaderContextTitle from "@/components/HeaderContextTitle";
import MobileBottomNav from "@/components/MobileBottomNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BNA Bardage — Dashboard",
  description: "Pilotage chantiers, devis et facturation — BNA Bardage",
  manifest: "/manifest.json?v=2",
  icons: {
    icon: [
      { url: "/favicon.ico?v=2" },
      { url: "/favicon-32x32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png?v=2", sizes: "96x96", type: "image/png" },
      { url: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#121212",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} h-full`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      {/* Le fond `#121212` ET le reflet rouge vivent sur le `<body>` : c'est le
          seul conteneur qui englobe aussi le header, donc le reflet part du
          tout-haut de la page et passe derrière le logo. Motivation détaillée
          dans le commentaire situé plus bas, au-dessus de `<main>`. */}
      <body className="bg-[#121212] min-h-screen text-gray-300 antialiased selection:bg-[#B85B2B]/30 selection:text-red-200 flex flex-col bg-[radial-gradient(ellipse_at_top,rgba(184,91,43,0.15),transparent_60%)] bg-size-[100%_380px] bg-no-repeat bg-top">
        <a href="#main-content-wrapper" className="skip-link">Aller au contenu principal</a>
        <EnregistrementServiceWorker />
        <InactivityLogout />
        {/* ── HEADER FLEXBOX — UNE SEULE LIGNE ───────────────────────────

            Un conteneur flex unique (`<header>`) porte les trois éléments sur
            UNE seule ligne, alignés verticalement au centre :
              · le bouton menu (hamburger) à GAUCHE ;
              · le logo BNA AU CENTRE (`flex-1` + `justify-center`, ce qui le
                recentre même si le menu et la cloche n'ont pas la même largeur) ;
              · la cloche de notification à DROITE.
            `justify-between` + `align-items:center` + `width:100%` +
            `padding:6px 16px` (`py-1.5 px-4`) : le padding vertical est réduit
            de 10 px à 6 px pour remonter le header et rapprocher le contenu.
            C'est la limite basse raisonnable — en dessous, la zone tactile de
            44 px du hamburger (40 px visuels) et de la cloche (36 px visuels)
            serait rognée par le bord du header.

            RÉDUIRE LA HAUTEUR SANS RÉDUIRE LE LOGO.
            Le PNG source est un carré 500 x 500 dont le dessin n'occupe que la
            bande y=121..361. À 180 px de large, l'échelle vaut 180/500 = 0,36 :
              · encre visible : 241 x 0,36 = 86,76 px de haut seulement ;
              · vide au-dessus : 121 x 0,36 = 43,56 px ;
              · vide en dessous : 138 x 0,36 = 49,68 px.
            Le logo payait donc 180 px de hauteur pour 87 px de dessin.

            On ne touche NI au PNG, NI au ratio, NI à la largeur : le cadre
            ci-dessous ne fait que 130 px de haut (`h-[130px]`) et masque
            uniquement du vide (`overflow-hidden`). L'image reste rendue à sa
            taille pleine de 180 px — `max-w-full h-auto` conserve le ratio,
            aucun `object-fill` — et le cadre rogne 25 px de vide en haut et
            25 px en bas, parfaitement symétriques (`items-center`).

            Vérification : l'encre occupe y=18,6 à y=105,0 dans un cadre de
            130 px, soit 19 px de marge en haut et 25 px en bas. AUCUN pixel
            opaque n'est coupé — la marge restante (25 px) est très supérieure
            à l'incertitude de mesure (1 px d'anti-aliasing). Un cadre plus
            serré (< 112 px) commencerait à mordre sur le dessin : 130 px laisse
            volontairement une réserve.

            Le logo descend ainsi de 50 px et le header de 192 px à 142 px,
            sans qu'un seul pixel du dessin ne disparaisse.

            `max-w-full` reste actif sur les écrans très étroits : sous ~280 px
            le logo rétrécit au lieu de venir recouvrir le menu ou la cloche.

            Le reflet rouge du fond ne s'arrête PLUS sous le header : il est
            porté par le `<body>` (voir plus bas) et file donc jusque derrière
            le logo. Il n'y a donc plus de bande noire `#121212` au-dessus du
            contenu.

            Le header reste `relative` ET en flux normal : il ne recouvre
            jamais le contenu, ce que verrouille
            `__tests__/ui/terrain-espace-vertical.test.ts`. */}
        {/* ── STRUCTURE RESPONSIVE PRINCIPALE (Sidebar Desktop + Colonne Contenu) ── */}
        <div className="flex-1 flex w-full min-h-screen">
          {/* Barre latérale visible sur grand écran (≥ 1024px) */}
          <SidebarDesktop />

          <div className="flex-1 flex flex-col min-w-0 w-full">
            {/* Header unifié responsive :
                - Mobile / Tablette (< 1024px) : 142 px, logo centré dans cadre 130 px, hamburger et cloche
                - Desktop (≥ 1024px) : 64 px compact (h-16), titre espace de travail, recherche inline et cloche */}
            <header className="relative z-40 flex w-full items-center justify-between gap-3 px-4 py-1.5 lg:h-16 lg:px-6 lg:py-0 lg:border-b lg:border-white/[0.06] lg:bg-[#121212]/50 lg:backdrop-blur-sm">
              <Drawer />
              <div className="flex min-w-0 flex-1 items-center justify-center lg:hidden">
                {/* Cadre de 130 px : borne la HAUTEUR réservée au logo sans
                    contraindre sa largeur. L'image de 180 px le dépasse de 25 px
                    en haut et en bas ; ce qui dépasse est du vide transparent, que
                    `overflow-hidden` masque. Le dessin reste donc entier. */}
                <div className="flex h-[130px] max-w-full items-center justify-center overflow-hidden">
                  <Image
                    src="/logo-bna.png"
                    alt="BNA Bardage"
                    width={500}
                    height={500}
                    className="w-[270px] max-w-full h-auto object-contain pointer-events-none"
                  />
                </div>
              </div>

              {/* Titre / contexte de travail sur grand écran (≥ 1024px) */}
              <div className="hidden lg:flex items-center gap-3 flex-1 min-w-0">
                <Image
                  src="/logo-bna.png"
                  alt="BNA Bardage"
                  width={140}
                  height={36}
                  className="h-7 w-auto object-contain shrink-0 pointer-events-none"
                />
                <span className="h-4 w-px bg-white/10 shrink-0" aria-hidden="true" />
                <HeaderContextTitle />
              </div>

              <SearchNav />
            </header>

            <main
              id="main-content-wrapper"
              className="mt-4 flex-1 relative z-10 w-full overflow-x-hidden pb-20 md:pb-12"
            >
              {children}
            </main>
          </div>
        </div>
        <MobileBottomNav />
      </body>
    </html>
  );
}
