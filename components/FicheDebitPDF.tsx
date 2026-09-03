// components/FicheDebitPDF.tsx

import { Zone, calculerZone } from "@/components/ZoneCard";
import { ResultatPose, LABELS_FAMILLE } from "@/lib/poseCalcul";
import { ResultatCalepinage } from "@/lib/calepinageCalcul";
import { Entreprise } from "@/types/entreprise";
import PlanCalepinage from "@/components/PlanCalepinage";

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
    <div id="document-pdf-content" className="mx-auto max-w-3xl bg-white p-8 text-slate-900 shadow-xl text-xs font-sans">
      {/* Bandeau supérieur bleu acier */}
      <div className="mb-2 h-1.5 w-full bg-red-700 rounded-full" />

      {/* En-tête */}
      <div className="flex items-start justify-between pt-3">
        <div className="flex items-center gap-3.5">
          <img
            src={entreprise.logo_url || "/logo-bna.png"}
            alt="Logo BNA"
            className="h-20 sm:h-24 max-h-24 w-auto object-contain"
          />
          <div>
            <p className="text-base font-extrabold text-slate-900">{entreprise.raison_sociale}</p>
            <p className="text-xs text-slate-500 font-medium">Atelier &amp; Préparation Chantier — Fiche de Débit</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black tracking-tight text-slate-900">
            FICHE DÉBIT &amp; ATELIER
          </p>
          <p className="text-sm font-bold text-red-700 font-mono">{zone.nom}</p>
          <p className="text-xs text-slate-500">{dateStr}</p>
        </div>
      </div>

      {/* Informations Chantier & Zone */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 p-3 text-xs bg-slate-50/60">
          <p className="font-bold uppercase text-slate-500 text-[10px]">Chantier</p>
          <p className="text-sm font-bold text-slate-900">{chantier.nom || "Chantier BNA"}</p>
          {chantier.clientNom && <p className="text-slate-600">Client : {chantier.clientNom}</p>}
          {chantier.adresse && <p className="text-slate-500">{chantier.adresse}</p>}
        </div>

        <div className="rounded-xl border border-slate-200 p-3 text-xs bg-slate-50/60">
          <p className="font-bold uppercase text-slate-500 text-[10px]">Caractéristiques Zone</p>
          <p className="text-sm font-bold text-slate-900">
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
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          <p className="text-[9px] font-bold uppercase text-slate-400">Surface brute</p>
          <p className="text-sm font-extrabold text-slate-900">
            {(totaux.bruteFacade + totaux.brutePignon).toFixed(2)} m²
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          <p className="text-[9px] font-bold uppercase text-slate-400">Ouvertures ({zone.ouvertures.length})</p>
          <p className="text-sm font-extrabold text-slate-700">
            {totaux.totalOuvertures.toFixed(2)} m²
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          <p className="text-[9px] font-bold uppercase text-slate-400">Surface nette</p>
          <p className="text-sm font-extrabold text-emerald-700">
            {totaux.surfaceNette.toFixed(2)} m²
          </p>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-2">
          <p className="text-[9px] font-bold uppercase text-amber-700">À Débiter / Cder</p>
          <p className="text-sm font-extrabold text-amber-900">
            {totaux.surfaceACommander.toFixed(2)} m²
          </p>
        </div>
      </div>

      {/* Visualisation Calepinage SVG */}
      <div className="mt-4 rounded-xl border border-slate-200 p-2.5">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
          Plan de pose &amp; Repérage des modules sur Façade
        </p>
        <div className="overflow-hidden bg-slate-900 rounded-lg p-2">
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

      {/* ============================================================ */}
      {/* SECTION OPTIMISEUR DE DÉCOUPE & PLAN DE COUPE ATELIER */}
      {/* ============================================================ */}
      {calepinage && (
        <div className="mt-4 space-y-3">
          {/* Synthèse Nesting & Chutes */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-800">
                Plan de Débit &amp; Optimisation Matière (Nesting 2D)
              </p>
              <span className="text-[10px] font-bold text-sky-700">
                {calepinage.plaqueBruteLongueurMm} × {calepinage.plaqueBruteLargeurMm} mm
              </span>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
              <div>
                <p className="text-slate-500 text-[10px] uppercase">Plaques Mères</p>
                <p className="font-extrabold text-slate-900">{calepinage.nbPlaquesNecessaires} plaques</p>
                <p className="text-[10px] text-slate-500">{calepinage.surfacePlaquesAchetesM2.toFixed(2)} m² brut</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase">Modules Débités</p>
                <p className="font-extrabold text-slate-900">{calepinage.nbPiecesPosees} pièces</p>
                <p className="text-[10px] text-slate-500">{calepinage.surfaceZoneM2.toFixed(2)} m² posé</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase">Chutes Réutilisables</p>
                <p className="font-extrabold text-emerald-700">{calepinage.totalChutesReutilisablesM2.toFixed(2)} m²</p>
                <p className="text-[10px] text-emerald-600">Rives / ébrasements</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase">Perte Nette</p>
                <p className="font-extrabold text-amber-700">{calepinage.tauxChuteNettePct.toFixed(1)} %</p>
                <p className="text-[10px] text-slate-500">{calepinage.totalDechetsPerteM2.toFixed(2)} m² sciure</p>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-200 flex flex-wrap justify-between items-center text-[10px] text-slate-600">
              <span className="font-medium">
                📐 <strong>Joint de dilatation :</strong> {calepinage.jointMm ?? 8} mm (conforme DTU 41.2)
              </span>
              <span className="font-medium text-sky-700 font-mono">
                Linéaire de joints : {calepinage.lineaireJointsM ? calepinage.lineaireJointsM.toFixed(1) : "0.0"} ml ({calepinage.nbJointsVerticaux} V + {calepinage.nbJointsHorizontaux} H = {calepinage.nbJoints} joints)
              </span>
            </div>
          </div>

          {/* Tableau des Découpes Pas-à-Pas pour l'Atelier */}
          <div className="rounded-xl border border-slate-200 p-3 avoid-break">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-2">
              Ordre de Coupe Atelier — Plaque par Plaque
            </p>
            <div className="space-y-3">
              {calepinage.plaquesDebit.map((plaque) => (
                <div key={plaque.index} className="rounded-lg border border-slate-200 overflow-hidden text-[11px]">
                  <div className="bg-slate-800 px-3 py-1 text-slate-100 font-bold flex justify-between items-center text-[10px]">
                    <span>PLAQUE #{plaque.index} ({plaque.longueurMm} × {plaque.largeurMm} mm)</span>
                    <span className="text-emerald-400">Rendement : {plaque.tauxRendementPct.toFixed(1)} %</span>
                  </div>

                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-[10px] text-slate-600 font-bold uppercase">
                      <tr>
                        <th className="py-1 px-2">Repère</th>
                        <th className="py-1 px-2">Type</th>
                        <th className="py-1 px-2 text-right">L × H (mm)</th>
                        <th className="py-1 px-2 text-right">Position (X, Y)</th>
                        <th className="py-1 px-2 text-right">Emplacement Façade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plaque.pieces.map((p, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-1 px-2 font-mono font-bold text-sky-700">{p.repere}</td>
                          <td className="py-1 px-2 text-slate-600">
                            {p.type === "pignon" ? "Rampant pignon" : p.type === "coupe" ? "Rive ajustée" : "Module plein"}
                          </td>
                          <td className="py-1 px-2 text-right font-mono font-bold text-slate-900">
                            {p.largeurMm} × {p.hauteurMm}
                          </td>
                          <td className="py-1 px-2 text-right font-mono text-slate-500">
                            X={p.xMm}, Y={p.yMm}
                          </td>
                          <td className="py-1 px-2 text-right text-slate-600">
                            Rangée {p.rangee + 1}, Col. {p.colonne + 1}
                          </td>
                        </tr>
                      ))}
                      {plaque.chutes.filter((c) => c.reutilisable).map((c, i) => (
                        <tr key={`chute-${i}`} className="bg-emerald-50/60 text-emerald-900 font-medium">
                          <td className="py-1 px-2 font-mono font-bold">♻️ CHUTE</td>
                          <td className="py-1 px-2 text-emerald-800">Réutilisable</td>
                          <td className="py-1 px-2 text-right font-mono font-bold">
                            {c.largeurMm} × {c.hauteurMm}
                          </td>
                          <td className="py-1 px-2 text-right font-mono">
                            X={c.xMm}, Y={c.yMm}
                          </td>
                          <td className="py-1 px-2 text-right text-emerald-700">
                            {c.motif}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* BON DE COMMANDE QUINCAILLERIE DTU 45.4 HPL */}
      {/* ============================================================ */}
      {calepinage && calepinage.quincaillerie && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/40 p-3 avoid-break">
          {/* En-tête */}
          <div className="flex items-center justify-between border-b border-sky-200 pb-1.5 mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-sky-900">
              🔩 Bon de Commande — Quincaillerie HPL (DTU 45.4)
            </p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              calepinage.quincaillerie.modeCalepinage === "A_linteau"
                ? "bg-amber-100 text-amber-800"
                : "bg-sky-100 text-sky-800"
            }`}>
              {calepinage.quincaillerie.modeCalepinage === "A_linteau"
                ? "Mode A — Alignement Linteau"
                : "Mode B — Symétrique Centre"}
            </span>
          </div>

          {/* Alerte anti-filet */}
          {calepinage.quincaillerie.antiFiletApplique && (
            <div className="mb-2 rounded-lg bg-amber-50 border border-amber-300 px-3 py-1.5 text-[10px] text-amber-900 font-medium">
              ⚠️ <strong>Règle anti-filet DTU 45.4 § 5.3.4 appliquée</strong> — Rive recalculée ≥ 300 mm pour garantir l&apos;ancrage sur 2 chevrons.
            </div>
          )}

          {/* Résumé alignement */}
          <p className="text-[10px] text-slate-600 italic mb-2">
            {calepinage.quincaillerie.resumeAlignementLinteau}
          </p>

          {/* Tableau de commande */}
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-sky-800 text-left uppercase text-sky-700 text-[10px]">
                <th className="py-1">Désignation</th>
                <th className="py-1 text-center">Règle / Norme</th>
                <th className="py-1 text-right">Qté</th>
                <th className="py-1 text-right">Unité</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-100 text-[11px]">
              {/* Équerres Isolco */}
              <tr className="bg-white/50">
                <td className="py-1.5 font-medium text-slate-800">
                  Équerres {calepinage.quincaillerie.modeleEquerreIsolco} — Porteuses (Point Fixe)
                </td>
                <td className="py-1.5 text-center text-slate-500">1 / panneau</td>
                <td className="py-1.5 text-right font-bold text-slate-900">{calepinage.quincaillerie.nbEquerresIsolcoPorteuses}</td>
                <td className="py-1.5 text-right text-slate-600">équerres</td>
              </tr>
              <tr className="bg-white/50">
                <td className="py-1.5 font-medium text-slate-800">
                  Équerres Isolco — Guides (Points Coulissants)
                </td>
                <td className="py-1.5 text-center text-slate-500">2 / panneau</td>
                <td className="py-1.5 text-right font-bold text-slate-900">{calepinage.quincaillerie.nbEquerresIsolcoGuides}</td>
                <td className="py-1.5 text-right text-slate-600">équerres</td>
              </tr>
              {/* Chevilles Spit MP3 */}
              <tr className="bg-sky-50/60">
                <td className="py-1.5 font-medium text-slate-800">Chevilles Spit MP3 Ø12×70mm (couple 15 Nm)</td>
                <td className="py-1.5 text-center text-slate-500">2 / équerre</td>
                <td className="py-1.5 text-right font-bold text-sky-900">{calepinage.quincaillerie.nbChevilles_SpitMP3}</td>
                <td className="py-1.5 text-right text-slate-600">chevilles</td>
              </tr>
              {/* Tirefonds */}
              <tr className="bg-white/50">
                <td className="py-1.5 font-medium text-slate-800">Tirefonds Inox A2 Ø6×60mm (chevron/équerre)</td>
                <td className="py-1.5 text-center text-slate-500">4/porteuse · 2/guide</td>
                <td className="py-1.5 text-right font-bold text-slate-900">{calepinage.quincaillerie.nbTirefondsInox}</td>
                <td className="py-1.5 text-right text-slate-600">vis inox</td>
              </tr>
              {/* Vis de parement */}
              <tr className="bg-sky-50/60">
                <td className="py-1.5 font-medium text-slate-800">
                  Vis parement HPL — Point Fixe Ø 5,1 mm
                </td>
                <td className="py-1.5 text-center text-slate-500">1 / panneau (centre haut)</td>
                <td className="py-1.5 text-right font-bold text-sky-900">{calepinage.quincaillerie.nbPercagesPointFixe51}</td>
                <td className="py-1.5 text-right text-slate-600">vis</td>
              </tr>
              <tr className="bg-sky-50/60">
                <td className="py-1.5 font-medium text-slate-800">
                  Vis parement HPL — Points Coulissants Ø 8 mm
                </td>
                <td className="py-1.5 text-center text-slate-500">2 / panneau (G + D)</td>
                <td className="py-1.5 text-right font-bold text-sky-900">{calepinage.quincaillerie.nbPercagesPointsCoulissants8}</td>
                <td className="py-1.5 text-right text-slate-600">vis</td>
              </tr>
              {/* Joints mastic */}
              <tr className="bg-white/50">
                <td className="py-1.5 font-medium text-slate-800">
                  Mastic joint de dilatation EPDM 8 mm (DTU 45.4)
                </td>
                <td className="py-1.5 text-center text-slate-500">100 % des joints</td>
                <td className="py-1.5 text-right font-bold text-slate-900">
                  {calepinage.quincaillerie.lineaireJointsMastic.toFixed(1)}
                </td>
                <td className="py-1.5 text-right text-slate-600">ml</td>
              </tr>
            </tbody>
          </table>

          {/* Notes de perçage */}
          <div className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-[10px] text-slate-700 space-y-1">
            <p><strong>PF :</strong> {calepinage.quincaillerie.instructionPercagePointFixe}</p>
            <p><strong>PC :</strong> {calepinage.quincaillerie.instructionPercagePointsCoulissants}</p>
            <p className="text-slate-500 italic">{calepinage.quincaillerie.notePercage}</p>
          </div>
        </div>
      )}

      {/* Nomenclature des Fournitures & Consommables */}
      {pose && (

        <div className="mt-4 avoid-break">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Nomenclature Atelier &amp; Fixations
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
                    <td className="py-1.5 font-medium text-emerald-950">Chevilles rosaces d&apos;isolant à frapper ITE</td>
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
    </div>
  );
}
