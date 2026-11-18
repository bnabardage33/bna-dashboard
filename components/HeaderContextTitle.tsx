"use client";

import React from "react";
import { usePathname } from "next/navigation";

function resoudreTitreContextuel(pathname: string | null): {
  titre: string;
  sousTitre: string;
} {
  if (!pathname || pathname === "/") {
    return {
      titre: "Tableau de bord • BNA",
      sousTitre: "Pilotage Bardage, Terrasse & Clôture",
    };
  }
  if (pathname.startsWith("/terrain/bna-ia")) {
    return {
      titre: "BNA-IA • Copilote",
      sousTitre: "Assistant BTP connecté temps réel",
    };
  }
  if (pathname.startsWith("/terrain/meteo") || pathname.startsWith("/bureau/meteo")) {
    return {
      titre: "Météo & Vigilance • BNA",
      sousTitre: "Conditions de pose DTU & intempéries",
    };
  }
  if (pathname.startsWith("/bureau/catalogue")) {
    return {
      titre: "Catalogues Matériaux • BNA",
      sousTitre: "Bardage, Terrasse, Clôture & Cadences",
    };
  }
  if (pathname.startsWith("/bureau/devis")) {
    return {
      titre: "Devis & Chiffrage • BNA",
      sousTitre: "Espace Commercial",
    };
  }
  if (pathname.startsWith("/bureau/factures")) {
    return {
      titre: "Facturation & Règlements • BNA",
      sousTitre: "Suivi encaissements",
    };
  }
  if (pathname.startsWith("/calepinage")) {
    return {
      titre: "Calepinage Façade 2D/3D • BNA",
      sousTitre: "Optimisation des coupes et quantitatifs",
    };
  }
  if (pathname.startsWith("/finance")) {
    return {
      titre: "Finance & Pilotage • BNA",
      sousTitre: "Rentabilité, pointages & trésorerie",
    };
  }
  if (pathname.startsWith("/terrain/chantier") || pathname.startsWith("/terrain/terrasse") || pathname.startsWith("/terrain/cloture")) {
    return {
      titre: "Chantiers Terrain • BNA",
      sousTitre: "Suivi d'exécution & avancements",
    };
  }
  return {
    titre: "Espace de travail • BNA",
    sousTitre: "Bâtiment Nouvelle Aquitaine",
  };
}

export default function HeaderContextTitle() {
  const pathname = usePathname();
  const { titre, sousTitre } = resoudreTitreContextuel(pathname);

  return (
    <div className="min-w-0 leading-tight">
      <p className="text-xs font-bold tracking-wide text-white truncate">{titre}</p>
      <p className="text-[10px] text-amber-200/60 truncate">{sousTitre}</p>
    </div>
  );
}
