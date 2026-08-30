"use client";

import Link from "next/link";
import { Building2, HardHat, CircleDollarSign, Users } from "lucide-react";

export default function Home() {
  const currentDate = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  const formattedDate = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);

  return (
    <div className="min-h-screen">
      {/* 2. HEADER - LOGO GEANT */}
      <header className="bg-black mx-3 mt-3 rounded-[20px] h-[140px] flex items-center justify-center">
        <img src="/logo-bna.png" alt="BNA Bardage Nouvelle-Aquitaine" className="h-[110px] w-auto object-contain" />
      </header>

      {/* 3. TITRE */}
      <div className="px-6 pt-6">
        <h1 className="text-white text-[32px] font-black tracking-tight">Tableau de bord</h1>
        <p className="text-white/60 text-[14px] mt-1">Vue d'ensemble • {formattedDate}</p>
      </div>

      {/* 4. LES 4 CARTES - GLASSMORPHISM EXACT */}
      <div className="grid grid-cols-2 gap-4 p-4 mt-2">
        {/* CARTE 1 : Bureau d'études */}
        <Link href="/bureau" className="bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-[20px] p-5 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),transparent_60%)] hover:bg-white/[0.12] transition-all hover:-translate-y-1 block">
          <div className="w-14 h-14 bg-white/10 rounded-[14px] border border-white/10 flex items-center justify-center text-[#ff5a5a] text-2xl">
            <Building2 size={28} />
          </div>
          <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Bureau d'études</h2>
          <p className="text-white font-bold text-[15px] mt-2 leading-tight">12 Études actives</p>
          <p className="text-white/60 text-[13px] mt-1 leading-tight mb-4">3 en revue • 5 à valider</p>
          <span className="bg-[#22c55e]/20 border border-[#22c55e]/30 text-[#4ade80] rounded-full px-3 py-1 text-[11px] font-bold">
            +2 cette semaine
          </span>
        </Link>

        {/* CARTE 2 : Terrain & Chantier */}
        <Link href="/terrain" className="bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-[20px] p-5 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),transparent_60%)] hover:bg-white/[0.12] transition-all hover:-translate-y-1 block">
          <div className="w-14 h-14 bg-white/10 rounded-[14px] border border-white/10 flex items-center justify-center text-[#ff5a5a] text-2xl">
            <HardHat size={28} />
          </div>
          <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Terrain & Chantier</h2>
          <p className="text-white font-bold text-[15px] mt-2 leading-tight">8 Chantiers en cours</p>
          
          <div className="mt-2 mb-1">
            <div className="flex justify-between text-[11px] text-white/80 font-bold mb-1">
              <span>Avancement</span>
              <span>76%</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#E30613] rounded-full" style={{ width: '76%' }}></div>
            </div>
          </div>
          
          <p className="text-white/60 text-[11px] mt-2 leading-tight">7 ouvriers mobilisés</p>
        </Link>

        {/* CARTE 3 : Finance & Pilotage */}
        <Link href="/finance" className="bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-[20px] p-5 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),transparent_60%)] hover:bg-white/[0.12] transition-all hover:-translate-y-1 block col-span-2">
          <div className="flex justify-between items-start">
            <div className="w-14 h-14 bg-white/10 rounded-[14px] border border-white/10 flex items-center justify-center text-[#ff5a5a] text-2xl">
              <CircleDollarSign size={28} />
            </div>
            <span className="bg-[#22c55e]/20 border border-[#22c55e]/30 text-[#4ade80] rounded-full px-3 py-1 text-[11px] font-bold">
              +8,2% vs prévisionnel
            </span>
          </div>
          <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Finance & Pilotage</h2>
          <p className="text-white font-bold text-[24px] mt-1 leading-tight">Budget 1,24 M€</p>
          <div className="flex gap-4 mt-3">
            <p className="text-white/60 text-[13px] leading-tight"><span className="text-white font-semibold">Dépensé:</span> 842 k€</p>
            <p className="text-white/60 text-[13px] leading-tight"><span className="text-white font-semibold">Restant:</span> 398 k€</p>
          </div>
        </Link>

        {/* CARTE 4 : Espace Client */}
        <Link href="/bureau/portails-clients" className="bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] rounded-[20px] p-5 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),transparent_60%)] hover:bg-white/[0.12] transition-all hover:-translate-y-1 block col-span-2 mb-8">
          <div className="flex justify-between items-start">
            <div className="w-14 h-14 bg-white/10 rounded-[14px] border border-white/10 flex items-center justify-center text-[#ff5a5a] text-2xl">
              <Users size={28} />
            </div>
            <span className="bg-[#E30613]/20 border border-[#E30613]/30 text-[#ff5a5a] rounded-full px-3 py-1 text-[11px] font-bold">
              2 nouveaux
            </span>
          </div>
          <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Espace Client</h2>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-white font-bold text-[18px] mt-1 leading-tight">14 Clients actifs</p>
              <p className="text-white/60 text-[13px] mt-1 leading-tight">4 demandes récentes</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
