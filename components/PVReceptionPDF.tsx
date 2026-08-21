// components/PVReceptionPDF.tsx
"use client";

export type StatutPV = "sans_reserve" | "avec_reserves" | "reserves_levees" | "refuse";

export type Reserve = {
  id: string;
  designation: string;
  localisation: string;
  date_limite: string;
  levee: boolean;
  date_levee?: string;
};

export type ChecklistRepli = {
  nettoyage: boolean;
  dechets_evacues: boolean;
  echafaudage_demonte: boolean;
  fiches_techniques_remises: boolean;
};

export type PVReceptionData = {
  numero: string;
  date_reception: string;
  statut: StatutPV;
  type_travaux: string | null;
  adresse_chantier: string | null;
  materiaux_utilises: string | null;
  reserves: Reserve[];
  observations: string | null;
  signature_client: string | null;
  signataire_client_nom: string | null;
  signature_entreprise: string | null;
  signataire_entreprise_nom: string | null;
  checklist_repli: ChecklistRepli;
};

export type EntrepriseInfo = {
  raison_sociale: string;
  siret: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  logo_url: string | null;
  assurance_decennale_nom?: string | null;
  assurance_decennale_police?: string | null;
};

export type ClientInfo = {
  nom: string;
  adresse?: string | null;
  telephone?: string | null;
  email?: string | null;
};

export type ChantierInfo = {
  nom: string | null;
  adresse_chantier?: string | null;
  devis_numero?: string | null;
};

const LABELS_STATUT: Record<StatutPV, { label: string; bg: string; text: string; desc: string }> = {
  sans_reserve: {
    label: "RÉCEPTION PRONONCÉE SANS RÉSERVE",
    bg: "bg-emerald-100 border-emerald-500",
    text: "text-emerald-900",
    desc: "Les travaux sont déclarés conformes aux règles de l'art (DTU 41.2 / 31.2) et acceptés en l'état sans réserve.",
  },
  avec_reserves: {
    label: "RÉCEPTION PRONONCÉE AVEC RÉSERVES",
    bg: "bg-amber-100 border-amber-500",
    text: "text-amber-900",
    desc: "La réception est prononcée avec engagement de l'entreprise de lever les réserves énumérées ci-dessous dans les délais fixés.",
  },
  reserves_levees: {
    label: "RÉSERVES INTÉGRALEMENT LEVÉES",
    bg: "bg-sky-100 border-sky-500",
    text: "text-sky-900",
    desc: "L'ensemble des réserves précédemment consignées a été valablement repris et validé par le maître d'ouvrage.",
  },
  refuse: {
    label: "REFUS DE RÉCEPTION",
    bg: "bg-red-100 border-red-500",
    text: "text-red-900",
    desc: "La réception ne peut être prononcée en l'état en raison de non-conformités ou d'inachèvement majeur.",
  },
};

