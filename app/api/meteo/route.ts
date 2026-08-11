import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const location = searchParams.get("location") || "Bordeaux,FR";
  const key = process.env.VISUALCROSSING_API_KEY;

  if (!key) {
    return NextResponse.json({ error: "Clé API manquante" }, { status: 500 });
  }

  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(
    location
  )}/today?unitGroup=metric&key=${key}&contentType=json&include=days,hours&elements=datetime,temp,windspeed,windgust,precip`;

  const vcRes = await fetch(url, { next: { revalidate: 1800 } });
  if (!vcRes.ok) {
    return NextResponse.json({ error: "Ville introuvable ou erreur API" }, { status: 502 });
  }

  const data = await vcRes.json();
  const today = data.days?.[0];
  if (!today) {
    return NextResponse.json({ error: "Pas de données pour cette ville" }, { status: 502 });
  }

  const heures = (today.hours || []).map((h: any) => ({
    heure: h.datetime.slice(0, 5),
    temp: Math.round(h.temp),
    vent: Math.round(h.windspeed),
    rafales: Math.round(h.windgust ?? h.windspeed),
    pluie: h.precip ?? 0,
  }));

  const matinHeures = heures.filter((h: any) => {
    const hh = parseInt(h.heure);
    return hh >= 6 && hh < 13;
  });
  const apremHeures = heures.filter((h: any) => {
    const hh = parseInt(h.heure);
    return hh >= 13 && hh < 19;
  });

  const avg = (arr: any[], k: string) =>
    arr.length ? Math.round(arr.reduce((s, h) => s + h[k], 0) / arr.length) : 0;
  const max = (arr: any[], k: string) =>
    arr.length ? Math.max(...arr.map((h) => h[k])) : 0;

  const matin = { temp: avg(matinHeures, "temp"), vent: avg(matinHeures, "vent"), rafales: max(matinHeures, "rafales") };
  const apresMidi = { temp: avg(apremHeures, "temp"), vent: avg(apremHeures, "vent"), rafales: max(apremHeures, "rafales") };

  const rafalesMax = Math.max(matin.rafales, apresMidi.rafales);
  const tempMax = Math.max(matin.temp, apresMidi.temp);
  const heuresPluie = heures.filter((h: any) => h.pluie > 0.2).length;
  const cumulPluie = heures.reduce((s: number, h: any) => s + h.pluie, 0);

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

  return NextResponse.json({ matin, apresMidi, heures, alerte: { niveau, motif } });
}
