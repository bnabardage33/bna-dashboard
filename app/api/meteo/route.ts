import { NextRequest, NextResponse } from "next/server";
import { verifierSession } from "@/lib/auth";
import {
  fetchDonneesOpenMeteo,
  type RawHeure,
  type RawJour,
} from "@/lib/meteoOpenMeteo";
import { resoudreLocalisationMeteo } from "@/lib/meteoLocalisation";
import { heureParis, heureParisEnMinutes } from "@/lib/dateParis";
import {
  heureDe,
  natureHeure,
  statutHeure,
  type NatureHeure,
  type StatutHeure,
} from "@/lib/meteoHoraire";
import { evaluerPoseChantier, type Acces, type Materiau } from "@/lib/meteoAlerte";
import { maxConnu } from "@/lib/meteo";

// Les interfaces `RawHeure`, `RawJour` et `DonneesMeteo` sont désormais importées
// depuis `lib/meteoOpenMeteo.ts`, où elles vivent depuis que la route accepte
// DEUX sources (VisualCrossing puis Open-Meteo). Les seuils, le découpage
// matin/après-midi et l'alerte ci-dessous n'ont pas bougé d'un iota : c'est la
// structure d'entrée qui s'est élargie, pas la règle de décision.

/**
 * Une heure de la série.
 *
 * Une grandeur `null` = la source n'a rien renvoyé pour cette heure. Elle
 * n'est jamais convertie en 0 : l'écran affiche un tiret, et aucun cumul ne
 * l'additionne. `statut` / `nature` décrivent l'heure (écoulée / à venir,
 * observée / prévue).
 */
interface Heure {
  heure: string;
  temp: number | null;
  vent: number | null;
  rafales: number | null;
  pluie: number | null;
  statut: StatutHeure;
  nature: NatureHeure;
}

interface Jour {
  date: string;
  tempMax: number;
  tempMin: number;
  icon: string;
  conditions: string;
  /**
   * Cumul journalier de précipitations fourni par la source. Les deux sources
   * l'exposent déjà sous forme de TOTAL de journée (`precip` /
   * `precipitation_sum`) : on le recopie tel quel, sans re-sommer les relevés
   * horaires — ce serait compter deux fois la même pluie.
   */
  cumulPluie?: number;
}

/**
 * Agrégat d'une période.
 *
 * `null` = aucune heure CONNUE dans la période. On affiche un tiret plutôt que
 * « 0 km/h », qui se lirait comme un calme garanti.
 */
interface MatinApresMidi {
  temp: number | null;
  vent: number | null;
  rafales: number | null;
}

/**
 * Origine de la réponse. `icon` n'a pas le même sens selon la source : un NOM
 * d'icône chez VisualCrossing, un CODE WMO chez Open-Meteo. Le client doit le
 * savoir pour choisir son pictogramme, plutôt que de l'inventer.
 */
export type SourceMeteo = "visualcrossing" | "open-meteo";

const arrondi = (v: number | null): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;

const toHeures = (
  raw: RawHeure[],
  referenceSource: string | undefined,
  heureCouranteMinutes: number,
): Heure[] =>
  raw.map((h) => {
    const heure = heureDe(h.datetime);
    // Rafale absente → repli sur le vent MOYEN de la même heure, qui reste une
    // donnée réelle de cette heure. Rafale ET vent absents → `null`, jamais 0.
    const rafales = h.windgust ?? h.windspeed;
    return {
      heure,
      temp: arrondi(h.temp),
      vent: arrondi(h.windspeed),
      rafales: arrondi(rafales),
      pluie: arrondi(h.precip),
      statut: statutHeure(heure, heureCouranteMinutes),
      nature: natureHeure(heure, referenceSource),
    };
  });

const toJours = (raw: RawJour[]): Jour[] =>
  raw.slice(1, 5).map((j) => ({
    date: j.datetime,
    tempMax: Math.round(j.tempmax),
    tempMin: Math.round(j.tempmin),
    icon: j.icon,
    conditions: j.conditions,
    // `j.precip` est DÉJÀ le cumul de la journée chez les deux fournisseurs.
    // On ne somme donc pas `j.hours` ici : le cumul du jour courant, lui, est
    // calculé plus bas à partir des relevés horaires (une seule fois).
    cumulPluie:
      typeof j.precip === "number" && Number.isFinite(j.precip)
        ? Math.round(j.precip * 10) / 10
        : undefined,
  }));

