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
    <div className="min-h-screen bg-[#080c18] relative overflow-hidden">
      {/* GLOW doit être en z-0 derrière tout */}
      <div className="absolute top-0 inset-x-0 h-[380px] bg-[radial-gradient(ellipse_at_top,_rgba(120,20,20,0.28),transparent_60%)] pointer-events-none z-0" />
      
      {/* HEADER en z-10 par dessus */}
      <header className="relative z-10 bg-black rounded-[22px] mx-4 mt-4 h-[145px] flex items-center justify-center border border-white/5 overflow-hidden">
        <img src="/logo-bna.png" alt="BNA Bardage" className="w-[90%] h-auto max-h-[115px] object-contain scale-[1.6]" />
      </header>

      {/* TITRE & MAIN CONTENT */}
      <main className="relative z-10 px-4 pt-6 pb-[20px]">
        <h1 className="text-white text-[30px] font-black">Tableau de bord</h1>
        <p className="text-white/60 text-sm">Vue d'ensemble • {formattedDate}</p>
        
        {/* LES 4 CARTES */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          {/* CARTE 1 : Bureau d'études */}
          <Link href="/bureau" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-[20px] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 flex flex-col">
            <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center shrink-0">
              <Building2 strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
            </div>
            <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Bureau d'études</h2>
            <p className="text-white font-bold text-[15px] mt-2 leading-tight">12 Études actives</p>
            <p className="text-white/60 text-[13px] mt-1 leading-tight mb-4 flex-1">3 en revue • 5 à valider</p>
            <div className="mt-auto">
              <span className="bg-white/10 text-white/70 border border-white/10 rounded-full px-3 py-1 text-[11px] font-bold inline-block">
                +2 cette semaine
              </span>
            </div>
          </Link>

          {/* CARTE 2 : Terrain & Chantier */}
          <Link href="/terrain" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-[20px] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 flex flex-col">
            <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center shrink-0">
              <HardHat strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
            </div>
            <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Terrain & Chantier</h2>
            <p className="text-white font-bold text-[15px] mt-2 leading-tight">8 Chantiers en cours</p>
            
            <div className="mt-auto pt-2">
              <div className="flex justify-between text-[11px] text-white/80 font-bold mb-1.5">
                <span>Avancement</span>
                <span>76%</span>
              </div>
              <div className="h-1.5 w-full bg-[rgba(255,255,255,0.07)] border border-white/10 rounded-full overflow-hidden mb-1">
                <div className="h-full bg-[#ff5a5a] rounded-full" style={{ width: '76%' }}></div>
              </div>
              <p className="text-white/60 text-[11px] leading-tight mt-1">7 ouvriers mobilisés</p>
            </div>
          </Link>

          {/* CARTE 3 : Finance & Pilotage */}
          <Link href="/finance" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-[20px] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 flex flex-col col-span-2 min-h-[180px]">
            <div className="flex justify-between items-start">
              <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center shrink-0">
                <CircleDollarSign strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
              </div>
              <span className="bg-[#00d08a]/15 text-[#6ee7b7] border border-[#00d08a]/20 rounded-full px-3 py-1 text-[11px] font-bold">
                +8,2% vs prévisionnel
              </span>
            </div>
            <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Finance & Pilotage</h2>
            <p className="text-white font-bold text-[24px] mt-1 leading-tight">Budget 1,24 M€</p>
            <div className="flex gap-6 mt-auto pt-3">
              <p className="text-white/60 text-[13px] leading-tight"><span className="text-white font-semibold">Dépensé:</span> 842 k€</p>
              <p className="text-white/60 text-[13px] leading-tight"><span className="text-white font-semibold">Restant:</span> 398 k€</p>
            </div>
          </Link>

          {/* CARTE 4 : Espace Client */}
          <Link href="/bureau/portails-clients" className="bg-[linear-gradient(145deg,_rgba(255,255,255,0.09),_rgba(255,255,255,0.03))] backdrop-blur-[20px] border border-white/[0.14] rounded-[20px] p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),_0_8px_32px_rgba(0,0,0,0.4)] relative overflow-hidden transition-all hover:bg-[rgba(255,255,255,0.12)] hover:-translate-y-1 flex flex-col col-span-2 min-h-[180px]">
            <div className="flex justify-between items-start">
              <div className="w-[56px] h-[56px] rounded-[14px] bg-[rgba(255,255,255,0.07)] border border-white/10 flex items-center justify-center shrink-0">
                <Users strokeWidth={1.5} size={28} className="text-[#ff5a5a]" />
              </div>
              <span className="bg-[#ff5a5a]/15 text-[#ff5a5a] border border-[#ff5a5a]/20 rounded-full px-3 py-1 text-[11px] font-bold">
                2 nouveaux
              </span>
            </div>
            <h2 className="font-bold text-white text-[18px] mt-4 leading-tight">Espace Client</h2>
            <div className="flex justify-between items-end mt-auto pt-1">
              <p className="text-white font-bold text-[18px] leading-tight">14 Clients actifs</p>
              <p className="text-white/60 text-[13px] leading-tight">4 demandes récentes</p>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
