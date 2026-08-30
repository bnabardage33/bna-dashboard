"use client";

import Link from "next/link";
import { Building2, HardHat, CircleDollarSign, Users } from "lucide-react";
import Drawer from "@/components/Drawer";

export default function Home() {
  const currentDate = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  const formattedDate = currentDate.charAt(0).toUpperCase() + currentDate.slice(1);

  return (
    <div className="relative overflow-hidden w-full">
      {/* GLOW doit être en z-0 derrière tout */}
      <div className="absolute top-0 inset-x-0 h-[380px] bg-[radial-gradient(ellipse_at_top,_rgba(120,20,20,0.28),transparent_60%)] pointer-events-none z-0" />
      
      {/* HEADER en z-10 par dessus */}
      <header className="relative z-10 bg-black rounded-[22px] mx-4 mt-4 h-[145px] flex items-center justify-between px-5 border border-white/5 overflow-hidden">
        <Drawer />
        <img src="/logo-bna.png" alt="BNA Bardage" className="absolute left-1/2 -translate-x-1/2 h-auto max-h-[115px] w-[90%] object-contain scale-[2.2] pointer-events-none" />
        {/* Spacer pour équilibrer le bouton de gauche */}
        <div className="w-10" />
      </header>

      {/* TITRE & MAIN CONTENT */}
      <main className="relative z-10 px-4 pt-6 pb-[20px]">
        <h1 className="text-white text-[30px] font-black">Tableau de bord</h1>
        <p className="text-white/60 text-sm">Vue d'ensemble • {formattedDate}</p>
        
        {/* LES 4 CARTES */}
        <div className="grid grid-cols-2 gap-4 mt-5">
          {/* CARTE 1 : Bureau d'études */}
          <Link href="/bureau" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-3xl p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 flex flex-col items-center text-center min-h-[220px]">
            <div className="relative mb-3 shrink-0">
              <div className="absolute -inset-3 bg-[#ff5a5a]/30 blur-2xl rounded-full z-0" />
              <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center relative z-10">
                <Building2 strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
              </div>
            </div>
            <h2 className="font-bold text-white text-[16px] leading-tight mt-1">Bureau d'études</h2>
            <p className="text-white font-bold text-[18px] mt-1 leading-tight">12 Études</p>
            <p className="text-white/60 text-[12px] mt-1 leading-tight flex-1">3 en revue • 5 valider</p>
            <div className="mt-auto w-full pt-2">
              <span className="bg-white/10 text-white/70 border border-white/10 rounded-full px-2.5 py-1 text-[10px] font-bold inline-block">
                +2 cette semaine
              </span>
            </div>
          </Link>

          {/* CARTE 2 : Terrain & Chantier */}
          <Link href="/terrain/chantier" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-3xl p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 flex flex-col items-center text-center min-h-[220px]">
            <div className="relative mb-3 shrink-0">
              <div className="absolute -inset-3 bg-[#ff5a5a]/30 blur-2xl rounded-full z-0" />
              <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center relative z-10">
                <HardHat strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
              </div>
            </div>
            <h2 className="font-bold text-white text-[16px] leading-tight mt-1">Terrain & Chantier</h2>
            <p className="text-white font-bold text-[18px] mt-1 leading-tight">8 Chantiers</p>
            
            <div className="mt-auto pt-2 w-full text-left">
              <div className="flex justify-between text-[11px] text-white/80 font-bold mb-1.5">
                <span>Avancement</span>
                <span>76%</span>
              </div>
              <div className="h-1.5 w-full bg-[rgba(255,255,255,0.07)] border border-white/10 rounded-full overflow-hidden mb-1">
                <div className="h-full bg-[#ff5a5a] rounded-full" style={{ width: '76%' }}></div>
              </div>
              <p className="text-white/60 text-[10px] leading-tight mt-1 text-center">7 ouvriers mobilisés</p>
            </div>
          </Link>

          {/* CARTE 3 : Finance & Pilotage */}
          <Link href="/finance" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-3xl p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 flex flex-col items-center text-center min-h-[220px]">
            <div className="relative mb-3 shrink-0">
              <div className="absolute -inset-3 bg-[#ff5a5a]/30 blur-2xl rounded-full z-0" />
              <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center relative z-10">
                <CircleDollarSign strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
              </div>
            </div>
            <h2 className="font-bold text-white text-[16px] leading-tight mt-1">Finance & Pilotage</h2>
            <p className="text-white font-bold text-[18px] mt-1 leading-tight">Budget 1,24M€</p>
            
            <div className="flex flex-col gap-1 mt-1 mb-2 w-full text-center flex-1">
              <p className="text-white/60 text-[11px] leading-tight"><span className="text-white font-semibold">Dépense:</span> 842 k€</p>
              <p className="text-white/60 text-[11px] leading-tight"><span className="text-white font-semibold">Reste:</span> 398 k€</p>
            </div>
            
            <div className="mt-auto w-full pt-2">
              <span className="bg-[#00d08a]/15 text-[#6ee7b7] border border-[#00d08a]/20 rounded-full px-2.5 py-1 text-[10px] font-bold inline-block">
                +8,2% vs prév
              </span>
            </div>
          </Link>

          {/* CARTE 4 : Espace Client */}
          <Link href="/bureau/portails-clients" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-3xl p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 flex flex-col items-center text-center min-h-[220px]">
            <div className="relative mb-3 shrink-0">
              <div className="absolute -inset-3 bg-[#ff5a5a]/30 blur-2xl rounded-full z-0" />
              <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center relative z-10">
                <Users strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
              </div>
            </div>
            <h2 className="font-bold text-white text-[16px] leading-tight mt-1">Espace Client</h2>
            <p className="text-white font-bold text-[18px] mt-1 leading-tight">14 Clients</p>
            <p className="text-white/60 text-[12px] mt-1 flex-1 leading-tight">4 demandes récentes</p>
            
            <div className="mt-auto w-full pt-2">
              <span className="bg-[#ff5a5a]/15 text-[#ff5a5a] border border-[#ff5a5a]/20 rounded-full px-2.5 py-1 text-[10px] font-bold inline-block">
                2 nouveaux
              </span>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
