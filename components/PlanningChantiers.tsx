"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  HardHat,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export type MetierPlanning = "bardage" | "terrasse" | "cloture";

export interface PlanningChantierItem {
  id: string;
  nom: string | null;
  client_nom: string | null;
  client_societe: string | null;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  metier?: MetierPlanning | string | null;
  heures_estimees?: number | null;
  heures_a_rattraper?: number | null;
}

export interface PlanningChantiersProps {
  chantiers: PlanningChantierItem[];
  onUpdateDates: (id: string, newDebut: string, newFin: string) => void | Promise<void>;
  defaultViewMode?: "semaine" | "mois";
  equipeHeuresParJour?: number; // défaut 16h/j (équipe de 2 poseurs)
}

type ViewMode = "semaine" | "mois";

const JOURS_COURTS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const JOURS_LETTRES = ["L", "M", "M", "J", "V", "S", "D"];
const MOIS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function parseYMD(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayOfWeek = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayOfWeek);
  return d;
}

function getWeekDays(startOfWeek: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });
}

function getMonthDays(currentDate: Date): Date[] {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  const total = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => new Date(y, m, i + 1));
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getMetierStyle(metier?: string | null) {
  const m = (metier || "bardage").toLowerCase();
  if (m === "terrasse") {
    return {
      label: "Terrasse",
      barBg: "bg-amber-600",
      barBorder: "border-amber-700",
      badge: "border-amber-200 bg-amber-500/15 text-amber-300",
      hubHref: (id: string) => `/terrain/terrasse/${id}`,
    };
  }
  if (m === "cloture") {
    return {
      label: "Clôture",
      barBg: "bg-[#D96B27]",
      barBorder: "border-[#96461E]",
      badge: "border-[#D96B27]/30 bg-[#D96B27]/10 text-[#D96B27]",
      hubHref: (id: string) => `/terrain/cloture/${id}`,
    };
  }
  return {
    label: "Bardage",
    barBg: "bg-slate-700",
    barBorder: "border-slate-800",
    badge: "border-blue-200 bg-sky-500/15 text-sky-300",
    hubHref: (id: string) => `/terrain/chantier/${id}`,
  };
}

