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
      <body className="min-h-full bg-slate-900 text-slate-100 antialiased selection:bg-sky-500/30 selection:text-sky-200">
        <TopNav />
        <main className="pb-28">{children}</main>
        <Suspense
          fallback={null}
        >
          <BottomNav />
        </Suspense>
      </body>
    </html>
  );
}
