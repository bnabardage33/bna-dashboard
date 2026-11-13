"use client";

import React from "react";
import {
  ChantiersCalepinageView,
  PointageEquipeView,
  TableauDeBordRentabiliteView,
} from "@/components/TempsHeuresViews";
import { Clock, TrendingUp, Users } from "lucide-react";

export interface BardageHeuresModuleProps {
  chantierId: string;
  chantierNom: string;
  surfaceM2: number;
  coupesMl: number;
  singularitesNb: number;
}

export default function BardageHeuresModule({
  chantierId,
  chantierNom,
  surfaceM2,
  coupesMl,
  singularitesNb,
}: BardageHeuresModuleProps) {
  return (
    <div className="space-y-6">
      {/* 1. Calepinage des Temps & Cadences */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center gap-2 border-b border-[#F0F0F0] pb-3">
          <Clock className="h-5 w-5 text-[#B85B2B]" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
              Temps Budget & Planification de Pose
            </h3>
            <p className="text-3xs text-[#777777]">
              Estimation du temps nécessaire calculée depuis les surfaces, coupes et singularités du calepinage.
            </p>
          </div>
        </div>

        <ChantiersCalepinageView
          initialSurface={surfaceM2 || 0}
          initialCoupes={coupesMl || 0}
          initialSingularites={singularitesNb || 0}
        />
      </div>

      {/* 2. Pointages de l'Équipe */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center gap-2 border-b border-[#F0F0F0] pb-3">
          <Users className="h-5 w-5 text-[#B85B2B]" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
              Pointages d&apos;Équipe & Saisie des Heures
            </h3>
            <p className="text-3xs text-[#777777]">
              Saisie et validation des heures d&apos;intervention par poseur et par date.
            </p>
          </div>
        </div>

        <PointageEquipeView
          chantierId={chantierId}
          chantierNom={chantierNom}
        />
      </div>

      {/* 3. Bilan de Rentabilité */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center gap-2 border-b border-[#F0F0F0] pb-3">
          <TrendingUp className="h-5 w-5 text-[#B85B2B]" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
              Tableau de Bord de Rentabilité
            </h3>
            <p className="text-3xs text-[#777777]">
              Comparaison entre heures budgétées et heures réelles consommées.
            </p>
          </div>
        </div>

        <TableauDeBordRentabiliteView
          chantierId={chantierId}
          chantierNom={chantierNom}
        />
      </div>
    </div>
  );
}
