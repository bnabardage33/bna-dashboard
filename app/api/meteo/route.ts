import { NextRequest, NextResponse } from "next/server";
import { verifierSession } from "@/lib/auth";
import {
  fetchDonneesOpenMeteo,
  type DonneesMeteo,
  type RawHeure,
  type RawJour,
} from "@/lib/meteoOpenMeteo";

// Les interfaces `RawHeure`, `RawJour` et `DonneesMeteo` sont désormais importées
// depuis `lib/meteoOpenMeteo.ts`, où elles vivent depuis que la route accepte
// DEUX sources (VisualCrossing puis Open-Meteo). Les seuils, le découpage
// matin/après-midi et l'alerte ci-dessous n'ont pas bougé d'un iota : c'est la
// structure d'entrée qui s'est élargie, pas la règle de décision.

interface Heure {
  heure: string;
  temp: number;
  vent: number;
  rafales: number;
  pluie: number;
}

interface Jour {
  date: string;
  tempMax: number;
  tempMin: number;
  icon: string;
  conditions: string;
}

interface MatinApresMidi {
  temp: number;
  vent: number;
  rafales: number;
}

/**
 * Origine de la réponse. `icon` n'a pas le même sens selon la source : un NOM
 * d'icône chez VisualCrossing, un CODE WMO chez Open-Meteo. Le client doit le
 * savoir pour choisir son pictogramme, plutôt que de l'inventer.
 */
export type SourceMeteo = "visualcrossing" | "open-meteo";

const toHeures = (raw: RawHeure[]): Heure[] =>
  raw.map((h) => ({
    heure: h.datetime.slice(0, 5),
    temp: Math.round(h.temp),
    vent: Math.round(h.windspeed),
    rafales: Math.round(h.windgust ?? h.windspeed),
    pluie: h.precip ?? 0,
  }));

const toJours = (raw: RawJour[]): Jour[] =>
  raw.slice(1, 5).map((j) => ({
    date: j.datetime,
    tempMax: Math.round(j.tempmax),
    tempMin: Math.round(j.tempmin),
    icon: j.icon,
    conditions: j.conditions,
  }));

/**
 * SOURCE PRIMAIRE — VisualCrossing.
 *
 * Ce n'est pas une source de secours : c'est celle que le projet a toujours
 * utilisée, et celle qui répond en production. `VISUALCROSSING_API_KEY` est
 * configurée dans les variables d'environnement Vercel et n'est pas versionnée.
 *
 * Renvoie `null` — au lieu de lever ou de répondre en erreur — dans tous les
 * cas d'indisponibilité : clé absente, clé refusée, service en panne. Le repli
 * Open-Meteo doit pouvoir démarrer dans chacun de ces cas, et `null` est le seul
 * moyen de l'exprimer sans court-circuiter la source de secours.
 *
 * Conséquence pratique du `null` : EN LOCAL, `.env.local` porte le placeholder
 * `ta_cle_ici` de `.env.example`, VisualCrossing répond 401, et ce `null` est le
 * chemin NORMAL de développement — pas une panne. Sur Vercel, la clé réelle
 * répond et ce chemin n'est pas emprunté. Voir `lib/meteoOpenMeteo.ts`.
 */
