"use client";

import { useEffect } from "react";
import { fmtEuro, fmtPct } from "@/lib/financeCalculs";

export default function SituationTravauxPDF({
  chantier,
  onReady,
}: {
  chantier: any;
  onReady: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onReady();
    }, 500);
    return () => clearTimeout(timer);
  }, [onReady]);

  if (!chantier) return null;

  const dateStr = new Date().toLocaleDateString("fr-FR");
  const numSituation = `SIT-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;

  const avancementReel = chantier.avancement_reel || 50;
  const pvHT = chantier.prix_vente_ht || 0;
  const montantSituationHT = pvHT * (avancementReel / 100);
  const tva = montantSituationHT * 0.20; // Defaulting to 20% for the PDF
  const montantTTC = montantSituationHT + tva;

  return (
    <div id="document-pdf-content" className="mx-auto max-w-4xl bg-white p-8 text-slate-900 text-sm leading-relaxed font-sans">
      <div className="flex justify-between items-start mb-10">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tighter">SITUATION DE TRAVAUX</h1>
          <p className="text-lg text-slate-600 font-semibold mt-1">N° {numSituation}</p>
          <p className="text-sm text-slate-500 mt-1">Date d'édition : {dateStr}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-slate-900">BNA BARDAGE</div>
          <p className="text-sm text-slate-500">12 Rue de l'Artisanat, 33000 Bordeaux</p>
          <p className="text-sm text-slate-500">contact@bna-bardage.fr</p>
        </div>
      </div>

      <div className="bg-slate-50 p-4 border border-slate-200 rounded mb-8">
        <h2 className="text-base font-bold text-slate-800 uppercase border-b border-slate-200 pb-1 mb-2">Informations du Chantier</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><span className="font-semibold">Référence / Nom :</span> {chantier.nom}</p>
            <p><span className="font-semibold">Client :</span> {chantier.client_nom}</p>
          </div>
          <div>
            <p><span className="font-semibold">Avancement constaté :</span> <span className="font-bold text-emerald-600">{avancementReel}%</span></p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-base font-bold text-slate-800 uppercase border-b border-slate-200 pb-1 mb-2">Détail d'Avancement</h2>
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="p-2 font-semibold">Désignation des ouvrages</th>
              <th className="p-2 font-semibold text-right">Montant Marché HT</th>
              <th className="p-2 font-semibold text-right">% Avancement</th>
              <th className="p-2 font-semibold text-right">Montant Cumulé HT</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="p-2">Travaux de bardage et isolation selon devis</td>
              <td className="p-2 text-right">{fmtEuro(pvHT)}</td>
              <td className="p-2 text-right font-bold">{avancementReel}%</td>
              <td className="p-2 text-right font-semibold">{fmtEuro(montantSituationHT)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-end mb-12">
        <div className="w-72 bg-slate-50 p-4 border border-slate-200 rounded">
          <div className="flex justify-between mb-1">
            <span>Total Situation HT :</span>
            <span className="font-semibold">{fmtEuro(montantSituationHT)}</span>
          </div>
          <div className="flex justify-between mb-2">
            <span>TVA (20%) :</span>
            <span>{fmtEuro(tva)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-2 font-bold text-base">
            <span>Net à Payer TTC :</span>
            <span>{fmtEuro(montantTTC)}</span>
          </div>
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-8 leading-normal">
        <p className="font-semibold mb-1 text-slate-700">Conditions de paiement</p>
        <p>Paiement à réception de la présente situation. Aucun escompte pour paiement anticipé.</p>
        <p>En application de l'article 1792-6 du Code Civil, la réception des ouvrages prononcée judiciairement ou à l'amiable est le point de départ des garanties légales.</p>
      </div>

      <div className="grid grid-cols-2 gap-8 text-sm mt-12">
        <div>
          <p className="font-bold border-b border-slate-200 pb-1 mb-8">Pour BNA BARDAGE</p>
          <div className="h-16 border-b-2 border-dashed border-slate-300 w-48"></div>
        </div>
        <div>
          <p className="font-bold border-b border-slate-200 pb-1 mb-8">Pour Le Client (Bon pour accord)</p>
          <div className="h-16 border-b-2 border-dashed border-slate-300 w-48"></div>
        </div>
      </div>
    </div>
  );
}
