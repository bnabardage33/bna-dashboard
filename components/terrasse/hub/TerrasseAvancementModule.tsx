"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Clock,
  Layers3,
  Calendar,
  AlertCircle,
  Save,
  Check,
  Compass,
  Hammer,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface PhaseDTU {
  id: string;
  nom: string;
  normeDTU: string;
  description: string;
  statut: "a_faire" | "en_cours" | "termine";
  dateValidation: string | null;
  remarques: string;
}

interface TerrasseAvancementModuleProps {
  chantierId: string;
  checklistActuelle?: Record<string, unknown> | null;
  onAvancementMisAJour?: (pct: number, phaseEnCours: string) => void;
}

const PHASES_DEFAUT: PhaseDTU[] = [
  {
    id: "support",
    nom: "1. Préparation du terrain & support",
    normeDTU: "DTU 51.4 Art. 5.1",
    description: "Décaissement, décapage de la terre végétale, pose du géotextile anti-repousse ou contrôle de la dalle béton.",
    statut: "a_faire",
    dateValidation: null,
    remarques: "",
  },
  {
    id: "implantation",
    nom: "2. Implantation & nivellement",
    normeDTU: "DTU 51.4 Art. 5.2",
    description: "Piquetage, équerrage géométrique (règle 3-4-5), report des hauteurs au laser et vérification de la pente d'écoulement ≥ 1.5%.",
    statut: "a_faire",
    dateValidation: null,
    remarques: "",
  },
  {
    id: "plots",
    nom: "3. Fondations & calage des plots",
    normeDTU: "DTU 51.4 Art. 6.1",
    description: "Disposition des plots réglables, entraxes entre plots ≤ 60-70 cm, calage sur sol stable et fixation des têtes.",
    statut: "a_faire",
    dateValidation: null,
    remarques: "",
  },
  {
    id: "lambourdage",
    nom: "4. Structure porteuse & lambourdage",
    normeDTU: "DTU 51.4 Art. 6.2 & 6.3",
    description: "Solivage avec entraxes lambourdes ≤ 40-50 cm, bandes d'étanchéité EPDM, cales d'isolation et double lambourde obligatoire sur aboutage.",
    statut: "a_faire",
    dateValidation: null,
    remarques: "",
  },
  {
    id: "platelage",
    nom: "5. Pose du platelage & fixations",
    normeDTU: "DTU 51.4 Art. 7.1",
    description: "Alignement des lames, respect des jeux de dilatation (4 à 7 mm), fixations vis inox A2/A4 ou clips spécifiques.",
    statut: "a_faire",
    dateValidation: null,
    remarques: "",
  },
  {
    id: "finitions",
    nom: "6. Finitions, rives & réception",
    normeDTU: "DTU 51.4 Art. 8",
    description: "Profilés de chant, cornières de rive, marches/escaliers, garde-corps de sécurité et procès-verbal de réception client.",
    statut: "a_faire",
    dateValidation: null,
    remarques: "",
  },
];

