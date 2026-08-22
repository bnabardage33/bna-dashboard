"use client";

import { Entreprise } from "./DocumentPDF";
import { useEffect } from "react";
import { fmtEuro } from "@/lib/financeCalculs";

export type RelanceData = {
  type_document: "Relance 1" | "Relance 2" | "Mise en demeure";
  facture_numero: string;
  facture_date: string;
  facture_echeance: string;
  facture_montant_ttc: number;
  client: {
    nom: string;
    societe: string | null;
    adresse: string | null;
    code_postal: string | null;
    ville: string | null;
  };
  entreprise: Entreprise;
  penalites_incluses: boolean;
};

export default function LettreRelancePDF({ data, onReady }: { data: RelanceData; onReady?: () => void }) {
  useEffect(() => {
    // Petit délai pour laisser les polices/images se charger
    const timer = setTimeout(() => {
      if (onReady) onReady();
    }, 500);
    return () => clearTimeout(timer);
  }, [onReady]);

  const { entreprise, client } = data;
  const mtTtc = data.facture_montant_ttc;
  
  // Pénalités B2B standard
  const indemniteForfaitaire = 40;
  // Calcul approximatif des pénalités (taux légal + majoration) 
  // Ex: 10% annuel. Pour l'exemple, on met un forfait simple si activé.
  const totalDupa = data.penalites_incluses ? mtTtc + indemniteForfaitaire : mtTtc;

  return (
    <div id="document-pdf-content" className="w-full bg-white text-slate-900 font-sans p-10 max-w-[210mm] mx-auto min-h-[297mm] shadow-lg print:shadow-none text-[13px]">
      {/* En-tête */}
      <div className="flex justify-between items-start mb-16">
        {/* Entreprise */}
        <div className="w-1/2 pr-4">
          {entreprise.logo_url && (
            <img src={entreprise.logo_url} alt="Logo" className="max-h-20 mb-4 object-contain" />
          )}
          <h1 className="text-xl font-black text-slate-900 mb-1">{entreprise.raison_sociale}</h1>
          <p className="text-sm text-slate-600">
            {entreprise.adresse}<br />
            {entreprise.code_postal} {entreprise.ville}
          </p>
          <p className="text-sm text-slate-600 mt-2">
            Tél : {entreprise.telephone}<br />
            Email : {entreprise.email}
          </p>
        </div>

        {/* Client */}
        <div className="w-5/12 bg-slate-50 p-6 rounded-lg border border-slate-100 mt-8">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Destinataire</p>
          <h2 className="text-base font-bold text-slate-900">
            {client.societe ? client.societe : client.nom}
          </h2>
          {client.societe && <p className="text-sm text-slate-700">{client.nom}</p>}
          <p className="text-sm text-slate-700 mt-1">
            {client.adresse || "Adresse non renseignée"}<br />
            {client.code_postal} {client.ville}
          </p>
        </div>
      </div>

      <div className="mb-10 text-right text-sm">
        Fait le {new Date().toLocaleDateString("fr-FR")}
      </div>

      {/* Objet */}
      <div className="mb-8">
        <h3 className="font-bold text-base">
          Objet : {data.type_document} - Facture impayée n° {data.facture_numero}
        </h3>
        <p className="font-medium text-slate-600 mt-1">
          Montant : {fmtEuro(data.facture_montant_ttc)} TTC
        </p>
      </div>

      {/* Corps */}
      <div className="space-y-4 text-justify leading-relaxed text-sm">
        <p>Madame, Monsieur,</p>

        <p>
          Sauf erreur ou omission de notre part, nous constatons que la facture n° <strong>{data.facture_numero}</strong> d'un montant de <strong>{fmtEuro(data.facture_montant_ttc)} TTC</strong>, datée du {new Date(data.facture_date).toLocaleDateString("fr-FR")} et arrivée à échéance le {new Date(data.facture_echeance).toLocaleDateString("fr-FR")}, demeure impayée à ce jour.
        </p>

        <p>
          Nous vous prions de bien vouloir régulariser cette situation dans les plus brefs délais par virement bancaire sur le compte de l'entreprise.
        </p>

        {data.penalites_incluses && (
          <div className="bg-rose-50 p-4 border border-rose-100 rounded-lg my-6">
            <p className="font-bold text-rose-800 mb-2">Conformément aux conditions générales de vente :</p>
            <ul className="list-disc list-inside text-rose-700 space-y-1">
              <li>Le retard de paiement entraîne l'exigibilité de l'indemnité forfaitaire pour frais de recouvrement de 40 €.</li>
              <li>Montant total actualisé dû : <strong>{fmtEuro(totalDupa)} TTC</strong>.</li>
            </ul>
          </div>
        )}

        <p>
          Si votre règlement a été effectué entre-temps, nous vous prions de ne pas tenir compte de cette lettre.
        </p>

        <p>
          Dans l'attente de votre règlement, nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.
        </p>
      </div>

      <div className="mt-16 text-right font-bold text-slate-800">
        La Direction
      </div>

      {/* Footer / RIB */}
      <div className="mt-auto pt-16">
        <div className="border-t border-slate-200 pt-6 text-[10px] text-center text-slate-400">
          <p>{entreprise.raison_sociale} - SIRET : {entreprise.siret}</p>
          {(entreprise.iban) && (
            <p className="mt-2 text-slate-500 font-mono font-medium">
              IBAN : {entreprise.iban} | BIC : {entreprise.bic}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
