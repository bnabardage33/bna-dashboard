"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { AlertTriangle, MapPin, Building } from "lucide-react";
import Link from "next/link";

export type GanttChantier = {
  id: string;
  nom: string | null;
  client_nom: string | null;
  client_societe: string | null;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
};

type PlanningGanttProps = {
  chantiers: GanttChantier[];
  onUpdateDates: (id: string, newDebut: string, newFin: string) => void;
};

const DAY_WIDTH_PX = 20;
const DAYS_TOTAL = 180;

export default function PlanningGantt({ chantiers, onUpdateDates }: PlanningGanttProps) {
  const [localChantiers, setLocalChantiers] = useState<GanttChantier[]>(chantiers);
  const [intemperies, setIntemperies] = useState<Record<string, boolean>>({});
  const [avancements, setAvancements] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronise state with props
  useEffect(() => {
    setLocalChantiers(chantiers);
  }, [chantiers]);

  useEffect(() => {
    async function fetchData() {
      // Intempéries
      const { data: intData } = await supabase
        .from("rapports_intemperies")
        .select("chantier_id, jour_arrete")
        .eq("jour_arrete", true);
      if (intData) {
        const map: Record<string, boolean> = {};
        for (const r of intData) {
          map[r.chantier_id] = true;
        }
        setIntemperies(map);
      }
      
      // Avancements
      const { data: avData } = await supabase
        .from("avancements_chantier")
        .select("chantier_id, pourcentage, date")
        .order("date", { ascending: false });
      if (avData) {
        const avMap: Record<string, number> = {};
        for (const av of avData) {
          if (av.chantier_id && avMap[av.chantier_id] === undefined && typeof av.pourcentage === 'number') {
            avMap[av.chantier_id] = av.pourcentage;
          }
        }
        setAvancements(avMap);
      }
    }
    fetchData();
  }, []);

  const timelineStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 15);
    return d;
  }, []);

  const todayIndex = 15;

  const months = useMemo(() => {
    const res: { label: string; days: number }[] = [];
    let curDate = new Date(timelineStart);
    for (let i = 0; i < DAYS_TOTAL; i++) {
      const month = curDate.toLocaleString("fr-FR", { month: "long", year: "numeric" });
      const lastObj = res[res.length - 1];
      if (lastObj && lastObj.label === month) {
        lastObj.days++;
      } else {
        res.push({ label: month, days: 1 });
      }
      curDate.setDate(curDate.getDate() + 1);
    }
    return res;
  }, [timelineStart]);

  const handlePointerDown = (
    e: React.PointerEvent,
    id: string,
    currentStart: string | null,
    currentEnd: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // Do nothing if no dates initially (user must set them in form first)
    if (!currentStart || !currentEnd) return;

    const startX = e.clientX;
    const initialStart = new Date(currentStart).getTime();
    const initialEnd = new Date(currentEnd).getTime();
    
    // We calculate how many ms per pixel
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const MS_PER_PX = MS_PER_DAY / DAY_WIDTH_PX;

    const handlePointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const msDelta = dx * MS_PER_PX;

      const newStartDate = new Date(initialStart + msDelta);
      const newEndDate = new Date(initialEnd + msDelta);

      setLocalChantiers((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                date_debut: newStartDate.toISOString(),
                date_fin: newEndDate.toISOString(),
              }
            : c
        )
      );
    };

    const handlePointerUp = (upEv: PointerEvent) => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);

      const dx = upEv.clientX - startX;
      const msDelta = dx * MS_PER_PX;
      
      const newStartDate = new Date(initialStart + msDelta);
      const newEndDate = new Date(initialEnd + msDelta);

      const debutStr = newStartDate.toISOString().split("T")[0];
      const finStr = newEndDate.toISOString().split("T")[0];
      onUpdateDates(id, debutStr, finStr);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  return (
    <div className="bg-[#1A1D24] border border-white/10 rounded-2xl p-4 overflow-hidden shadow-lg mt-4 flex flex-col relative">
      <div 
        ref={containerRef}
        className="overflow-x-auto select-none touch-pan-x"
        style={{ cursor: "grab" }}
      >
        <div style={{ width: DAYS_TOTAL * DAY_WIDTH_PX, position: "relative" }}>
          
          {/* Ligne des Mois */}
          <div className="flex border-b border-white/10 h-10 mb-2">
            {months.map((m, i) => (
              <div
                key={i}
                className="text-xs font-bold text-gray-400 capitalize flex items-center justify-center border-r border-white/5"
                style={{ width: m.days * DAY_WIDTH_PX }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Grille de fond (semaines/jours) */}
          <div className="absolute top-10 bottom-0 left-0 right-0 pointer-events-none flex">
            {Array.from({ length: DAYS_TOTAL }).map((_, i) => (
              <div
                key={i}
                className={`h-full border-r ${i % 7 === 0 ? "border-white/10" : "border-white/5"} shrink-0`}
                style={{ width: DAY_WIDTH_PX }}
              />
            ))}
          </div>

          {/* Ligne rouge "Aujourd'hui" */}
          <div
            className="absolute top-10 bottom-0 z-0 border-l-2 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
            style={{ left: todayIndex * DAY_WIDTH_PX, width: 2 }}
          />
          <div 
            className="absolute top-[28px] bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md z-10"
            style={{ left: (todayIndex * DAY_WIDTH_PX) - 30 }}
          >
            Aujourd'hui
          </div>

          {/* Lignes des chantiers */}
          <div className="relative pt-6 pb-12 z-10 space-y-3">
            {localChantiers.map((ch) => {
              const startTimestamp = ch.date_debut ? new Date(ch.date_debut).getTime() : 0;
              const endTimestamp = ch.date_fin ? new Date(ch.date_fin).getTime() : 0;
              const timeBase = timelineStart.getTime();

              const MS_PER_DAY = 1000 * 60 * 60 * 24;
              const hasDates = startTimestamp > 0 && endTimestamp > 0 && endTimestamp >= startTimestamp;

              let left = 0;
              let width = 0;

              if (hasDates) {
                left = ((startTimestamp - timeBase) / MS_PER_DAY) * DAY_WIDTH_PX;
                width = ((endTimestamp - startTimestamp) / MS_PER_DAY) * DAY_WIDTH_PX;
                width = Math.max(width, DAY_WIDTH_PX); // Minimum 1 day width
              }

              const nomClient = ch.client_societe || ch.client_nom || "Client Inconnu";
              let bgColor = "bg-gray-600";
              let borderColor = "border-gray-500";

              if (ch.statut === "en_cours") {
                bgColor = "bg-orange-600";
                borderColor = "border-orange-500";
              } else if (ch.statut === "termine") {
                bgColor = "bg-green-600";
                borderColor = "border-green-500";
              }

              const hasAlert = intemperies[ch.id];

              return (
                <div key={ch.id} className="relative h-12 flex items-center group">
                  {/* Titre du chantier fixé à gauche (sticky) si on veut, 
                      mais dans un canvas scrollable, le label sur la barre c'est mieux */}
                  
                  {hasDates ? (
                    <div
                      onPointerDown={(e) => handlePointerDown(e, ch.id, ch.date_debut, ch.date_fin)}
                      className={`absolute h-9 rounded-lg border-2 ${bgColor} ${borderColor} shadow-lg flex items-center px-2 cursor-grab active:cursor-grabbing hover:brightness-110 transition-all z-20 overflow-hidden ${hasAlert ? 'ring-2 ring-red-500' : ''}`}
                      style={{ left, width }}
                    >
                      {/* Jauge d'avancement (Calque sombre sous le texte) */}
                      {avancements[ch.id] !== undefined && (
                        <div 
                          className="absolute top-0 bottom-0 left-0 bg-black/30 pointer-events-none"
                          style={{ width: `${avancements[ch.id]}%` }}
                        />
                      )}
                      
                      <div className="relative z-10 whitespace-nowrap text-white text-xs font-bold truncate select-none pointer-events-none flex-1 flex items-center gap-2">
                        <span>{ch.nom || nomClient}</span>
                        {avancements[ch.id] !== undefined && width > 100 && (
                          <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded-md font-medium">
                            {avancements[ch.id]}%
                          </span>
                        )}
                      </div>
                      
                      {hasAlert && (
                        <AlertTriangle className="relative z-10 w-3 h-3 text-white ml-auto shrink-0 pointer-events-none drop-shadow" />
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500 italic pl-4">
                      {ch.nom || nomClient} (Dates non définies)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
