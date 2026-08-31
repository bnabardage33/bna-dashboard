import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Drawer from "@/components/Drawer";
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
    icon: "/logo-bna.png",
    apple: "/logo-bna.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0F19",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} h-full`}>
      <body className="bg-[#0B0F19] min-h-screen text-gray-300 antialiased selection:bg-[#E30613]/30 selection:text-red-200 flex flex-col">
        <RegisterSW />
        <InactivityLogout />
        <header style={{ backgroundColor: '#1A1D24', position: 'relative', margin: '16px 16px 0 16px', zIndex: 9999, height: '120px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderRadius: '22px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <Drawer />
          <img
            src="/logo-bna.png"
            alt="BNA Bardage"
            style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', height: '200px', width: 'auto', maxWidth: '400px', objectFit: 'contain', pointerEvents: 'none' }}
          />
          <div style={{ width: '40px' }} />
        </header>
        <main id="main-content-wrapper" style={{ marginTop: '16px' }} className="flex-1 relative z-10 w-full overflow-x-hidden pb-12">
          {children}
        </main>
      </body>
    </html>
  );
}
