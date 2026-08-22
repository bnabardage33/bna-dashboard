"use client";

export type NiveauVigilance = "vert" | "jaune" | "orange" | "rouge";

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

type Chantier = {
  nom: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
};

export type RapportIntemperiesData = {
  numero: string;
  cree_le: string;
  cree_par: "auto" | "manuel";
  vigilance_officielle: NiveauVigilance;
  vigilance_phenomene?: string | null; // ex: "orages", "vent", "pluie-inondation"
  jour_arrete: boolean;
  a_valider: boolean;
  pluie_continue: boolean;
  motif: string;
  risque_technique_niveau: string | null;
  risque_technique_motif: string | null;
  temp_max: number | null;
  temp_min: number | null;
  rafales_max: number | null;
  vent_moyen: number | null;
  pluie_cumul: number | null;
  materiau: string | null;
  acces: string | null;
  departement: string | null;
  mesures_prises: string | null;
  heures?: { heure: string; temp: number; vent: number; rafales: number; pluie: number }[];
};

const LABELS_VIGILANCE: Record<NiveauVigilance, string> = {
  vert: "Pas de vigilance",
  jaune: "Vigilance jaune",
  orange: "Vigilance orange",
  rouge: "Vigilance rouge",
};

const EMOJI_VIGILANCE: Record<NiveauVigilance, string> = {
  vert: "🟢",
  jaune: "🟡",
  orange: "🟠",
  rouge: "🔴",
};

const BADGE_VIGILANCE: Record<NiveauVigilance, string> = {
  vert: "bg-emerald-600",
  jaune: "bg-amber-500",
  orange: "bg-orange-600",
  rouge: "bg-red-600",
};

const LABELS_MATERIAU: Record<string, string> = {
  bois: "Bois",
  metal: "Métal / Bac acier",
  composite: "Composite",
  fibrociment: "Fibrociment",
};

const LABELS_ACCES: Record<string, string> = {
  echafaudage: "Échafaudage",
  nacelle: "Nacelle",
};

// Calcule min/moyenne à partir du relevé horaire si dispo, sinon fallback
function calculerTempMin(rapport: RapportIntemperiesData): number | null {
  if (rapport.temp_min !== null && rapport.temp_min !== undefined) return rapport.temp_min;
  if (rapport.heures && rapport.heures.length > 0) {
    return Math.min(...rapport.heures.map((h) => h.temp));
  }
  return null;
}

function calculerVentMoyen(rapport: RapportIntemperiesData): number | null {
  if (rapport.vent_moyen !== null && rapport.vent_moyen !== undefined) return rapport.vent_moyen;
  if (rapport.heures && rapport.heures.length > 0) {
    const total = rapport.heures.reduce((s, h) => s + h.vent, 0);
    return Math.round(total / rapport.heures.length);
  }
  return null;
}

