"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CloudSun,
  Fence,
  FileText,
  HardHat,
  Layers,
  Receipt,
  Ruler,
  Sparkles,
  UserCheck,
  Wind,
  Wrench,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  getStartOfWeekLocal,
  parseYMD,
} from "@/lib/services/planningService";
import {
  listerRendezVous,
  type RendezVousRow,
} from "@/lib/services/rendezVousService";
import BnaCopilotMiniPanel from "@/components/BnaCopilotMiniPanel";

interface ChantierRow {
  id: string;
  nom: string | null;
  client_nom: string | null;
  metier: string;
  statut: string | null;
  date_debut: string | null;
  date_fin: string | null;
  checklist: unknown;
}

interface DevisRow {
  id: string;
  statut: string;
}

interface FactureRow {
  id: string;
  statut: string;
  net_a_payer_ttc: number;
}

interface MeteoResume {
  localisation: { libelle: string; codePostal: string };
  tempActuelle: number | null;
  conditions: string;
  matin: { temp: number | null; vent: number | null; rafales: number | null };
  apresMidi: { temp: number | null; vent: number | null; rafales: number | null };
  heures: Array<{
    heure: string;
    temp: number | null;
    vent: number | null;
    rafales: number | null;
  }>;
  alerte: { niveau: string; motif: string };
}

function calculerAvancementChantier(ch: ChantierRow): number {
  const s = (ch.statut ?? "").toLowerCase();
  if (s === "termine" || s === "terminé" || s === "cloture" || s === "clôturé") {
    return 100;
  }
  if (Array.isArray(ch.checklist) && ch.checklist.length > 0) {
    const items = ch.checklist as Array<{ fait?: boolean; done?: boolean }>;
    const done = items.filter((i) => Boolean(i?.fait ?? i?.done)).length;
    return Math.round((done / items.length) * 100);
  }
  if (s === "en_cours" || s === "chantier") return 55;
  if (s === "planifie" || s === "planifié") return 20;
  return 35;
}

function libelleMetier(metier: string): "Bardage" | "Terrasse" | "Clôture" {
  const m = (metier || "").toLowerCase();
  if (m.includes("terrasse")) return "Terrasse";
  if (m.includes("cloture") || m.includes("clôture")) return "Clôture";
  return "Bardage";
}

function moyennePeriode(
  heures: MeteoResume["heures"],
  hMin: number,
  hMax: number
): { temp: number | null; vent: number | null } {
  const subset = heures.filter((h) => {
    const hh = parseInt(h.heure.slice(0, 2), 10);
    return Number.isFinite(hh) && hh >= hMin && hh <= hMax;
  });
  const temps = subset.map((s) => s.temp).filter((v): v is number => v !== null);
  const vents = subset.map((s) => s.vent).filter((v): v is number => v !== null);
  return {
    temp: temps.length > 0 ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null,
    vent: vents.length > 0 ? Math.round(vents.reduce((a, b) => a + b, 0) / vents.length) : null,
  };
}

