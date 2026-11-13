"use client";

import React from "react";
import PhotosNotes from "@/components/PhotosNotes";
import { Camera } from "lucide-react";

export interface BardagePhotosNotesModuleProps {
  chantierId: string;
}

export default function BardagePhotosNotesModule({
  chantierId,
}: BardagePhotosNotesModuleProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center gap-2 border-b border-[#F0F0F0] pb-3">
          <Camera className="h-5 w-5 text-[#B85B2B]" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
              Journal Photographique & Notes de Chantier
            </h3>
            <p className="text-3xs text-[#777777]">
              Prises de vues terrain étiquetées (avant, pendant, après travaux) et consignes d&apos;intervention.
            </p>
          </div>
        </div>

        <PhotosNotes chantierId={chantierId} />
      </div>
    </div>
  );
}
