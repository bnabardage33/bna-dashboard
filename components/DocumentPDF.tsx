// components/DocumentPDF.tsx
"use client";

type Ligne = { designation: string; description?: string; qte: number; unite: string; pu_ht: number };

type Entreprise = {
  raison_sociale: string;
  siret: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  assurance: string | null;
  iban: string | null;
  bic: string | null;
  mentions_legales: string | null;
  logo_url: string | null;
};

type Client = {
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
  type_facture?: "acompte" | "solde" | "totale";
};

function euros(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

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

  return (
    <div id="document-pdf-content" className="mx-auto max-w-3xl bg-white p-8 text-slate-900 shadow-xl">
      {/* Liseré supérieur bleu acier */}
      <div className="mb-2 h-1.5 w-full bg-sky-600 rounded-full" />

      <div className="flex items-start justify-between pt-3">
        <div className="flex items-center gap-3.5">
          <img
            src={logoUrl}
            alt="Logo BNA"
            className="max-h-12 w-auto object-contain"
          />
          <div>
            <p className="text-lg font-extrabold text-slate-900">{entreprise.raison_sociale}</p>
            <p className="text-xs text-slate-500 font-medium">Bardage Rapporté · Façades · Isolation ITE</p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-3xl font-black tracking-tight text-slate-900">{titre}</p>
          <p className="text-sm font-bold text-sky-600 font-mono">N° {doc.numero}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Émis le {new Date(doc.date_emission).toLocaleDateString("fr-FR")}
            {doc.kind === "devis" && doc.validite_jours
              ? ` · Valable ${doc.validite_jours} jours`
              : ""}
          </p>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <span className="inline-block rounded-full bg-slate-800 px-3 py-0.5 text-[11px] font-bold text-slate-100 uppercase tracking-wider">
              {doc.statut}
            </span>
            {doc.kind === "facture" && doc.type_facture && doc.type_facture !== "totale" && (
              <span className="inline-block rounded-full bg-sky-600 px-3 py-0.5 text-[11px] font-bold uppercase text-white">
                {doc.type_facture}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-300 overflow-hidden bg-slate-50/50 shadow-sm">
          <div className="bg-slate-800 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-100">
            Votre Entreprise
          </div>
          <div className="space-y-1 p-3 text-xs text-slate-700">
            <p className="font-bold text-slate-900 text-sm">{entreprise.raison_sociale}</p>
            {entreprise.adresse && <p>{entreprise.adresse}</p>}
            {(entreprise.code_postal || entreprise.ville) && (
              <p>
                {entreprise.code_postal} {entreprise.ville}
              </p>
            )}
            {entreprise.siret && <p className="text-slate-500 font-medium">SIRET : {entreprise.siret}</p>}
            {entreprise.assurance && (
              <p className="text-slate-500">Assurance : {entreprise.assurance}</p>
            )}
            {entreprise.telephone && <p>Tél : {entreprise.telephone}</p>}
            {entreprise.email && <p>Email : {entreprise.email}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-300 overflow-hidden bg-slate-50/50 shadow-sm">
          <div className="bg-slate-800 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-100">
            Client
          </div>
          <div className="space-y-1 p-3 text-xs text-slate-700">
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

      {(doc.adresse_chantier || doc.type_travaux) && (
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-xs">
          {doc.adresse_chantier && (
            <div>
              <p className="font-bold uppercase tracking-wide text-slate-500 text-[10px]">📍 Lieu du chantier</p>
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
        <div className="mt-3 rounded-xl border border-slate-300 bg-slate-50/50 p-3 text-xs">
          <p className="font-bold uppercase tracking-wide text-slate-500 text-[10px]">Objet du document</p>
          <p className="font-medium text-slate-900 mt-0.5">{doc.objet}</p>
        </div>
      )}

      <table className="mt-4 w-full text-xs border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-800 bg-slate-100 text-left font-bold uppercase tracking-wider text-slate-700 text-[10px]">
            <th className="p-2">Désignation</th>
            <th className="p-2 text-right">Qté</th>
            <th className="p-2 text-right">Unité</th>
            <th className="p-2 text-right">PU HT</th>
            <th className="p-2 text-right">Total HT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {doc.lignes.map((l, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              <td className="p-2">
                <p className="font-semibold text-slate-900">{l.designation}</p>
                {l.description && <p className="text-[11px] text-slate-500 mt-0.5">{l.description}</p>}
              </td>
              <td className="p-2 text-right text-slate-700">{l.qte}</td>
              <td className="p-2 text-right text-slate-700">{l.unite}</td>
              <td className="p-2 text-right text-slate-700">{euros(l.pu_ht)}</td>
              <td className="p-2 text-right font-bold text-slate-900">{euros(l.qte * l.pu_ht)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-72 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-700">
            <span>Total HT</span>
            <span className="font-semibold">{euros(totalHT)}</span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>TVA ({doc.tva_pct} %)</span>
            <span className="font-semibold">{euros(tva)}</span>
          </div>
          <div className="flex justify-between rounded-xl bg-slate-800 px-3.5 py-2.5 font-black text-sm text-slate-100 shadow-md">
            <span>TOTAL TTC</span>
            <span className="text-sky-400 font-mono">{euros(totalTTC)}</span>
          </div>
          {acompte !== null && (
            <div className="flex justify-between text-slate-600 text-[11px] pt-1">
              <span>Acompte demandé ({doc.acompte_pct} %)</span>
              <span className="font-semibold">{euros(acompte)}</span>
            </div>
          )}
          {doc.kind === "facture" && doc.echeance && (
            <div className="flex justify-between text-slate-600 text-[11px]">
              <span>Date d&apos;échéance</span>
              <span className="font-semibold">{new Date(doc.echeance).toLocaleDateString("fr-FR")}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-300 pt-4 text-xs">
        {doc.kind === "devis" ? (
          <>
            <div>
              <p className="font-bold text-slate-800">Délai</p>
              <p className="text-slate-500 text-[11px]">{doc.delai_jours ? `${doc.delai_jours} jours ouvrés` : "À convenir"}</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">Modalités de règlement</p>
              <p className="text-slate-500 text-[11px]">{doc.acompte_pct ?? 30}% à la commande, solde à réception</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">Conditions DTU</p>
              <p className="text-slate-500 text-[11px]">
                Pose conforme aux normes DTU 41.2 / DTU 31.2.
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="font-bold text-slate-800">Règlement</p>
              <p className="text-slate-500 text-[11px]">Virement bancaire à réception</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">IBAN</p>
              <p className="text-slate-600 font-mono text-[11px]">{entreprise.iban || "—"}</p>
            </div>
            <div>
              <p className="font-bold text-slate-800">BIC</p>
              <p className="text-slate-600 font-mono text-[11px]">{entreprise.bic || "—"}</p>
            </div>
          </>
        )}
      </div>

      {entreprise.mentions_legales && (
        <p className="mt-4 text-[10px] text-slate-400 italic">{entreprise.mentions_legales}</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-300 pt-4 text-xs">
        <div>
          <p className="font-bold text-slate-800">Pour l&apos;Entreprise</p>
          <div className="mt-2 h-16 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[10px] italic">
            Cachet et signature
          </div>
        </div>
        <div>
          <p className="font-bold text-slate-800">Pour le Client — « Bon pour accord »</p>
          <div className="mt-2 h-16 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[10px] italic">
            Date et signature manuscrite
          </div>
        </div>
      </div>
    </div>
  );
}
