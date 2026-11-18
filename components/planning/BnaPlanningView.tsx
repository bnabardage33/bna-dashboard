"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  HardHat,
  Package,
} from "lucide-react";
import {
  NATURES_CONFIG,
  getISOWeekNumber,
  getMonthDaysLocal,
  getStartOfWeekLocal,
  getWeekDaysLocal,
  parseYMD,
  type UnifiedPlanningItem,
} from "@/lib/services/planningService";

export type ViewMode = "semaine" | "mois";

export interface BnaPlanningViewProps {
  items: UnifiedPlanningItem[];
  onSelectItem: (item: UnifiedPlanningItem) => void;
  className?: string;
  defaultViewMode?: ViewMode;
}

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

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function BnaPlanningView({
  items,
  onSelectItem,
  className = "",
  defaultViewMode = "semaine",
}: BnaPlanningViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);

  const visibleDays = useMemo(() => {
    if (viewMode === "semaine") {
      return getWeekDaysLocal(getStartOfWeekLocal(currentDate));
    }
    return getMonthDaysLocal(currentDate);
  }, [viewMode, currentDate]);

  const rangeStart = visibleDays[0];
  const rangeEnd = visibleDays[visibleDays.length - 1];
  const totalDays = visibleDays.length;

  const scrollToToday = () => {
    if (!containerRef.current) return;
    const el = containerRef.current.querySelector("[data-today='true']");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToToday();
    }, 150);
    return () => clearTimeout(timer);
  }, [viewMode, currentDate]);

  const handlePrevious = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "semaine") {
        next.setDate(next.getDate() - 7);
      } else {
        next.setMonth(next.getMonth() - 1);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "semaine") {
        next.setDate(next.getDate() + 7);
      } else {
        next.setMonth(next.getMonth() + 1);
      }
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setTimeout(() => scrollToToday(), 180);
  };

  const periodLabel = useMemo(() => {
    if (viewMode === "semaine") {
      const weekNum = getISOWeekNumber(rangeStart);
      const startD = rangeStart.getDate();
      const endD = rangeEnd.getDate();
      const monthStart = MOIS_FR[rangeStart.getMonth()].slice(0, 4);
      const monthEnd = MOIS_FR[rangeEnd.getMonth()].slice(0, 4);
      const monthStr =
        rangeStart.getMonth() === rangeEnd.getMonth()
          ? `${monthStart}. ${rangeEnd.getFullYear()}`
          : `${monthStart}. - ${monthEnd}. ${rangeEnd.getFullYear()}`;
      return `Semaine ${weekNum} • ${startD} au ${endD} ${monthStr}`;
    }
    return `${MOIS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  }, [viewMode, rangeStart, rangeEnd, currentDate]);

  const { chantiersList, rdvsByDay, livraisonsByDay, counts } = useMemo(() => {
    const msPerDay = 86400000;
    const rStartMs = rangeStart.getTime();
    const rEndDayMs = new Date(
      rangeEnd.getFullYear(),
      rangeEnd.getMonth(),
      rangeEnd.getDate()
    ).getTime();
    const rEndMs = rEndDayMs + msPerDay - 1;

    const chantiers: {
      item: UnifiedPlanningItem;
      startIdx: number;
      endIdx: number;
      continuesBefore: boolean;
      continuesAfter: boolean;
    }[] = [];

    const rdvsMap = new Map<number, UnifiedPlanningItem[]>();
    const livraisonsMap = new Map<number, UnifiedPlanningItem[]>();
    let cCount = 0;
    let rCount = 0;
    let lCount = 0;

    for (const it of items) {
      const dStart = parseYMD(it.dateDebut);
      if (!dStart) continue;
      const dEnd = it.dateFin ? parseYMD(it.dateFin) ?? dStart : dStart;
      const itemStartMs = dStart.getTime();
      const itemEndMs = dEnd.getTime();

      if (itemEndMs < rStartMs || itemStartMs > rEndMs) continue;

      if (it.type === "chantier") {
        cCount++;
        const clampedStartMs = Math.max(rStartMs, itemStartMs);
        const clampedEndMs = Math.min(rEndDayMs, itemEndMs);
        const startIdx = Math.max(
          0,
          Math.min(totalDays - 1, Math.round((clampedStartMs - rStartMs) / msPerDay))
        );
        const endIdx = Math.max(
          startIdx,
          Math.min(totalDays - 1, Math.round((clampedEndMs - rStartMs) / msPerDay))
        );
        chantiers.push({
          item: it,
          startIdx,
          endIdx,
          continuesBefore: itemStartMs < rStartMs,
          continuesAfter: itemEndMs > rEndDayMs,
        });
      } else if (it.type === "rdv") {
        rCount++;
        const dayIdx = Math.round((itemStartMs - rStartMs) / msPerDay);
        if (dayIdx >= 0 && dayIdx < totalDays) {
          const arr = rdvsMap.get(dayIdx) ?? [];
          arr.push(it);
          rdvsMap.set(dayIdx, arr);
        }
      } else {
        lCount++;
        const dayIdx = Math.round((itemStartMs - rStartMs) / msPerDay);
        if (dayIdx >= 0 && dayIdx < totalDays) {
          const arr = livraisonsMap.get(dayIdx) ?? [];
          arr.push(it);
          livraisonsMap.set(dayIdx, arr);
        }
      }
    }

    return {
      chantiersList: chantiers,
      rdvsByDay: rdvsMap,
      livraisonsByDay: livraisonsMap,
      counts: { chantiers: cCount, rdvs: rCount, livraisons: lCount },
    };
  }, [items, rangeStart, rangeEnd, totalDays]);

  const isMonth = viewMode === "mois";
  const dayMinWidth = isMonth ? 38 : 112;
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `116px repeat(${totalDays}, minmax(${dayMinWidth}px, 1fr))`,
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Barre de navigation temporelle */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#1B1511] p-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevious}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 bg-[#120F0D] text-white/75 hover:border-[#D96B27]/50 hover:text-white transition-colors cursor-pointer"
            aria-label="Période précédente"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={handleToday}
            className="h-9 px-3 rounded-xl border border-[#D96B27]/40 bg-[#D96B27]/15 text-xs font-semibold text-[#F59E0B] hover:bg-[#D96B27]/25 transition-colors cursor-pointer"
          >
            Aujourd&apos;hui
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-white/10 bg-[#120F0D] text-white/75 hover:border-[#D96B27]/50 hover:text-white transition-colors cursor-pointer"
            aria-label="Période suivante"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="ml-2 text-xs sm:text-sm font-bold text-white">
            {periodLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-[11px] text-white/60 mr-2">
            <span>{counts.chantiers} chantier(s)</span>
            <span>·</span>
            <span>{counts.rdvs} RDV</span>
            <span>·</span>
            <span>{counts.livraisons} livr.</span>
          </div>

          <div className="inline-flex rounded-xl border border-white/10 bg-[#120F0D] p-1">
            <button
              type="button"
              onClick={() => setViewMode("semaine")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === "semaine"
                  ? "bg-[#D96B27] text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Semaine
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mois")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === "mois"
                  ? "bg-[#D96B27] text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Mois
            </button>
          </div>
        </div>
      </div>

      {/* Grille Gantt / Timeline à défilement horizontal */}
      <div
        ref={containerRef}
        className="overflow-x-auto rounded-2xl border border-white/10 bg-[#1B1511]"
      >
        <div className="min-w-max">
          {/* En-tête des jours */}
          <div className="grid border-b border-white/10" style={gridStyle}>
            <div className="sticky left-0 z-20 bg-[#1B1511] border-r border-white/10 px-3 py-2.5 flex items-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                Couloirs
              </span>
            </div>

            {visibleDays.map((day, idx) => {
              const isToday = isSameDay(day, today);
              const dow = (day.getDay() + 6) % 7;
              const isWeekend = dow >= 5;
              return (
                <div
                  key={idx}
                  data-today={isToday ? "true" : undefined}
                  className={`border-r border-white/5 px-1.5 py-2 text-center ${
                    isToday
                      ? "bg-[#D96B27]/20 border-b-2 border-b-[#D96B27]"
                      : isWeekend
                      ? "bg-black/20"
                      : ""
                  }`}
                >
                  <p
                    className={`text-[10px] font-semibold uppercase ${
                      isToday ? "text-[#F59E0B]" : "text-white/45"
                    }`}
                  >
                    {isMonth ? JOURS_LETTRES[dow] : JOURS_COURTS[dow]}
                  </p>
                  <p
                    className={`mt-0.5 text-xs font-bold ${
                      isToday ? "text-white" : "text-white/80"
                    }`}
                  >
                    {day.getDate()}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Couloir 1 : Chantiers (Barres Gantt multi-jours) */}
          <div className="border-b border-white/10">
            <div className="grid" style={gridStyle}>
              <div className="sticky left-0 z-20 bg-[#1B1511] border-r border-white/10 px-3 py-3 flex items-start gap-2">
                <HardHat className="h-4 w-4 text-[#D96B27] shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-white">Chantiers</p>
                  <p className="text-[10px] text-white/45">{counts.chantiers} actif(s)</p>
                </div>
              </div>

              <div
                className="relative py-2.5 px-1 space-y-1.5"
                style={{
                  gridColumn: `2 / span ${totalDays}`,
                  display: "grid",
                  gridTemplateColumns: `repeat(${totalDays}, minmax(${dayMinWidth}px, 1fr))`,
                }}
              >
                {chantiersList.length === 0 ? (
                  <div
                    className="py-2 px-3 text-xs text-white/35 italic"
                    style={{ gridColumn: `1 / span ${totalDays}` }}
                  >
                    Aucun chantier planifié sur cette période
                  </div>
                ) : (
                  chantiersList.map(({ item, startIdx, endIdx, continuesBefore, continuesAfter }) => {
                    const span = Math.max(1, endIdx - startIdx + 1);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectItem(item)}
                        style={{
                          gridColumn: `${startIdx + 1} / span ${span}`,
                        }}
                        className={`group text-left px-2.5 py-1.5 rounded-xl border border-[#D96B27]/50 bg-gradient-to-r from-[#D96B27]/25 to-[#B85316]/15 hover:border-[#D96B27] transition-all cursor-pointer overflow-hidden ${
                          continuesBefore ? "rounded-l-none border-l-dashed" : ""
                        } ${continuesAfter ? "rounded-r-none border-r-dashed" : ""}`}
                        title={`${item.titre} (${item.dateDebut} → ${item.dateFin ?? item.dateDebut})`}
                      >
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="text-[11px] font-bold text-white truncate">
                            {continuesBefore ? "← " : ""}
                            {item.titre}
                            {continuesAfter ? " →" : ""}
                          </span>
                          {!isMonth && item.avancement !== undefined && (
                            <span className="shrink-0 text-[10px] font-bold text-[#F59E0B]">
                              {item.avancement}%
                            </span>
                          )}
                        </div>
                        {!isMonth && item.metier && (
                          <p className="text-[10px] text-white/60 truncate">
                            {item.metier}
                            {item.lieu ? ` · ${item.lieu}` : ""}
                          </p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Couloir 2 : Rendez-vous */}
          <div className="grid border-b border-white/10" style={gridStyle}>
            <div className="sticky left-0 z-20 bg-[#1B1511] border-r border-white/10 px-3 py-3 flex items-start gap-2">
              <CalendarCheck2 className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-white">Rendez-vous</p>
                <p className="text-[10px] text-white/45">{counts.rdvs} prévu(s)</p>
              </div>
            </div>

            {visibleDays.map((day, colIdx) => {
              const isToday = isSameDay(day, today);
              const rdvs = rdvsByDay.get(colIdx) ?? [];
              return (
                <div
                  key={colIdx}
                  className={`border-r border-white/5 p-1.5 flex flex-col gap-1.5 min-h-[64px] ${
                    isToday ? "bg-[#D96B27]/10" : ""
                  }`}
                >
                  {rdvs.map((r) => {
                    const cfg = NATURES_CONFIG[r.natureKey] ?? NATURES_CONFIG.autre;
                    if (isMonth) {
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => onSelectItem(r)}
                          className={`w-full h-7 rounded-lg border flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${cfg.barClass}`}
                          title={`${r.titre}${r.heure ? ` (${r.heure})` : ""}`}
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                      );
                    }
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelectItem(r)}
                        className={`w-full text-left p-2 rounded-xl border transition-all hover:brightness-110 cursor-pointer ${cfg.barClass}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold truncate">
                            {r.heure || "Journée"}
                          </span>
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: cfg.dotColor }}
                          />
                        </div>
                        <p className="mt-0.5 text-[11px] font-semibold text-white truncate">
                          {r.titre}
                        </p>
                        {r.chantierNom && (
                          <p className="text-[10px] opacity-75 truncate">{r.chantierNom}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Couloir 3 : Commandes & Livraisons */}
          <div className="grid" style={gridStyle}>
            <div className="sticky left-0 z-20 bg-[#1B1511] border-r border-white/10 px-3 py-3 flex items-start gap-2">
              <Package className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-white">Livraisons</p>
                <p className="text-[10px] text-white/45">{counts.livraisons} suivi(s)</p>
              </div>
            </div>

            {visibleDays.map((day, colIdx) => {
              const isToday = isSameDay(day, today);
              const livs = livraisonsByDay.get(colIdx) ?? [];
              return (
                <div
                  key={colIdx}
                  className={`border-r border-white/5 p-1.5 flex flex-col gap-1.5 min-h-[60px] ${
                    isToday ? "bg-[#D96B27]/10" : ""
                  }`}
                >
                  {livs.map((l) => {
                    if (isMonth) {
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => onSelectItem(l)}
                          className="w-full h-7 rounded-lg border border-purple-500/40 bg-purple-500/15 text-purple-200 hover:bg-purple-500/25 flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                          title={l.titre}
                        >
                          <Package className="h-3.5 w-3.5" />
                        </button>
                      );
                    }
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => onSelectItem(l)}
                        className="w-full text-left p-2 rounded-xl border border-purple-500/35 bg-purple-500/15 hover:bg-purple-500/25 text-purple-100 transition-all cursor-pointer"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-tight text-purple-300 truncate">
                          {l.statutLabel}
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-white truncate">
                          {l.fournisseurNom || l.titre}
                        </p>
                        {l.chantierNom && (
                          <p className="text-[10px] text-purple-200/75 truncate">
                            {l.chantierNom}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
