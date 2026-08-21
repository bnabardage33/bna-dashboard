"use client";

type Entreprise = {
  raison_sociale: string;
  siret: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  logo_url: string | null;
};

type FournisseurInfo = {
  nom: string;
  contact: string | null;
  telephone: string | null;
  email: string | null;
  conditions_paiement: string | null;
};

type ChantierInfo = {
  nom: string | null;
  adresse: string | null;
  clientNom?: string | null;
};

export type BonCommandeData = {
  id: string;
  created_at: string;
  designation: string;
  quantite: number | null;
  unite: string | null;
  montant_ht: number | null;
  date_livraison_prevue: string | null;
  lignes?: { designation: string; quantite: number; unite: string; montant_ht?: number | null }[];
};

export default function BonCommandePDF({
  commande,
  fournisseur,
  chantier,
  entreprise,
}: {
  commande: BonCommandeData;
  fournisseur: FournisseurInfo;
  chantier: ChantierInfo;
  entreprise: Entreprise;
}) {
  const dateEmission = new Date(commande.created_at || Date.now()).toLocaleDateString("fr-FR");
  const dateLivraison = commande.date_livraison_prevue
    ? new Date(commande.date_livraison_prevue).toLocaleDateString("fr-FR")
    : "Dès que possible";

  const lignes = commande.lignes && commande.lignes.length > 0
    ? commande.lignes
    : [{ designation: commande.designation, quantite: commande.quantite || 1, unite: commande.unite || "u", montant_ht: commande.montant_ht }];

  return (
    <div id="document-pdf-content" className="mx-auto max-w-3xl bg-white p-8 text-slate-900">
      {/* Bandeau supérieur */}
      <div className="mb-1 h-1.5 w-full bg-red-600" />

      {/* En-tête */}
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
          <p className="text-3xl font-extrabold tracking-tight text-slate-900">
            BON DE COMMANDE
          </p>
          <p className="text-sm font-semibold text-red-600">
            RÉF #{commande.id.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-xs text-slate-500">Date d&apos;émission : {dateEmission}</p>
        </div>
      </div>

      {/* Adresses Émetteur / Fournisseur / Livraison */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Émetteur / Acheteur</p>
          <p className="mt-1 font-semibold text-slate-900">{entreprise.raison_sociale}</p>
          {entreprise.adresse && <p className="text-xs text-slate-600">{entreprise.adresse}</p>}
          {(entreprise.code_postal || entreprise.ville) && (
            <p className="text-xs text-slate-600">{entreprise.code_postal} {entreprise.ville}</p>
          )}
          {entreprise.siret && <p className="text-xs text-slate-400">SIRET {entreprise.siret}</p>}
          {entreprise.telephone && <p className="text-xs text-slate-600">Tél : {entreprise.telephone}</p>}
          {entreprise.email && <p className="text-xs text-slate-600">Email : {entreprise.email}</p>}
        </div>

        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Fournisseur</p>
          <p className="mt-1 font-semibold text-slate-900">{fournisseur.nom}</p>
          {fournisseur.contact && <p className="text-xs text-slate-600">Contact : {fournisseur.contact}</p>}
          {fournisseur.telephone && <p className="text-xs text-slate-600">Tél : {fournisseur.telephone}</p>}
          {fournisseur.email && <p className="text-xs text-slate-600">Email : {fournisseur.email}</p>}
          {fournisseur.conditions_paiement && (
            <p className="text-xs text-slate-500">Règlement : {fournisseur.conditions_paiement}</p>
          )}
        </div>
      </div>

      {/* Lieu et Date de livraison */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Adresse de livraison (Chantier)</p>
            <p className="mt-0.5 font-semibold text-slate-900">{chantier.nom || "Chantier BNA"}</p>
            <p className="text-xs text-slate-600">{chantier.adresse || "À préciser / Atelier"}</p>
            {chantier.clientNom && (
              <p className="text-xs text-slate-500">Pour le compte de : {chantier.clientNom}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-slate-500">Date de livraison souhaitée</p>
            <p className="mt-0.5 text-base font-bold text-red-600">{dateLivraison}</p>
            <p className="text-xs text-slate-500">Merci de prévenir avant livraison.</p>
          </div>
        </div>
      </div>

      {/* Tableau des Articles Commandés */}
      <div className="mt-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Articles & Fournitures Commandés
        </p>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-900 bg-slate-100 text-left text-xs uppercase text-slate-600">
              <th className="p-2.5">Désignation</th>
              <th className="p-2.5 text-right">Quantité</th>
              <th className="p-2.5 text-left">Unité</th>
              {commande.montant_ht !== null && <th className="p-2.5 text-right">Montant HT</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {lignes.map((l, idx) => (
              <tr key={idx}>
                <td className="p-2.5 font-medium text-slate-900">{l.designation}</td>
                <td className="p-2.5 text-right font-bold">{l.quantite}</td>
                <td className="p-2.5 text-slate-600">{l.unite}</td>
                {commande.montant_ht !== null && (
                  <td className="p-2.5 text-right text-slate-800">
                    {l.montant_ht ? `${l.montant_ht.toFixed(2)} €` : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Total HT si renseigné */}
      {commande.montant_ht !== null && commande.montant_ht > 0 && (
        <div className="mt-4 flex justify-end">
          <div className="w-60 rounded-lg border border-slate-200 bg-slate-50 p-3 text-right">
            <p className="text-xs text-slate-500">Total estimé HT</p>
            <p className="text-xl font-bold text-slate-900">{commande.montant_ht.toFixed(2)} €</p>
          </div>
        </div>
      )}

      {/* Signatures & Instructions */}
      <div className="mt-8 grid grid-cols-2 gap-6 border-t border-slate-200 pt-4 text-xs">
        <div>
          <p className="font-semibold text-slate-800">Pour l&apos;acheteur ({entreprise.raison_sociale})</p>
          <p className="text-[10px] text-slate-500">Bon pour accord et commande</p>
          <div className="mt-4 h-16 rounded-lg border border-dashed border-slate-300 p-2 text-[10px] text-slate-400">
            Signature & Cachet
          </div>
        </div>

        <div>
          <p className="font-semibold text-slate-800">Accusé de réception Fournisseur</p>
          <p className="text-[10px] text-slate-500">À retourner signé avec date de livraison confirmée</p>
          <div className="mt-4 h-16 rounded-lg border border-dashed border-slate-300 p-2 text-[10px] text-slate-400">
            Signature & Date confirmée
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[9px] text-slate-400">
        Document généré par {entreprise.raison_sociale} — Merci de rappeler la référence #{commande.id.slice(0, 8).toUpperCase()} sur le bon de livraison et la facture.
      </p>
    </div>
  );
}
