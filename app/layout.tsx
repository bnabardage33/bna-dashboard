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
        <header className="bg-[#1A1D24] relative z-[9999] h-[120px] overflow-hidden flex items-center justify-between px-5 border-b border-white/5 shadow-lg m-4 rounded-[22px]">
          <Drawer />
          <div className="flex-1"></div>
          <Image
            src="/logo-bna.png"
            alt="BNA Bardage"
            width={400}
            height={200}
            className="absolute left-1/2 -translate-x-1/2 h-[200px] w-auto max-w-[400px] object-contain pointer-events-none"
          />
          <SearchNav />
        </header>
        <main id="main-content-wrapper" className="mt-4 flex-1 relative z-10 w-full overflow-x-hidden pb-12">
          {children}
        </main>
      </body>
    </html>
  );
}