export default function TerrasseAvancementModule({
  chantierId,
  checklistActuelle,
  onAvancementMisAJour,
}: TerrasseAvancementModuleProps) {
  const [phases, setPhases] = useState<PhaseDTU[]>(PHASES_DEFAUT);
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);
  const [messageSucces, setMessageSucces] = useState(false);

  // Charger les phases sauvegardées depuis checklist.phases_dtu
  useEffect(() => {
    if (checklistActuelle && typeof checklistActuelle === "object") {
      const dtu = (checklistActuelle as { phases_dtu?: Record<string, Partial<PhaseDTU>> })
        ?.phases_dtu;
      if (dtu && typeof dtu === "object") {
        setPhases((prev) =>
          prev.map((p) => {
            const data = dtu[p.id];
            if (!data) return p;
            return {
              ...p,
              statut: (data.statut as PhaseDTU["statut"]) || p.statut,
              dateValidation: data.dateValidation || p.dateValidation,
              remarques: data.remarques || p.remarques,
            };
          })
        );
      }
    }
  }, [checklistActuelle]);

  // Calcul du % d'avancement
  const nbTermine = phases.filter((p) => p.statut === "termine").length;
  const nbEnCours = phases.filter((p) => p.statut === "en_cours").length;
  const pourcentage = Math.round(((nbTermine + nbEnCours * 0.5) / phases.length) * 100);

  // Phase en cours
  const phaseActive =
    phases.find((p) => p.statut === "en_cours")?.nom.replace(/^\d+\.\s*/, "") ||
    phases.find((p) => p.statut === "a_faire")?.nom.replace(/^\d+\.\s*/, "") ||
    "Chantier achevé";

  async function handleModifierStatut(
    phaseId: string,
    nouveauStatut: PhaseDTU["statut"]
  ) {
    const majPhases = phases.map((p) => {
      if (p.id !== phaseId) return p;
      return {
        ...p,
        statut: nouveauStatut,
        dateValidation:
          nouveauStatut === "termine"
            ? new Date().toISOString().split("T")[0]
            : p.dateValidation,
      };
    });
    setPhases(majPhases);

    // Calculer nouveau %
    const t = majPhases.filter((p) => p.statut === "termine").length;
    const c = majPhases.filter((p) => p.statut === "en_cours").length;
    const pct = Math.round(((t + c * 0.5) / majPhases.length) * 100);
    onAvancementMisAJour?.(pct, phaseActive);

    // Persistance automatique
    await persisterPhases(majPhases);
  }

  async function handleModifierRemarques(phaseId: string, remarques: string) {
    setPhases((prev) =>
      prev.map((p) => (p.id === phaseId ? { ...p, remarques } : p))
    );
  }

  async function persisterPhases(phasesAEnregistrer = phases) {
    setSauvegardeEnCours(true);
    setMessageSucces(false);

    const phasesDtuMap: Record<string, unknown> = {};
    for (const p of phasesAEnregistrer) {
      phasesDtuMap[p.id] = {
        statut: p.statut,
        dateValidation: p.dateValidation,
        remarques: p.remarques,
      };
    }

    const payloadChecklist = {
      ...(checklistActuelle || {}),
      metier: "terrasse",
      phases_dtu: phasesDtuMap,
    };

    const { error } = await supabase
      .from("chantiers")
      .update({ checklist: payloadChecklist as unknown as import("@/types/supabase").Json })
      .eq("id", chantierId);

    setSauvegardeEnCours(false);
    if (!error) {
      setMessageSucces(true);
      setTimeout(() => setMessageSucces(false), 2500);
    } else {
      console.error("Erreur sauvegarde avancement DTU:", error);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Carte Synthèse & Jauge Globale */}
      <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[2px] text-[#B85B2B]">
                Suivi Normatif de Pose
              </p>
              <h3 className="text-xl font-bold text-[#23272B]">
                Avancement DTU 51.4 (6 Phases Clés)
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-semibold text-[#777777]">Progression globale</p>
              <p className="text-2xl font-bold tracking-tight text-[#B85B2B]">{pourcentage}%</p>
            </div>
            {messageSucces && (
              <span className="flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                <Check className="h-4 w-4" /> Sauvegardé
              </span>
            )}
          </div>
        </div>

        {/* Barre de progression cuivrée */}
        <div className="mt-5">
          <div className="h-3 w-full overflow-hidden rounded-full bg-[#EFEFEF]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#B85B2B] to-[#D97732] transition-all duration-500"
              style={{ width: `${pourcentage}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs font-semibold text-[#777777]">
            <span>{nbTermine} sur 6 phases achevées</span>
            <span>Phase active : <strong className="text-[#23272B]">{phaseActive}</strong></span>
          </div>
        </div>
      </section>

      {/* 2. Liste détaillée des 6 phases normatives */}
      <div className="space-y-4">
        {phases.map((phase, index) => {
          const estTermine = phase.statut === "termine";
          const estEnCours = phase.statut === "en_cours";

          return (
            <article
              key={phase.id}
              className={`rounded-2xl border p-5 transition-all shadow-xs ${
                estTermine
                  ? "border-emerald-200 bg-emerald-50/30"
                  : estEnCours
                  ? "border-[#B85B2B]/40 bg-white shadow-sm ring-1 ring-[#B85B2B]/20"
                  : "border-[#E5E5E5] bg-white"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                {/* Libellé & description */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-bold text-[#23272B]">{phase.nom}</h4>
                    <span className="rounded-md border border-[#E5E5E5] bg-[#F8F9FA] px-2 py-0.5 text-[10px] font-bold text-[#777777]">
                      {phase.normeDTU}
                    </span>
                    {phase.dateValidation && (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        Validé le {new Date(phase.dateValidation).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#777777]">
                    {phase.description}
                  </p>

                  {/* Remarques / Observations */}
                  <div className="mt-3">
                    <input
                      type="text"
                      value={phase.remarques}
                      onChange={(e) => handleModifierRemarques(phase.id, e.target.value)}
                      onBlur={() => persisterPhases()}
                      placeholder="Remarques éventuelles sur cette phase (ex: dénivelé compensé de 4 cm)..."
                      className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] focus:bg-white px-3 py-1.5 text-xs text-[#23272B] placeholder:text-[#999999] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 transition-all"
                    />
                  </div>
                </div>

                {/* Sélecteur de statut à 3 boutons */}
                <div className="flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F7F7F6] p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleModifierStatut(phase.id, "a_faire")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                      phase.statut === "a_faire"
                        ? "bg-white text-gray-800 shadow-sm"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    À faire
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModifierStatut(phase.id, "en_cours")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                      phase.statut === "en_cours"
                        ? "bg-[#B85B2B] text-white shadow-sm"
                        : "text-gray-500 hover:text-[#B85B2B]"
                    }`}
                  >
                    En cours
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModifierStatut(phase.id, "termine")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                      phase.statut === "termine"
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-gray-500 hover:text-emerald-700"
                    }`}
                  >
                    Terminé ✓
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => persisterPhases()}
          disabled={sauvegardeEnCours}
          className="inline-flex items-center gap-2 rounded-xl bg-[#23272B] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#B85B2B] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {sauvegardeEnCours ? "Enregistrement..." : "Sauvegarder l'avancement"}
        </button>
      </div>
    </div>
  );
}
