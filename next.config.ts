import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. Autorise l'affichage des images/photos de chantiers stockées sur ton Supabase
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  
  // 2. Active les nouvelles fonctionnalités de performance de la v16.3
  experimental: {
    // Active le nouveau système stable de composants de cache ('use cache')
    cacheComponents: true,
  }
};

export default nextConfig;
