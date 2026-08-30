import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Drawer from "@/components/Drawer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BNA Bardage — Dashboard",
  description: "Pilotage chantiers, devis et facturation — BNA Bardage",
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
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#1A1D24]/90 backdrop-blur-md rounded-[22px] mx-4 mt-4 h-[80px] flex items-center justify-between px-5 border border-white/5 shadow-lg">
          <Drawer />
          <img src="/logo-bna.png" alt="BNA Bardage" className="absolute left-1/2 -translate-x-1/2 h-12 w-auto object-contain pointer-events-none" />
          <div className="w-10" />
        </header>
        <main id="main-content-wrapper" className="flex-1 relative z-10 w-full overflow-x-hidden pt-32 pb-12">
          {children}
        </main>
      </body>
    </html>
  );
}
