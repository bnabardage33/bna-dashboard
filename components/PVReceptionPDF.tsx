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

export type ZoneMetre = {
  id: string;
  nom: string;
  type: "facade" | "pignon";
  largeur: number;
  hauteur_mur: number;
  hauteur_faite?: number | null;
  surfaceBrute: number;
  surfaceOuvertures: number;
  surfaceNette: number;
  materiau: string;
};

export type PhotoFinChantier = {
  id: string;
  url: string;
  titre?: string;
};

export type NoticeEntretien = {
  remise_fiches_techniques: boolean;
  remise_guide_entretien: boolean;
  remise_attestation_decennale: boolean;
  frequence_nettoyage_recommandee?: string;
  controle_joints_recommande?: string;
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
  zones_metres?: ZoneMetre[];
  photos?: PhotoFinChantier[];
  reserves: Reserve[];
  observations: string | null;
  notice_entretien?: NoticeEntretien;
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
    desc: "Les travaux sont déclarés conformes aux règles de l'art (DTU 41.2 / DTU 31.2 / CSTB 3194) et acceptés en l'état sans réserve. Prise de possession immédiate de l'ouvrage.",
  },
  avec_reserves: {
    label: "RÉCEPTION PRONONCÉE AVEC RÉSERVES",
    bg: "bg-amber-100 border-amber-500",
    text: "text-amber-900",
    desc: "La réception est prononcée avec engagement formel de l'entreprise d'effectuer la levée des réserves consignées au tableau ci-dessous avant les dates limites fixées.",
  },
  reserves_levees: {
    label: "RÉSERVES INTÉGRALEMENT LEVÉES",
    bg: "bg-sky-100 border-sky-500",
    text: "text-sky-900",
    desc: "L'ensemble des désordres ou finitions précédemment signalés a été valablement repris et formellement validé par le Maître d'Ouvrage. L'ouvrage est purgé de toute réserve.",
  },
  refuse: {
    label: "REFUS DE RÉCEPTION",
    bg: "bg-red-100 border-red-500",
    text: "text-red-900",
    desc: "La réception ne peut être prononcée en l'état en raison de non-conformités substantielles ou d'inachèvement majeur.",
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
  const zones = pv.zones_metres || [];
  const photos = (pv.photos || []).filter((p) => !!p.url).slice(0, 4);

  const totalBrut = zones.reduce((s, z) => s + (z.surfaceBrute || 0), 0);
  const totalOuvertures = zones.reduce((s, z) => s + (z.surfaceOuvertures || 0), 0);
  const totalNet = zones.reduce((s, z) => s + (z.surfaceNette || 0), 0);

  const notice = pv.notice_entretien || {
    remise_fiches_techniques: true,
    remise_guide_entretien: true,
    remise_attestation_decennale: true,
    frequence_nettoyage_recommandee: "Lavage annuel à l'eau douce / savon doux (proscrire nettoyeur haute pression et solvants)",
    controle_joints_recommande: "Inspection visuelle annuelle des grilles anti-rongeurs et bavettes",
  };

  return (
    <div id="document-pdf-content" className="mx-auto max-w-4xl bg-white p-8 text-slate-900 text-xs font-sans space-y-5">
      {/* ============================================================ */}
      {/* 1. EN-TÊTE OFFICIEL BNA */}
      {/* ============================================================ */}
      <div className="mb-2 h-1.5 w-full bg-sky-600 rounded-full" />

      <div className="flex items-start justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3.5">
          <img
            src={entreprise.logo_url || "/logo-bna.png"}
            alt="Logo BNA"
            className="max-h-12 w-auto object-contain"
          />
          <div>
            <p className="text-base font-extrabold text-slate-900">{entreprise.raison_sociale}</p>
            <p className="text-[11px] font-medium text-slate-600">Spécialiste Bardage Rapporté · Isolation ITE · Façades</p>
            {entreprise.siret && <p className="text-[10px] text-slate-400">SIRET : {entreprise.siret}</p>}
            <p className="text-[10px] text-slate-400">
              {entreprise.adresse} {entreprise.code_postal} {entreprise.ville} · {entreprise.telephone} · {entreprise.email}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-block rounded bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white font-mono">
            {pv.numero}
          </span>
          <p className="mt-1.5 text-[11px] font-bold text-slate-800">
            Date de réception : {new Date(pv.date_reception).toLocaleDateString("fr-FR")}
          </p>
          {chantier.devis_numero && (
            <p className="text-[10px] text-slate-500 font-medium">Réf. Devis Marché : {chantier.devis_numero}</p>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. TITRE & CADRE JURIDIQUE */}
      {/* ============================================================ */}
      <div className="text-center space-y-0.5">
        <h1 className="text-base font-black uppercase tracking-wide text-slate-900">
          Procès-Verbal de Réception de Travaux
        </h1>
        <p className="text-[10px] text-slate-500 italic">
          Conforme à l&apos;Article 1792-6 du Code Civil · Norme NF P 03-001 (Cahier des Clauses Administratives Générales)
        </p>
      </div>

      {/* ============================================================ */}
      {/* 3. IDENTIFICATION : CLIENT & CHANTIER */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 gap-4">
        {/* Maître d'Ouvrage */}
        <div className="rounded-xl border border-slate-300 bg-slate-50/70 p-3.5 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            👤 Maître d&apos;Ouvrage (Client)
          </p>
          <p className="font-bold text-slate-900 text-sm">{client.nom}</p>
          {client.adresse && <p className="text-slate-600">{client.adresse}</p>}
          {client.telephone && <p className="text-slate-500">Tél : {client.telephone}</p>}
          {client.email && <p className="text-slate-500">Email : {client.email}</p>}
        </div>

        {/* Chantier & Ouvrage */}
        <div className="rounded-xl border border-slate-300 bg-slate-50/70 p-3.5 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            📍 Ouvrage Réceptionné
          </p>
          <p className="font-bold text-slate-900 text-sm">{chantier.nom || "Chantier de bardage"}</p>
          <p className="text-slate-600">
            Lieu : {pv.adresse_chantier || chantier.adresse_chantier || "Sur site client"}
          </p>
          <p className="text-slate-500">
            Nature : {pv.type_travaux || "Travaux de bardage et isolation extérieure"}
          </p>
          {pv.materiaux_utilises && (
            <p className="text-[11px] text-slate-700 font-medium">Matériaux : {pv.materiaux_utilises}</p>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. PRONONCIATION OFFICIELLE DE LA RÉCEPTION */}
      {/* ============================================================ */}
      <div className={`rounded-xl border-2 p-3.5 ${statutConfig.bg}`}>
        <div className="flex items-center justify-between">
          <p className={`font-black text-xs uppercase tracking-wider ${statutConfig.text}`}>
            {statutConfig.label}
          </p>
          <span className="text-[10px] font-bold text-slate-700 bg-white/80 px-2 py-0.5 rounded border">
            Prise d&apos;effet légale : {new Date(pv.date_reception).toLocaleDateString("fr-FR")}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-slate-800 leading-relaxed font-medium">{statutConfig.desc}</p>
      </div>

      {/* ============================================================ */}
      {/* 5. TABLEAU DÉTAILLÉ DES SURFACES & MÉTRÉS EXÉCUTÉS */}
      {/* ============================================================ */}
      {zones.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-800 flex items-center gap-1.5">
              <span>📐</span> Métrés &amp; Surfaces Posées sur l&apos;Ouvrage
            </p>
            <span className="text-[10px] font-semibold text-slate-500">
              {zones.length} zone(s) traitée(s)
            </span>
          </div>

          <table className="w-full border-collapse border border-slate-300 text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-left font-bold text-slate-700 text-[10px] uppercase">
                <th className="border border-slate-300 p-2">Désignation / Zone</th>
                <th className="border border-slate-300 p-2 text-center">Type</th>
                <th className="border border-slate-300 p-2 text-center">Dimensions</th>
                <th className="border border-slate-300 p-2 text-right">Surface Brute</th>
                <th className="border border-slate-300 p-2 text-right">Déductions Baies</th>
                <th className="border border-slate-300 p-2 text-right font-black">Surface Nette Posée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {zones.map((z, idx) => (
                <tr key={z.id || idx} className="hover:bg-slate-50/60">
                  <td className="border border-slate-300 p-2 font-semibold text-slate-900">
                    {z.nom}
                    {z.materiau && <span className="block text-[10px] text-slate-500 font-normal">{z.materiau}</span>}
                  </td>
                  <td className="border border-slate-300 p-2 text-center capitalize text-slate-600">
                    {z.type === "pignon" ? "Pignon" : "Façade"}
                  </td>
                  <td className="border border-slate-300 p-2 text-center text-slate-600">
                    {z.largeur} m × {z.hauteur_mur} m
                    {z.hauteur_faite ? ` (Faîte ${z.hauteur_faite}m)` : ""}
                  </td>
                  <td className="border border-slate-300 p-2 text-right text-slate-600">
                    {z.surfaceBrute.toFixed(2)} m²
                  </td>
                  <td className="border border-slate-300 p-2 text-right text-slate-500">
                    {z.surfaceOuvertures > 0 ? `- ${z.surfaceOuvertures.toFixed(2)} m²` : "—"}
                  </td>
                  <td className="border border-slate-300 p-2 text-right font-bold text-slate-900">
                    {z.surfaceNette.toFixed(2)} m²
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/90 font-bold text-slate-900">
                <td colSpan={3} className="border border-slate-300 p-2 uppercase text-right">
                  Totalisation globale réceptionnée :
                </td>
                <td className="border border-slate-300 p-2 text-right text-slate-700">
                  {totalBrut.toFixed(2)} m²
                </td>
                <td className="border border-slate-300 p-2 text-right text-slate-500">
                  {totalOuvertures > 0 ? `- ${totalOuvertures.toFixed(2)} m²` : "0.00 m²"}
                </td>
                <td className="border border-slate-300 p-2 text-right text-sm font-black text-red-600">
                  {totalNet.toFixed(2)} m²
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. TABLEAU COMPLET DES RÉSERVES (Si applicable) */}
      {/* ============================================================ */}
      {(pv.statut === "avec_reserves" || pv.statut === "reserves_levees" || pv.reserves.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-800 flex items-center gap-1.5">
              <span>📝</span> Tableau des Réserves Constatées &amp; Délais de Reprise
            </p>
            <span className="text-[10px] font-semibold text-slate-500">
              {pv.reserves.filter((r) => r.levee).length} / {pv.reserves.length} levée(s)
            </span>
          </div>

          <table className="w-full border-collapse border border-slate-300 text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-left font-bold text-slate-700 text-[10px] uppercase">
                <th className="border border-slate-300 p-2 w-8 text-center">N°</th>
                <th className="border border-slate-300 p-2">Désignation du désordre / retouche demandée</th>
                <th className="border border-slate-300 p-2 w-36">Emplacement précis</th>
                <th className="border border-slate-300 p-2 w-28 text-center">Date limite de levée</th>
                <th className="border border-slate-300 p-2 w-28 text-center">Statut &amp; Visa</th>
              </tr>
            </thead>
            <tbody>
              {pv.reserves.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border border-slate-300 p-3 text-center text-slate-400 italic">
                    Aucune réserve consignée.
                  </td>
                </tr>
              ) : (
                pv.reserves.map((r, idx) => (
                  <tr key={r.id || idx} className={r.levee ? "bg-emerald-50/60" : "bg-white"}>
                    <td className="border border-slate-300 p-2 text-center font-bold">{idx + 1}</td>
                    <td className="border border-slate-300 p-2 font-medium text-slate-900">{r.designation}</td>
                    <td className="border border-slate-300 p-2 text-slate-700">{r.localisation || "Façade"}</td>
                    <td className="border border-slate-300 p-2 text-center text-slate-700 font-semibold">
                      {r.date_limite ? new Date(r.date_limite).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td className="border border-slate-300 p-2 text-center font-bold">
                      {r.levee ? (
                        <span className="text-emerald-700 block">
                          ✓ Levée le {r.date_levee ? new Date(r.date_levee).toLocaleDateString("fr-FR") : ""}
                        </span>
                      ) : (
                        <span className="text-amber-700 block">⚠️ Non levée</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. NOTICE & FICHES TECHNIQUES / GUIDE D'ENTRETIEN */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-slate-300 bg-slate-50/70 p-3.5 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-800 flex items-center gap-1.5">
          <span>📚</span> Notice, Fiches Techniques &amp; Recommandations d&apos;Entretien
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
          <div className="flex items-start gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-emerald-600 font-bold">{notice.remise_fiches_techniques ? "☑️" : "⬜"}</span>
            <div>
              <p className="font-bold text-slate-900">Fiches Techniques Matériaux</p>
              <p className="text-[10px] text-slate-500">Notices fabricants, avis techniques CSTB et fiches de données environnementales.</p>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-emerald-600 font-bold">{notice.remise_guide_entretien ? "☑️" : "⬜"}</span>
            <div>
              <p className="font-bold text-slate-900">Guide d&apos;Entretien &amp; Nettoyage</p>
              <p className="text-[10px] text-slate-500">Instructions de lavage et précautions pour préserver le parement et la ventilation.</p>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
            <span className="text-emerald-600 font-bold">{notice.remise_attestation_decennale ? "☑️" : "⬜"}</span>
            <div>
              <p className="font-bold text-slate-900">Attestation Décennale BNA</p>
              <p className="text-[10px] text-slate-500">
                {entreprise.assurance_decennale_nom || "AXA Courtage"} · Police {entreprise.assurance_decennale_police || "DEC-2026"}
              </p>
            </div>
          </div>
        </div>

        {notice.frequence_nettoyage_recommandee && (
          <p className="text-[10px] text-slate-600 italic bg-white/60 p-2 rounded border border-slate-200">
            💡 <strong>Entretien préconisé :</strong> {notice.frequence_nettoyage_recommandee}. {notice.controle_joints_recommande}.
          </p>
        )}
      </div>

      {/* ============================================================ */}
      {/* 8. ANNEXES PHOTOS DU CHANTIER FINI (2 à 4 clichés) */}
      {/* ============================================================ */}
      {photos.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-800 flex items-center gap-1.5">
              <span>📷</span> Annexes Photographiques de l&apos;Ouvrage Achevé ({photos.length} clichés)
            </p>
            <span className="text-[10px] text-slate-400">État contradictoire à la date de réception</span>
          </div>

          <div className={`grid gap-3 ${photos.length === 1 ? "grid-cols-1" : photos.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
            {photos.map((p, i) => (
              <div key={p.id || i} className="rounded-xl border border-slate-300 bg-slate-50 p-2 space-y-1.5 shadow-sm">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-200 flex items-center justify-center">
                  <img
                    src={p.url}
                    alt={p.titre || `Cliché ${i + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="text-[10px] font-semibold text-slate-700 text-center truncate">
                  {p.titre || `Vue de fin de chantier #${i + 1}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 9. PROPRETÉ DU SITE & OBSERVATIONS */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 gap-4">
        {/* Propreté & Repli */}
        <div className="rounded-xl border border-slate-300 bg-slate-50/70 p-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            🧹 Propreté &amp; Repli du Site
          </p>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <p className="flex items-center gap-1.5 text-slate-700">
              <span>{pv.checklist_repli.nettoyage ? "☑️" : "⬜"}</span> Nettoyage site
            </p>
            <p className="flex items-center gap-1.5 text-slate-700">
              <span>{pv.checklist_repli.dechets_evacues ? "☑️" : "⬜"}</span> Déchets évacués
            </p>
            <p className="flex items-center gap-1.5 text-slate-700">
              <span>{pv.checklist_repli.echafaudage_demonte ? "☑️" : "⬜"}</span> Échafaudage démonté
            </p>
            <p className="flex items-center gap-1.5 text-slate-700">
              <span>{pv.checklist_repli.fiches_techniques_remises ? "☑️" : "⬜"}</span> Fiches remises
            </p>
          </div>
        </div>

        {/* Observations */}
        <div className="rounded-xl border border-slate-300 bg-slate-50/70 p-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            💬 Observations Particulières
          </p>
          <p className="text-[10px] text-slate-600 italic leading-relaxed">
            {pv.observations || "Aucune observation particulière consignée."}
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 10. RAPPEL DES GARANTIES LÉGALES */}
      {/* ============================================================ */}
      <div className="rounded-xl border border-slate-300 bg-slate-100/70 p-3 space-y-1 text-[10px] text-slate-700">
        <p className="font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
          <span>🛡️</span> Déclenchement des Garanties Légales à compter de la date de réception :
        </p>
        <p className="leading-relaxed">
          • <strong>Garantie de Parfait Achèvement (GPA - 1 an)</strong> : Couvre la reprise de tous désordres signalés (Art. 1792-6 du Code Civil).<br />
          • <strong>Garantie Biennale de bon fonctionnement (2 ans)</strong> : Couvre les éléments dissociables et accessoires (Art. 1792-3 du Code Civil).<br />
          • <strong>Garantie Décennale (10 ans)</strong> : Couvre les dommages compromettant la solidité ou l&apos;imperméabilité de l&apos;ouvrage (Art. 1792 du Code Civil).
        </p>
      </div>

      {/* ============================================================ */}
      {/* 11. CADRES D'ÉMARGEMENT & SIGNATURES */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        {/* Signature Client */}
        <div className="rounded-xl border-2 border-slate-400 p-3.5 flex flex-col justify-between h-40 bg-white">
          <div>
            <p className="font-extrabold text-slate-900 uppercase text-[10px]">
              Pour le Maître d&apos;Ouvrage (Client) :
            </p>
            <p className="text-[10px] text-slate-600">
              Nom : <strong>{pv.signataire_client_nom || client.nom}</strong>
            </p>
            <p className="text-[9px] text-slate-500 italic mt-0.5">
              Mention « Lu et approuvé, bon pour réception des travaux et remise des fiches d&apos;entretien »
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center py-1">
            {pv.signature_client ? (
              <img src={pv.signature_client} alt="Signature Client" className="max-h-20 max-w-full object-contain" />
            ) : (
              <p className="text-[10px] text-slate-300 italic">Signature manuscrite</p>
            )}
          </div>

          <div className="flex items-center justify-between text-[9px] text-slate-400 border-t pt-1">
            <span>Fait à {pv.adresse_chantier ? pv.adresse_chantier.split(",").pop()?.trim() : "Bordeaux"}</span>
            <span>Le {new Date(pv.date_reception).toLocaleDateString("fr-FR")}</span>
          </div>
        </div>

        {/* Signature Entreprise */}
        <div className="rounded-xl border-2 border-slate-400 p-3.5 flex flex-col justify-between h-40 bg-white">
          <div>
            <p className="font-extrabold text-slate-900 uppercase text-[10px]">
              Pour l&apos;Entreprise Exécutante (BNA BARDAGE) :
            </p>
            <p className="text-[10px] text-slate-600">
              Nom : <strong>{pv.signataire_entreprise_nom || entreprise.raison_sociale}</strong>
            </p>
            <p className="text-[9px] text-slate-500 italic mt-0.5">
              Visa du conducteur de travaux / chef de chantier
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center py-1">
            {pv.signature_entreprise ? (
              <img src={pv.signature_entreprise} alt="Signature Entreprise" className="max-h-20 max-w-full object-contain" />
            ) : (
              <p className="text-[10px] text-slate-300 italic">Cachet et signature</p>
            )}
          </div>

          <div className="flex items-center justify-between text-[9px] text-slate-400 border-t pt-1">
            <span>Fait à Bordeaux</span>
            <span>Le {new Date(pv.date_reception).toLocaleDateString("fr-FR")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
