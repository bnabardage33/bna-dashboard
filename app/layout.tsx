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
      {/* Le fond `#121212` ET le reflet rouge vivent sur le `<body>` : c'est le
          seul conteneur qui englobe aussi le header, donc le reflet part du
          tout-haut de la page et passe derrière le logo. Motivation détaillée
          dans le commentaire situé plus bas, au-dessus de `<main>`. */}
      <body className="bg-[#121212] min-h-screen text-gray-300 antialiased selection:bg-[#E53935]/30 selection:text-red-200 flex flex-col bg-[radial-gradient(ellipse_at_top,rgba(229,57,53,0.15),transparent_60%)] bg-size-[100%_380px] bg-no-repeat bg-top">
        <a href="#main-content-wrapper" className="skip-link">Aller au contenu principal</a>
        <RegisterSW />
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
        <header className="relative z-[9999] flex w-full items-center justify-between gap-3 px-4 py-1.5">
          <Drawer />
          <div className="flex min-w-0 flex-1 items-center justify-center">
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
                className="w-[180px] max-w-full h-auto object-contain pointer-events-none"
              />
            </div>
          </div>
          <SearchNav />
        </header>
        {/* FOND GLOBAL DU DASHBOARD — page #121212 (sur `<body>`) + reflet rouge BNA.

            Le reflet est porté par `background-image` plutôt que par un `div` en
            positionnement absolu, pour trois raisons :
              · une couche de fond peint AVANT tous les descendants, donc jamais
                par-dessus une carte. Un `div` en `z-0` peint, lui, au-dessus des
                fonds de blocs non positionnés : il aurait voilé toutes les cartes
                des pages qui n'emballent pas leur contenu dans un `relative z-10`.
              · aucun nœud DOM ajouté — ni structure, ni z-index, ni `pointer-events`
                à arbitrer : une couche de fond ne peut pas intercepter un clic.
              · géométrie identique à l'ancien `div` (`top-0 inset-x-0 h-[380px]`) :
                `100% 380px` + `no-repeat` + `top` redessinent la même ellipse au
                même endroit.

            PORTÉ PAR LE `<body>` ET PLUS PAR LE `<main>` :
            tant qu'il n'y avait que `<main>`, la bande située AU-DESSUS (le
            header, le logo) restait sur le noir brut `#121212` : une limite
            noire nette séparait le logo du contenu, et le fond général ne se
            prolongeait pas derrière lui. `<body>` englobe aussi le header : le
            reflet part maintenant du tout-haut de la page et couvre le logo, sans
            barre ni conteneur supplémentaire. Aucun autre élément n'a bougé —
            `<main>` conserve ses classes d'origine, seul le fond rouge a monté.

            Rouge passé de l'ancien `rgba(227,6,19,…)` (= #E30613, échappé à la
            migration de palette car écrit en `rgba()` et non en hex) au rouge de la
            charte `#E53935`, à l'opacité 0.15 inchangée : le reflet reste aussi
            subtil qu'avant. */}
        <main
          id="main-content-wrapper"
          className="mt-4 flex-1 relative z-10 w-full overflow-x-hidden pb-12"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
