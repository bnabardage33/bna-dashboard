"use client";

import type { TicketSav, EntrepriseSettings } from "@/types/finance";
import Image from "next/image";
import {
  LIBELLES_GARANTIE,
  REFERENTIELS_NORMATIFS_SAV,
  type MetierSav,
  type TypeGarantieSav,
} from "@/lib/savGaranties";

export default function RapportSAVPDF({
  ticket,
  entreprise,
}: {
  ticket: TicketSav;
  entreprise: EntrepriseSettings | null;
}) {
  if (!ticket || !entreprise) return null;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("fr-FR");
  };

  const estExterne = ticket.type_origine === "client_externe";
  const metier = (ticket.metier || ticket.chantiers?.metier || "bardage") as MetierSav;
  const refNormatif = REFERENTIELS_NORMATIFS_SAV[metier] || REFERENTIELS_NORMATIFS_SAV.bardage;
  const regime = (ticket.type_garantie ||
    (estExterne ? "hors_garantie_externe" : "decennale_10ans")) as TypeGarantieSav;

  const nomClient =
    ticket.clients?.societe ||
    ticket.clients?.nom ||
    ticket.chantiers?.clients?.societe ||
    ticket.chantiers?.clients?.nom ||
    "Client";
  const adresseClient =
    ticket.chantiers?.adresse_chantier || ticket.clients?.adresse_facturation || "";

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="bg-white text-black p-4 sm:p-8 w-full max-w-3xl mx-auto shadow-2xl font-sans text-sm min-w-[320px]">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-10 border-b-2 border-slate-900 pb-6">
          <div className="w-full md:w-auto">
            {entreprise.logo_url ? (
              <Image
                src={entreprise.logo_url}
                alt="Logo"
                className="max-h-20 max-w-[200px] object-contain"
                width={100}
                height={100}
              />
            ) : (
              <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-slate-900 uppercase break-words">
                {entreprise.raison_sociale}
              </h1>
            )}
            <div className="mt-4 text-xs text-slate-500 space-y-0.5">
              <p>{entreprise.adresse}</p>
              <p>
                {entreprise.code_postal} {entreprise.ville}
              </p>
              <p>
                {entreprise.telephone} | {entreprise.email}
              </p>
              <p>SIRET : {entreprise.siret}</p>
            </div>
          </div>

          <div className="w-full md:w-auto md:text-right">
            <h2 className="text-2xl md:text-4xl font-black text-slate-800 uppercase tracking-tight break-words">
              RAPPORT D&apos;INTERVENTION SAV
            </h2>
            <p className="text-sm font-bold text-[#B85B2B] mt-2">
              Ticket N° : SAV-{ticket.id?.split("-")[0].toUpperCase()} · {refNormatif.libelleMetier}
            </p>
            <p className="text-xs font-semibold text-slate-500">
              Origine : {estExterne ? "Client externe (Hors chantier BNA)" : `Chantier BNA (${ticket.chantiers?.nom || "—"})`}
            </p>
            <p className="text-sm font-bold text-slate-500">
              Date d&apos;intervention : {formatDate(ticket.date_intervention)}
            </p>

            <div className="mt-4 text-left block w-full md:inline-block md:w-auto bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                CLIENT
              </p>
              <p className="font-bold text-base">{nomClient}</p>
              {adresseClient && <p className="mt-1 text-xs">{adresseClient}</p>}
            </div>
          </div>
        </div>

        {/* INFOS SINISTRE & GARANTIE */}
        <div className="mb-8">
          <h3 className="text-lg font-black uppercase text-slate-800 mb-3 border-l-4 border-[#B85B2B] pl-3">
            Détails du Sinistre &amp; Couverture
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold">Type de problème</p>
              <p className="font-medium text-slate-900">
                {ticket.type_sinistre || "Non précisé"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold">Localisation</p>
              <p className="font-medium text-slate-900">
                {ticket.localisation || "Non précisée"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold">Régime de garantie</p>
              <p className="font-semibold text-slate-900">
                {LIBELLES_GARANTIE[regime] || "Décennale (10 ans)"}
              </p>
              {ticket.pv_receptions?.date_reception && (
                <p className="text-xs text-slate-500">
                  PV {ticket.pv_receptions.numero} du {formatDate(ticket.pv_receptions.date_reception)}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold">Statut couverture</p>
              <p
                className={`font-bold ${
                  ticket.sous_garantie ? "text-emerald-700" : "text-[#B85B2B]"
                }`}
              >
                {ticket.sous_garantie
                  ? "Intervention sous garantie"
                  : ticket.facturable
                    ? "Intervention hors garantie (Facturable)"
                    : "Intervention hors garantie"}
              </p>
            </div>
          </div>
        </div>

        {/* DIAGNOSTIC DTU */}
        <div className="mb-8">
          <h3 className="text-lg font-black uppercase text-slate-800 mb-3 border-l-4 border-slate-800 pl-3">
            Diagnostic &amp; Constat ({refNormatif.libelleMetier})
          </h3>
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold">
                {refNormatif.labelNorme}
              </p>
              <p
                className={`font-bold text-sm mt-1 ${
                  ticket.respect_dtu ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {ticket.respect_dtu
                  ? "✅ Ouvrage conforme aux règles de l'art lors du constat"
                  : "❌ Anomalie / non-conformité constatée"}
              </p>
            </div>
            {ticket.diagnostic_dtu && (
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">
                  Analyse technique &amp; Cause probable
                </p>
                <p className="text-slate-800 mt-1 whitespace-pre-line">
                  {ticket.diagnostic_dtu}
                </p>
              </div>
            )}
            {ticket.description && (
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">
                  Matériel &amp; Travaux réalisés
                </p>
                <p className="text-slate-800 mt-1 whitespace-pre-line">
                  {ticket.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* PHOTOS AVANT / APRÈS */}
        {(ticket.photos?.avant || ticket.photos?.apres) && (
          <div className="mb-8">
            <h3 className="text-lg font-black uppercase text-slate-800 mb-3 border-l-4 border-slate-800 pl-3">
              Preuves Photographiques
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {ticket.photos?.avant && (
                <div className="border border-slate-200 p-2 rounded-lg text-center bg-slate-50">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                    Avant intervention
                  </p>
                  <Image
                    src={ticket.photos.avant}
                    alt="Avant"
                    className="max-h-48 mx-auto rounded object-contain"
                    width={200}
                    height={200}
                  />
                </div>
              )}
              {ticket.photos?.apres && (
                <div className="border border-slate-200 p-2 rounded-lg text-center bg-slate-50">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                    Après intervention
                  </p>
                  <Image
                    src={ticket.photos.apres}
                    alt="Après"
                    className="max-h-48 mx-auto rounded object-contain"
                    width={200}
                    height={200}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* SIGNATURES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-12 pt-6 border-t border-slate-200">
          <div className="text-center">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">
              Visa Technicien ({ticket.intervenant || "Équipe"})
            </p>
            <div className="h-28 border border-slate-200 rounded-xl flex items-center justify-center bg-slate-50 p-2">
              {ticket.signature_technicien ? (
                <Image
                  src={ticket.signature_technicien}
                  alt="Signature Technicien"
                  className="max-h-full"
                  width={120}
                  height={80}
                />
              ) : (
                <span className="text-xs text-slate-400 italic">Non signé</span>
              )}
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">
              Signature Client (Bon pour réception)
            </p>
            <div className="h-28 border border-slate-200 rounded-xl flex items-center justify-center bg-slate-50 p-2">
              {ticket.signature_client ? (
                <Image
                  src={ticket.signature_client}
                  alt="Signature Client"
                  className="max-h-full"
                  width={120}
                  height={80}
                />
              ) : (
                <span className="text-xs text-slate-400 italic">Non signé</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
