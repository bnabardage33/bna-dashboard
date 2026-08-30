import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BNA Bardage — Dashboard",
  description: "Pilotage chantiers, devis et facturation — BNA Bardage",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} h-full`}>
      <body className="bg-[#0a0e1a] min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(120,20,0.35),transparent_50%),radial-gradient(ellipse_at_bottom,_rgba(227,6,19,0.08),transparent_60%)] text-slate-100 antialiased selection:bg-red-500/30 selection:text-red-200">
        <TopNav />
        <main className="pb-[100px]">{children}</main>
        <Suspense fallback={null}>
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
