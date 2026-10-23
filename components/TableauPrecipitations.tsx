"use client";

// components/TableauPrecipitations.tsx
//
// TABLEAU HORAIRE DÉPLOYANT « Voir les précipitations ».
//
// ─── Pourquoi un composant partagé ───────────────────────────────────────────
//
// La fiche chantier et les cartes météo ont toutes deux besoin de montrer le
// détail heure par heure (pluie + rafales). Dupliquer le tableau produirait
// deux affichages divergents — exactement le défaut de fiabilité que la
// refonte corrige ailleurs. Un seul composant, deux emplacements.
//
// ─── Règles d'affichage ──────────────────────────────────────────────────────
//
//  1. UNE DONNÉE MANQUANTE S'AFFICHE EN TIRET. `null` n'est jamais remplacé
//     par 0 : « 0 mm » se lirait comme une garantie de temps sec.
//  2. LA BORNE PASSÉ / À VENIR SE CALCULE À L'AFFICHAGE. La réponse météo est
//     cachée 30 minutes ; le `statut` livré par la route décrit la génération
//     du cache. `heuresAJour` reclasse avec l'heure courante du navigateur.
//  3. LE BOUTON NE DÉCLICHE PAS LA NAVIGATION. Ce composant est inséré dans un
//     `<Link>` sur les cartes : sans `preventDefault` + `stopPropagation`, le
//     clic ouvrirait le chantier au lieu de déplier le tableau. C'est le point
//     délicat listé dans la commande initiale.
//  4. MOBILE D'ABORD. Le tableau est lisible à 320 px : première colonne
//     collante, défilement horizontal, pas de texte tronqué.

import { useMemo, useState } from "react";
import { type HeureMeteo } from "@/lib/meteo";
import { heuresAJour } from "@/lib/meteo";

/**
 * Libellé de la nature d'une heure.
 *
 * La nature n'est AFFIRMÉE (« Observée » / « Prévue ») que lorsque la source
 * le permet : sans référence temporelle fiable de la source, la nature est
 * `inconnue` et le libellé est un tiret. On ne transforme jamais une prévision
 * en relevé observé parce que l'heure est passée sur notre horloge.
 */
export const texteNature = (n: string | null | undefined): string =>
  n === "observee" ? "Observée" : n === "prevision" ? "Prévue" : "—";

/** Formatage mm : une décimale, tiret si la donnée manque. */
export const texteMm = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)} mm` : "—";

/** Formatage km/h : tiret si la donnée manque. */
export const texteKmh = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? `${Math.round(v)} km/h` : "—";

/** Formatage °C : tiret si la donnée manque. */
export const texteDegre = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? `${Math.round(v)}°C` : "—";

export default function TableauPrecipitations({
  heures,
  libelleFerme = "▼ Voir les précipitations",
  libelleOuvert = "▲ Masquer les précipitations",
}: {
  heures: HeureMeteo[];
  libelleFerme?: string;
  libelleOuvert?: string;
}) {
  const [ouvert, setOuvert] = useState(false);

  // Reclassement des heures à l'AFFICHAGE, et non à l'import : le cache de
  // 30 minutes rendrait un statut figé faux jusqu'à la prochaine génération.
  const affichees = useMemo(() => heuresAJour(heures), [heures]);

  // Période couverte et données manquantes : deux informations que la mission
  // exige d'afficher clairement. Le calcul est fait ICI, à l'affichage, sur la
  // même série que le tableau — ils ne peuvent donc pas diverger. On compte les
  // heures SANS DONNÉE DE PLUIE : c'est le sujet du dépliant.
  const couverture = useMemo(() => {
    if (!affichees.length) return null;
    const premier = affichees[0].heure;
    const dernier = affichees[affichees.length - 1].heure;
    const sansPluie = affichees.filter((h) => typeof h.pluie !== "number").length;
    return {
      periode: `${premier} – ${dernier} (${affichees.length} h)`,
      sansDonnees: sansPluie,
    };
  }, [affichees]);

  if (!affichees.length) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        // `preventDefault` empêche la navigation du `<Link>` parent ;
        // `stopPropagation` évite que le clic ne remonte jusqu'au gestionnaire
        // de la carte. Les deux sont nécessaires : l'un sans l'autre ne suffit
        // pas selon le navigateur.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOuvert((v) => !v);
        }}
        className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-left text-xs font-medium text-gray-300 hover:border-white/20 hover:text-white"
      >
        {ouvert ? libelleOuvert : libelleFerme}
      </button>

      {ouvert && (
        <div
          className="overflow-x-auto rounded-lg border border-white/10"
          // Le dépliant est cliquable en lui-même : on empêche que son
          // défilement ou son clic ne remonte au `<Link>`.
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <table className="w-full min-w-[340px] text-left text-2xs">
            <thead>
              <tr className="border-b border-white/10 text-gray-500">
                <th className="px-2 py-1.5 font-medium sticky left-0 bg-[#0b0f1a]">Heure</th>
                <th className="px-2 py-1.5 font-medium">Pluie</th>
                <th className="px-2 py-1.5 font-medium">Rafales</th>
                <th className="px-2 py-1.5 font-medium">Temp.</th>
                <th className="px-2 py-1.5 font-medium">Nature</th>
              </tr>
            </thead>
            <tbody>
              {affichees.map((h) => (
                <tr
                  key={h.heure}
                  className={
                    h.statut === "ecoulee"
                      ? "border-b border-white/5 text-gray-500"
                      : "border-b border-white/5 text-gray-300"
                  }
                >
                  <td className="px-2 py-1.5 sticky left-0 bg-[#0b0f1a] whitespace-nowrap">
                    {h.heure}
                    {h.statut === "ecoulee" ? " ·" : ""}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{texteMm(h.pluie)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{texteKmh(h.rafales)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{texteDegre(h.temp)}</td>
                  {/* La nature n'est affirmée QUE si la source le permet :
                      sinon tiret, jamais une supposition. */}
                  <td className="px-2 py-1.5 whitespace-nowrap text-gray-500">
                    {texteNature(h.nature)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-2 py-1.5 text-2xs text-gray-600">
            Heure suivie de « · » = heure déjà écoulée. Tiret « — » = donnée non
            renvoyée par la source, jamais 0. « Nature » n&apos;est affirmée que
            si la source le permet.
          </p>
          {couverture && (
            <p className="px-2 pb-1.5 text-2xs text-gray-600">
              Période couverte : {couverture.periode}
              {couverture.sansDonnees > 0 &&
                ` · ${couverture.sansDonnees} heure(s) sans donnée de pluie`}
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
