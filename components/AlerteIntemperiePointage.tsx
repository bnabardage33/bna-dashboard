"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type RapportArretJour = {
  id: string;
  numero: string;
  motif: string | null;
};

/**
 * Vérifie si le chantier sélectionné possède un rapport intempéries validé
 * (`jour_arrete = true`) à la date saisie (`YYYY-MM-DD`).
 */
export function useArretIntemperieJour(chantierId: string, date: string) {
  const [rapportArrete, setRapportArrete] = useState<RapportArretJour | null>(null);
  const [confirme, setConfirme] = useState(false);

  useEffect(() => {
    setConfirme(false);
    if (!chantierId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setRapportArrete(null);
      return;
    }

    let actif = true;
    async function verifier() {
      const { data, error } = await supabase
        .from("rapports_intemperies")
        .select("id, numero, motif")
        .eq("chantier_id", chantierId)
        .eq("jour_arrete", true)
        .gte("cree_le", `${date}T00:00:00`)
        .lte("cree_le", `${date}T23:59:59.999`)
        .order("cree_le", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!actif) return;
      if (error) {
        console.error("[AlerteIntemperiePointage] Erreur vérification :", error);
        setRapportArrete(null);
        return;
      }
      setRapportArrete(data ? (data as RapportArretJour) : null);
    }

    void verifier();
    return () => {
      actif = false;
    };
  }, [chantierId, date]);

  return { rapportArrete, confirme, setConfirme };
}

export function AlerteIntemperiePointage({
  rapport,
  confirme,
  onConfirmerChange,
}: {
  rapport: RapportArretJour | null;
  confirme: boolean;
  onConfirmerChange: (val: boolean) => void;
}) {
  if (!rapport) return null;

  return (
    <div className="rounded-xl border border-[#D96B27]/60 bg-[#1B1511] p-4 text-sm text-amber-100 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D96B27]/40 bg-[#D96B27]/20 text-[#D96B27]">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-[#F59E0B]">
            Arrêt intempéries validé ({rapport.numero}) sur ce chantier à cette date — vérifiez avant de pointer des heures productives.
          </p>
          {rapport.motif && (
            <p className="text-xs text-gray-300">{rapport.motif}</p>
          )}
          <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs font-medium text-amber-100">
            <input
              type="checkbox"
              checked={confirme}
              onChange={(e) => onConfirmerChange(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-[#120F0D] accent-[#D96B27]"
            />
            <span>
              Je confirme la saisie d&apos;heures malgré l&apos;arrêt validé (intervention d&apos;urgence, bâchage ou heures d&apos;intempéries).
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
