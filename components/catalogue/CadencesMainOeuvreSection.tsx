"use client";

import React, { useEffect, useState } from "react";
import { Clock, Save, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  CADENCES_DEFAUT,
  fusionnerCadencesDepuisCatalogueTemps,
  type CadencesTempsPose,
} from "@/lib/tempsPoseCalcul";

type CleCadence = keyof CadencesTempsPose;

interface ChampCadence {
  cle: CleCadence;
  label: string;
  unite: string;
  step: string;
}

const CHAMPS_TAUX_HORAIRES: ChampCadence[] = [
  { cle: "taux_horaire_vente_ht", label: "Taux horaire vente", unite: "€ HT/h", step: "0.5" },
  { cle: "taux_horaire_charge_ht", label: "Coût horaire chargé", unite: "€ HT/h", step: "0.5" },
];

const CHAMPS_BARDAGE: ChampCadence[] = [
  { cle: "bardage_ite_h_m2", label: "Isolation ITE (si actif)", unite: "h/m²", step: "0.05" },
  { cle: "bardage_ossature_h_m2", label: "Ossature (équerres + chevrons + EPDM)", unite: "h/m²", step: "0.05" },
  { cle: "bardage_parement_clin_h_m2", label: "Parement clin bois / composite", unite: "h/m²", step: "0.05" },
  { cle: "bardage_parement_claire_voie_h_m2", label: "Parement claire-voie", unite: "h/m²", step: "0.05" },
  { cle: "bardage_parement_hpl_h_m2", label: "Parement HPL / cassette (perçage)", unite: "h/m²", step: "0.05" },
  { cle: "bardage_pignon_majoration_pct", label: "Majoration surface pignons", unite: "%", step: "1" },
  { cle: "bardage_ouverture_h_u", label: "Habillage ouverture (bavette/tableaux/linteau)", unite: "h/u", step: "0.1" },
  { cle: "bardage_corniere_h_ml", label: "Cornières d'angle / départ", unite: "h/ml", step: "0.05" },
];

const CHAMPS_TERRASSE: ChampCadence[] = [
  { cle: "terrasse_prep_geotextile_h_m2", label: "Préparation sol / géotextile", unite: "h/m²", step: "0.05" },
  { cle: "terrasse_structure_h_m2", label: "Structure (plots + lambourdes + aboutages)", unite: "h/m²", step: "0.05" },
  { cle: "terrasse_platelage_h_m2", label: "Platelage (lames + vis/clips)", unite: "h/m²", step: "0.05" },
  { cle: "terrasse_escalier_h_u", label: "Escalier d'accès", unite: "h/u", step: "0.5" },
  { cle: "terrasse_garde_corps_h_ml", label: "Garde-corps périphérique", unite: "h/ml", step: "0.05" },
  { cle: "terrasse_mobile_rails_chassis_h", label: "Terrasse mobile (rails inox + châssis)", unite: "h", step: "0.5" },
  { cle: "terrasse_mobile_motorisation_h", label: "Supplément motorisation (solaire/filaire)", unite: "h", step: "0.5" },
];

const CHAMPS_CLOTURE: ChampCadence[] = [
  { cle: "cloture_implantation_scellement_h_poteau", label: "Implantation & scellement béton", unite: "h/poteau", step: "0.05" },
  { cle: "cloture_pose_poteau_soubassement_h_u", label: "Pose poteau & plaque soubassement", unite: "h/u", step: "0.05" },
  { cle: "cloture_pose_lame_panneau_h_ml", label: "Pose lames / panneaux", unite: "h/ml", step: "0.05" },
  { cle: "cloture_portillon_finitions_h_u", label: "Pose portillon & finitions", unite: "h/u", step: "0.25" },
];

export interface CadencesMainOeuvreSectionProps {
  metier: "bardage" | "terrasse" | "cloture";
}

