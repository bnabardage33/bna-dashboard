"use client";

import { CheckCircle, AlertTriangle } from "lucide-react";

export default function RapportSAVPDF({ ticket, entreprise }: { ticket: any; entreprise: any }) {
  if (!ticket || !entreprise) return null;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("fr-FR");
  };

  return (
    <div className="bg-white text-black p-8 w-full max-w-[21cm] mx-auto min-h-[29.7cm] shadow-2xl relative font-sans text-sm">
      
      {/* HEADER */}
      <div className="flex justify-between items-start mb-10 border-b-2 border-slate-900 pb-6">
        <div>
          {entreprise.logo_url ? (
            <img src={entreprise.logo_url} alt="Logo" className="max-h-20 max-w-[250px] object-contain" />
          ) : (
            <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">
              {entreprise.raison_sociale}
            </h1>
          )}
          <div className="mt-4 text-xs text-slate-500 space-y-0.5">
            <p>{entreprise.adresse}</p>
            <p>{entreprise.code_postal} {entreprise.ville}</p>
            <p>{entreprise.telephone} | {entreprise.email}</p>
            <p>SIRET : {entreprise.siret}</p>
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">RAPPORT D'INTERVENTION SAV</h2>
          <p className="text-sm font-bold text-slate-500 mt-2">
            Ticket N° : SAV-{ticket.id?.split('-')[0].toUpperCase()}
          </p>
          <p className="text-sm font-bold text-slate-500">
            Date de l'intervention : {formatDate(ticket.date_intervention)}
          </p>
          
          <div className="mt-6 text-left inline-block bg-slate-50 p-4 rounded-xl border border-slate-200 min-w-[250px]">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">CLIENT</p>
            <p className="font-bold text-base">{ticket.chantiers?.clients?.societe || ticket.chantiers?.clients?.nom}</p>
            {ticket.chantiers?.clients?.societe && <p>{ticket.chantiers?.clients?.nom}</p>}
            <p className="mt-2 text-sm">{ticket.chantiers?.adresse_chantier}</p>
          </div>
        </div>
      </div>

      {/* INFOS SINISTRE */}
      <div className="mb-8">
        <h3 className="text-lg font-black uppercase text-slate-800 mb-3 border-l-4 border-slate-800 pl-3">Détails du Sinistre</h3>
        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold">Type de problème</p>
            <p className="font-medium text-slate-900">{ticket.type_sinistre || "Non précisé"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold">Localisation</p>
            <p className="font-medium text-slate-900">{ticket.localisation || "Non précisée"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-slate-500 uppercase font-bold">Couverture</p>
            <p className={`font-bold ${ticket.sous_garantie ? 'text-emerald-600' : 'text-red-600'}`}>
              {ticket.sous_garantie ? "Intervention sous garantie" : "Intervention hors garantie"}
            </p>
          </div>
        </div>
      </div>

      {/* DIAGNOSTIC DTU */}
      <div className="mb-8">
        <h3 className="text-lg font-black uppercase text-slate-800 mb-3 border-l-4 border-slate-800 pl-3">Diagnostic & Constat</h3>
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Observation</p>
            <p className="text-slate-900 whitespace-pre-wrap">{ticket.diagnostic_dtu || "Aucun diagnostic renseigné."}</p>
          </div>
          {ticket.respect_dtu && (
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
              <CheckCircle size={16} />
              <p className="text-sm font-bold">La pose d'origine a été constatée conforme aux normes DTU en vigueur.</p>
            </div>
          )}
        </div>
      </div>

      {/* MATERIEL / TRAVAUX */}
      <div className="mb-8">
        <h3 className="text-lg font-black uppercase text-slate-800 mb-3 border-l-4 border-slate-800 pl-3">Travaux Réalisés</h3>
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <p className="text-xs text-slate-500 uppercase font-bold mb-1">Matériel / Action</p>
          <p className="text-slate-900 whitespace-pre-wrap">{ticket.description || "Aucun matériel spécifique."}</p>
        </div>
      </div>

      {/* PHOTOS PREUVES */}
      <div className="mb-8">
        <h3 className="text-lg font-black uppercase text-slate-800 mb-3 border-l-4 border-slate-800 pl-3">Preuves Visuelles</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
            <p className="text-xs text-slate-500 font-bold uppercase mb-2 text-center">Avant intervention</p>
            {ticket.photos?.avant ? (
              <img src={ticket.photos.avant} alt="Avant" className="w-full h-48 object-cover rounded" />
            ) : (
              <div className="w-full h-48 bg-slate-100 flex items-center justify-center text-slate-400 text-xs">Aucune photo</div>
            )}
          </div>
          <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
            <p className="text-xs text-slate-500 font-bold uppercase mb-2 text-center">Après intervention</p>
            {ticket.photos?.apres ? (
              <img src={ticket.photos.apres} alt="Après" className="w-full h-48 object-cover rounded" />
            ) : (
              <div className="w-full h-48 bg-slate-100 flex items-center justify-center text-slate-400 text-xs">Aucune photo</div>
            )}
          </div>
        </div>
      </div>

      {/* SIGNATURES */}
      <div className="mt-12 flex justify-between gap-8 break-inside-avoid">
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-900 mb-1">Visa du technicien ({ticket.intervenant})</p>
          <div className="h-32 border border-slate-300 rounded-lg bg-slate-50 flex items-center justify-center">
             <p className="text-slate-400 text-xs italic">Signé électroniquement</p>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-900 mb-1">Signature du client (Pour accord)</p>
          <div className="h-32 border border-slate-300 rounded-lg bg-slate-50 relative overflow-hidden">
             {ticket.signature_client ? (
               <img src={ticket.signature_client} alt="Signature Client" className="w-full h-full object-contain p-2" />
             ) : (
               <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs italic">Aucune signature</div>
             )}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="absolute bottom-8 left-8 right-8 text-center text-[10px] text-slate-400 border-t border-slate-200 pt-4">
        Ce rapport atteste de la bonne exécution des travaux SAV. {entreprise.assurance_nom ? `Assurance : ${entreprise.assurance_nom} N°${entreprise.assurance_numero_police}` : ""}
      </div>
    </div>
  );
}
