// components/DocumentPDF.tsx
"use client";

import { Scissors } from "lucide-react";
import { Entreprise } from "@/types/entreprise";
import Image from "next/image";
import { fmtEuro } from "@/lib/financeCalculs";

export type { Entreprise };

type Ligne = { designation: string; description?: string; qte: number; unite: string; pu_ht: number };

export type Client = {
  nom: string;
  societe: string | null;
  adresse_facturation: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
};

export type DocumentData = {
  kind: "devis" | "facture";
  numero: string;
  statut: string;
  date_emission: string;
  validite_jours?: number | null;
  echeance?: string | null;
  objet: string | null;
  adresse_chantier: string | null;
  type_travaux: string | null;
  lignes: Ligne[];
  tva_pct: number;
  acompte_pct?: number | null;
  delai_jours?: number | null;
  type_facture?: "acompte" | "situation" | "solde" | "totale";
  profil_revenu?: string | null;
  surface_m2?: number | null;
  signature_client?: string | null;
  signataire_client_nom?: string | null;
  retenue_garantie_pct?: number | null;
  montant_retenue_ht?: number | null;
  montant_retenue_ttc?: number | null;
  net_a_payer_ttc?: number | null;
};

// LOT 2C — la fonction `euros()` locale est supprimee au profit de fmtEuro().
// Les deux produisaient exactement la meme chaine sur toutes les valeurs
// testees (0 ; 12,5 ; 1 234,5 ; 1 234,56 ; 10 000 ; -12,5 ; -1 234,56) : meme
// separateur de milliers, meme virgule decimale, meme symbole. Seul change
// l'espace avant le €, qui devient insecable — le montant ne peut plus passer
// a la ligne. fmtEuro() apporte en plus la gestion de null/undefined/NaN, que
// `euros()` laissait lever en TypeError.

