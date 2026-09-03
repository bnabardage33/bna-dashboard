import { NextRequest, NextResponse } from "next/server";

interface RawHeure {
  datetime: string;
  temp: number;
  windspeed: number;
  windgust: number;
  precip: number;
}

interface RawJour {
  datetime: string;
  tempmax: number;
  tempmin: number;
  temp: number;
  windspeed: number;
  windgust: number;
  precip: number;
  icon: string;
  conditions: string;
  hours?: RawHeure[];
}

interface DonneesMeteo {
  days: RawJour[];
  currentConditions?: { temp: number; icon: string };
}

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const location = searchParams.get("location") || "Bordeaux,FR";
  const key = process.env.VISUALCROSSING_API_KEY;

  if (!key) {
    return NextResponse.json({ error: "Clé API manquante" }, { status: 500 });
  }

  const aujourdHui = new Date();
  const dans4Jours = new Date();
  dans4Jours.setDate(aujourdHui.getDate() + 4);

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
    location
  )}/${fmtDate(aujourdHui)}/${fmtDate(dans4Jours)}?unitGroup=metric&key=${key}&contentType=json&include=days,hours,current&elements=datetime,tempmax,tempmin,temp,windspeed,windgust,precip,icon,conditions&lang=fr`;

  const vcRes = await fetch(url, { next: { revalidate: 1800 } });
  if (!vcRes.ok) {
    return NextResponse.json({ error: "Ville introuvable ou erreur API" }, { status: 502 });
  }

  const data: DonneesMeteo = await vcRes.json();
  const jours = data.days || [];
  const today = jours[0];

  if (!today) {
    return NextResponse.json({ error: "Pas de données pour cette ville" }, { status: 502 });
  }

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
    tempActuelle,
    tempMaxJour: Math.round(today.tempmax),
    tempMinJour: Math.round(today.tempmin),
    prochainsJours,
  });
}