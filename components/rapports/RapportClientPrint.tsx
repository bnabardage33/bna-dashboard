"use client";

// components/rapports/RapportClientPrint.tsx
// Rendu CLAIR (fond blanc, texte noir) du rapport hebdomadaire client.
// Ne lit que le snapshot jsonb déjà figé (aucun appel API au moment du
// print). Réutilisé par l'onglet dashboard (aperçu PDF) et l'espace client
// (overlay clair). Le chargement des images AVANT window.print() est géré
// par preparerEtImprimer() (lib/rapports-client.ts).

import Image from "next/image";
import {
  FACADES,
  formatDateFr,
  statutFacade,
  RAPPORT_PRINT_ROOT_ID,
  type FacadeId,
  type SnapshotContenu,
} from "@/lib/rapports-client";

export type EntrepriseRapport = {
  raison_sociale: string | null;
  logo_url: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  mentions_legales: string | null;
};

export type RapportClientPrintProps = {
  snapshot: SnapshotContenu;
  semaineLabel: string;
  entreprise: EntrepriseRapport | null;
  rootId?: string;
};

function statutFacadeClair(n: number): { label: string; className: string } {
  if (n >= 4) {
    return {
      label: "Terminée",
      className: "border-emerald-500/40 bg-emerald-50 text-emerald-700",
    };
  }
  if (n > 0) {
    return {
      label: "En cours",
      className: "border-amber-500/40 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: "À commencer",
    className: "border-slate-200 bg-slate-50 text-slate-500",
  };
}

function CompterValeur({ valeur, label }: { valeur: string; label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-lg font-black text-slate-900">{valeur}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}

export default function RapportClientPrint({
  snapshot,
  semaineLabel,
  entreprise,
  rootId = RAPPORT_PRINT_ROOT_ID,
}: RapportClientPrintProps) {
  const delta = snapshot.avancement.delta;
  const pct = Math.max(0, Math.min(100, snapshot.avancement.pct_fin));
  const dateFin =
    snapshot.communication.date_fin_estimee ?? snapshot.chantier.date_fin_estimee;

  const grillePhotosClasse =
    snapshot.photos.length === 1
      ? "grid-cols-1"
      : snapshot.photos.length === 2
        ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";

  const adresseEntreprise = [
    entreprise?.adresse,
    entreprise?.code_postal ? `${entreprise.code_postal} ${entreprise.ville ?? ""}`.trim() : null,
    entreprise?.ville && !entreprise?.code_postal ? entreprise.ville : null,
  ]
    .filter((partie): partie is string => partie != null && partie.trim() !== "")
    .join(", ");

  return (
    <div
      id={rootId}
      className="mx-auto max-w-[860px] bg-white text-slate-900 shadow-2xl print:max-w-none print:shadow-none"
    >
      <div className="h-1.5 w-full bg-red-700" />

      {/* En-tête */}
      <div className="flex items-start justify-between gap-4 px-6 pt-4 sm:px-8">
        <div className="flex items-center gap-3">
          {entreprise?.logo_url && (
            <Image
              src={entreprise.logo_url}
              alt="Logo entreprise"
              width={160}
              height={80}
              className="h-16 w-auto object-contain"
            />
          )}
          {entreprise?.raison_sociale && (
            <div>
              <p className="text-lg font-extrabold text-slate-900">
                {entreprise.raison_sociale}
              </p>
              <p className="text-xs font-medium text-slate-500">
                Bardage rapporté · Isolation ITE
              </p>
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl font-black uppercase leading-tight tracking-tight text-slate-900">
            Rapport
            <br />
            hebdomadaire
          </p>
          <p className="mt-1 text-xs font-bold text-red-700">{semaineLabel}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Édité le {formatDateFr(new Date().toISOString())}
          </p>
        </div>
      </div>

      {/* Chantier + delta avancement */}
      <div className="grid gap-4 px-6 pt-6 sm:grid-cols-[1fr_auto] sm:px-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Chantier
          </p>
          <p className="text-base font-bold text-slate-900">
            {snapshot.chantier.nom ?? "Chantier"}
          </p>
          {snapshot.chantier.client_nom && (
            <p className="text-sm text-slate-600">
              Client : {snapshot.chantier.client_nom}
            </p>
          )}
          {snapshot.chantier.adresse && (
            <p className="mt-0.5 text-sm text-slate-600">{snapshot.chantier.adresse}</p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Avancement de la semaine
          </p>
          <p
            className={`text-3xl font-black ${
              delta >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta} point{Math.abs(delta) > 1 ? "s" : ""}
          </p>
          <p className="text-xs text-slate-500">
            {snapshot.avancement.pct_debut}% → {snapshot.avancement.pct_fin}%
          </p>
        </div>
      </div>

      {/* Barre de progression */}
      <div className="px-6 pt-4 sm:px-8">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>Progression totale</span>
          <span className="font-bold text-slate-900">{pct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-3 rounded-full bg-red-600" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Statuts des façades */}
      <div className="px-6 pt-6 sm:px-8">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Façades
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FACADES.map((f) => {
            const n = snapshot.avancement.facades[f.id as FacadeId] ?? 0;
            const etat = statutFacadeClair(n);
            const libelle = statutFacade(n).label;
            return (
              <div
                key={f.id}
                className={`rounded-lg border p-3 text-center ${etat.className}`}
              >
                <p className="text-xs font-bold text-slate-900">{f.label}</p>
                <p className="text-[11px] text-slate-600">{libelle}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Photos de la semaine */}
      {snapshot.photos.length > 0 && (
        <div className="px-6 pt-6 sm:px-8">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Photos de la semaine
          </p>
          <div className={`grid gap-3 ${grillePhotosClasse}`}>
            {snapshot.photos.map((photo, index) => (
              <figure
                key={`${photo.url}-${index}`}
                className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <div className="relative aspect-[4/3]">
                  <Image
                    src={photo.url}
                    alt={photo.legende || "Photo de chantier"}
                    fill
                    sizes="(max-width: 860px) 50vw, 260px"
                    className="object-cover"
                  />
                </div>
                <figcaption className="px-2 py-1.5 text-[10px] font-medium text-slate-500">
                  {photo.legende || "Photo de chantier"}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {/* Activité de la semaine */}
      <div className="px-6 pt-6 sm:px-8">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Activité de la semaine
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CompterValeur
            valeur={String(snapshot.pointages.jours_pointes)}
            label="Jours travaillés"
          />
          <CompterValeur
            valeur={`${snapshot.pointages.total_heures} h`}
            label="Heures déclarées"
          />
          <CompterValeur
            valeur={
              snapshot.pointages.coef_meteo_moyen !== null
                ? String(snapshot.pointages.coef_meteo_moyen)
                : "—"
            }
            label="Coefficient météo"
          />
          <CompterValeur
            valeur={String(snapshot.avancement.cases_cochees)}
            label="Étapes avancées"
          />
        </div>

        {snapshot.pointages.meteo_relevee.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Météo relevée : {snapshot.pointages.meteo_relevee.join(" · ")}
          </p>
        )}

        {snapshot.intemperies.jours_arret_total > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-bold text-amber-800">
              Intempéries : {snapshot.intemperies.jours_arret_total} jour
              {snapshot.intemperies.jours_arret_total > 1 ? "s" : ""} d&apos;arrêt
            </p>
            <ul className="mt-1 list-inside list-disc text-xs text-amber-900">
              {snapshot.intemperies.details.map((jour, index) => (
                <li key={`${jour.date}-${index}`}>
                  {formatDateFr(jour.date)} — {jour.motif}
                  {jour.jour_arrete ? " (arrêt des travaux)" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Prochaine étape + estimation de fin */}
      <div className="px-6 pt-6 sm:px-8">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Prochaine étape
        </p>
        <p className="text-sm font-medium text-slate-700">
          {snapshot.communication.observations || "Poursuite des travaux en cours."}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Estimation de fin de chantier : {dateFin ? formatDateFr(dateFin) : "à confirmer auprès de l'équipe"}
        </p>
      </div>

      {/* Mot du patron */}
      {snapshot.communication.message_patron && (
        <div className="mx-6 mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:mx-8">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Le mot du patron
          </p>
          <p className="text-sm italic text-slate-700">
            {snapshot.communication.message_patron}
          </p>
        </div>
      )}

      {/* Pied de page */}
      <div className="mt-8 border-t border-slate-200 px-6 pb-6 pt-4 sm:px-8">
        <p className="text-xs font-bold text-slate-700">
          {entreprise?.raison_sociale ?? "BNA Bardage"}
        </p>
        {adresseEntreprise !== "" && (
          <p className="mt-0.5 text-[10px] text-slate-500">{adresseEntreprise}</p>
        )}
        {entreprise?.mentions_legales && (
          <p className="mt-1 text-[9.5px] leading-relaxed text-slate-400">
            {entreprise.mentions_legales}
          </p>
        )}
        <p className="mt-2 text-[9px] text-slate-300">
          Rapport généré depuis l&apos;application BNA Bardage — documents à conserver au dossier chantier.
        </p>
      </div>
    </div>
  );
}