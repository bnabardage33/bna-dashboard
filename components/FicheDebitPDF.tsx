"use client";

import { Zone, calculerZone } from "@/components/ZoneCard";
import { ResultatPose, LABELS_FAMILLE } from "@/lib/poseCalcul";
import { ResultatCalepinage } from "@/lib/calepinageCalcul";
import PlanCalepinage from "@/components/PlanCalepinage";

type Entreprise = {
  raison_sociale: string;
  telephone: string | null;
  email: string | null;
  logo_url: string | null;
};

type ChantierInfo = {
  nom: string | null;
  clientNom?: string | null;
  adresse?: string | null;
};

export default function FicheDebitPDF({
  zone,
  chantier,
  entreprise,
  pose,
  calepinage,
}: {
  zone: Zone;
  chantier: ChantierInfo;
  entreprise: Entreprise;
  pose: ResultatPose | null;
  calepinage: ResultatCalepinage | null;
}) {
  const totaux = calculerZone(zone);
  const dateStr = new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div id="document-pdf-content" className="mx-auto max-w-3xl bg-white p-8 text-slate-900">
      {/* Bandeau d'en-tête */}
      <div className="mb-1 h-1.5 w-full bg-red-600" />

      <div className="flex items-start justify-between pt-4">
        <div className="flex items-center gap-3">
          {entreprise.logo_url && (
            <img src={entreprise.logo_url} alt="Logo" className="h-12 w-auto" />
          )}
          <div>
            <p className="text-base font-bold text-slate-900">{entreprise.raison_sociale}</p>
            <p className="text-xs text-slate-500">Atelier & Préparation Chantier</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tracking-tight text-slate-900">
            FICHE DÉBIT & ATELIER
          </p>
          <p className="text-sm font-semibold text-red-600">{zone.nom}</p>
          <p className="text-xs text-slate-500">{dateStr}</p>
        </div>
      </div>

      {/* Informations Chantier & Zone */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 p-3 text-xs">
          <p className="font-bold uppercase text-slate-500">Chantier</p>
          <p className="text-sm font-semibold text-slate-900">{chantier.nom || "Chantier sans nom"}</p>
          {chantier.clientNom && <p className="text-slate-600">Client : {chantier.clientNom}</p>}
          {chantier.adresse && <p className="text-slate-500">{chantier.adresse}</p>}
        </div>

        <div className="rounded-lg border border-slate-200 p-3 text-xs">
          <p className="font-bold uppercase text-slate-500">Caractéristiques Zone</p>
          <p className="text-sm font-semibold text-slate-900">
            {zone.type === "pignon" ? "📐 Pignon triangulaire" : "🧱 Façade rectangulaire"}
          </p>
          <p className="text-slate-600">
            Dimensions : {zone.largeur.toFixed(2)} m × {zone.hauteur_mur.toFixed(2)} m
            {zone.type === "pignon" && zone.hauteur_faite
              ? ` (faîte ${zone.hauteur_faite.toFixed(2)} m)`
              : ""}
          </p>
          <p className="text-slate-600">
            Système : {zone.famille_pose ? LABELS_FAMILLE[zone.famille_pose] : zone.materiau}
            {zone.angle ? " (Zone d'angle)" : ""}
          </p>
        </div>
      </div>

      {/* Résumé des Surfaces & Quantités */}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="text-[10px] font-bold uppercase text-slate-400">Surface brute</p>
          <p className="text-base font-extrabold text-slate-900">
            {(totaux.bruteFacade + totaux.brutePignon).toFixed(2)} m²
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="text-[10px] font-bold uppercase text-slate-400">Ouvertures ({zone.ouvertures.length})</p>
          <p className="text-base font-extrabold text-slate-700">
            {totaux.totalOuvertures.toFixed(2)} m²
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <p className="text-[10px] font-bold uppercase text-slate-400">Surface nette</p>
          <p className="text-base font-extrabold text-emerald-700">
            {totaux.surfaceNette.toFixed(2)} m²
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-2">
          <p className="text-[10px] font-bold uppercase text-red-600">À Débiter / Cder</p>
          <p className="text-base font-extrabold text-red-700">
            {totaux.surfaceACommander.toFixed(2)} m²
          </p>
        </div>
      </div>

      {/* Visualisation Calepinage SVG */}
      <div className="mt-4 rounded-lg border border-slate-200 p-2">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Plan de pose & calepinage
        </p>
        <div className="overflow-hidden bg-slate-900 rounded p-2">
          <PlanCalepinage
            largeurM={zone.largeur}
            hauteurM={zone.hauteur_mur}
            hauteurFaiteReelleM={zone.hauteur_faite}
            pose={pose}
            calepinage={calepinage}
            estPignon={zone.type === "pignon"}
            ouvertures={zone.ouvertures}
          />
        </div>
      </div>

      {/* Nomenclature des Fournitures & Consommables */}
      {pose && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Nomenclature Atelier & Fixations
          </p>
          <table className="mt-1.5 w-full text-xs">
            <thead>
              <tr className="border-b-2 border-slate-900 text-left uppercase text-slate-500">
                <th className="py-1">Désignation</th>
                <th className="py-1 text-center">Entraxe</th>
                <th className="py-1 text-right">Quantité</th>
                <th className="py-1 text-right">Unité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-1.5 font-medium">Montants chevrons verticaux</td>
                <td className="py-1.5 text-center">{pose.entraxeHorizontal ? `${pose.entraxeHorizontal * 100} cm` : "—"}</td>
                <td className="py-1.5 text-right font-bold">{pose.nbMontants}</td>
                <td className="py-1.5 text-right">lignes</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">Équerres Isolco 3000 P2 (avec MP3-S)</td>
                <td className="py-1.5 text-center">{pose.entraxeVertical} m {zone.angle ? "(angle)" : ""}</td>
                <td className="py-1.5 text-right font-bold">{pose.nbFixationsTotal}</td>
                <td className="py-1.5 text-right">équerres</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">Chevilles Spit MP3-S (2 par équerre)</td>
                <td className="py-1.5 text-center">Ø12mm prof. 70mm</td>
                <td className="py-1.5 text-right font-bold">{pose.nbFixationsTotal * 2}</td>
                <td className="py-1.5 text-right">chevilles</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">Vis de fixation (total structure + parement)</td>
                <td className="py-1.5 text-center">—</td>
                <td className="py-1.5 text-right font-bold">{pose.nbVis}</td>
                <td className="py-1.5 text-right">vis</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">Bande de protection EPDM (80mm)</td>
                <td className="py-1.5 text-center">100% chevrons</td>
                <td className="py-1.5 text-right font-bold">{(pose.nbMontants * zone.hauteur_mur).toFixed(1)}</td>
                <td className="py-1.5 text-right">ml</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">Grilles de ventilation anti-rongeurs</td>
                <td className="py-1.5 text-center">Haut + Bas</td>
                <td className="py-1.5 text-right font-bold">{(zone.largeur * 2).toFixed(1)}</td>
                <td className="py-1.5 text-right">ml</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Consignes Techniques Spécifiques */}
      {pose && pose.remarques && pose.remarques.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <p className="font-bold uppercase text-amber-800">⚠️ Consignes Techniques de Pose</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {pose.remarques.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-400">
        <p>Document généré pour préparation chantier — BNA Bardage</p>
        <p>Conforme DTU 41.2 et Règles Professionnelles</p>
      </div>
    </div>
  );
}
