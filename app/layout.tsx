import Image from "next/image";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Drawer from "@/components/Drawer";
import SearchNav from "@/components/SearchNav";
import RegisterSW from "@/components/RegisterSW";
import InactivityLogout from "@/components/InactivityLogout";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BNA Bardage — Dashboard",
  description: "Pilotage chantiers, devis et facturation — BNA Bardage",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
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
      <body className="bg-[#121212] min-h-screen text-gray-300 antialiased selection:bg-[#E53935]/30 selection:text-red-200 flex flex-col">
        <a href="#main-content-wrapper" className="skip-link">Aller au contenu principal</a>
        <RegisterSW />
        <InactivityLogout />
        <header className="bg-[#1E1E1E] relative z-[9999] h-[120px] overflow-hidden flex items-center justify-between px-5 border-b border-white/5 shadow-lg m-4 rounded-[22px]">
          <Drawer />
          <div className="flex-1 flex justify-center items-center">
            <Image
              src="/logo-bna.png"
              alt="BNA Bardage"
              width={400}
              height={200}
              className="size-48 object-contain pointer-events-none"
            />
          </div>
          <SearchNav />
        </header>
        {/* FOND GLOBAL DU DASHBOARD — page #121212 (sur `<body>`) + reflet rouge BNA.

            Ce halo était un `div` local à `app/page.tsx` : il n'existait que sur
            `/`, et l'ouverture de n'importe quelle catégorie du Drawer
            (`/bureau/**`, `/terrain/**`, `(dashboard)/**`) faisait retomber le fond
            sur un noir uniforme. Il est ici, sur le `<main>` partagé, parce que
            `<main>` est le seul conteneur présent sur TOUTES les pages du
            dashboard : le reflet devient global sans être dupliqué nulle part.

            Porté par `background-image` plutôt que par un `div` en positionnement
            absolu, pour trois raisons :
              · une couche de fond peint AVANT tous les descendants, donc jamais
                par-dessus une carte. Un `div` en `z-0` peint, lui, au-dessus des
                fonds de blocs non positionnés : il aurait voilé toutes les cartes
                des pages qui n'emballent pas leur contenu dans un `relative z-10`.
              · aucun nœud DOM ajouté — ni structure, ni z-index, ni `pointer-events`
                à arbitrer : une couche de fond ne peut pas intercepter un clic.
              · géométrie identique à l'ancien `div` (`top-0 inset-x-0 h-[380px]`) :
                `100% 380px` + `no-repeat` + `top` redessinent la même ellipse au
                même endroit.

            Rouge passé de l'ancien `rgba(227,6,19,…)` (= #E30613, échappé à la
            migration de palette car écrit en `rgba()` et non en hex) au rouge de la
            charte `#E53935`, à l'opacité 0.15 inchangée : le reflet reste aussi
            subtil qu'avant. */}
        <main
          id="main-content-wrapper"
          className="mt-4 flex-1 relative z-10 w-full overflow-x-hidden pb-12 bg-[radial-gradient(ellipse_at_top,rgba(229,57,53,0.15),transparent_60%)] bg-size-[100%_380px] bg-no-repeat bg-top"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
