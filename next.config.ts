import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async redirects() {
    return [
      // ── Redirections issues de pages devenues vides (PHASE 2) ────────────
      //
      // Ces trois écrans ne faisaient que « Cette section est en cours de
      // construction » et n'avaient aucune référence entrante. Ils ont été
      // convertis en `redirect()` dans leurs fichiers ; les redirections
      // ci-dessous couvrent le cas où la route est atteinte avant
      // le rendu de la page (ou par un lien externe en cache).
      {
        source: "/bureau-etudes",
        destination: "/bureau/clients",
        permanent: true,
      },
      {
        source: "/chantiers",
        destination: "/terrain/chantier",
        permanent: true,
      },
      {
        source: "/boite-a-outils",
        destination: "/terrain/outils",
        permanent: true,
      },
      // ── Météo : deux entrées distinctes (restauration) ──────────────────
      //
      // `/terrain/meteo` a été restaurée en page complète (météo générale :
      // recherche de ville, matin/après-midi, heure par heure, J+1 à J+4).
      // Aucune redirection ne doit la re-diriger vers `/bureau/meteo`, qui
      // porte la veille des intempéries : ce sont deux fonctions
      // complémentaires, chacune avec son entrée dans le Drawer.
      // L'index `/terrain` ouvrait l'ancien cockpit météo ; il redirige
      // désormais vers la liste des chantiers (logique et cohérente avec
      // le nouveau Drawer).
      {
        source: "/terrain",
        destination: "/terrain/chantier",
        permanent: true,
      },
      // ── Index `/bureau` (ancien cockpit) ─────────────────────────────────
      //
      // `/bureau` était la page d'accueil du BureauNav (cockpit doublon). Le
      // concept « Bureau » disparaît de la navigation principale : l'accueil
      // unique est `/`. On renvoie `/bureau` vers l'accueil général. Les
      // fonctionnalités utiles ont été reprises dans l'Accueil.
      {
        source: "/bureau",
        destination: "/",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/dashboard/calepinage",
        destination: "/calepinage",
      },
      {
        source: "/dashboard/calepinage/:path*",
        destination: "/calepinage/:path*",
      },
    ];
  },
};

export default nextConfig;
