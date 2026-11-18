"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchMeteo, JourMeteo } from "@/lib/meteo";
import { supabase } from "@/lib/supabase";
import { texteDegre, texteKmh, texteMm } from "@/components/TableauPrecipitations";
import {
  Search,
  Sun,
  Cloud,
  CloudSun,
  CloudFog,
  Snowflake,
  Wind,
  CloudRain,
  ArrowRight,
  Droplets,
  MapPin,
  ShieldAlert,
  HardHat,
  Clock,
  CalendarDays,
} from "lucide-react";

const COULEURS = {
  vert: "border-emerald-500/35 bg-emerald-950/40 text-emerald-200",
  jaune: "border-amber-500/40 bg-amber-950/45 text-amber-200",
  orange: "border-orange-500/45 bg-orange-950/50 text-orange-200",
  rouge: "border-red-500/50 bg-red-950/55 text-red-200",
} as const;

const EMOJIS = { vert: "🟢", jaune: "🟡", orange: "🟠", rouge: "🔴" } as const;

interface ChantierRaccourci {
  id: string;
  label: string;
  ville: string;
}

function extraireVilleDepuisAdresse(adresse: string): string {
  const clean = adresse.trim();
  if (!clean) return "";
  const cpMatch = clean.match(/\b\d{5}\s+([A-Za-zÀ-ÿ' -]{2,})/);
  if (cpMatch) return cpMatch[1].trim();
  const parts = clean.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? clean;
}

function IconeMeteo({
  icon,
  conditions,
  className,
}: {
  icon: string;
  conditions?: string;
  className?: string;
}) {
  const c = (conditions || "").toLowerCase();
  const i = (icon || "").toLowerCase();

  if (i.includes("rain") || c.includes("pluie") || c.includes("averse") || c.includes("bruine")) {
    return <CloudRain className={className || "h-7 w-7 text-sky-400"} />;
  }
  if (i.includes("snow") || c.includes("neige")) {
    return <Snowflake className={className || "h-7 w-7 text-sky-200"} />;
  }
  if (i.includes("fog") || c.includes("brouillard") || c.includes("brume")) {
    return <CloudFog className={className || "h-7 w-7 text-[#8E7F74]"} />;
  }
  if (i.includes("wind") || c.includes("vent")) {
    return <Wind className={className || "h-7 w-7 text-amber-300"} />;
  }
  if (i.includes("partly") || c.includes("éclaircie") || c.includes("peu nuageux") || c.includes("passages")) {
    return <CloudSun className={className || "h-7 w-7 text-amber-400"} />;
  }
  if (i.includes("clear") || c.includes("ensoleillé") || c.includes("dégagé")) {
    return <Sun className={className || "h-7 w-7 text-amber-400"} />;
  }
  return <Cloud className={className || "h-7 w-7 text-slate-300"} />;
}

function nomJour(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

export default function MeteoPage() {
  const [ville, setVille] = useState("Bordeaux");
  const [villeSaisie, setVilleSaisie] = useState("Bordeaux");
  const [meteo, setMeteo] = useState<JourMeteo | null>(null);
  const [loading, setLoading] = useState(true);
  const [chantiersRaccourcis, setChantiersRaccourcis] = useState<ChantierRaccourci[]>([]);
  const [voirHeuresPassees, setVoirHeuresPassees] = useState(false);

  useEffect(() => {
    let annule = false;
    async function charger() {
      setLoading(true);
      try {
        const data = await fetchMeteo(ville);
        if (!annule) setMeteo(data);
      } catch {
        if (!annule) setMeteo(null);
      } finally {
        if (!annule) setLoading(false);
      }
    }
    charger();
    return () => {
      annule = true;
    };
  }, [ville]);

  useEffect(() => {
    let actif = true;
    async function chargerChantiers() {
      try {
        const { data, error } = await supabase
          .from("chantiers")
          .select("id, nom, client_nom, adresse_chantier, statut")
          .limit(12);
        if (!actif || error || !Array.isArray(data)) return;
        const items: ChantierRaccourci[] = [];
        for (const c of data) {
          const s = (c.statut ?? "").toLowerCase();
          if (["termine", "terminé", "archive", "archivé", "annule", "annulé"].includes(s)) {
            continue;
          }
          const v = c.adresse_chantier ? extraireVilleDepuisAdresse(c.adresse_chantier) : "";
          if (!v) continue;
          items.push({
            id: c.id,
            label: c.nom || c.client_nom || v,
            ville: v,
          });
        }
        setChantiersRaccourcis(items.slice(0, 6));
      } catch {
        // Ignorer si hors-ligne ou variables env absentes en test
      }
    }
    chargerChantiers();
    return () => {
      actif = false;
    };
  }, []);

  function handleRechercherVille(e: React.FormEvent) {
    e.preventDefault();
    const v = villeSaisie.trim();
    if (!v || v === ville) return;
    setVille(v);
  }

  const heuresAffichees = useMemo(() => {
    if (!meteo?.heures) return [];
    if (voirHeuresPassees) return meteo.heures;
    const futures = meteo.heures.filter((h) => h.statut === "avenir");
    return futures.length > 0 ? futures : meteo.heures;
  }, [meteo, voirHeuresPassees]);

  const creneauxCles = useMemo(() => {
    if (!meteo) return [];
    const trouverHeure = (cibleH: number) =>
      meteo.heures.find((h) => parseInt(h.heure.slice(0, 2), 10) >= cibleH) ?? null;

    const midi = trouverHeure(12);
    const soir = trouverHeure(18);
    return [
      {
        titre: "Matin",
        heure: "08h",
        temp: meteo.matin.temp,
        vent: meteo.matin.vent,
        rafales: meteo.matin.rafales,
        pluie: trouverHeure(8)?.pluie ?? null,
      },
      {
        titre: "Midi",
        heure: "12h",
        temp: midi?.temp ?? meteo.apresMidi.temp,
        vent: midi?.vent ?? meteo.apresMidi.vent,
        rafales: midi?.rafales ?? meteo.apresMidi.rafales,
        pluie: midi?.pluie ?? null,
      },
      {
        titre: "Après-midi",
        heure: "15h",
        temp: meteo.apresMidi.temp,
        vent: meteo.apresMidi.vent,
        rafales: meteo.apresMidi.rafales,
        pluie: trouverHeure(15)?.pluie ?? null,
      },
      {
        titre: "Soir",
        heure: "18h",
        temp: soir?.temp ?? null,
        vent: soir?.vent ?? null,
        rafales: soir?.rafales ?? null,
        pluie: soir?.pluie ?? null,
      },
    ];
  }, [meteo]);

  const rafaleMaxJour = useMemo(() => {
    if (!meteo) return null;
    const vals = [
      meteo.matin.rafales,
      meteo.apresMidi.rafales,
      ...meteo.heures.map((h) => h.rafales),
    ].filter((v): v is number => v !== null && Number.isFinite(v));
    return vals.length > 0 ? Math.max(...vals) : null;
  }, [meteo]);

  return (
    <div className="min-h-screen bg-[#120F0D] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 pb-20">
        {/* En-tête & Sélecteur rapide Chantier / Ville */}
        <header className="rounded-2xl border border-white/10 bg-[#1E1916] p-5 shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D96B27]">
                <MapPin className="h-3.5 w-3.5" />
                <span>Météo Chantiers BTP</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
                Accueil Météo
              </h1>
              <p className="mt-0.5 text-sm text-gray-400">
                Conditions actuelles et prévisions disponibles pour{" "}
                <span className="font-semibold text-white">{ville}</span>
              </p>
            </div>

            <form
              onSubmit={handleRechercherVille}
              className="flex w-full max-w-md items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="ville-meteo-detaillee"
                  type="text"
                  value={villeSaisie}
                  onChange={(e) => setVilleSaisie(e.target.value)}
                  placeholder="Rechercher une ville (ex: Bordeaux, Mérignac...)"
                  className="w-full rounded-xl border border-white/15 bg-[#14110F] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:border-[#D96B27] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-[#D96B27] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#C25B1B]"
              >
                Rechercher
              </button>
            </form>
          </div>

          {chantiersRaccourcis.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Chantiers actifs :
              </span>
              {chantiersRaccourcis.map((c) => {
                const actif = ville.toLowerCase() === c.ville.toLowerCase();
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setVilleSaisie(c.ville);
                      setVille(c.ville);
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      actif
                        ? "border-[#D96B27] bg-[#D96B27]/20 text-amber-200"
                        : "border-white/10 bg-[#14110F] text-gray-300 hover:border-[#D96B27]/50 hover:text-white"
                    }`}
                  >
                    {c.label} · {c.ville}
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {loading && !meteo ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-[#1E1916]" />
            <div className="h-56 animate-pulse rounded-2xl border border-white/10 bg-[#1E1916]" />
          </div>
        ) : !meteo ? (
          <div className="rounded-2xl border border-white/10 bg-[#1E1916] p-8 text-center">
            <Cloud className="mx-auto h-10 w-10 text-gray-500" />
            <p className="mt-3 text-base font-semibold text-white">
              Impossible de récupérer la météo pour « {ville} »
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Vérifiez l&apos;orthographe de la ville ou réessayez dans quelques instants.
            </p>
          </div>
        ) : (
          <>
            {/* Bloc 1 : Décision Chantier du jour */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Carte gauche : Conditions actuelles & Vigilance BTP */}
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-[#1E1916] p-5 shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[#D96B27]/30 bg-[#D96B27]/15">
                      <IconeMeteo
                        icon={meteo.icon}
                        conditions={meteo.conditions}
                        className="h-9 w-9 text-amber-400"
                      />
                    </div>
                    <div>
                      <p className="text-4xl font-black tracking-tight text-white">
                        {texteDegre(meteo.tempActuelle)}
                      </p>
                      <p className="text-sm font-semibold text-gray-200">{meteo.conditions}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        Max {texteDegre(meteo.tempMaxJour)} · Min {texteDegre(meteo.tempMinJour)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-300 space-y-1">
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#14110F] px-2.5 py-1">
                      <Wind className="h-3.5 w-3.5 text-[#D96B27]" />
                      <span>Rafales max : {texteKmh(rafaleMaxJour)}</span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 text-sky-300">
                      <Droplets className="h-3.5 w-3.5" />
                      <span>Cumul jour : {texteMm(meteo.cumulPluie)}</span>
                    </div>
                  </div>
                </div>

                <div
                  className={`flex items-start gap-3 rounded-xl border p-3.5 ${
                    COULEURS[meteo.alerte.niveau]
                  }`}
                >
                  <span className="text-lg leading-none" aria-hidden="true">
                    {EMOJIS[meteo.alerte.niveau]}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider">
                      Vigilance météo · {meteo.alerte.niveau}
                    </p>
                    <p className="mt-0.5 text-xs opacity-90">{meteo.alerte.motif}</p>
                  </div>
                </div>
              </div>

              {/* Carte droite : Détails météorologiques (4 Créneaux Clés) */}
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-[#1E1916] p-5 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white">
                    Détails météorologiques · Créneaux clés
                  </h2>
                  <span className="inline-flex items-center gap-1 text-xs text-sky-300">
                    <Droplets className="h-3.5 w-3.5" />
                    Précipitations prévues : {texteMm(meteo.cumulPluie)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {creneauxCles.map((c) => (
                    <div
                      key={c.titre}
                      className="rounded-xl border border-white/10 bg-[#14110F] p-3 text-center"
                    >
                      <p className="text-xs font-bold text-white">{c.titre}</p>
                      <p className="text-[10px] text-gray-400">{c.heure}</p>
                      <p className="mt-1.5 text-lg font-black text-amber-300">
                        {texteDegre(c.temp)}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-300">
                        Vent {texteKmh(c.vent)}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Raf. {texteKmh(c.rafales)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-sky-300">
                        {texteMm(c.pluie)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Bloc 2 : Prévisions sur plusieurs jours + Cumuls Pluie */}
            <section className="rounded-2xl border border-white/10 bg-[#1E1916] p-5 shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                  <CalendarDays className="h-4 w-4 text-[#D96B27]" />
                  Prévisions sur plusieurs jours
                </h2>
                <span className="text-xs text-gray-400">Min / Max · Cumuls pluie</span>
              </div>

              {meteo.prochainsJours.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {meteo.prochainsJours.map((j) => (
                    <div
                      key={j.date}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#14110F] p-3.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <IconeMeteo
                          icon={j.icon}
                          conditions={j.conditions}
                          className="h-7 w-7 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold capitalize text-white truncate">
                            {nomJour(j.date)}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">{j.conditions}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-white">
                          {j.tempMin}° / <span className="text-amber-300">{j.tempMax}°</span>
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-sky-300">
                          {j.cumulPluie !== undefined ? `${j.cumulPluie.toFixed(1)} mm` : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Prévisions multi-jours indisponibles.</p>
              )}
            </section>

            {/* Bloc 3 : Prévisions heure par heure en ruban horizontal */}
            <section className="rounded-2xl border border-white/10 bg-[#1E1916] p-5 shadow-lg">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                  <Clock className="h-4 w-4 text-[#D96B27]" />
                  Prévisions horaires
                </h2>
                <button
                  type="button"
                  onClick={() => setVoirHeuresPassees((prev) => !prev)}
                  className="rounded-lg border border-white/10 bg-[#14110F] px-3 py-1 text-xs font-semibold text-gray-300 hover:border-[#D96B27]/50 hover:text-white transition-colors"
                >
                  {voirHeuresPassees ? "Masquer les heures passées" : "Voir les heures passées"}
                </button>
              </div>

              {heuresAffichees.length > 0 ? (
                <div className="flex gap-2.5 overflow-x-auto pb-2">
                  {heuresAffichees.map((h) => (
                    <div
                      key={h.heure}
                      className="min-w-[104px] shrink-0 rounded-xl border border-white/10 bg-[#14110F] p-3 text-center"
                    >
                      <p className="text-xs font-bold text-white">{h.heure}</p>
                      <div className="my-1.5 flex justify-center">
                        <IconeMeteo icon={meteo.icon} className="h-5 w-5" />
                      </div>
                      <p className="text-base font-black text-amber-300">
                        {texteDegre(h.temp)}
                      </p>
                      <p className="mt-1 text-[10px] text-gray-300">
                        Raf. {texteKmh(h.rafales)}
                      </p>
                      <p className="text-[10px] font-semibold text-sky-300">
                        {texteMm(h.pluie)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Données horaires indisponibles.</p>
              )}
            </section>
          </>
        )}

        {/* Bloc 4 : Actions métier BTP */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href="/bureau/meteo"
            className="group flex items-center justify-between rounded-2xl border border-white/10 bg-[#1E1916] p-5 transition-all hover:border-[#D96B27]/60"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D96B27]/30 bg-[#D96B27]/15 text-[#D96B27]">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Veille des intempéries</h3>
                <p className="text-xs text-gray-400">
                  Suivi des alertes, arrêts et rapports intempéries BTP
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-[#D96B27]" />
          </Link>

          <Link
            href="/terrain/accueil"
            className="group flex items-center justify-between rounded-2xl border border-white/10 bg-[#1E1916] p-5 transition-all hover:border-[#D96B27]/60"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D96B27]/30 bg-[#D96B27]/15 text-[#D96B27]">
                <HardHat className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Impact météo sur les chantiers
                </h3>
                <p className="text-xs text-gray-400">
                  Consulter les chantiers actifs exposés et leurs plannings
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-[#D96B27]" />
          </Link>
        </section>
      </div>
    </div>
  );
}