export async function GET(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  const { searchParams } = new URL(req.url);
  const location = (searchParams.get("location") ?? "").trim() || "Bordeaux, FR";

  const localisation = await resoudreLocalisationMeteo(location);
  if (!localisation.ok) {
    return NextResponse.json(
      { error: localisation.erreur, localisation: false },
      { status: 422 },
    );
  }
  const { lat, lon } = localisation.data;

  // Source unique gratuite : Open-Meteo (modèle AROME / best_match, sans clé API).
  const data = await fetchDonneesOpenMeteo(location, { lat, lon });
  const source: SourceMeteo = "open-meteo";

  const today = data?.days[0];

  // Les deux sources ont échoué : aucune donnée. On le dit franchement, pour
  // que l'écran affiche un état vide plutôt qu'un ciel bleu par défaut.
  if (!data || !today) {
    return NextResponse.json(
      { error: "Pas de données météo disponibles pour cette adresse" },
      { status: 502 },
    );
  }

  const jours = data.days;

  // Référence temporelle : quand la source l'indique (`current.time`), elle
  // autorise à qualifier chaque heure d'observée ou de prévue ; sinon la
  // nature de toutes les heures reste `inconnue`.
  const referenceSource =
    data.referenceSource ?? data.currentConditions?.time ?? undefined;

  const heures: Heure[] = toHeures(
    today.hours || [],
    referenceSource,
    heureParisEnMinutes(),
  );

  const matinHeures = heures.filter((h) => {
    const hh = parseInt(h.heure);
    return hh >= 6 && hh < 13;
  });
  const apremHeures = heures.filter((h) => {
    const hh = parseInt(h.heure);
    return hh >= 13 && hh < 19;
  });

  // Agrégats NULL-SÛRS : une période sans aucune heure connue produit `null`
  // (affiché en tiret), jamais 0, qui se lirait « 0 km/h » ou « 0 °C ».
  const moyenne = (arr: Heure[], k: "temp" | "vent"): number | null => {
    const connues = arr
      .map((h) => h[k])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    // Arrondi ENTIER, comme avant la refonte : c'est la valeur affichée
    // (« Matin 19°C »), et le test de fidélité de la source la verrouille.
    return connues.length
      ? Math.round(connues.reduce((s, v) => s + v, 0) / connues.length)
      : null;
  };
  const maxi = (arr: Heure[], k: "rafales"): number | null => {
    const connues = arr
      .map((h) => h[k])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return connues.length ? Math.round(Math.max(...connues)) : null;
  };

  const matin: MatinApresMidi = {
    temp: moyenne(matinHeures, "temp"),
    vent: moyenne(matinHeures, "vent"),
    rafales: maxi(matinHeures, "rafales"),
  };
  const apresMidi: MatinApresMidi = {
    temp: moyenne(apremHeures, "temp"),
    vent: moyenne(apremHeures, "vent"),
    rafales: maxi(apremHeures, "rafales"),
  };

  const rafalesMax = maxConnu(matin.rafales, apresMidi.rafales);
  const tempMax = Math.round(today.tempmax);
  const heuresPluie = heures.filter(
    (h) => typeof h.pluie === "number" && h.pluie > 0.2,
  ).length;
  const valeursPluie = heures
    .map((h) => h.pluie)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const cumulPluie = valeursPluie.length
    ? Math.round(valeursPluie.reduce((s, v) => s + v, 0) * 10) / 10
    : null;

  // ─── ALERTE GÉNÉRALE DE LA JOURNÉE ────────────────────────────────────────
  //
  // Cette alerte décrit les CONDITIONS GÉNÉRALES de la journée sur le lieu du
  // chantier. Ce n'est PAS la décision de pose : celle-ci est portée par
  // `pose`, évaluée sur les horaires du chantier (voir plus bas).
  //
  // CORRECTION D'AUDIT : le cumul JOURNALIER de pluie ne déclenche plus le
  // rouge « pose interdite ». Une nuit de pluie qui se termine à 6 h n'interdit
  // rien à une équipe posant de 7 h à 17 h. Le même cumul (≥ 8 mm en ≥ 4 h
  // pluvieuses) est désormais évalué dans `evaluerPoseChantier`, sur les seules
  // heures de pose. Ici il devient un AVERTISSEMENT orange, consultable, avec
  // le rappel que la décision se prend sur les horaires de pose.
  //
  // Le seuil de VENT (≥ 70 km/h) reste rouge à l'échelle de la journée : c'est
  // un seuil existant validé, et aucun seuil n'est abaissé par cette refonte.
  let niveau: "vert" | "jaune" | "orange" | "rouge" = "vert";
  let motif = "Conditions normales de pose";

  if (typeof rafalesMax === "number" && rafalesMax > 70) {
    niveau = "rouge";
    motif = `Rafales critiques (${rafalesMax} km/h) — pose interdite`;
  } else if (cumulPluie !== null && cumulPluie >= 8 && heuresPluie >= 4) {
    niveau = "orange";
    motif =
      `Pluie abondante sur la journée (${cumulPluie.toFixed(1)} mm en ${heuresPluie} h) ` +
      `— protection des matériaux à vérifier. La décision de pose dépend des horaires du chantier.`;
  } else if (typeof rafalesMax === "number" && rafalesMax > 50) {
    niveau = "orange";
    motif = `Rafales fortes (${rafalesMax} km/h) — conditions difficiles`;
  } else if (tempMax > 35) {
    niveau = "orange";
    motif = `Chaleur importante (${tempMax}°C) — conditions difficiles`;
  } else if (typeof rafalesMax === "number" && rafalesMax > 30) {
    niveau = "jaune";
    motif = `Rafales modérées (${rafalesMax} km/h) — vigilance renforcée`;
  } else if (tempMax > 30) {
    niveau = "jaune";
    motif = `Chaleur (${tempMax}°C) — vigilance renforcée`;
  } else if (cumulPluie !== null && cumulPluie > 0) {
    // Le cumul reste AFFICHÉ, même minime : c'est une information demandée,
    // pas un silence.
    motif = `Conditions normales de pose — cumul journalier ${cumulPluie.toFixed(1)} mm`;
  }

  // ─── DÉCISION DE POSE, SUR LES HORAIRES DU CHANTIER ──────────────────────
  //
  // Elle n'existe QUE si le chantier a communiqué ses horaires : le paramètre
  // `horaires` porte `chantiers.horaires`. Sans lui, `pose.statut` vaut
  // `non_determine` — l'écran affiche un état explicite au lieu d'un vert
  // silencieux. Voir `lib/meteoAlerte.ts#evaluerPoseChantier`.
  const horaires = searchParams.get("horaires");
  const materiau = (searchParams.get("materiau") ?? "bois") as Materiau;
  const acces = (searchParams.get("acces") ?? "echafaudage") as Acces;
  const resultatPose = evaluerPoseChantier(materiau, acces, horaires, heures);

  const prochainsJours = toJours(jours);

  const tempActuelle = data.currentConditions?.temp !== undefined
    ? Math.round(data.currentConditions.temp)
    : Math.round(today.tempmax);

  return NextResponse.json({
    // Le point réellement utilisé par les deux fournisseurs : rend vérifiable
    // « quelle commune a produit cette prévision » sans relire les logs.
    localisation: {
      lat,
      lon,
      libelle: localisation.data.libelle,
      codePostal: localisation.data.codePostal,
    },
    matin,
    apresMidi,
    heures,
    alerte: { niveau, motif },
    // Décision de pose sur les horaires du chantier. Distincte de `alerte`,
    // qui décrit la journée et ne connaît aucun horaire.
    pose: {
      statut: resultatPose.statut,
      niveau: resultatPose.niveau,
      motif: resultatPose.motif,
      fenetre: resultatPose.fenetre,
      horairesStatut: resultatPose.horairesStatut,
      avertissements: resultatPose.avertissements,
      synthese: resultatPose.synthese,
    },
    icon: data.currentConditions?.icon || today.icon,
    conditions: today.conditions,
    source,
    tempActuelle,
    tempMaxJour: Math.round(today.tempmax),
    tempMinJour: Math.round(today.tempmin),
    // Cumul de pluie de la journée, en mm. Ajouté pour que la carte puisse
    // afficher la precipitation SANS recalculer un cumul dans le navigateur —
    // et sans inventer de chiffre quand la donnée est absente.
    // `null` = la source n'a rien renvoyé : à afficher en tiret.
    cumulPluie,
    // Heure LOCALE de génération de cette réponse. La réponse est cachée
    // 30 minutes : c'est cette référence qui justifie le `statut` des heures,
    // et un affichage doit reclasser avec sa propre heure courante.
    genereLe: heureParis(),
    ...(referenceSource ? { referenceSource } : {}),
    prochainsJours,
  });
}