export default function DocumentPDF({
  doc,
  entreprise,
  client,
}: {
  doc: DocumentData;
  entreprise: Entreprise;
  client: Client;
}) {
  const totalHT = doc.lignes.reduce((s, l) => s + l.qte * l.pu_ht, 0);
  const tva = totalHT * (doc.tva_pct / 100);
  const totalTTC = totalHT + tva;
  const acompte = doc.acompte_pct ? totalTTC * (doc.acompte_pct / 100) : null;

  const titre = doc.kind === "devis" ? "DEVIS" : "FACTURE";
  const logoUrl = entreprise.logo_url || "/logo-bna.png";

  const nomAssurance = entreprise.assurance_nom || entreprise.assurance || "AXA Courtage / SMABTP";
  const policeAssurance = entreprise.assurance_numero_police || "DEC-2024-884920";
  const zoneAssurance = entreprise.assurance_zone_geo || "France métropolitaine et Corse";
  const nomMediateur = entreprise.mediateur_nom || "CM2C (Centre de la Médiation de la Consommation)";
  const contactMediateur = entreprise.mediateur_contact || "https://www.cm2c.net - 14 rue Saint Jean 75017 Paris";

  return (
    <div id="document-pdf-content" className="mx-auto max-w-3xl bg-white p-8 text-slate-900 shadow-xl text-xs font-sans">
      {/* ============================================================ */}
      {/* PAGE 1 : DEVIS / FACTURE PRINCIPALE */}
      {/* ============================================================ */}
      <div className="space-y-4">
        {/* Liseré supérieur bleu acier */}
        <div className="h-2 w-full bg-red-700 rounded-full" />

        {/* En-tête avec Logo imposant */}
        <div className="flex items-start justify-between pt-2">
          <div className="flex items-center gap-4">
            <Image
              src={logoUrl}
              alt="Logo BNA"
              className="h-20 sm:h-24 max-h-24 w-auto object-contain"
             width={100} height={100} />
            <div>
              <p className="text-xl font-extrabold text-slate-900 tracking-tight">{entreprise.raison_sociale}</p>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Spécialiste Bardage Rapporté · Isolation ITE · Façades
              </p>
              {entreprise.siret && <p className="text-[10px] text-slate-400 mt-0.5">SIRET : {entreprise.siret}</p>}
            </div>
          </div>

          <div className="text-right">
            <p className="text-3xl font-black tracking-tight text-slate-900">{titre}</p>
            <p className="text-sm font-bold text-red-700 font-mono">N° {doc.numero}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Émis le {new Date(doc.date_emission).toLocaleDateString("fr-FR")}
              {doc.kind === "devis" && doc.validite_jours
                ? ` · Validité ${doc.validite_jours} jours`
                : ""}
            </p>
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <span className="inline-block rounded-full bg-slate-800 px-3 py-0.5 text-[10px] font-bold text-slate-100 uppercase tracking-wider">
                {doc.statut}
              </span>
              {doc.kind === "facture" && doc.type_facture && doc.type_facture !== "totale" && (
                <span className="inline-block rounded-full bg-red-700 px-3 py-0.5 text-[10px] font-bold uppercase text-white">
                  {doc.type_facture}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Blocs Émetteur / Client */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-300 overflow-hidden bg-slate-50/60 shadow-sm">
            <div className="bg-slate-800 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-100">
              Votre Entreprise
            </div>
            <div className="space-y-0.5 p-3 text-xs text-slate-700">
              <p className="font-bold text-slate-900 text-sm">{entreprise.raison_sociale}</p>
              {entreprise.adresse && <p>{entreprise.adresse}</p>}
              {(entreprise.code_postal || entreprise.ville) && (
                <p>
                  {entreprise.code_postal} {entreprise.ville}
                </p>
              )}
              {entreprise.telephone && <p>Tél : {entreprise.telephone}</p>}
              {entreprise.email && <p>Email : {entreprise.email}</p>}
              <p className="text-[10px] text-slate-500 pt-1 font-medium">
                Assurance Décennale : {nomAssurance} (Police N° {policeAssurance})
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-300 overflow-hidden bg-slate-50/60 shadow-sm">
            <div className="bg-slate-800 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-100">
              Client
            </div>
            <div className="space-y-0.5 p-3 text-xs text-slate-700">
              {client.societe && <p className="font-bold text-slate-900 text-sm">{client.societe}</p>}
              <p className={client.societe ? "font-semibold text-slate-800" : "font-bold text-slate-900 text-sm"}>
                {client.nom}
              </p>
              {client.adresse_facturation && <p>{client.adresse_facturation}</p>}
              {(client.code_postal || client.ville) && (
                <p>
                  {client.code_postal} {client.ville}
                </p>
              )}
              {client.tel && <p>Tél : {client.tel}</p>}
              {client.email && <p>Email : {client.email}</p>}
            </div>
          </div>
        </div>

        {/* Détails du chantier */}
        {(doc.adresse_chantier || doc.type_travaux) && (
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-300 bg-slate-50/60 p-3 text-xs">
            {doc.adresse_chantier && (
              <div>
                <p className="font-bold uppercase tracking-wide text-slate-500 text-[10px]">📍 Lieu d&apos;exécution du chantier</p>
                <p className="font-medium text-slate-900 mt-0.5">{doc.adresse_chantier}</p>
              </div>
            )}
            {doc.type_travaux && (
              <div>
                <p className="font-bold uppercase tracking-wide text-slate-500 text-[10px]">🔨 Nature des travaux</p>
                <p className="font-medium text-slate-900 mt-0.5">{doc.type_travaux}</p>
              </div>
            )}
          </div>
        )}

        {doc.objet && (
          <div className="rounded-xl border border-slate-300 bg-slate-50/60 p-2.5 text-xs">
            <p className="font-bold uppercase tracking-wide text-slate-500 text-[10px]">Objet du document</p>
            <p className="font-medium text-slate-900 mt-0.5">{doc.objet}</p>
          </div>
        )}

        {/* Tableau des prestations */}
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-800 bg-slate-100 text-left font-bold uppercase tracking-wider text-slate-700 text-[10px]">
              <th className="p-2">Désignation des ouvrages</th>
              <th className="p-2 text-right">Qté</th>
              <th className="p-2 text-right">Unité</th>
              <th className="p-2 text-right">PU HT</th>
              <th className="p-2 text-right">Total HT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {doc.lignes.map((l, i) => (
              <tr key={i} className="hover:bg-slate-50/50 break-inside-avoid">
                <td className="p-2">
                  <p className="font-semibold text-slate-900">{l.designation}</p>
                  {l.description && <p className="text-[11px] text-slate-500 mt-0.5 whitespace-pre-wrap leading-relaxed">{l.description}</p>}
                </td>
                <td className="p-2 text-right text-slate-700">{l.qte}</td>
                <td className="p-2 text-right text-slate-700">{l.unite}</td>
                <td className="p-2 text-right text-slate-700">{fmtEuro(l.pu_ht)}</td>
                <td className="p-2 text-right font-bold text-slate-900">{fmtEuro(l.qte * l.pu_ht)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Récapitulatif financier avec TOTAL TTC contrasté */}
        <div className="flex justify-end pt-1">
          <div className="w-72 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-700">
              <span>Total HT</span>
              <span className="font-semibold">{fmtEuro(totalHT)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>TVA ({doc.tva_pct} %)</span>
              <span className="font-semibold">{fmtEuro(tva)}</span>
            </div>
            {/* Affichage différencié selon présence de Retenue de Garantie */}
            {doc.kind === "facture" && (doc.montant_retenue_ttc ?? 0) > 0 ? (
              <>
                <div className="flex justify-between rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700 font-medium text-[11px]">
                  <span>TOTAL TTC</span>
                  <span className="font-mono font-bold">{fmtEuro(totalTTC)}</span>
                </div>
                <div className="flex justify-between text-amber-700 font-semibold px-2.5 text-[11px]">
                  <span>Retenue de garantie ({doc.retenue_garantie_pct ?? 5} %)</span>
                  <span className="font-mono">-{fmtEuro(doc.montant_retenue_ttc ?? 0)}</span>
                </div>
                <div className="flex justify-between rounded-xl bg-slate-800 px-3.5 py-2.5 font-black text-sm text-slate-100 shadow-md">
                  <span className="text-slate-100">NET À PAYER TTC</span>
                  <span className="text-amber-400 font-mono font-black text-base">
                    {fmtEuro(doc.net_a_payer_ttc ?? (totalTTC - (doc.montant_retenue_ttc ?? 0)))}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between rounded-xl bg-slate-800 px-3.5 py-2.5 font-black text-sm text-slate-100 shadow-md">
                <span className="text-slate-100">TOTAL TTC</span>
                <span className="text-amber-400 font-mono font-black text-base">{fmtEuro(totalTTC)}</span>
              </div>
            )}
            {acompte !== null && (
              <div className="flex justify-between text-slate-600 text-[11px] pt-1">
                <span>Acompte à la commande ({doc.acompte_pct} %)</span>
                <span className="font-semibold text-slate-900">{fmtEuro(acompte)}</span>
              </div>
            )}
            {doc.kind === "facture" && doc.echeance && (
              <div className="flex justify-between text-slate-600 text-[11px]">
                <span>Date d&apos;échéance</span>
                <span className="font-semibold text-slate-900">{new Date(doc.echeance).toLocaleDateString("fr-FR")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Coordonnées bancaires pour les factures uniquement */}
        {doc.kind === "facture" && (
          <div className="grid grid-cols-3 gap-3 border-t border-slate-300 pt-3 text-xs">
            <div>
              <p className="font-bold text-slate-800">Règlement</p>
              <p className="text-slate-500 text-[11px]">Virement à réception</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">IBAN</p>
              <p className="text-slate-600 font-mono text-[11px]">{entreprise.iban || "—"}</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">BIC</p>
              <p className="text-slate-600 font-mono text-[11px]">{entreprise.bic || "—"}</p>
            </div>
          </div>
        )}

        {entreprise.mentions_legales && (
          <p className="text-[10px] text-slate-400 italic pt-1">{entreprise.mentions_legales}</p>
        )}

        {/* Mention contractuelle Devis (CGV & Retenue de garantie Loi n° 71-584) */}
        {doc.kind === "devis" && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2 text-[10px] text-slate-700 leading-tight">
            {(doc.retenue_garantie_pct ?? 0) > 0 ? (
              <p>
                <strong>Conditions contractuelles &amp; Retenue de garantie :</strong> Les travaux sont soumis aux Conditions Générales de Vente ci-jointes. Conformément aux dispositions de la loi n° 71-584 du 16 juillet 1971 et selon accord exprès entre les parties, une retenue de garantie de <strong>{doc.retenue_garantie_pct} %</strong> sera appliquée sur les acomptes et situations pour garantir la levée des réserves éventuelles.
              </p>
            ) : (
              <p>
                <strong>Conditions contractuelles :</strong> Les travaux sont soumis aux Conditions Générales de Vente ci-jointes. Aucune retenue de garantie contractuelle n&apos;est convenue au titre du présent devis.
              </p>
            )}
          </div>
        )}

        {/* Zone de signature */}
        <div className="grid grid-cols-2 gap-6 border-t border-slate-300 pt-3 text-xs avoid-break">
          <div>
            <p className="font-bold text-slate-800">Pour l&apos;Entreprise</p>
            <div className="mt-1 h-14 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[10px] italic">
              Cachet et signature
            </div>
          </div>
          <div>
            <p className="font-bold text-slate-800">Pour le Client — « Bon pour accord »</p>
            {doc.signature_client ? (
              <div className="mt-1 rounded-xl border border-slate-300 flex flex-col items-center justify-center p-2">
                <p className="text-[10px] text-slate-600 mb-1 w-full text-left">Signé par : <strong>{doc.signataire_client_nom || "Le Client"}</strong></p>
                <Image src={doc.signature_client} alt="Signature Client" className="h-12 object-contain"  width={100} height={100} />
              </div>
            ) : (
              <div className="mt-1 h-14 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[10px] italic">
                Date, mention « Lu et approuvé » et signature
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* PAGE 2 : CONDITIONS GÉNÉRALES DE VENTE (CGV BTP) & RETRACTATION */}
      {/* ============================================================ */}
      {doc.kind === "devis" && (
        <div className="page-break mt-10 pt-6 border-t-2 border-slate-300 space-y-4 text-[10px] text-slate-700 leading-normal">
          {/* En-tête CGV */}
          <div className="flex items-center justify-between border-b border-slate-300 pb-2">
            <div className="flex items-center gap-3">
              <Image src={logoUrl} alt="Logo" className="h-12 w-auto object-contain"  width={100} height={100} />
              <div>
                <p className="font-bold text-slate-900 text-xs">{entreprise.raison_sociale}</p>
                <p className="text-[9px] text-slate-500">Conditions Générales de Vente — Travaux de Bardage &amp; ITE</p>
              </div>
            </div>
            <p className="font-mono text-[10px] text-slate-500 font-semibold">Annexe au Devis N° {doc.numero}</p>
          </div>

          {/* Grille des Articles CGV */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-justify">
            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-[11px]">Article 1 — Objet &amp; Champ d&apos;application</p>
              <p>
                Les présentes Conditions Générales de Vente (CGV) régissent l&apos;ensemble des travaux de fourniture, pose de bardage rapporté, vêtures, isolation thermique par l&apos;extérieur (ITE) et finitions réalisés par l&apos;entreprise <strong>{entreprise.raison_sociale}</strong>. Les travaux sont exécutés conformément aux règles de l&apos;art et aux prescriptions des DTU 41.2 (bardages bois) et DTU 31.2 / CSTB en vigueur.
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-[11px]">Article 2 — Devis, Validité &amp; Engagement</p>
              <p>
                Le présent devis est valable pendant une durée de <strong>{doc.validite_jours || 90} jours</strong> à compter de sa date d&apos;émission. L&apos;acceptation du devis par le Client, manifestée par sa signature manuscrite précédée de la mention manuscrite « Bon pour accord », vaut conclusion définitive du contrat d&apos;entreprise et acceptation sans réserve des présentes CGV.
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-[11px]">Article 3 — Droit de rétractation (Particuliers)</p>
              <p>
                Conformément aux articles L.221-18 et suivants du Code de la consommation, le Client particulier (consommateur) dispose d&apos;un délai légal de <strong>14 jours calendaires</strong> pour exercer son droit de rétractation à compter de la signature du devis sans avoir à motiver sa décision, au moyen du formulaire détachable ci-dessous ou d&apos;une déclaration dénuée d&apos;ambiguïté.
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-[11px]">Article 4 — Modalités de paiement &amp; Pénalités</p>
              <p>
                Sauf accord écrit contraire, le règlement s&apos;effectue selon les modalités suivantes : versement d&apos;un acompte de <strong>{doc.acompte_pct || 30} %</strong> à la commande pour validation des approvisionnements, situations intermédiaires éventuelles et solde intégral à la signature du Procès-Verbal de Réception des travaux. En cas de retard de paiement, des pénalités au taux légal majoré de 3 fois le taux d&apos;intérêt légal ainsi qu&apos;une indemnité forfaitaire de 40 € pour frais de recouvrement (clients pros) seront appliquées de plein droit.
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-[11px]">Article 5 — Délais d&apos;exécution &amp; Intempéries</p>
              <p>
                Les délais d&apos;intervention et d&apos;exécution sont donnés à titre indicatif. Ils sont suspendus et prolongés de plein droit en cas de force majeure, retards d&apos;accès au site non imputables à l&apos;entreprise, ou conditions météorologiques défavorables à la sécurité et à la qualité des ouvrages (vents supérieurs à 50 km/h, gel, fortes pluies certifiés par les relevés officiels Météo-France).
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-[11px]">Article 6 — Réception des travaux &amp; Transfert de garde</p>
              <p>
                À l&apos;achèvement des travaux, les parties procèdent contradictoirement à la réception des ouvrages matérialisée par l&apos;établissement d&apos;un Procès-Verbal de Réception (avec ou sans réserves). La réception constitue le point de départ des garanties légales et opère le transfert de garde des ouvrages au Client (Maître d&apos;Ouvrage).
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-[11px]">Article 7 — Retenue de garantie légale &amp; Consignation (Loi n° 71-584)</p>
              <p>
                Conformément aux dispositions de la loi n° 71-584 du 16 juillet 1971, une retenue de garantie égale au plus à 5 % du montant des travaux peut être appliquée sur les situations et acomptes, sous réserve d&apos;avoir été expressément convenue entre les parties dans le devis accepté. Cette retenue a pour objet exclusif de garantir contractuellement la bonne exécution des travaux et de répondre, le cas échéant, aux réserves formulées lors de la réception contradictoire des ouvrages. En application de l&apos;article 2 de ladite loi, les sommes retenues doivent être impérativement consignées entre les mains d&apos;un tiers consignataire accepté des deux parties ou désigné judiciairement. L&apos;entreprise conserve la faculté légale de substituer à cette retenue une caution personnelle et solidaire équivalente. La retenue (ou caution) est libérée dès la levée formelle des réserves constatée contradictoirement. À défaut de mainlevée amiable, elle est libérée de plein droit à l&apos;expiration d&apos;un délai d&apos;un an à compter de la date de réception des travaux, sauf opposition motivée notifiée par LRAR pour inexécution contractuelle.
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-[11px]">Article 8 — Assurances &amp; Garantie Décennale</p>
              <p>
                L&apos;entreprise est couverte par une assurance Responsabilité Civile Professionnelle et <strong>Garantie Décennale obligatoire</strong> (Art. 1792 du Code Civil) souscrite auprès de la compagnie <strong>{nomAssurance}</strong>, sous le contrat N° <strong>{policeAssurance}</strong>, valable pour les travaux exécutés en <strong>{zoneAssurance}</strong>.
              </p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-[11px]">Article 9 — Médiation de la consommation &amp; Litiges</p>
              <p>
                Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, le Client consommateur a le droit de recourir gratuitement au médiateur de la consommation compétent pour le règlement amiable de tout litige : <strong>{nomMediateur}</strong>, joignable via <strong>{contactMediateur}</strong>. À défaut d&apos;accord amiable, les tribunaux compétents seront ceux du siège social de l&apos;entreprise.
              </p>
            </div>
          </div>

          {/* ============================================================ */}
          {/* BORDEREAU DE RÉTRACTATION (LOI HAMON / CODE DE LA CONSOMMATION) */}
          {/* ============================================================ */}
          <div className="mt-4 pt-3 border-t-2 border-dashed border-slate-400 avoid-break space-y-2 bg-slate-50/80 p-3 rounded-xl">
            <div className="flex items-center justify-between text-slate-500 font-bold uppercase text-[9px] tracking-wider">
              <div className="flex items-center gap-1.5">
                <Scissors className="h-3.5 w-3.5" />
                <span>Bordereau de rétractation (À découper et envoyer en LRAR sous 14 jours si vous souhaitez annuler)</span>
              </div>
              <span>Loi Hamon — Art. L.221-18</span>
            </div>

            <div className="text-[9px] text-slate-700 space-y-1">
              <p>
                <strong>À l&apos;attention de :</strong> {entreprise.raison_sociale} — {entreprise.adresse}, {entreprise.code_postal} {entreprise.ville} (Email : {entreprise.email} · Tél : {entreprise.telephone})
              </p>
              <p>
                Je vous notifie par la présente ma rétractation du contrat portant sur les travaux de bardage / isolation ci-dessous :
              </p>

              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <p>• <strong>N° de Devis :</strong> {doc.numero}</p>
                <p>• <strong>Date du devis :</strong> {new Date(doc.date_emission).toLocaleDateString("fr-FR")}</p>
                <p>• <strong>Nom du client :</strong> {client.nom} {client.societe ? `(${client.societe})` : ""}</p>
                <p>• <strong>Adresse du client :</strong> {client.adresse_facturation || client.ville || "—"}</p>
                <p className="col-span-2">• <strong>Adresse du chantier :</strong> {doc.adresse_chantier || client.adresse_facturation || "—"}</p>
              </div>

              <div className="flex justify-between items-end pt-2">
                <p>Date : ................................................................</p>
                <div className="text-right">
                  <p className="font-semibold">Signature du client :</p>
                  <div className="h-10 w-48 border border-dashed border-slate-400 mt-1 rounded bg-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