export default function DashboardAccueilBna() {
  const [loading, setLoading] = useState(true);
  const [chantiers, setChantiers] = useState<ChantierRow[]>([]);
  const [devis, setDevis] = useState<DevisRow[]>([]);
  const [factures, setFactures] = useState<FactureRow[]>([]);
  const [rdvs, setRdvs] = useState<RendezVousRow[]>([]);
  const [meteo, setMeteo] = useState<MeteoResume | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  useEffect(() => {
    let actif = true;
    async function charger() {
      setLoading(true);
      try {
        const ctx = await resoudreContexteEntreprise(null);
        const entId = ctx.entreprise_id;

        const chantiersQuery = entId
          ? supabase
              .from("chantiers")
              .select("id, nom, client_nom, metier, statut, date_debut, date_fin, checklist")
              .eq("entreprise_id", entId)
              .order("created_at", { ascending: false })
              .limit(40)
          : supabase
              .from("chantiers")
              .select("id, nom, client_nom, metier, statut, date_debut, date_fin, checklist")
              .order("created_at", { ascending: false })
              .limit(40);

        const devisQuery = entId
          ? supabase.from("devis").select("id, statut").eq("entreprise_id", entId)
          : supabase.from("devis").select("id, statut");

        const facturesQuery = entId
          ? supabase
              .from("factures")
              .select("id, statut, net_a_payer_ttc")
              .eq("entreprise_id", entId)
          : supabase.from("factures").select("id, statut, net_a_payer_ttc");

        const [chRes, devRes, facRes, rdvRes, meteoRes] = await Promise.all([
          chantiersQuery,
          devisQuery,
          facturesQuery,
          listerRendezVous(supabase, entId).catch(() => ({
            data: [] as RendezVousRow[],
            migrationRequired: true,
          })),
          fetch("/api/meteo", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);

        if (!actif) return;
        if (!chRes.error && chRes.data) setChantiers(chRes.data as ChantierRow[]);
        if (!devRes.error && devRes.data) setDevis(devRes.data as DevisRow[]);
        if (!facRes.error && facRes.data) setFactures(facRes.data as FactureRow[]);
        setRdvs(rdvRes.data);
        if (meteoRes) setMeteo(meteoRes as MeteoResume);
      } finally {
        if (actif) setLoading(false);
      }
    }
    charger();
    return () => {
      actif = false;
    };
  }, []);

  const chantiersActifs = useMemo(
    () =>
      chantiers.filter((c) => {
        const s = (c.statut ?? "").toLowerCase();
        return !["termine", "terminé", "archive", "archivé", "annule", "annulé"].includes(s);
      }),
    [chantiers]
  );

  const devisEnAttente = useMemo(
    () =>
      devis.filter((d) =>
        ["brouillon", "en_attente", "envoye", "envoyé"].includes((d.statut ?? "").toLowerCase())
      ).length,
    [devis]
  );

  const facturesAEncaisser = useMemo(() => {
    const ouvertes = factures.filter((f) =>
      ["emise", "émise", "en_attente", "partiellement_payee", "en_retard"].includes(
        (f.statut ?? "").toLowerCase()
      )
    );
    return ouvertes.reduce((sum, f) => sum + (Number(f.net_a_payer_ttc) || 0), 0);
  }, [factures]);

  const planningSemaine = useMemo(() => {
    const debut = getStartOfWeekLocal(new Date());
    const fin = new Date(
      debut.getFullYear(),
      debut.getMonth(),
      debut.getDate() + 6,
      23,
      59,
      59,
      999
    );
    const debutMs = debut.getTime();
    const finMs = fin.getTime();

    const chantiersSemaine = chantiersActifs.filter((c) => {
      const dStart = parseYMD(c.date_debut);
      if (!dStart) return false;
      const dEnd = c.date_fin ? parseYMD(c.date_fin) ?? dStart : dStart;
      return dEnd.getTime() >= debutMs && dStart.getTime() <= finMs;
    }).length;

    const rdvsSemaine = rdvs.filter((r) => {
      if (r.statut === "annule") return false;
      const d = parseYMD(r.date);
      if (!d) return false;
      return d.getTime() >= debutMs && d.getTime() <= finMs;
    }).length;

    return {
      total: chantiersSemaine + rdvsSemaine,
      chantiersSemaine,
      rdvsSemaine,
    };
  }, [chantiersActifs, rdvs]);

  const repartitionMetiers = useMemo(() => {
    const base = chantiers.length > 0 ? chantiers : [];
    const counts = { Bardage: 0, Terrasse: 0, Clôture: 0 };
    for (const c of base) {
      counts[libelleMetier(c.metier)] += 1;
    }
    const total = counts.Bardage + counts.Terrasse + counts.Clôture;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return {
      total,
      counts,
      pctBardage: pct(counts.Bardage),
      pctTerrasse: pct(counts.Terrasse),
      pctCloture: pct(counts.Clôture),
    };
  }, [chantiers]);

  const soir = useMemo(
    () => (meteo?.heures ? moyennePeriode(meteo.heures, 18, 21) : { temp: null, vent: null }),
    [meteo]
  );
  const nuit = useMemo(
    () => (meteo?.heures ? moyennePeriode(meteo.heures, 22, 23) : { temp: null, vent: null }),
    [meteo]
  );

  const ventMax = Math.max(
    meteo?.matin?.rafales ?? meteo?.matin?.vent ?? 0,
    meteo?.apresMidi?.rafales ?? meteo?.apresMidi?.vent ?? 0
  );
  const vigilanceVent =
    meteo?.alerte?.niveau === "orange" ||
    meteo?.alerte?.niveau === "rouge" ||
    meteo?.alerte?.niveau === "jaune" ||
    ventMax >= 45;

  // Donut SVG (rayon 42 -> circonférence ~263.89)
  const C = 2 * Math.PI * 42;
  const segBardage =
    repartitionMetiers.total > 0
      ? (repartitionMetiers.counts.Bardage / repartitionMetiers.total) * C
      : 0;
  const segTerrasse =
    repartitionMetiers.total > 0
      ? (repartitionMetiers.counts.Terrasse / repartitionMetiers.total) * C
      : 0;
  const segCloture =
    repartitionMetiers.total > 0
      ? (repartitionMetiers.counts.Clôture / repartitionMetiers.total) * C
      : 0;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 text-white">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Colonne Principale */}
        <div className="min-w-0 space-y-4">
          {/* Rangée 1 : 4 Cartes KPI */}
          <section
            aria-label="Indicateurs clés"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <Link
              href="/terrain/chantier"
              className="rounded-2xl border border-white/10 bg-[#1B1511]/90 p-4 hover:border-[#D96B27]/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Chantiers en cours
                </span>
                <span className="rounded-full bg-[#D96B27]/20 border border-[#D96B27]/40 px-2 py-0.5 text-[10px] font-bold text-[#F59E0B]">
                  Actifs
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-white">
                {loading ? "…" : chantiersActifs.length}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-100/60">
                Sur {chantiers.length} chantier(s) total
              </p>
            </Link>

            <Link
              href="/bureau/devis-factures"
              className="rounded-2xl border border-white/10 bg-[#1B1511]/90 p-4 hover:border-[#D96B27]/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Devis en attente
                </span>
                <FileText className="h-4 w-4 text-[#D96B27]" />
              </div>
              <p className="mt-2 text-2xl font-black text-white">
                {loading ? "…" : devisEnAttente}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-100/60">
                À valider / relancer
              </p>
            </Link>

            <Link
              href="/bureau/factures"
              className="rounded-2xl border border-white/10 bg-[#1B1511]/90 p-4 hover:border-[#D96B27]/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Factures à encaisser
                </span>
                <Receipt className="h-4 w-4 text-[#D96B27]" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-black text-white truncate">
                {loading ? "…" : fmtEuro(facturesAEncaisser)}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-100/60">
                Net TTC en cours
              </p>
            </Link>

            <Link
              href="/planning"
              className="rounded-2xl border border-white/10 bg-[#1B1511]/90 p-4 hover:border-[#D96B27]/60 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  PLANNING
                </span>
                <CalendarDays className="h-4 w-4 text-[#D96B27]" />
              </div>
              <p className="mt-2 text-2xl font-black text-white">
                {loading ? "…" : planningSemaine.total}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-100/60">
                {loading
                  ? "Chantiers & interventions"
                  : `${planningSemaine.chantiersSemaine} chantier(s) · ${planningSemaine.rdvsSemaine} RDV cette semaine`}
              </p>
            </Link>
          </section>

          {/* Rangée 2 : Météo Chantier + Accès rapides */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Carte Météo Chantier */}
            <div className="rounded-2xl border border-white/10 bg-[#1B1511]/90 p-4 sm:p-5 flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CloudSun className="h-4 w-4 text-[#D96B27]" />
                    <h2 className="text-sm font-bold text-white">Météo Chantier</h2>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {meteo?.localisation?.libelle
                      ? `${meteo.localisation.libelle} (${meteo.localisation.codePostal})`
                      : "Générac (33920)"}
                    {meteo?.conditions ? ` · ${meteo.conditions}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-white">
                    {meteo?.tempActuelle != null ? `${meteo.tempActuelle}°C` : "—"}
                  </p>
                  <p className="inline-flex items-center gap-1 text-[11px] text-amber-200/80">
                    <Wind className="h-3 w-3 text-[#D96B27]" />
                    {ventMax > 0 ? `Rafales ${Math.round(ventMax)} km/h` : "Vent calme"}
                  </p>
                </div>
              </div>

              {vigilanceVent && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="font-semibold">
                    Vigilance Météo : {meteo?.alerte?.motif || "Vent soutenu sur chantier"}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-2 pt-1">
                {[
                  {
                    label: "Matin",
                    temp: meteo?.matin?.temp,
                    vent: meteo?.matin?.vent,
                  },
                  {
                    label: "Après-midi",
                    temp: meteo?.apresMidi?.temp,
                    vent: meteo?.apresMidi?.vent,
                  },
                  {
                    label: "Soir",
                    temp: soir.temp,
                    vent: soir.vent,
                  },
                  {
                    label: "Nuit",
                    temp: nuit.temp,
                    vent: nuit.vent,
                  },
                ].map((slot) => (
                  <div
                    key={slot.label}
                    className="rounded-xl border border-white/10 bg-black/25 p-2 text-center"
                  >
                    <p className="text-[10px] font-semibold text-gray-400">{slot.label}</p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {slot.temp != null ? `${Math.round(slot.temp)}°` : "—"}
                    </p>
                    <p className="text-[10px] text-amber-200/70">
                      {slot.vent != null ? `${Math.round(slot.vent)} km/h` : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Carte Accès rapides */}
            <div className="rounded-2xl border border-white/10 bg-[#1B1511]/90 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Accès rapides</h2>
                <span className="text-[11px] text-amber-200/70">Actions métier</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <Link
                  href="/bureau/portails-clients"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/25 p-3 text-center hover:border-[#D96B27]/50 hover:bg-[#D96B27]/15 transition-colors"
                >
                  <UserCheck className="h-5 w-5 text-[#D96B27]" />
                  <span className="text-[11px] font-semibold text-gray-200 leading-tight">
                    Accès client
                  </span>
                </Link>

                <Link
                  href="/calepinage"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/25 p-3 text-center hover:border-[#D96B27]/50 hover:bg-[#D96B27]/15 transition-colors"
                >
                  <Layers className="h-5 w-5 text-[#D96B27]" />
                  <span className="text-[11px] font-semibold text-gray-200 leading-tight">
                    Chantier bardage
                  </span>
                </Link>

                <Link
                  href="/terrain/terrasse"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/25 p-3 text-center hover:border-[#D96B27]/50 hover:bg-[#D96B27]/15 transition-colors"
                >
                  <Ruler className="h-5 w-5 text-[#D96B27]" />
                  <span className="text-[11px] font-semibold text-gray-200 leading-tight">
                    Chantier terrasse
                  </span>
                </Link>

                <Link
                  href="/terrain/cloture"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/25 p-3 text-center hover:border-[#D96B27]/50 hover:bg-[#D96B27]/15 transition-colors"
                >
                  <Fence className="h-5 w-5 text-[#D96B27]" />
                  <span className="text-[11px] font-semibold text-gray-200 leading-tight">
                    Chantier clôture
                  </span>
                </Link>

                <Link
                  href="/bureau/sav"
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-black/25 p-3 text-center hover:border-[#D96B27]/50 hover:bg-[#D96B27]/15 transition-colors"
                >
                  <Wrench className="h-5 w-5 text-[#D96B27]" />
                  <span className="text-[11px] font-semibold text-gray-200 leading-tight">
                    SAV
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={() => setAiModalOpen(true)}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[#D96B27]/60 bg-gradient-to-br from-[#D96B27] to-[#B85316] p-3 text-center shadow-md shadow-[#D96B27]/20 hover:from-[#E57732] hover:to-[#C95D1B] transition-all cursor-pointer"
                >
                  <Sparkles className="h-5 w-5 text-white" />
                  <span className="text-[11px] font-bold text-white leading-tight">
                    BNA IA Assistant
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Rangée 3 : Chantiers en cours + Répartition des métiers */}
          <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
            {/* Chantiers en cours */}
            <div className="rounded-2xl border border-white/10 bg-[#1B1511]/90 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                  <HardHat className="h-4 w-4 text-[#D96B27]" />
                  Chantiers en cours
                </h2>
                <Link
                  href="/terrain/chantier"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#D96B27] hover:underline"
                >
                  Voir tout
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {loading ? (
                <p className="text-xs text-gray-400 py-6 text-center">
                  Chargement des chantiers...
                </p>
              ) : chantiersActifs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-xs text-gray-400">
                  Aucun chantier actif pour le moment.{" "}
                  <Link href="/terrain/chantier" className="font-bold text-[#D96B27] hover:underline">
                    Créer un chantier
                  </Link>
                </div>
              ) : (
                <>
                  {/* Vue Tableau Tablette & Desktop (≥ md) */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-gray-400">
                          <th className="pb-2 font-semibold">Chantier</th>
                          <th className="pb-2 font-semibold">Métier</th>
                          <th className="pb-2 font-semibold">Avancement</th>
                          <th className="pb-2 font-semibold text-right">Échéance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {chantiersActifs.slice(0, 6).map((c) => {
                          const av = calculerAvancementChantier(c);
                          const met = libelleMetier(c.metier);
                          const href =
                            met === "Terrasse"
                              ? `/terrain/terrasse/${c.id}`
                              : met === "Clôture"
                                ? `/terrain/cloture/${c.id}`
                                : `/terrain/chantier/${c.id}`;
                          return (
                            <tr key={c.id} className="hover:bg-white/[0.03]">
                              <td className="py-2.5 pr-3">
                                <Link
                                  href={href}
                                  className="font-semibold text-white hover:text-[#D96B27] block truncate max-w-[200px]"
                                >
                                  {c.nom || c.client_nom || "Chantier sans nom"}
                                </Link>
                              </td>
                              <td className="py-2.5 pr-3">
                                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-amber-100/80">
                                  {met}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 w-36">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-[#D96B27]"
                                      style={{ width: `${av}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] font-mono text-gray-300">{av}%</span>
                                </div>
                              </td>
                              <td className="py-2.5 text-right text-[11px] text-gray-400 font-mono">
                                {c.date_fin
                                  ? new Date(c.date_fin).toLocaleDateString("fr-FR")
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Vue Cartes empilées Mobile (< md) */}
                  <div className="space-y-2.5 md:hidden">
                    {chantiersActifs.slice(0, 5).map((c) => {
                      const av = calculerAvancementChantier(c);
                      const met = libelleMetier(c.metier);
                      const href =
                        met === "Terrasse"
                          ? `/terrain/terrasse/${c.id}`
                          : met === "Clôture"
                            ? `/terrain/cloture/${c.id}`
                            : `/terrain/chantier/${c.id}`;
                      return (
                        <Link
                          key={c.id}
                          href={href}
                          className="block rounded-xl border border-white/10 bg-black/25 p-3 hover:border-[#D96B27]/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-white truncate">
                              {c.nom || c.client_nom || "Chantier"}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                              {met}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#D96B27]"
                                style={{ width: `${av}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-gray-300">{av}%</span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              {c.date_fin
                                ? new Date(c.date_fin).toLocaleDateString("fr-FR")
                                : "—"}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Répartition des métiers (Donut SVG) */}
            <div className="rounded-2xl border border-white/10 bg-[#1B1511]/90 p-4 sm:p-5 flex flex-col justify-between">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">Répartition des métiers</h2>
                <span className="text-[11px] text-gray-400">{repartitionMetiers.total} dossiers</span>
              </div>

              <div className="flex items-center justify-center py-2">
                <div className="relative h-36 w-36">
                  <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
                    <circle
                      cx="55"
                      cy="55"
                      r="42"
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="14"
                    />
                    {repartitionMetiers.total > 0 && (
                      <>
                        <circle
                          cx="55"
                          cy="55"
                          r="42"
                          fill="none"
                          stroke="#D96B27"
                          strokeWidth="14"
                          strokeDasharray={`${segBardage} ${C}`}
                          strokeDashoffset={0}
                        />
                        <circle
                          cx="55"
                          cy="55"
                          r="42"
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="14"
                          strokeDasharray={`${segTerrasse} ${C}`}
                          strokeDashoffset={-segBardage}
                        />
                        <circle
                          cx="55"
                          cy="55"
                          r="42"
                          fill="none"
                          stroke="#38BDF8"
                          strokeWidth="14"
                          strokeDasharray={`${segCloture} ${C}`}
                          strokeDashoffset={-(segBardage + segTerrasse)}
                        />
                      </>
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xl font-black text-white">
                      {repartitionMetiers.total}
                    </span>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                      Total
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-300">
                    <span className="h-2 w-2 rounded-full bg-[#D96B27]" />
                    Bardage
                  </div>
                  <p className="text-xs font-bold text-white mt-0.5">
                    {repartitionMetiers.pctBardage}%
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-300">
                    <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                    Terrasse
                  </div>
                  <p className="text-xs font-bold text-white mt-0.5">
                    {repartitionMetiers.pctTerrasse}%
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-300">
                    <span className="h-2 w-2 rounded-full bg-[#38BDF8]" />
                    Clôture
                  </div>
                  <p className="text-xs font-bold text-white mt-0.5">
                    {repartitionMetiers.pctCloture}%
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Colonne droite épinglée : Panneau BNA AI (Desktop >= xl) */}
        <aside className="hidden xl:block sticky top-20">
          <BnaCopilotMiniPanel />
        </aside>
      </div>

      {/* Modale BNA AI sur Mobile / Tablette (< xl) */}
      {aiModalOpen && (
        <div
          className="fixed inset-0 z-[220] xl:hidden flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setAiModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[88vh] rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
          >
            <BnaCopilotMiniPanel onClose={() => setAiModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