async function essayerVisualCrossing(
  location: string,
  key: string | undefined,
): Promise<DonneesMeteo | null> {
  if (!key) {
    // Cas attendu en local, où la clé payante n'est volontairement pas versionnée.
    console.warn(
      "api/meteo : VISUALCROSSING_API_KEY absente (attendu hors Vercel), repli Open-Meteo.",
    );
    return null;
  }

  const aujourdHui = new Date();
  const dans4Jours = new Date();
  dans4Jours.setDate(aujourdHui.getDate() + 4);

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
    location
  )}/${fmtDate(aujourdHui)}/${fmtDate(dans4Jours)}?unitGroup=metric&key=${key}&contentType=json&include=days,hours,current&elements=datetime,tempmax,tempmin,temp,windspeed,windgust,precip,icon,conditions&lang=fr`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) {
      // 401/403 = clé refusée. Sur Vercel, cela signifierait qu'une clé payante a
      // été révoquée ou a expiré — VRAI problème de production, à voir dans les
      // logs. En local, c'est le placeholder `ta_cle_ici` de `.env.local` qui
      // est refusé : comportement attendu, sans rapport avec la production.
      //
      // On journalise dans les deux cas, avec le statut, pour que la distinction
      // se fasse d'un coup d'œil au log et non en supposant.
      console.warn(
        "api/meteo : VisualCrossing a répondu %s (clé refusée ou service indisponible) — repli Open-Meteo.",
        res.status,
      );
      return null;
    }
    const data = (await res.json()) as DonneesMeteo;
    return data.days && data.days.length > 0 ? data : null;
  } catch (e) {
    console.warn("api/meteo : VisualCrossing injoignable, repli Open-Meteo.", e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  const { searchParams } = new URL(req.url);
  const location = searchParams.get("location") || "Bordeaux,FR";

  // DEUX SOURCES, UN SEUL CALCUL.
  //
  // VisualCrossing en PREMIER : c'est la source du projet, celle qui répond en
  // production. Ce n'est pas un abandon — elle n'est simplement pas disponible
  // hors Vercel, sa clé n'étant pas versionnée.
  //
  // Open-Meteo ensuite : gratuite, sans clé, et DÉJÀ utilisée par
  // `/api/meteo/intemperies` et par l'Edge Function. Elle couvre le local (où
  // la clé payante est absente) et absorbe une indisponibilité de
  // VisualCrossing en production.
  //
  // Lequel que ce soit qui réponde, les lignes ci-dessous produisent une réponse
  // identique : aucun seuil, aucun calcul d'alerte n'est dupliqué.
  const vc = await essayerVisualCrossing(
    location,
    process.env.VISUALCROSSING_API_KEY,
  );
  const data = vc ?? (await fetchDonneesOpenMeteo(location));
  // `icon` n'a pas le même sens selon la source : un NOM d'icône chez
  // VisualCrossing, un CODE WMO chez Open-Meteo. On le dit explicitement pour
  // que l'affichage puisse choisir son pictogramme au lieu de deviner.
  const source: SourceMeteo = vc ? "visualcrossing" : "open-meteo";

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

  const heures: Heure[] = toHeures(today.hours || []);

  const matinHeures = heures.filter((h) => {
    const hh = parseInt(h.heure);
    return hh >= 6 && hh < 13;
  });
  const apremHeures = heures.filter((h) => {
    const hh = parseInt(h.heure);
    return hh >= 13 && hh < 19;
  });

  const avg = (arr: Heure[], k: "temp" | "vent" | "rafales" | "pluie") =>
    arr.length ? Math.round(arr.reduce((s, h) => s + h[k], 0) / arr.length) : 0;
  const max = (arr: Heure[], k: "temp" | "vent" | "rafales" | "pluie") =>
    arr.length ? Math.max(...arr.map((h) => h[k])) : 0;

  const matin: MatinApresMidi = { temp: avg(matinHeures, "temp"), vent: avg(matinHeures, "vent"), rafales: max(matinHeures, "rafales") };
  const apresMidi: MatinApresMidi = { temp: avg(apremHeures, "temp"), vent: avg(apremHeures, "vent"), rafales: max(apremHeures, "rafales") };

  const rafalesMax = Math.max(matin.rafales, apresMidi.rafales);
  const tempMax = Math.round(today.tempmax);
  const heuresPluie = heures.filter((h) => h.pluie > 0.2).length;
  const cumulPluie = heures.reduce((s, h) => s + h.pluie, 0);

  let niveau: "vert" | "jaune" | "orange" | "rouge" = "vert";
  let motif = "Conditions normales de pose";

  if (rafalesMax > 70) {
    niveau = "rouge";
    motif = `Rafales critiques (${rafalesMax} km/h) — pose interdite`;
  } else if (cumulPluie >= 8 && heuresPluie >= 4) {
    niveau = "rouge";
    motif = `Pluie continue (${cumulPluie.toFixed(1)} mm sur ${heuresPluie}h) — pose interdite`;
  } else if (rafalesMax > 50) {
    niveau = "orange";
    motif = `Rafales fortes (${rafalesMax} km/h) — conditions difficiles`;
  } else if (tempMax > 35) {
    niveau = "orange";
    motif = `Chaleur importante (${tempMax}°C) — conditions difficiles`;
  } else if (rafalesMax > 30) {
    niveau = "jaune";
    motif = `Rafales modérées (${rafalesMax} km/h) — vigilance renforcée`;
  } else if (tempMax > 30) {
    niveau = "jaune";
    motif = `Chaleur (${tempMax}°C) — vigilance renforcée`;
  }

  const prochainsJours = toJours(jours);

  const tempActuelle = data.currentConditions?.temp !== undefined
    ? Math.round(data.currentConditions.temp)
    : Math.round(today.tempmax);

  return NextResponse.json({
    matin,
    apresMidi,
    heures,
    alerte: { niveau, motif },
    icon: data.currentConditions?.icon || today.icon,
    conditions: today.conditions,
    source,
    tempActuelle,
    tempMaxJour: Math.round(today.tempmax),
    tempMinJour: Math.round(today.tempmin),
    // Cumul de pluie de la journée, en mm. Ajouté pour que la carte puisse
    // afficher la precipitation SANS recalculer un cumul dans le navigateur —
    // et sans inventer de chiffre quand la donnée est absente.
    cumulPluie: Math.round(cumulPluie * 10) / 10,
    prochainsJours,
  });
}