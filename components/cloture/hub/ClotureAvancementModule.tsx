"use client";

import React, { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/supabase";

const PHASES_CLOTURE = [
  {
    cle: "implantation",
    titre: "1. Implantation, traçage & fouilles",
    description: "Piquetage des angles, vérification des limites et réalisation des plots béton.",
  },
  {
    cle: "poteaux_scellement",
    titre: "2. Pose des poteaux & plaques de soubassement",
    description: "Réglage d'aplomb, scellement béton ou fixation sur muret, gestion des redans.",
  },
  {
    cle: "lames_panneaux",
    titre: "3. Remplissage lames / panneaux",
    description: "Empilage des lames avec jeu de dilatation thermique de 10 mm et découpes.",
  },
  {
    cle: "portillon_finitions",
    titre: "4. Portillon, chapeaux & finitions",
    description: "Pose du portillon, réglage gâche/serrure, pose des chapeaux de poteaux et nettoyage.",
  },
];

export default function ClotureAvancementModule({
  chantierId,
  checklistInitiale,
  onAvancementChange,
}: {
  chantierId: string;
  checklistInitiale: Record<string, unknown> | null;
  onAvancementChange?: (pct: number, phase: string) => void;
}) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    const base: Record<string, boolean> = {};
    for (const p of PHASES_CLOTURE) {
      base[p.cle] = Boolean(checklistInitiale?.[p.cle]);
    }
    return base;
  });
  const [saving, setSaving] = useState(false);

  const nbFaites = PHASES_CLOTURE.filter((p) => checklist[p.cle]).length;
  const pct = Math.round((nbFaites / PHASES_CLOTURE.length) * 100);

  async function togglePhase(cle: string) {
    const next = { ...checklist, [cle]: !checklist[cle] };
    setChecklist(next);
    setSaving(true);
    try {
      await supabase
        .from("chantiers")
        .update({ checklist: next as unknown as Json })
        .eq("id", chantierId);

      const faites = PHASES_CLOTURE.filter((p) => next[p.cle]).length;
      const nextPct = Math.round((faites / PHASES_CLOTURE.length) * 100);
      const prochaine = PHASES_CLOTURE.find((p) => !next[p.cle])?.titre ?? "Terminé";
      onAvancementChange?.(nextPct, prochaine);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-6 shadow-xs space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#23272B]">
            Avancement d&apos;exécution Clôture
          </h3>
          <p className="text-xs text-[#777777]">
            Cochez chaque étape validée sur le terrain {saving ? "· Enregistrement..." : ""}
          </p>
        </div>
        <span className="rounded-xl bg-[#B85B2B]/10 px-3 py-1.5 text-xs font-extrabold text-[#B85B2B]">
          {pct} % ({nbFaites}/{PHASES_CLOTURE.length})
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
        <div
          className="h-full rounded-full bg-[#B85B2B] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-3">
        {PHASES_CLOTURE.map((phase) => {
          const coche = checklist[phase.cle];
          return (
            <button
              key={phase.cle}
              type="button"
              onClick={() => togglePhase(phase.cle)}
              className={`w-full text-left flex items-start gap-3 rounded-2xl border p-4 transition-all ${
                coche
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-[#E5E5E5] bg-[#F8F9FA] hover:border-[#B85B2B]/40"
              }`}
            >
              {coche ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-5 w-5 text-[#999999] shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-sm font-bold text-[#23272B]">{phase.titre}</p>
                <p className="text-xs text-[#666666] mt-0.5">{phase.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
