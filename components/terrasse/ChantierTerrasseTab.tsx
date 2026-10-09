"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { ChantierTerrasseConfig, ResultatCalculTerrasse } from "@/lib/terrasse/types";
import { calculerTerrasse } from "@/lib/terrasse/calculs";
import TerrasseConfigForm from "./TerrasseConfigForm";
import TerrasseConformiteDTU from "./TerrasseConformiteDTU";
import TerrassePlanCanvas2D from "./TerrassePlanCanvas2D";
import TerrasseVue3D from "./TerrasseVue3D";
import TerrasseQuantitatifTable from "./TerrasseQuantitatifTable";
import {
  SlidersHorizontal,
  LayoutGrid,
  Rotate3d,
  FileSpreadsheet,
  FileText,
  Save,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface ChantierTerrasseTabProps {
  chantierId: string;
  chantierNom: string;
  clientNom?: string;
}

type SousOngletTerrasse = "config" | "plan2d" | "vue3d" | "quantitatif";

export default function ChantierTerrasseTab({
  chantierId,
  chantierNom,
  clientNom,
}: ChantierTerrasseTabProps) {
  const [sousOnglet, setSousOnglet] = useState<SousOngletTerrasse>("config");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Configuration par défaut initiale
  const [config, setConfig] = useState<ChantierTerrasseConfig>({
    chantier_id: chantierId,
    nom: "Terrasse principale",
    longueur_m: 6.0,
    largeur_m: 4.0,
    hauteur_sol_cm: 15.0,
    type_sol: "dalle_beton",
    pente_pct: 1.5,
    essence_bois: "pin_cl4",
    type_pose: "parallele",
    largeur_lame_mm: 145,
    epaisseur_lame_mm: 21,
    longueur_lame_m: 4.0,
    espacement_lames_mm: 5,
    type_fixation: "vis_inox",
    type_lambourde: "bois_cl4",
    section_largeur_mm: 45,
    section_hauteur_mm: 70,
    longueur_lambourde_m: 4.0,
    entraxe_lambourdes_cm: 40,
    double_lambourdage_aboutage: true,
    bande_etancheite_epdm: true,
    cales_isolation: true,
    type_plots: "reglables",
    entraxe_plots_cm: 60,
    hauteur_reglage_plots: "40_60",
    geotextile: true,
    presence_escalier: false,
    escalier_nb_marches: 2,
    escalier_largeur_m: 2.0,
    escalier_giron_cm: 28.0,
    escalier_hauteur_marche_cm: 16.0,
    presence_garde_corps: false,
    garde_corps_longueur_ml: 0.0,
    garde_corps_type: "bois_cables",
    garde_corps_hauteur_cm: 100,
    coef_perte_lames: 1.10,
    coef_perte_lambourdes: 1.08,
  });

  // Calcul instantané en mémoire dès que la configuration change
  const resultat = useMemo<ResultatCalculTerrasse>(() => {
    return calculerTerrasse(config);
  }, [config]);

  // Chargement initial depuis l'API
  const fetchTerrasse = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/chantiers/${encodeURIComponent(chantierId)}/terrasse`);
      if (!res.ok) {
        throw new Error("Impossible de charger les données terrasse");
      }
      const data = await res.json();
      if (data.terrasse) {
        setConfig((prev) => ({ ...prev, ...data.terrasse }));
      }
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg("Erreur lors de la récupération des données.");
    } finally {
      setLoading(false);
    }
  }, [chantierId]);

  useEffect(() => {
    fetchTerrasse();
  }, [fetchTerrasse]);

  const handleConfigChange = (updated: Partial<ChantierTerrasseConfig>) => {
    setConfig((prev) => ({ ...prev, ...updated }));
    setSavedSuccess(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setErrorMsg(null);
      const res = await fetch(`/api/chantiers/${encodeURIComponent(chantierId)}/terrasse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erreur de sauvegarde");
      }

      const data = await res.json();
      if (data.terrasse) {
        setConfig((prev) => ({ ...prev, ...data.terrasse }));
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg((err as Error).message || "Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      const res = await fetch(`/api/chantiers/${encodeURIComponent(chantierId)}/terrasse/export/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) throw new Error("Échec de la génération PDF");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `terrasse-dtu51.4-${chantierNom.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'exportation du PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      const res = await fetch(`/api/chantiers/${encodeURIComponent(chantierId)}/terrasse/export/excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) throw new Error("Échec de la génération Excel");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quantitatif-terrasse-${chantierNom.replace(/[^a-zA-Z0-9_-]/g, "_")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'exportation Excel.");
    } finally {
      setExportingExcel(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-[#14161b]">
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
          Chargement du module Terrasse DTU 51.4…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Barre d'en-tête du sous-onglet Terrasse */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-white/10 bg-[#14161b] p-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">🪵</span>
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">
              Module Métier Terrasse · DTU 51.4
            </h2>
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-3xs font-semibold text-amber-400 border border-amber-500/30">
              Indépendant Bardage
            </span>
          </div>
          <p className="mt-0.5 text-3xs text-gray-400">
            Platelage extérieur bois, lambourdage, plots réglables, escaliers et garde-corps
          </p>
        </div>

        {/* Boutons d'actions globales */}
        <div className="flex flex-wrap items-center gap-2">
          {savedSuccess && (
            <span className="flex items-center gap-1 text-3xs font-bold text-emerald-400 animate-pulse">
              <Check size={13} /> Enregistré
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-md disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>

          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10 transition shadow-sm disabled:opacity-50"
            title="Exporter la fiche technique et rapport de conformité DTU 51.4 en PDF"
          >
            {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            Fiche PDF
          </button>

          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10 transition shadow-sm disabled:opacity-50"
            title="Exporter le quantitatif complet en Excel"
          >
            {exportingExcel ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            Excel
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-300">
          <AlertCircle size={15} />
          {errorMsg}
        </div>
      )}

      {/* Navigation entre sous-vues du module Terrasse */}
      <div className="flex gap-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setSousOnglet("config")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            sousOnglet === "config"
              ? "bg-amber-600 text-white shadow-md"
              : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <SlidersHorizontal size={14} />
          Configuration & Audit DTU 51.4
        </button>

        <button
          onClick={() => setSousOnglet("plan2d")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            sousOnglet === "plan2d"
              ? "bg-amber-600 text-white shadow-md"
              : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <LayoutGrid size={14} />
          Plan 2D & Calepinage
        </button>

        <button
          onClick={() => setSousOnglet("vue3d")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            sousOnglet === "vue3d"
              ? "bg-amber-600 text-white shadow-md"
              : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <Rotate3d size={14} />
          Vue 3D
        </button>

        <button
          onClick={() => setSousOnglet("quantitatif")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            sousOnglet === "quantitatif"
              ? "bg-amber-600 text-white shadow-md"
              : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <FileSpreadsheet size={14} />
          Quantitatif & Approvisionnements
        </button>
      </div>

      {/* Rendu du sous-onglet sélectionné */}
      {sousOnglet === "config" && (
        <div className="space-y-6">
          <TerrasseConformiteDTU conformite={resultat.conformite} />
          <TerrasseConfigForm config={config} onChange={handleConfigChange} />
        </div>
      )}

      {sousOnglet === "plan2d" && (
        <div className="space-y-4">
          <TerrassePlanCanvas2D config={config} resultat={resultat} />
        </div>
      )}

      {sousOnglet === "vue3d" && (
        <div className="space-y-4">
          <TerrasseVue3D config={config} resultat={resultat} />
        </div>
      )}

      {sousOnglet === "quantitatif" && (
        <div className="space-y-4">
          <TerrasseQuantitatifTable
            resultat={resultat}
            chantierId={chantierId}
            chantierNom={chantierNom}
          />
        </div>
      )}
    </div>
  );
}
