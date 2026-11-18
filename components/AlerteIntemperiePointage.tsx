"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type TypeHeurePointage =
  | "productive"
  | "intemperie"
  | "recuperation_intemperie"
  | "supplementaire";

export type RapportArretJour = {
  id: string;
  numero: string;
  motif: string | null;
  arret_decide_sur_place: boolean;
};

export function calculerIndemnitesPointage(
  base: { panier: number; transport: number; trajet: number },
  rapport: RapportArretJour | null
): { panier: number; transport: number; trajet: number; regle: string | null } {
  if (!rapport) {
    return {
      panier: base.panier,
      transport: base.transport,
      trajet: base.trajet,
      regle: null,
    };
  }
  if (!rapport.arret_decide_sur_place) {
    return {
      panier: 0,
      transport: 0,
      trajet: 0,
      regle: "Arrêt prévenu avant déplacement : panier, transport et trajet mis à 0 €.",
    };
  }
  return {
    panier: 0,
    transport: base.transport,
    trajet: Math.round(base.trajet * 0.5 * 100) / 100,
    regle: "Équipe déplacée sur place : panier à 0 €, transport conservé à 100 %, trajet réduit à 50 % (aller).",
  };
}

/**
 * Déduit les heures récupérées (`recuperation_intemperie`, plafonnées à 1h/jour
 * sans majoration +25 %) du compteur `chantiers.heures_a_rattraper`.
 */
export async function deduireHeuresARattraper(
  chantierId: string,
  heuresRecuperees: number
): Promise<number | null> {
  if (!chantierId || heuresRecuperees <= 0) return null;
  const { data: ch, error: errRead } = await supabase
    .from("chantiers")
    .select("heures_a_rattraper")
    .eq("id", chantierId)
    .maybeSingle();

  if (errRead || !ch) {
    console.error("[deduireHeuresARattraper] Erreur lecture chantier :", errRead);
    return null;
  }

  const actuel = Number(ch.heures_a_rattraper ?? 0);
  const nouveau = Math.max(0, Math.round((actuel - heuresRecuperees) * 100) / 100);
  const { error: errUpdate } = await supabase
    .from("chantiers")
    .update({ heures_a_rattraper: nouveau })
    .eq("id", chantierId);

  if (errUpdate) {
    console.error("[deduireHeuresARattraper] Erreur mise à jour :", errUpdate);
    return null;
  }
  return nouveau;
}

/**
 * Vérifie si le chantier sélectionné possède un rapport intempéries validé
 * (`jour_arrete = true`) à la date saisie (`YYYY-MM-DD`).
 */
export function useArretIntemperieJour(chantierId: string, date: string) {
  const [rapportArrete, setRapportArrete] = useState<RapportArretJour | null>(null);

  useEffect(() => {
    if (!chantierId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setRapportArrete(null);
      return;
    }

    let actif = true;
    async function verifier() {
      const { data, error } = await supabase
        .from("rapports_intemperies")
        .select("id, numero, motif, arret_decide_sur_place")
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
      setRapportArrete(
        data
          ? {
              id: data.id,
              numero: data.numero,
              motif: data.motif,
              arret_decide_sur_place: Boolean(data.arret_decide_sur_place),
            }
          : null
      );
    }

    void verifier();
    return () => {
      actif = false;
    };
  }, [chantierId, date]);

  return { rapportArrete };
}

export function AlerteIntemperiePointage({
  rapport,
  bloqueProductive,
  onBasculerIntemperie,
  regleIndemnite,
}: {
  rapport: RapportArretJour | null;
  bloqueProductive: boolean;
  onBasculerIntemperie: () => void;
  regleIndemnite?: string | null;
}) {
  if (!rapport) return null;

  return (
    <div className="rounded-xl border border-[#D96B27]/70 bg-[#1B1511] p-4 text-sm text-amber-100 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#D96B27]/40 bg-[#D96B27]/20 text-[#D96B27]">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-2">
          <p className="font-semibold text-[#F59E0B]">
            Arrêt intempéries validé ({rapport.numero}) sur ce chantier à cette date
            {bloqueProductive
              ? " — saisie d'heures productives bloquée."
              : " — mode Intempérie actif."}
          </p>
          {rapport.motif && (
            <p className="text-xs text-gray-300">{rapport.motif}</p>
          )}
          {regleIndemnite && (
            <p className="rounded-lg border border-white/10 bg-[#120F0D] px-2.5 py-1.5 text-xs text-amber-200/90">
              {regleIndemnite}
            </p>
          )}
          {bloqueProductive && (
            <button
              type="button"
              onClick={onBasculerIntemperie}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D96B27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#E07A38] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Basculer les heures en &laquo; Intempérie &raquo;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