export default function PVReceptionPDF({
  pv,
  entreprise,
  client,
  chantier,
}: {
  pv: PVReceptionData;
  entreprise: EntrepriseInfo;
  client: ClientInfo;
  chantier: ChantierInfo;
}) {
  const statutConfig = LABELS_STATUT[pv.statut] || LABELS_STATUT.sans_reserve;

  return (
    <div id="document-pdf-content" className="mx-auto max-w-4xl bg-white p-8 text-slate-900 text-xs font-sans">
      {/* Ligne d'accent supérieure rouge BNA */}
      <div className="mb-2 h-1.5 w-full bg-red-600" />

      {/* EN-TÊTE OFFICIEL */}
      <div className="flex items-start justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3.5">
          {entreprise.logo_url && (
            <img src={entreprise.logo_url} alt="Logo" className="h-14 w-auto object-contain" />
          )}
          <div>
            <p className="text-base font-bold text-slate-900">{entreprise.raison_sociale}</p>
            <p className="text-[11px] text-slate-500">Spécialiste Bardage · Isolation ITE · Façade</p>
            {entreprise.siret && <p className="text-[10px] text-slate-400">SIRET : {entreprise.siret}</p>}
            <p className="text-[10px] text-slate-400">
              {entreprise.adresse} {entreprise.code_postal} {entreprise.ville} · {entreprise.telephone}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-block rounded bg-slate-900 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
            {pv.numero}
          </span>
          <p className="mt-1 text-[11px] font-semibold text-slate-700">
            Date de réception : {new Date(pv.date_reception).toLocaleDateString("fr-FR")}
          </p>
          {chantier.devis_numero && (
            <p className="text-[10px] text-slate-500">Réf. Devis : {chantier.devis_numero}</p>
          )}
        </div>
      </div>

      {/* TITRE PRINCIPAL & CADRE JURIDIQUE */}
      <div className="my-4 text-center">
        <h1 className="text-base font-extrabold uppercase tracking-wide text-slate-900">
          Procès-Verbal de Réception de Travaux
        </h1>
        <p className="text-[10px] text-slate-500 italic">
          Établi conformément aux dispositions de l&apos;Article 1792-6 du Code Civil (Norme NF P 03-001)
        </p>
      </div>

      {/* CADRES IDENTIFICATION : CLIENT & CHANTIER */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Maître d'ouvrage / Client */}
        <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            👤 Maître d&apos;Ouvrage (Client)
          </p>
          <p className="font-bold text-slate-900 text-sm">{client.nom}</p>
          {client.adresse && <p className="text-slate-600">{client.adresse}</p>}
          {client.telephone && <p className="text-slate-500">Tél : {client.telephone}</p>}
          {client.email && <p className="text-slate-500">Email : {client.email}</p>}
        </div>

        {/* Emplacement du Chantier */}
        <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            📍 Ouvrage & Chantier Exécuté
          </p>
          <p className="font-bold text-slate-900 text-sm">{chantier.nom || "Chantier de bardage"}</p>
          <p className="text-slate-600">
            Adresse : {pv.adresse_chantier || chantier.adresse_chantier || "Sur site client"}
          </p>
          <p className="text-slate-500">
            Nature : {pv.type_travaux || "Travaux de bardage et isolation thermique"}
          </p>
          {pv.materiaux_utilises && (
            <p className="text-[11px] text-slate-600 font-medium">Matériaux : {pv.materiaux_utilises}</p>
          )}
        </div>
      </div>

      {/* CADRE DE PRONONCIATION DE LA RÉCEPTION */}
      <div className={`rounded-lg border-2 p-3.5 mb-4 ${statutConfig.bg}`}>
        <div className="flex items-center justify-between">
          <p className={`font-extrabold text-sm uppercase tracking-wide ${statutConfig.text}`}>
            {statutConfig.label}
          </p>
          <span className="text-[10px] font-semibold text-slate-600">
            Prise d&apos;effet : {new Date(pv.date_reception).toLocaleDateString("fr-FR")}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-700 leading-relaxed">{statutConfig.desc}</p>
      </div>

      {/* TABLEAU DES RÉSERVES (Si avec réserves ou réserves levées) */}
      {(pv.statut === "avec_reserves" || pv.statut === "reserves_levees" || pv.reserves.length > 0) && (
        <div className="mb-4 space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
            📝 Liste des réserves constatées ({pv.reserves.length})
          </p>
          <table className="w-full border-collapse border border-slate-300 text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-left font-bold text-slate-700">
                <th className="border border-slate-300 p-1.5 w-8 text-center">N°</th>
                <th className="border border-slate-300 p-1.5">Désignation du désordre / retouche</th>
                <th className="border border-slate-300 p-1.5 w-32">Localisation</th>
                <th className="border border-slate-300 p-1.5 w-24 text-center">Délai limite</th>
                <th className="border border-slate-300 p-1.5 w-24 text-center">Statut</th>
              </tr>
            </thead>
            <tbody>
              {pv.reserves.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-slate-300 p-2 text-center text-slate-400 italic">
                    Aucune réserve formulée.
                  </td>
                </tr>
              ) : (
                pv.reserves.map((r, idx) => (
                  <tr key={r.id || idx} className={r.levee ? "bg-emerald-50/50" : ""}>
                    <td className="border border-slate-300 p-1.5 text-center font-bold">{idx + 1}</td>
                    <td className="border border-slate-300 p-1.5 font-medium">{r.designation}</td>
                    <td className="border border-slate-300 p-1.5 text-slate-600">{r.localisation || "Façade"}</td>
                    <td className="border border-slate-300 p-1.5 text-center">
                      {r.date_limite ? new Date(r.date_limite).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-center font-semibold">
                      {r.levee ? (
                        <span className="text-emerald-700">
                          ✓ Levée {r.date_levee ? `(${new Date(r.date_levee).toLocaleDateString("fr-FR")})` : ""}
                        </span>
                      ) : (
                        <span className="text-amber-700">À lever</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CHECKLIST DE REPLI & OBSERVATIONS */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Checklist Repli */}
        <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-2.5 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            🧹 Propreté & Repli de Chantier
          </p>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <p className="flex items-center gap-1.5 text-slate-700">
              <span>{pv.checklist_repli.nettoyage ? "☑️" : "⬜"}</span> Nettoyage du site
            </p>
            <p className="flex items-center gap-1.5 text-slate-700">
              <span>{pv.checklist_repli.dechets_evacues ? "☑️" : "⬜"}</span> Déchets évacués
            </p>
            <p className="flex items-center gap-1.5 text-slate-700">
              <span>{pv.checklist_repli.echafaudage_demonte ? "☑️" : "⬜"}</span> Échafaudage démonté
            </p>
            <p className="flex items-center gap-1.5 text-slate-700">
              <span>{pv.checklist_repli.fiches_techniques_remises ? "☑️" : "⬜"}</span> Fiches techniques
            </p>
          </div>
        </div>

        {/* Observations */}
        <div className="rounded-lg border border-slate-300 bg-slate-50/50 p-2.5 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            💬 Observations Particulières
          </p>
          <p className="text-[10px] text-slate-600 italic leading-relaxed">
            {pv.observations || "Aucune observation particulière consignée."}
          </p>
        </div>
      </div>

      {/* GARANTIES LÉGALES & ASSURANCE DÉCENNALE */}
      <div className="rounded-lg border border-slate-300 bg-slate-100/60 p-2.5 mb-4 space-y-1 text-[10px] text-slate-600">
        <p className="font-bold text-slate-800 uppercase tracking-wide">
          🛡️ Déclenchement des Garanties Légales à compter de la date de réception :
        </p>
        <p>
          • <strong>Garantie de Parfait Achèvement (GPA)</strong> : 1 an pour tous désordres signalés (Art. 1792-6).<br />
          • <strong>Garantie Biennale de bon fonctionnement</strong> : 2 ans sur les éléments dissociables (Art. 1792-3).<br />
          • <strong>Garantie Décennale</strong> : 10 ans couvrant la solidité de l&apos;ouvrage et l&apos;imperméabilité (Art. 1792).
          {entreprise.assurance_decennale_nom && (
            <span className="text-slate-800 font-semibold">
              {" "}— Assurance Décennale : {entreprise.assurance_decennale_nom}{" "}
              {entreprise.assurance_decennale_police ? `(Police N° ${entreprise.assurance_decennale_police})` : ""}
            </span>
          )}
        </p>
      </div>

      {/* CADRES D'ÉMARGEMENT & SIGNATURES */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        {/* Signature Client */}
        <div className="rounded-lg border border-slate-400 p-3 flex flex-col justify-between h-36">
          <div>
            <p className="font-bold text-slate-800 uppercase text-[10px]">
              Pour le Maître d&apos;Ouvrage (Client) :
            </p>
            <p className="text-[10px] text-slate-500">
              Nom : <strong>{pv.signataire_client_nom || client.nom}</strong>
            </p>
            <p className="text-[9px] text-slate-400 italic">
              Mention « Lu et approuvé, bon pour réception des travaux »
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center py-1">
            {pv.signature_client ? (
              <img src={pv.signature_client} alt="Signature Client" className="max-h-16 max-w-full object-contain" />
            ) : (
              <p className="text-[10px] text-slate-300 italic">Signature manuscrite</p>
            )}
          </div>

          <p className="text-[9px] text-right text-slate-400">Date et signature</p>
        </div>

        {/* Signature Entreprise */}
        <div className="rounded-lg border border-slate-400 p-3 flex flex-col justify-between h-36">
          <div>
            <p className="font-bold text-slate-800 uppercase text-[10px]">
              Pour l&apos;Entreprise Exécutante :
            </p>
            <p className="text-[10px] text-slate-500">
              Nom : <strong>{pv.signataire_entreprise_nom || entreprise.raison_sociale}</strong>
            </p>
            <p className="text-[9px] text-slate-400 italic">Cachet et signature du chef de chantier</p>
          </div>

          <div className="flex-1 flex items-center justify-center py-1">
            {pv.signature_entreprise ? (
              <img src={pv.signature_entreprise} alt="Signature Entreprise" className="max-h-16 max-w-full object-contain" />
            ) : (
              <p className="text-[10px] text-slate-300 italic">Cachet et signature</p>
            )}
          </div>

          <p className="text-[9px] text-right text-slate-400">Date et signature</p>
        </div>
      </div>
    </div>
  );
}
