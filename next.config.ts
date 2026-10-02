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
      // ── Météo : fusion vers /bureau/meteo (PHASE 2) ────────────────────
      //
      // Le bloc impact météo est remonté sur l'Accueil. L'entrée unique
      // « Météo & intempéries » du Drawer pointe sur `/bureau/meteo`. On
      // redirige donc l'ancienne route `/terrain/meteo` vers sa nouvelle
      // destination, pour préserver les favoris et liens éventuels.
      {
        source: "/terrain/meteo",
        destination: "/bureau/meteo",
        permanent: true,
      },
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
};

export default nextConfig;
