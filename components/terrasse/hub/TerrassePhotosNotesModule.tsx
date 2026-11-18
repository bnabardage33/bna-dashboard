"use client";

import React from "react";
import PhotosNotes from "@/components/PhotosNotes";
import { Camera, Tag, FileText } from "lucide-react";

interface TerrassePhotosNotesModuleProps {
  chantierId: string;
}

const TAGS_TERRASSE = [
  { tag: "#Support", label: "Préparation du terrain / géotextile" },
  { tag: "#Structure", label: "Plots autonivelants & lambourdes" },
  { tag: "#Platelage", label: "Lames & fixations en cours" },
  { tag: "#Finitions", label: "Rives, plinthes & marches" },
  { tag: "#SAV", label: "Point de contrôle / détail technique" },
];

export default function TerrassePhotosNotesModule({
  chantierId,
}: TerrassePhotosNotesModuleProps) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Bandeau d'aide aux tags de classement terrasse */}
      <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3 mb-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27]">
            <Camera className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold text-[#F5EFEA]">
              Photothèque & Journal du Chantier Terrasse
            </h3>
            <p className="text-xs text-[#8E7F74]">
              Preuves visuelles d&apos;avancement et consignes horodatées
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
          <span className="text-xs font-bold text-[#8E7F74] flex items-center gap-1 mr-1">
            <Tag className="h-3.5 w-3.5 text-[#D96B27]" /> Tags recommandés :
          </span>
          {TAGS_TERRASSE.map((t) => (
            <span
              key={t.tag}
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#120F0D] px-2.5 py-1 text-xs font-semibold text-[#F5EFEA]"
            >
              <strong className="text-[#D96B27]">{t.tag}</strong> {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Composant PhotosNotes existant connecté au chantier terrasse */}
      <PhotosNotes chantierId={chantierId} />
    </div>
  );
}