export default function CadencesMainOeuvreSection({ metier }: CadencesMainOeuvreSectionProps) {
  const [ouvert, setOuvert] = useState(false);
  const [cadences, setCadences] = useState<CadencesTempsPose>({ ...CADENCES_DEFAUT });
  const [chargement, setChargement] = useState(true);
  const [sauvegarde, setSauvegarde] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; texte: string } | null>(null);

  const champsMetier =
    metier === "bardage"
      ? CHAMPS_BARDAGE
      : metier === "terrasse"
        ? CHAMPS_TERRASSE
        : CHAMPS_CLOTURE;

  useEffect(() => {
    let actif = true;
    async function charger() {
      setChargement(true);
      if (typeof supabase?.from !== "function") {
        setChargement(false);
        return;
      }
      const { data, error } = await supabase
        .from("catalogue_temps")
        .select("nom_tache, temps_unitaire_heure, entreprise_id");
      if (!actif) return;
      if (!error && data) {
        const tries = [...data].sort((a, b) => {
          if (a.entreprise_id && !b.entreprise_id) return 1;
          if (!a.entreprise_id && b.entreprise_id) return -1;
          return 0;
        });
        setCadences(fusionnerCadencesDepuisCatalogueTemps(tries));
      }
      setChargement(false);
    }
    charger();
    return () => {
      actif = false;
    };
  }, []);

  async function handleEnregistrer() {
    setSauvegarde(true);
    setMessage(null);
    try {
      const { entreprise_id } = await resoudreContexteEntreprise(null);
      if (!entreprise_id) {
        throw new Error("Contexte entreprise introuvable dans la session.");
      }

      const clesTaux = new Set(CHAMPS_TAUX_HORAIRES.map((c) => c.cle));
      const clesAEnregistrer = [
        ...CHAMPS_TAUX_HORAIRES.map((c) => c.cle),
        ...champsMetier.map((c) => c.cle),
      ];

      const lignesUpsert = clesAEnregistrer
        .map((cle) => {
          const valeur = Number(cadences[cle]);
          if (!Number.isFinite(valeur) || valeur < 0) return null;
          return {
            entreprise_id,
            nom_tache: cle,
            temps_unitaire_heure: valeur,
            metier: clesTaux.has(cle) ? "commun" : metier,
            updated_at: new Date().toISOString(),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      const { error } = await supabase
        .from("catalogue_temps")
        .upsert(lignesUpsert, { onConflict: "entreprise_id,nom_tache" });
      if (error) throw error;

      setMessage({ type: "ok", texte: "Cadences et taux horaires enregistrés." });
    } catch (err) {
      setMessage({
        type: "err",
        texte: "Erreur d'enregistrement : " + ((err as Error)?.message || "inconnue"),
      });
    } finally {
      setSauvegarde(false);
    }
  }

  function handleReinitialiser() {
    const maj = { ...cadences };
    for (const c of [...CHAMPS_TAUX_HORAIRES, ...champsMetier]) {
      maj[c.cle] = CADENCES_DEFAUT[c.cle];
    }
    setCadences(maj);
    setMessage(null);
  }

  return (
    <section className="rounded-xl border border-white/10 bg-[#1E1E1E]/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300 border border-violet-500/30">
            <Clock className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-white">
              Cadences &amp; Taux horaire main-d&apos;œuvre
            </h2>
            <p className="text-xs text-gray-400">
              Paramétrage des temps unitaires ({metier === "bardage" ? "Bardage" : "Terrasse"}) et taux horaires entreprise (table{" "}
              <code className="font-mono text-[11px] text-violet-300">catalogue_temps</code>)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-300">
          <span className="hidden sm:inline font-mono bg-[#121212] border border-white/10 px-2.5 py-1 rounded-md">
            Vente : {fmtEuro(cadences.taux_horaire_vente_ht)} · Chargé : {fmtEuro(cadences.taux_horaire_charge_ht)}
          </span>
          {ouvert ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {ouvert && (
        <div className="border-t border-white/10 px-4 py-4 space-y-5">
          {chargement ? (
            <p className="text-xs text-gray-400">Chargement des cadences...</p>
          ) : (
            <>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-2.5">
                  Taux horaires entreprise
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CHAMPS_TAUX_HORAIRES.map((champ) => (
                    <label
                      key={champ.cle}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#121212]/70 px-3.5 py-2.5"
                    >
                      <span className="text-xs font-medium text-gray-200">{champ.label}</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step={champ.step}
                          value={cadences[champ.cle]}
                          onChange={(e) =>
                            setCadences((prev) => ({
                              ...prev,
                              [champ.cle]: Number(e.target.value),
                            }))
                          }
                          className="w-24 rounded-md border border-white/15 bg-[#1E1E1E] px-2.5 py-1 text-right text-xs font-mono font-semibold text-white"
                        />
                        <span className="text-[11px] text-gray-400 w-12">{champ.unite}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-2.5">
                  Cadences de pose ({metier === "bardage" ? "Bardage" : "Terrasse & Mobile"})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {champsMetier.map((champ) => (
                    <label
                      key={champ.cle}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#121212]/70 px-3.5 py-2.5"
                    >
                      <span className="text-xs font-medium text-gray-200">{champ.label}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min="0"
                          step={champ.step}
                          value={cadences[champ.cle]}
                          onChange={(e) =>
                            setCadences((prev) => ({
                              ...prev,
                              [champ.cle]: Number(e.target.value),
                            }))
                          }
                          className="w-20 rounded-md border border-white/15 bg-[#1E1E1E] px-2.5 py-1 text-right text-xs font-mono font-semibold text-white"
                        />
                        <span className="text-[11px] text-gray-400 w-10">{champ.unite}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {message && (
                <p
                  className={`text-xs font-medium px-3 py-2 rounded-lg ${
                    message.type === "ok"
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                      : "bg-red-500/15 text-red-300 border border-red-500/30"
                  }`}
                >
                  {message.texte}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleReinitialiser}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#121212] px-3.5 py-2 text-xs font-semibold text-gray-300 hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Valeurs par défaut
                </button>
                <button
                  type="button"
                  onClick={handleEnregistrer}
                  disabled={sauvegarde}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {sauvegarde ? "Enregistrement..." : "Enregistrer les cadences"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
