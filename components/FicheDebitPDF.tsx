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
    <div id="document-pdf-content" className="mx-auto max-w-3xl bg-white p-8 text-slate-900 shadow-xl text-xs">
      {/* Bandeau supérieur bleu acier */}
      <div className="mb-2 h-1.5 w-full bg-sky-600 rounded-full" />

      <div className="flex items-start justify-between pt-3">
        <div className="flex items-center gap-3.5">
          <img
            src={entreprise.logo_url || "/logo-bna.png"}
            alt="Logo BNA"
            className="h-20 sm:h-24 max-h-24 w-auto object-contain"
          />
          <div>
            <p className="text-base font-extrabold text-slate-900">{entreprise.raison_sociale}</p>
            <p className="text-xs text-slate-500 font-medium">Atelier & Préparation Chantier</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black tracking-tight text-slate-900">
            FICHE DÉBIT & ATELIER
          </p>
          <p className="text-sm font-bold text-sky-600 font-mono">{zone.nom}</p>
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

      {/* Synthèse Débit Panneaux HPL & Imbrication */}
      {calepinage && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
            Débit & Imbrication Panneaux HPL
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <p className="text-slate-500 text-[10px] uppercase">Plaques brutes mères</p>
              <p className="font-bold text-slate-900">{calepinage.nbPlaquesNecessaires} plaques</p>
              <p className="text-[10px] text-slate-500">{calepinage.plaqueBruteLongueurMm}×{calepinage.plaqueBruteLargeurMm} mm</p>
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase">Modules finis débités</p>
              <p className="font-bold text-slate-900">{calepinage.nbPiecesPosees} modules</p>
              <p className="text-[10px] text-slate-500">Trame {calepinage.moduleCibleLargeurMm}×{calepinage.moduleCibleHauteurMm} mm</p>
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase">Rendement de coupe</p>
              <p className="font-bold text-slate-900">~{calepinage.modulesParPlaqueBrute} mod. / plaque</p>
              <p className="text-[10px] text-slate-500">{calepinage.nbJoints} joints</p>
            </div>
            <div>
              <p className="text-slate-500 text-[10px] uppercase">Taux de chute réel</p>
              <p className="font-bold text-emerald-700">{calepinage.tauxChutePct.toFixed(1)} %</p>
              <p className="text-[10px] text-slate-500">{(calepinage.surfacePlaquesAchetesM2 - calepinage.surfaceZoneM2).toFixed(2)} m² chutes</p>
            </div>
          </div>
        </div>
      )}

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
              {pose.isolant.actif && (
                <>
                  <tr className="bg-emerald-50/50">
                    <td className="py-1.5 font-medium text-emerald-950">
                      {pose.isolant.typeIsolant} (ép. {pose.isolant.epaisseurMm} mm)
                    </td>
                    <td className="py-1.5 text-center text-emerald-800">+8% perte</td>
                    <td className="py-1.5 text-right font-bold text-emerald-900">
                      {pose.isolant.nbPaquetsACommander} pqt ({pose.isolant.surfaceACommanderM2} m²)
                    </td>
                    <td className="py-1.5 text-right text-emerald-800">
                      paquets ({pose.isolant.surfacePaquetM2} m²)
                    </td>
                  </tr>
                  <tr className="bg-emerald-50/50">
                    <td className="py-1.5 font-medium text-emerald-950">Chevilles rosaces d'isolant à frapper ITE</td>
                    <td className="py-1.5 text-center text-emerald-800">5 / m²</td>
                    <td className="py-1.5 text-right font-bold text-emerald-900">{pose.isolant.nbChevillesRosaces}</td>
                    <td className="py-1.5 text-right text-emerald-800">chevilles</td>
                  </tr>
                </>
              )}
              <tr>
                <td className="py-1.5 font-medium">Chevrons bois verticaux (max 3m / segment)</td>
                <td className="py-1.5 text-center">{pose.entraxeHorizontal ? `${Math.round(pose.entraxeHorizontal * 100)} cm` : "60 cm"}</td>
                <td className="py-1.5 text-right font-bold">{pose.nbSegmentsChevrons} pcs ({pose.lineaireChevronsM.toFixed(1)} ml)</td>
                <td className="py-1.5 text-right">{pose.nbMontants} lignes</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">Équerres {pose.isolant.modeleEquerreIsolco} ({pose.nbEquerresPorteuses} porteuses + {pose.nbEquerresGuides} guides)</td>
                <td className="py-1.5 text-center">{pose.entraxeVertical} m {zone.angle || zone.zone_vent_rive ? "(angle/vent)" : ""}</td>
                <td className="py-1.5 text-right font-bold">{pose.nbFixationsTotal}</td>
                <td className="py-1.5 text-right">équerres</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">Chevilles maçonnerie Spit MP3-S Ø12×70mm</td>
                <td className="py-1.5 text-center">2 / équerre (15 Nm)</td>
                <td className="py-1.5 text-right font-bold">{pose.nbChevillesMurales}</td>
                <td className="py-1.5 text-right">chevilles</td>
              </tr>
              <tr>
                <td className="py-1.5 font-medium">Vis Inox chevron sur équerre (4/porteuse, 2/guide)</td>
                <td className="py-1.5 text-center">Inox A2 auto-perf</td>
                <td className="py-1.5 text-right font-bold">{pose.nbVisChevronEquerre}</td>
                <td className="py-1.5 text-right">vis inox</td>
              </tr>
              {pose.nbVisParement > 0 && (
                <tr>
                  <td className="py-1.5 font-medium">Fixations parement bardage (vis laquées / clips)</td>
                  <td className="py-1.5 text-center">—</td>
                  <td className="py-1.5 text-right font-bold">{pose.nbVisParement}</td>
                  <td className="py-1.5 text-right">vis</td>
                </tr>
              )}
              <tr>
                <td className="py-1.5 font-medium">Bande de protection EPDM (80-100mm)</td>
                <td className="py-1.5 text-center">100% chevrons + 5%</td>
                <td className="py-1.5 text-right font-bold">{pose.lineaireBandeEPDMM}</td>
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
