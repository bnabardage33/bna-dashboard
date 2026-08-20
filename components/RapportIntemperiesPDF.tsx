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
  jour_arrete: boolean;
  a_valider: boolean;
  pluie_continue: boolean;
  motif: string;
  risque_technique_niveau: string | null;
  risque_technique_motif: string | null;
  temp_max: number | null;
  rafales_max: number | null;
  pluie_cumul: number | null;
  materiau: string | null;
  acces: string | null;
  mesures_prises: string | null;
  // Relevé horaire optionnel — nécessite d'ajouter une colonne jsonb
  // (releve_horaire) à rapports_intemperies si tu veux le conserver.
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

export default function RapportIntemperiesPDF({
  rapport,
  entreprise,
  chantier,
}: {
  rapport: RapportIntemperiesData;
  entreprise: Entreprise;
  chantier: Chantier;
}) {
  return (
    <div id="document-pdf-content" className="mx-auto max-w-3xl bg-white p-8 text-slate-900">
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
          <p className="text-3xl font-extrabold leading-none tracking-tight text-slate-900">
            RAPPORT
            <br />
            INTEMPÉRIES
          </p>
          <p className="mt-1 text-sm font-medium text-red-600">N° {rapport.numero}</p>
          <p className="text-xs text-slate-500">
            {new Date(rapport.cree_le).toLocaleDateString("fr-FR")} ·{" "}
            {new Date(rapport.cree_le).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
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

      {/* Chantier / Émis par */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200">
          <div className="bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
            Chantier
          </div>
          <div className="space-y-1 p-3 text-sm">
            <p className="font-semibold">{chantier.nom || "Chantier"}</p>
            {chantier.adresse && <p>{chantier.adresse}</p>}
            {(chantier.code_postal || chantier.ville) && (
              <p>
                {chantier.code_postal} {chantier.ville}
              </p>
            )}
            {rapport.materiau && (
              <p className="text-xs text-slate-500">
                Matériau : {LABELS_MATERIAU[rapport.materiau] ?? rapport.materiau}
              </p>
            )}
            {rapport.acces && (
              <p className="text-xs text-slate-500">
                Moyen d&apos;accès : {LABELS_ACCES[rapport.acces] ?? rapport.acces}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200">
          <div className="bg-slate-900 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
            Émis par
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
          </div>
        </div>
      </div>

      {/* Bloc alerte */}
      <div className="mt-5 rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 p-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{EMOJI_VIGILANCE[rapport.vigilance_officielle]}</span>
          <p className="text-sm font-extrabold uppercase tracking-wide text-orange-800">
            {rapport.jour_arrete
              ? "Jour d'arrêt de chantier"
              : rapport.a_valider
                ? "Arrêt à confirmer"
                : "Vigilance constatée"}
          </p>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-orange-900">{rapport.motif}</p>
        {rapport.risque_technique_motif && (
          <p className="mt-2 text-xs text-orange-700">
            Risque technique (matériau/accès) : {rapport.risque_technique_motif}
          </p>
        )}
      </div>

      {/* Statistiques */}
      <div className="mt-4 grid grid-cols-4 gap-2.5">
        <div className="rounded-lg border border-slate-200 p-2.5 text-center">
          <p className="text-[10px] font-bold uppercase text-slate-400">Rafales max</p>
          <p className="mt-0.5 text-lg font-extrabold text-slate-900">
            {rapport.rafales_max ?? "—"} {rapport.rafales_max !== null && "km/h"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-2.5 text-center">
          <p className="text-[10px] font-bold uppercase text-slate-400">Température max</p>
          <p className="mt-0.5 text-lg font-extrabold text-slate-900">
            {rapport.temp_max ?? "—"} {rapport.temp_max !== null && "°C"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-2.5 text-center">
          <p className="text-[10px] font-bold uppercase text-slate-400">Cumul pluie</p>
          <p className="mt-0.5 text-lg font-extrabold text-slate-900">
            {rapport.pluie_cumul ?? "—"} {rapport.pluie_cumul !== null && "mm"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-2.5 text-center">
          <p className="text-[10px] font-bold uppercase text-slate-400">Niveau</p>
          <p className="mt-0.5 text-lg font-extrabold text-slate-900">
            {LABELS_VIGILANCE[rapport.vigilance_officielle]}
          </p>
        </div>
      </div>

      {/* Relevé horaire, si disponible */}
      {rapport.heures && rapport.heures.length > 0 && (
        <>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Relevé horaire du jour
          </p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-900 text-left text-[10px] uppercase text-slate-400">
                <th className="py-1.5">Heure</th>
                <th className="py-1.5 text-right">Temp.</th>
                <th className="py-1.5 text-right">Vent</th>
                <th className="py-1.5 text-right">Rafales</th>
                <th className="py-1.5 text-right">Pluie</th>
              </tr>
            </thead>
            <tbody>
              {rapport.heures.map((h, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1.5">{h.heure}</td>
                  <td className="py-1.5 text-right">{h.temp}°C</td>
                  <td className="py-1.5 text-right">{h.vent} km/h</td>
                  <td className="py-1.5 text-right">{h.rafales} km/h</td>
                  <td className="py-1.5 text-right">{h.pluie} mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Mesures prises */}
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Mesures prises
      </p>
      <div className="mt-2 min-h-[44px] rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-700">
        {rapport.mesures_prises || "—"}
      </div>

      {/* Signatures */}
      <div className="mt-7 grid grid-cols-2 gap-6 border-t border-slate-200 pt-4 text-xs">
        <div>
          <p className="font-semibold">L&apos;entreprise</p>
          <div className="mt-8 h-14 rounded-lg border border-dashed border-slate-300" />
        </div>
        <div>
          <p className="font-semibold">Chef de chantier</p>
          <div className="mt-8 h-14 rounded-lg border border-dashed border-slate-300" />
        </div>
      </div>

      <p className="mt-4 text-[9.5px] leading-relaxed text-slate-400">
        Rapport généré {rapport.cree_par === "auto" ? "automatiquement" : "manuellement"} à partir
        de la vigilance officielle Météo-France et des données météo locales du chantier. Document
        à conserver au dossier chantier en cas de sinistre ou de litige lié aux conditions
        météorologiques.
      </p>
    </div>
  );
}
