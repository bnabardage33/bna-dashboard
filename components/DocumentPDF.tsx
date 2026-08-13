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

  return (
    <div id="document-pdf-content" className="mx-auto max-w-3xl bg-white p-8 text-slate-900">
      <div className="mb-1 h-1.5 w-full bg-red-600" />

      <div className="flex items-start justify-between pt-4">
        <div className="flex items-center gap-3">
          {entreprise.logo_url && (
            <img src={entreprise.logo_url} alt="Logo" className="h-14 w-auto" />
          )}
          <div>
            <p className="text-lg font-bold text-slate-900">{entreprise.raison_sociale}</p>
            <p className="text-xs text-slate-500">Bardage · Façade · Nouvelle-Aquitaine</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-4xl font-extrabold tracking-tight text-slate-900">{titre}</p>
          <p className="text-sm font-medium text-red-600">N° {doc.numero}</p>
          <p className="text-xs text-slate-500">
            {new Date(doc.date_emission).toLocaleDateString("fr-FR")}
            {doc.kind === "devis" && doc.validite_jours
              ? ` · Valable ${doc.validite_jours} jours`
              : ""}
          </p>
          <span className="mt-1 inline-block rounded-full bg-slate-900 px-3 py-0.5 text-xs font-medium text-white">
            {doc.statut}
          </span>
          {doc.kind === "facture" && doc.type_facture && doc.type_facture !== "totale" && (
            <span className="ml-2 mt-1 inline-block rounded-full bg-red-600 px-3 py-0.5 text-xs font-semibold uppercase text-white">
              {doc.type_facture}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200">
          <div className="bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
            Votre entreprise
          </div>
          <div className="space-y-1 p-3 text-sm">
            <p className="font-semibold">{entreprise.raison_sociale}</p>
            {entreprise.adresse && <p>{entreprise.adresse}</p>}
            {(entreprise.code_postal || entreprise.ville) && (
              <p>
                {entreprise.code_postal} {entreprise.ville}
              </p>
            )}
            {entreprise.siret && <p className="text-xs text-slate-500">SIRET {entreprise.siret}</p>}
            {entreprise.assurance && (
              <p className="text-xs text-slate-500">Assurance : {entreprise.assurance}</p>
            )}
            {entreprise.telephone && <p>{entreprise.telephone}</p>}
            {entreprise.email && <p>{entreprise.email}</p>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200">
          <div className="bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
            Client
          </div>
          <div className="space-y-1 p-3 text-sm">
            {client.societe && <p className="font-semibold">{client.societe}</p>}
            <p className={client.societe ? "" : "font-semibold"}>{client.nom}</p>
            {client.adresse_facturation && <p>{client.adresse_facturation}</p>}
            {(client.code_postal || client.ville) && (
              <p>
                {client.code_postal} {client.ville}
              </p>
            )}
            {client.tel && <p>{client.tel}</p>}
            {client.email && <p>{client.email}</p>}
          </div>
        </div>
      </div>

      {(doc.adresse_chantier || doc.type_travaux) && (
        <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-3 text-sm">
          {doc.adresse_chantier && (
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Adresse chantier</p>
              <p>{doc.adresse_chantier}</p>
            </div>
          )}
          {doc.type_travaux && (
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Type de travaux</p>
              <p>{doc.type_travaux}</p>
            </div>
          )}
        </div>
      )}

      {doc.objet && (
        <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Objet</p>
          <p>{doc.objet}</p>
        </div>
      )}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-900 text-left text-xs uppercase text-slate-500">
            <th className="py-2">Désignation</th>
            <th className="py-2 text-right">Qté</th>
            <th className="py-2 text-right">Unité</th>
            <th className="py-2 text-right">PU HT</th>
            <th className="py-2 text-right">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {doc.lignes.map((l, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2">
                <p className="font-medium">{l.designation}</p>
                {l.description && <p className="text-xs text-slate-500">{l.description}</p>}
              </td>
              <td className="py-2 text-right">{l.qte}</td>
              <td className="py-2 text-right">{l.unite}</td>
              <td className="py-2 text-right">{euros(l.pu_ht)}</td>
              <td className="py-2 text-right font-medium">{euros(l.qte * l.pu_ht)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Total HT</span>
            <span>{euros(totalHT)}</span>
          </div>
          <div className="flex justify-between">
            <span>TVA ({doc.tva_pct} %)</span>
            <span>{euros(tva)}</span>
          </div>
          <div className="flex justify-between rounded-lg bg-slate-900 px-3 py-2 font-bold text-white">
            <span>Total TTC</span>
            <span>{euros(totalTTC)}</span>
          </div>
          {acompte !== null && (
            <div className="flex justify-between text-xs text-slate-500">
              <span>Acompte ({doc.acompte_pct} %)</span>
              <span>{euros(acompte)}</span>
            </div>
          )}
          {doc.kind === "facture" && doc.echeance && (
            <div className="flex justify-between text-xs text-slate-500">
              <span>Échéance</span>
              <span>{new Date(doc.echeance).toLocaleDateString("fr-FR")}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 border-t border-slate-200 pt-4 text-xs">
        {doc.kind === "devis" ? (
          <>
            <div>
              <p className="font-semibold">Délai</p>
              <p className="text-slate-500">{doc.delai_jours ? `${doc.delai_jours} jours ouvrés` : "À définir"}</p>
            </div>
            <div>
              <p className="font-semibold">Paiement</p>
              <p className="text-slate-500">{doc.acompte_pct ?? 30}% à la commande, solde à réception</p>
            </div>
            <div>
              <p className="font-semibold">Conditions d&apos;exécution</p>
              <p className="text-slate-500">
                Interventions suspendues si conditions météo/sécurité défavorables.
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="font-semibold">Règlement</p>
              <p className="text-slate-500">Virement bancaire à échéance</p>
            </div>
            <div>
              <p className="font-semibold">IBAN</p>
              <p className="text-slate-500">{entreprise.iban || "—"}</p>
            </div>
            <div>
              <p className="font-semibold">BIC</p>
              <p className="text-slate-500">{entreprise.bic || "—"}</p>
            </div>
          </>
        )}
      </div>

      {entreprise.mentions_legales && (
        <p className="mt-4 text-[10px] text-slate-400">{entreprise.mentions_legales}</p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-slate-200 pt-4 text-xs">
        <div>
          <p className="font-semibold">L&apos;entreprise</p>
          <div className="mt-8 h-16 rounded-lg border border-dashed border-slate-300" />
        </div>
        <div>
          <p className="font-semibold">Le client — Bon pour accord</p>
          <div className="mt-8 h-16 rounded-lg border border-dashed border-slate-300" />
        </div>
      </div>
    </div>
  );
}