export default function PlanningChantiers({
  chantiers,
  onUpdateDates,
  defaultViewMode = "semaine",
  equipeHeuresParJour = 16,
}: PlanningChantiersProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [localChantiers, setLocalChantiers] = useState<PlanningChantierItem[]>(chantiers);
  const [intemperies, setIntemperies] = useState<Record<string, boolean>>({});
  const [heuresRattraperMap, setHeuresRattraperMap] = useState<Record<string, number>>({});
  const [avancements, setAvancements] = useState<Record<string, number>>({});
  const [ficheRapide, setFicheRapide] = useState<PlanningChantierItem | null>(null);
  const [editDebut, setEditDebut] = useState("");
  const [editFin, setEditFin] = useState("");

  const gridRef = useRef<HTMLDivElement>(null);
  const dragHappenedRef = useRef(false);
  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  useEffect(() => {
    setLocalChantiers(chantiers);
  }, [chantiers]);

  useEffect(() => {
    async function fetchData() {
      if (typeof supabase?.from !== "function") return;
      const [{ data: intData }, { data: avData }, { data: chRattrapData }] = await Promise.all([
        supabase
          .from("rapports_intemperies")
          .select("chantier_id, jour_arrete")
          .eq("jour_arrete", true),
        supabase
          .from("avancements_chantier")
          .select("chantier_id, pourcentage, date")
          .order("date", { ascending: false }),
        supabase
          .from("chantiers")
          .select("id, heures_a_rattraper")
          .gt("heures_a_rattraper", 0),
      ]);

      if (chRattrapData) {
        const rattrapMap: Record<string, number> = {};
        for (const row of chRattrapData as { id: string; heures_a_rattraper: number | null }[]) {
          if (row.id && typeof row.heures_a_rattraper === "number" && row.heures_a_rattraper > 0) {
            rattrapMap[row.id] = row.heures_a_rattraper;
          }
        }
        setHeuresRattraperMap(rattrapMap);
      }

      if (intData) {
        const map: Record<string, boolean> = {};
        for (const r of intData) {
          if (r.chantier_id) map[r.chantier_id] = true;
        }
        setIntemperies(map);
      }

      if (avData) {
        const avMap: Record<string, number> = {};
        for (const av of avData) {
          if (av.chantier_id && avMap[av.chantier_id] === undefined && typeof av.pourcentage === "number") {
            avMap[av.chantier_id] = av.pourcentage;
          }
        }
        setAvancements(avMap);
      }
    }
    fetchData();
  }, []);

  const visibleDays = useMemo(() => {
    if (viewMode === "semaine") {
      return getWeekDays(getStartOfWeek(currentDate));
    }
    return getMonthDays(currentDate);
  }, [viewMode, currentDate]);

  const rangeStart = visibleDays[0];
  const rangeEnd = visibleDays[visibleDays.length - 1];
  const totalDays = visibleDays.length;

  const periodLabel = useMemo(() => {
    if (viewMode === "semaine") {
      const weekNum = getISOWeekNumber(rangeStart);
      const startD = rangeStart.getDate();
      const endD = rangeEnd.getDate();
      const mStart = MOIS_FR[rangeStart.getMonth()].slice(0, 4);
      const mEnd = MOIS_FR[rangeEnd.getMonth()].slice(0, 4);
      const mStr =
        rangeStart.getMonth() === rangeEnd.getMonth()
          ? `${mStart}. ${rangeEnd.getFullYear()}`
          : `${mStart}. - ${mEnd}. ${rangeEnd.getFullYear()}`;
      return `Semaine ${weekNum} • ${startD} au ${endD} ${mStr}`;
    }
    return `${MOIS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [viewMode, rangeStart, rangeEnd, currentDate]);

  const chantiersSurPeriode = useMemo(() => {
    const rStartMs = rangeStart.getTime();
    const rEndMs = rangeEnd.getTime();
    const msPerDay = 86400000;

    return localChantiers
      .map((ch) => {
        const dStart = parseYMD(ch.date_debut);
        if (!dStart) return null;

        let dEnd = parseYMD(ch.date_fin);
        let estEstimee = false;
        if (!dEnd) {
          estEstimee = true;
          const heures = ch.heures_estimees && ch.heures_estimees > 0 ? ch.heures_estimees : 24;
          const joursEstimes = Math.max(1, Math.ceil(heures / equipeHeuresParJour));
          dEnd = new Date(dStart);
          dEnd.setDate(dStart.getDate() + joursEstimes - 1);
        }

        const startMs = dStart.getTime();
        const endMs = Math.max(startMs, dEnd.getTime());
        if (endMs < rStartMs || startMs > rEndMs) return null;

        const startIdx = Math.max(0, Math.floor((startMs - rStartMs) / msPerDay));
        const endIdx = Math.min(totalDays - 1, Math.floor((endMs - rStartMs) / msPerDay));

        return {
          chantier: ch,
          dStart,
          dEnd,
          estEstimee,
          startIdx,
          endIdx,
          continuesBefore: startMs < rStartMs,
          continuesAfter: endMs > rEndMs,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [localChantiers, rangeStart, rangeEnd, totalDays, equipeHeuresParJour]);

  const chantiersSansDates = useMemo(
    () => localChantiers.filter((c) => !parseYMD(c.date_debut)),
    [localChantiers]
  );

  const handleBarPointerDown = (
    e: React.PointerEvent,
    ch: PlanningChantierItem,
    dStart: Date,
    dEnd: Date
  ) => {
    if (e.button !== 0) return;
    const gridEl = gridRef.current;
    if (!gridEl) return;

    const startX = e.clientX;
    const colWidth = Math.max(24, gridEl.clientWidth / totalDays);
    dragHappenedRef.current = false;

    const onMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dayDelta = Math.round(dx / colWidth);
      if (Math.abs(dx) > 5) dragHappenedRef.current = true;
      if (dayDelta === 0) return;

      const nextStart = new Date(dStart);
      nextStart.setDate(dStart.getDate() + dayDelta);
      const nextEnd = new Date(dEnd);
      nextEnd.setDate(dEnd.getDate() + dayDelta);

      setLocalChantiers((prev) =>
        prev.map((item) =>
          item.id === ch.id
            ? { ...item, date_debut: formatYMD(nextStart), date_fin: formatYMD(nextEnd) }
            : item
        )
      );
    };

    const onUp = (upEv: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      const dx = upEv.clientX - startX;
      const dayDelta = Math.round(dx / colWidth);
      if (dayDelta !== 0) {
        const nextStart = new Date(dStart);
        nextStart.setDate(dStart.getDate() + dayDelta);
        const nextEnd = new Date(dEnd);
        nextEnd.setDate(dEnd.getDate() + dayDelta);
        onUpdateDates(ch.id, formatYMD(nextStart), formatYMD(nextEnd));
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const ouvrirFicheRapide = (ch: PlanningChantierItem, dStart: Date, dEnd: Date) => {
    if (dragHappenedRef.current) return;
    setFicheRapide(ch);
    setEditDebut(formatYMD(dStart));
    setEditFin(ch.date_fin ? formatYMD(dEnd) : "");
  };

  const colMinW = viewMode === "mois" ? "min-w-[34px]" : "min-w-[85px]";

  return (
    <div className="space-y-4">
      {/* 1. Barre de contrôles supérieure (design clair BnaPlanningView) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-[#120F0D] p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewMode("semaine")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                viewMode === "semaine"
                  ? "bg-[#1B1511] text-[#D96B27] shadow-xs"
                  : "text-[#B8A99E] hover:text-[#F5EFEA]"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" /> Semaine
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mois")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                viewMode === "mois"
                  ? "bg-[#1B1511] text-[#D96B27] shadow-xs"
                  : "text-[#B8A99E] hover:text-[#F5EFEA]"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Mois
            </button>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D96B27]/20 bg-[#D96B27]/10 px-3 py-1 text-xs font-bold text-[#D96B27]">
            <HardHat className="h-3.5 w-3.5" />
            {chantiersSurPeriode.length} chantier(s) sur la période
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setCurrentDate((d) => {
                const n = new Date(d);
                if (viewMode === "semaine") n.setDate(n.getDate() - 7);
                else n.setMonth(n.getMonth() - 1);
                return n;
              })
            }
            className="rounded-xl border border-white/10 bg-[#120F0D] p-2 text-[#F5EFEA] hover:border-[#D96B27]/40"
            aria-label="Période précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="rounded-xl border border-white/10 bg-[#120F0D] px-3 py-1.5 text-xs font-bold text-[#F5EFEA] hover:border-[#D96B27]/40"
          >
            Aujourd&apos;hui
          </button>
          <span className="min-w-[160px] text-center text-xs sm:text-sm font-extrabold text-[#F5EFEA]">
            {periodLabel}
          </span>
          <button
            type="button"
            onClick={() =>
              setCurrentDate((d) => {
                const n = new Date(d);
                if (viewMode === "semaine") n.setDate(n.getDate() + 7);
                else n.setMonth(n.getMonth() + 1);
                return n;
              })
            }
            className="rounded-xl border border-white/10 bg-[#120F0D] p-2 text-[#F5EFEA] hover:border-[#D96B27]/40"
            aria-label="Période suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. Grille temporelle claire */}
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#1B1511] shadow-xs">
        <div className="min-w-max">
          {/* En-tête des jours */}
          <div className="flex border-b border-white/10 bg-[#120F0D]">
            <div className="w-36 sm:w-44 shrink-0 sticky left-0 z-20 bg-[#120F0D] border-r border-white/10 px-3 py-2.5 flex items-center text-[11px] font-extrabold uppercase tracking-wider text-[#B8A99E]">
              Chantiers
            </div>
            <div
              ref={gridRef}
              className="grid flex-1"
              style={{ gridTemplateColumns: `repeat(${totalDays}, minmax(0, 1fr))` }}
            >
              {visibleDays.map((d, idx) => {
                const isToday = isSameDay(d, today);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const dayIdx = (d.getDay() + 6) % 7;
                return (
                  <div
                    key={idx}
                    className={`flex flex-col items-center justify-center py-2 px-1 border-r border-[#EFEFEF] ${colMinW} ${
                      isToday
                        ? "bg-[#D96B27]/10"
                        : isWeekend
                          ? "bg-[#221B17]/70"
                          : "bg-[#1B1511]"
                    }`}
                  >
                    <span
                      className={`text-[10px] font-bold uppercase ${
                        isToday ? "text-[#D96B27]" : "text-[#8E7F74]"
                      }`}
                    >
                      {viewMode === "mois" ? JOURS_LETTRES[dayIdx] : JOURS_COURTS[dayIdx]}
                    </span>
                    <span
                      className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold ${
                        isToday ? "bg-[#D96B27] text-white" : "text-[#F5EFEA]"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lignes de chantiers */}
          {chantiersSurPeriode.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#8E7F74] italic">
              Aucun chantier planifié sur cette période. Naviguez ou définissez des dates sur vos chantiers.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {chantiersSurPeriode.map(
                ({
                  chantier: ch,
                  dStart,
                  dEnd,
                  estEstimee,
                  startIdx,
                  endIdx,
                  continuesBefore,
                  continuesAfter,
                }) => {
                  const style = getMetierStyle(ch.metier);
                  const avPct = avancements[ch.id];
                  const hasAlert = Boolean(intemperies[ch.id]);
                  const nomClient = ch.client_societe || ch.client_nom || "Client";

                  return (
                    <div key={ch.id} className="flex items-center hover:bg-[#120F0D]/60">
                      <div className="w-36 sm:w-44 shrink-0 sticky left-0 z-10 bg-[#1B1511] border-r border-white/10 px-3 py-3">
                        <p className="text-xs font-bold text-[#F5EFEA] truncate">
                          {ch.nom || nomClient}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span
                            className={`inline-block rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase ${style.badge}`}
                          >
                            {style.label}
                          </span>
                          {(heuresRattraperMap[ch.id] ?? ch.heures_a_rattraper ?? 0) > 0 && (
                            <span className="inline-block rounded-md border border-[#D96B27]/50 bg-[#D96B27]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#F59E0B]">
                              +{heuresRattraperMap[ch.id] ?? ch.heures_a_rattraper}h intemp.
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        className="relative flex-1 grid py-2.5"
                        style={{ gridTemplateColumns: `repeat(${totalDays}, minmax(0, 1fr))` }}
                      >
                        <div
                          onPointerDown={(e) => handleBarPointerDown(e, ch, dStart, dEnd)}
                          onClick={() => ouvrirFicheRapide(ch, dStart, dEnd)}
                          style={{
                            gridColumnStart: startIdx + 1,
                            gridColumnEnd: endIdx + 2,
                          }}
                          className={`mx-1 h-9 rounded-xl border-2 ${
                            estEstimee ? "border-dashed opacity-85" : ""
                          } ${style.barBg} ${style.barBorder} relative overflow-hidden cursor-grab active:cursor-grabbing shadow-xs hover:brightness-110 transition-all flex items-center px-2.5 gap-1.5 ${
                            hasAlert ? "ring-2 ring-red-500" : ""
                          }`}
                          title={`${ch.nom || nomClient} · Glisser pour déplacer, cliquer pour éditer`}
                        >
                          {avPct !== undefined && (
                            <div
                              className="absolute inset-y-0 left-0 bg-black/25 pointer-events-none"
                              style={{ width: `${avPct}%` }}
                            />
                          )}
                          <div className="relative z-10 flex items-center justify-between w-full gap-1.5 text-white text-xs select-none pointer-events-none">
                            <span className="truncate font-bold">
                              {continuesBefore ? "‹ " : ""}
                              {ch.nom || nomClient}
                              {estEstimee ? " (est.)" : ""}
                              {continuesAfter ? " ›" : ""}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {avPct !== undefined && (
                                <span className="rounded bg-black/35 px-1.5 py-0.5 text-[10px] font-bold">
                                  {avPct}%
                                </span>
                              )}
                              {hasAlert && (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}

          {chantiersSansDates.length > 0 && (
            <div className="border-t border-white/10 bg-[#120F0D] px-4 py-2.5 flex flex-wrap items-center gap-2 text-xs text-[#B8A99E]">
              <span className="font-bold text-[#F5EFEA]">Sans dates :</span>
              {chantiersSansDates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    const t = formatYMD(today);
                    setFicheRapide(c);
                    setEditDebut(t);
                    setEditFin(t);
                  }}
                  className="rounded-lg border border-white/10 bg-[#1B1511] px-2.5 py-1 font-semibold text-[#F5EFEA] hover:border-[#D96B27]"
                >
                  + {c.nom || c.client_nom || "Chantier"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Fiche rapide au clic */}
      {ficheRapide && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-28 bg-black/50 backdrop-blur-xs"
          onClick={() => setFicheRapide(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1B1511] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span
                  className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${
                    getMetierStyle(ficheRapide.metier).badge
                  }`}
                >
                  {getMetierStyle(ficheRapide.metier).label}
                </span>
                <h3 className="mt-1 text-base font-bold text-[#F5EFEA]">
                  {ficheRapide.nom || "Chantier"}
                </h3>
                <p className="text-xs text-[#8E7F74]">
                  {ficheRapide.client_societe || ficheRapide.client_nom || "Client"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFicheRapide(null)}
                className="rounded-lg p-1 text-[#8E7F74] hover:text-[#F5EFEA]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold text-[#B8A99E]">Date début</label>
                <input
                  type="date"
                  value={editDebut}
                  onChange={(e) => setEditDebut(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
                />
              </div>
              <div>
                <label className="font-semibold text-[#B8A99E]">Date fin</label>
                <input
                  type="date"
                  value={editFin}
                  onChange={(e) => setEditFin(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 px-3 py-2 text-[#F5EFEA]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
              <Link
                href={getMetierStyle(ficheRapide.metier).hubHref(ficheRapide.id)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#23272B] hover:bg-[#D96B27] px-3.5 py-2 text-xs font-bold text-white transition-all"
              >
                <span>Ouvrir Hub</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>

              <button
                type="button"
                onClick={() => {
                  if (!editDebut) return;
                  onUpdateDates(ficheRapide.id, editDebut, editFin || editDebut);
                  setFicheRapide(null);
                }}
                className="rounded-xl bg-[#D96B27] hover:bg-[#E07A38] px-4 py-2 text-xs font-bold text-white"
              >
                Enregistrer les dates
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
