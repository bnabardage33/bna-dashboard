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
    <div className="min-h-screen bg-[#080c18] relative">
      <div className="absolute top-0 left-0 right-0 h-[400px] bg-[radial-gradient(ellipse_at_top,_rgba(139,0,0,0.25),transparent_60%),radial-gradient(ellipse_at_top_left,_rgba(80,0,120,0.15),transparent_50%)] pointer-events-none" />
      
      {/* HEADER LOGO */}
      <header className="relative bg-black rounded-[22px] mx-4 mt-4 h-[145px] flex items-center justify-center border border-white/[0.06]">
        <img src="/logo-bna.png" alt="BNA Bardage" className="h-[105px] w-auto object-contain drop-shadow-[0_0_20px_rgba(255,0,0,0.2)]" />
      </header>

      {/* TITRE */}
      <div className="px-6 pt-6 relative z-10">
        <h1 className="text-white text-[32px] font-black tracking-tight">Tableau de bord</h1>
        <p className="text-white/60 text-[14px] mt-1">Vue d'ensemble • {formattedDate}</p>
      </div>

      {/* LES 4 CARTES */}
      <div className="grid grid-cols-2 gap-4 p-4 mt-2 relative z-10">
        {/* CARTE 1 : Bureau d'études */}
        <Link href="/bureau" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-[20px] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 block">
          <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center">
            <Building2 strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
          </div>
          <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Bureau d'études</h2>
          <p className="text-white font-bold text-[15px] mt-2 leading-tight">12 Études actives</p>
          <p className="text-white/60 text-[13px] mt-1 leading-tight mb-4">3 en revue • 5 à valider</p>
          <span className="bg-white/10 text-white/70 border border-white/10 rounded-full px-3 py-1 text-[11px] font-bold">
            +2 cette semaine
          </span>
        </Link>

        {/* CARTE 2 : Terrain & Chantier */}
        <Link href="/terrain" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-[20px] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 block">
          <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center">
            <HardHat strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
          </div>
          <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Terrain & Chantier</h2>
          <p className="text-white font-bold text-[15px] mt-2 leading-tight">8 Chantiers en cours</p>
          
          <div className="mt-2 mb-2">
            <div className="flex justify-between text-[11px] text-white/80 font-bold mb-1.5">
              <span>Avancement moyen</span>
              <span>76%</span>
            </div>
            <div className="h-1.5 w-full bg-[rgba(255,255,255,0.07)] border border-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#ff5a5a] rounded-full" style={{ width: '76%' }}></div>
            </div>
          </div>
          
          <p className="text-white/60 text-[13px] mt-1 leading-tight">7 ouvriers mobilisés</p>
        </Link>

        {/* CARTE 3 : Finance & Pilotage */}
        <Link href="/finance" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-[20px] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 block col-span-2">
          <div className="flex justify-between items-start">
            <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center">
              <CircleDollarSign strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
            </div>
            <span className="bg-[#00d08a]/15 text-[#6ee7b7] border border-[#00d08a]/20 rounded-full px-3 py-1 text-[11px] font-bold">
              +8,2% vs prévisionnel
            </span>
          </div>
          <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Finance & Pilotage</h2>
          <p className="text-white font-bold text-[24px] mt-1 leading-tight">Budget 1,24 M€</p>
          <div className="flex gap-6 mt-3">
            <p className="text-white/60 text-[13px] leading-tight"><span className="text-white font-semibold">Dépensé:</span> 842 k€</p>
            <p className="text-white/60 text-[13px] leading-tight"><span className="text-white font-semibold">Restant:</span> 398 k€</p>
          </div>
        </Link>

        {/* CARTE 4 : Espace Client */}
        <Link href="/bureau/portails-clients" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-[20px] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 block col-span-2 mb-4">
          <div className="flex justify-between items-start">
            <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center">
              <Users strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
            </div>
            <span className="bg-[#ff5a5a]/15 text-[#ff5a5a] border border-[#ff5a5a]/20 rounded-full px-3 py-1 text-[11px] font-bold">
              2 nouveaux
            </span>
          </div>
          <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Espace Client</h2>
          <div className="flex justify-between items-end mt-1">
            <p className="text-white font-bold text-[18px] leading-tight">14 Clients actifs</p>
            <p className="text-white/60 text-[13px] leading-tight">4 demandes récentes</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