export default function RapportIntemperiesPDF({
  rapport,
  entreprise,
  chantier,
}: {
  rapport: RapportIntemperiesData;
  entreprise: Entreprise;
  chantier: Chantier;
}) {
  const tempMin = calculerTempMin(rapport);
  const ventMoyen = calculerVentMoyen(rapport);

  return (
    <div id="document-pdf-content" className="mx-auto max-w-3xl bg-white p-6 text-slate-900 shadow-xl text-sm leading-relaxed">
      <div className="mb-2 h-1.5 w-full rounded-full bg-sky-600" />

      {/* En-tête */}
      <div className="flex items-start justify-between pt-3">
        <div className="flex items-center gap-3.5">
          <img
            src={entreprise.logo_url || "/logo-bna.png"}
            alt="Logo"
            className="h-20 sm:h-24 max-h-24 w-auto object-contain"
          />
          <div>
            <p className="text-lg font-extrabold text-slate-900">{entreprise.raison_sociale}</p>
            <p className="font-medium text-slate-500 text-xs">Spécialiste Bardage Rapporté · Isolation ITE</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-black uppercase tracking-tight text-slate-900 leading-tight">
            Rapport d&apos;arrêt de chantier
            <br />
            pour intempéries
          </p>
          <p className="font-mono text-sm font-bold text-sky-600 mt-1">N° {rapport.numero}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Rédigé le {new Date(rapport.cree_le).toLocaleDateString("fr-FR")}
          </p>
          <div className="mt-1">
            <span
              className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold uppercase text-white ${BADGE_VIGILANCE[rapport.vigilance_officielle]}`}
            >
              {LABELS_VIGILANCE[rapport.vigilance_officielle]}
            </span>
            <span className="ml-1 inline-block rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
              {rapport.cree_par === "auto" ? "Auto" : "Manuel"}
            </span>
          </div>
        </div>
      </div>

      {/* 1. Identification du chantier */}
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1">
        1. Identification du chantier
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
        <p><span className="text-slate-400">Entreprise de pose :</span> {entreprise.raison_sociale}</p>
        <p><span className="text-slate-400">Maître d&apos;ouvrage / Client :</span> ______________________</p>
        <p><span className="text-slate-400">Lieu des travaux :</span> {chantier.adresse || chantier.nom} {chantier.code_postal} {chantier.ville}</p>
        <p><span className="text-slate-400">Chef d&apos;équipe :</span> ______________________</p>
        {rapport.materiau && (
          <p><span className="text-slate-400">Matériau :</span> {LABELS_MATERIAU[rapport.materiau] ?? rapport.materiau}</p>
        )}
        {rapport.acces && (
          <p><span className="text-slate-400">Moyen d&apos;accès :</span> {LABELS_ACCES[rapport.acces] ?? rapport.acces}</p>
        )}
      </div>

      {/* 2. Données météorologiques de contrôle */}
      <div className="mt-3 rounded-lg border-2 border-sky-200 bg-sky-50/50 p-4">
        <p className="text-xs font-extrabold uppercase tracking-wide text-sky-800">
          🚩 Données météorologiques de contrôle (générées via API)
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Horodatage de l&apos;extraction : {new Date(rapport.cree_le).toLocaleString("fr-FR")}
          {rapport.departement && ` · Département ${rapport.departement}`}
        </p>

        <div className="mt-3">
          <p className="text-xs font-bold uppercase text-orange-700">
            {EMOJI_VIGILANCE[rapport.vigilance_officielle]} Vigilance officielle (Météo-France)
          </p>
          <p className="text-sm mt-0.5">
            Niveau d&apos;alerte : <strong>{LABELS_VIGILANCE[rapport.vigilance_officielle]}</strong>
            {rapport.vigilance_phenomene && <> — Phénomène : <strong>{rapport.vigilance_phenomene}</strong></>}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <p>💨 Vent maximum (rafales) : <strong>{rapport.rafales_max ?? "—"} km/h</strong></p>
          <p>💨 Vent moyen : <strong>{ventMoyen ?? "—"} km/h</strong></p>
          <p>🌧️ Précipitations cumulées : <strong>{rapport.pluie_cumul !== null ? Math.round(rapport.pluie_cumul * 10) / 10 : "—"} mm</strong></p>
          <p>🌡️ Température min / max : <strong>{tempMin ?? "—"}°C / {rapport.temp_max ?? "—"}°C</strong></p>
        </div>

        <p className="mt-3 text-xs text-sky-800">
          Statut réglementaire : ces relevés confirment {rapport.jour_arrete ? "un dépassement" : "une approche"} des
          seuils de tolérance des DTU de la série 41 / 31 et du Code du travail.
        </p>
      </div>

      {/* 3. Description de l'impact */}
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1">
        2. Description de l&apos;impact sur les travaux
      </p>
      <div className="mt-2 space-y-1.5">
        <p><span className="text-slate-400">Phase de travaux impactée :</span> ______________________</p>
        <p><span className="text-slate-400">Risques identifiés :</span> {rapport.motif}</p>
        {rapport.risque_technique_motif && (
          <p><span className="text-slate-400">Risque technique (matériau/accès) :</span> {rapport.risque_technique_motif}</p>
        )}
        <p>
          <span className="text-slate-400">Décision :</span>{" "}
          {rapport.jour_arrete
            ? "Arrêt des travaux en extérieur pour préserver la sécurité des compagnons et la conformité technique de l'ouvrage (DTU 41.2 / DTU 31.2)."
            : rapport.a_valider
              ? "Arrêt à confirmer par le chef de chantier au vu des conditions constatées sur site."
              : "Poursuite des travaux, conditions conformes."}
        </p>
      </div>

      {/* 4. Mesures conservatoires */}
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1">
        3. Mesures conservatoires prises immédiatement
      </p>
      <div className="mt-2 min-h-[50px] rounded-lg border border-dashed border-slate-300 p-3 text-sm">
        {rapport.mesures_prises || "☐ ______________________________________________"}
      </div>

      {/* 5. Conséquences planning */}
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1">
        4. Conséquences sur le planning
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
        <p><span className="text-slate-400">Heures perdues :</span> ______ h pour ______ poseur(s)</p>
        <p><span className="text-slate-400">Report de livraison estimé :</span> ______ jour(s)</p>
      </div>

      {/* Relevé horaire (annexe technique) */}
      {rapport.heures && rapport.heures.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">
            Annexe — Relevé horaire complet (pièce jointe)
          </summary>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="border-b-2 border-slate-900 text-left uppercase text-slate-400">
                <th className="py-1">Heure</th>
                <th className="py-1 text-right">Temp.</th>
                <th className="py-1 text-right">Vent</th>
                <th className="py-1 text-right">Rafales</th>
                <th className="py-1 text-right">Pluie</th>
              </tr>
            </thead>
            <tbody>
              {rapport.heures.map((h, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1">{h.heure}</td>
                  <td className="py-1 text-right">{h.temp}°C</td>
                  <td className="py-1 text-right">{h.vent} km/h</td>
                  <td className="py-1 text-right">{h.rafales} km/h</td>
                  <td className="py-1 text-right">{h.pluie} mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* 6. Pièces jointes */}
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1">
        5. Pièces jointes
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
        <li>Relevé météo officiel (voir encadré ci-dessus)</li>
        <li>Photos datées de l&apos;état du chantier au moment de l&apos;arrêt (à joindre au dossier)</li>
      </ul>

      {/* Signatures */}
      <div className="mt-4 grid grid-cols-2 gap-6 border-t border-slate-200 pt-3 text-xs">
        <div>
          <p className="font-semibold">L&apos;entreprise</p>
          <div className="mt-4 h-10 rounded-lg border border-dashed border-slate-300" />
        </div>
        <div>
          <p className="font-semibold">Chef de chantier</p>
          <div className="mt-4 h-10 rounded-lg border border-dashed border-slate-300" />
        </div>
      </div>

      <p className="mt-3 text-[9.5px] leading-relaxed text-slate-400">
        Rapport généré {rapport.cree_par === "auto" ? "automatiquement" : "manuellement"} à partir de la vigilance
        officielle Météo-France et des données météo locales du chantier. Document à conserver au dossier chantier
        en cas de sinistre ou de litige lié aux conditions météorologiques et aux dispositions des DTU 41.2 / 31.2.
      </p>
    </div>
  );
}
