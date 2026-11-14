"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import type {
  ChantierTerrasseConfig,
  ChantierTerrasseReservation,
  EssenceBois,
  ResultatCalculTerrasse,
  TypeMotorisationTerrasse,
  TypeReservationTerrasse,
} from "@/lib/terrasse/types";
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
  Plus,
  Trash2,
  Box,
} from "lucide-react";

interface ChantierTerrasseTabProps {
  chantierId: string;
  chantierNom: string;
  clientNom?: string;
}

type SousOngletTerrasse = "config" | "plan2d" | "vue3d" | "reservations" | "quantitatif";

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

  const [reservations, setReservations] = useState<ChantierTerrasseReservation[]>([]);

  // Calcul instantané en mémoire dès que la configuration ou les réservations changent
  const resultat = useMemo<ResultatCalculTerrasse>(() => {
    return calculerTerrasse(config, reservations, config.tarifs_catalogue);
  }, [config, reservations]);

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
      if (data.reservations) {
        setReservations(data.reservations);
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

  const handleAddReservation = (type: TypeReservationTerrasse) => {
    const nouvelle: ChantierTerrasseReservation = {
      terrasse_id: config.id || "",
      type_reservation: type,
      nom:
        type === "piscine"
          ? "Piscine"
          : type === "skimmer"
          ? "Skimmer"
          : type === "arbre"
          ? "Arbre"
          : type === "poteau"
          ? "Poteau"
          : "Trappe technique",
      x: 1.0,
      y: 1.0,
      largeur: type === "piscine" ? 4.0 : type === "arbre" || type === "poteau" ? undefined : 0.6,
      longueur: type === "piscine" ? 2.5 : type === "arbre" || type === "poteau" ? undefined : 0.6,
      diametre: type === "arbre" ? 0.8 : type === "poteau" ? 0.3 : undefined,
      terrasse_mobile:
        type === "piscine"
          ? {
              active: true,
              mode: "1_plateau",
              sens_refoulement: "droite",
              hauteur_chassis_alu_mm: 100,
              jeu_fonctionnel_peripherique_mm: 20,
              section_profil_alu_mm: "80x40",
              charge_exploitation_kn_m2: 2.5,
            }
          : undefined,
    };
    setReservations((prev) => [...prev, nouvelle]);
    setSavedSuccess(false);
  };

  const handleRemoveReservation = (index: number) => {
    setReservations((prev) => prev.filter((_, i) => i !== index));
    setSavedSuccess(false);
  };

  const handleUpdateReservation = (index: number, updated: Partial<ChantierTerrasseReservation>) => {
    setReservations((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updated } : r))
    );
    setSavedSuccess(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setErrorMsg(null);
      const res = await fetch(`/api/chantiers/${encodeURIComponent(chantierId)}/terrasse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, reservations }),
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
      <div className="flex h-64 items-center justify-center rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA]">
        <div className="flex items-center gap-3 text-sm text-[#777777]">
          <Loader2 className="h-5 w-5 animate-spin text-[#B85B2B]" />
          Chargement du module Terrasse DTU 51.4…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Barre d'en-tête du sous-onglet Terrasse */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">🪵</span>
            <h2 className="text-sm sm:text-base font-bold text-[#23272B] uppercase tracking-wide">
              Module Métier Terrasse · DTU 51.4
            </h2>
            <span className="rounded-full bg-[#B85B2B]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#B85B2B] border border-[#B85B2B]/20">
              Indépendant Bardage
            </span>
          </div>
          <p className="mt-1 text-xs text-[#777777]">
            Platelage extérieur bois, lambourdage, plots réglables, escaliers et garde-corps
          </p>
        </div>

        {/* Boutons d'actions globales */}
        <div className="flex flex-wrap items-center gap-2">
          {savedSuccess && (
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 animate-pulse">
              <Check size={13} /> Enregistré
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] active:scale-[0.98] px-4 py-2 text-xs font-bold text-white transition shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>

          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-3.5 py-2 text-xs font-semibold text-[#23272B] transition shadow-xs disabled:opacity-50"
            title="Exporter la fiche technique et rapport de conformité DTU 51.4 en PDF"
          >
            {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            Fiche PDF
          </button>

          <button
            onClick={handleExportExcel}
            disabled={exportingExcel}
            className="flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-3.5 py-2 text-xs font-semibold text-[#23272B] transition shadow-xs disabled:opacity-50"
            title="Exporter le quantitatif complet en Excel"
          >
            {exportingExcel ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            Excel
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <AlertCircle size={15} />
          {errorMsg}
        </div>
      )}

      {/* Navigation entre sous-vues du module Terrasse.
          `overflow-x-auto` + `scrollbar-hide` : sur mobile (< 640 px) les 5
          onglets défilent au doigt au lieu de déborder ; sur desktop, tout
          tient, le comportement est inchangé. (Motif identique à la fiche
          chantier, app/terrain/chantier/[id]/page.tsx.) */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide border-b border-[#F0F0F0] pb-3 -mx-1 px-1">
        <button
          onClick={() => setSousOnglet("config")}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            sousOnglet === "config"
              ? "bg-[#23272B] text-white shadow-xs"
              : "bg-[#F8F9FA] text-[#777777] hover:text-[#23272B] hover:bg-white border border-[#E5E5E5]"
          }`}
        >
          <SlidersHorizontal size={14} />
          Configuration & Audit DTU 51.4
        </button>

        <button
          onClick={() => setSousOnglet("plan2d")}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            sousOnglet === "plan2d"
              ? "bg-[#23272B] text-white shadow-xs"
              : "bg-[#F8F9FA] text-[#777777] hover:text-[#23272B] hover:bg-white border border-[#E5E5E5]"
          }`}
        >
          <LayoutGrid size={14} />
          Plan 2D & Calepinage
        </button>

        <button
          onClick={() => setSousOnglet("vue3d")}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            sousOnglet === "vue3d"
              ? "bg-[#23272B] text-white shadow-xs"
              : "bg-[#F8F9FA] text-[#777777] hover:text-[#23272B] hover:bg-white border border-[#E5E5E5]"
          }`}
        >
          <Rotate3d size={14} />
          Vue 3D
        </button>

        <button
          onClick={() => setSousOnglet("reservations")}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            sousOnglet === "reservations"
              ? "bg-[#23272B] text-white shadow-xs"
              : "bg-[#F8F9FA] text-[#777777] hover:text-[#23272B] hover:bg-white border border-[#E5E5E5]"
          }`}
        >
          <Box size={14} />
          Réservations & Découpes ({reservations.length})
        </button>

        <button
          onClick={() => setSousOnglet("quantitatif")}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            sousOnglet === "quantitatif"
              ? "bg-[#23272B] text-white shadow-xs"
              : "bg-[#F8F9FA] text-[#777777] hover:text-[#23272B] hover:bg-white border border-[#E5E5E5]"
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
          <TerrassePlanCanvas2D config={config} resultat={resultat} reservations={reservations} />
        </div>
      )}

      {sousOnglet === "vue3d" && (
        <div className="space-y-4">
          <TerrasseVue3D config={config} resultat={resultat} reservations={reservations} />
        </div>
      )}

      {sousOnglet === "reservations" && (
        <div className="space-y-6">
          <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
                  🕳️ Réservations & Trémies dans le platelage
                </h3>
                <p className="mt-1 text-xs text-[#777777]">
                  Découpes intégrées (piscines, trappes de visite, skimmers, arbres, poteaux) avec renforts de lambourdes automatiques.
                </p>
              </div>

              {/* Boutons d'ajout rapide */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAddReservation("piscine")}
                  className="flex items-center gap-1 rounded-xl bg-sky-50 border border-sky-200 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100 transition shadow-2xs"
                >
                  <Plus size={12} /> + Piscine
                </button>
                <button
                  onClick={() => handleAddReservation("trappe")}
                  className="flex items-center gap-1 rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                >
                  <Plus size={12} /> + Trappe / Regard
                </button>
                <button
                  onClick={() => handleAddReservation("skimmer")}
                  className="flex items-center gap-1 rounded-xl bg-cyan-50 border border-cyan-200 px-3 py-1.5 text-xs font-bold text-cyan-800 hover:bg-cyan-100 transition shadow-2xs"
                >
                  <Plus size={12} /> + Skimmer
                </button>
                <button
                  onClick={() => handleAddReservation("arbre")}
                  className="flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                >
                  <Plus size={12} /> + Arbre
                </button>
                <button
                  onClick={() => handleAddReservation("poteau")}
                  className="flex items-center gap-1 rounded-xl bg-gray-50 border border-[#E5E5E5] px-3 py-1.5 text-xs font-bold text-[#23272B] hover:bg-white transition shadow-2xs"
                >
                  <Plus size={12} /> + Poteau
                </button>
              </div>
            </div>

            {reservations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#DCDCDC] bg-[#F8F9FA] p-8 text-center text-xs text-[#777777]">
                Aucune réservation configurée. Cliquez sur les boutons ci-dessus pour intégrer une piscine, une trappe ou un obstacle.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#F0F0F0] text-3xs font-semibold uppercase text-[#777777]">
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Nom</th>
                      <th className="py-2.5 px-3">Pos X (m)</th>
                      <th className="py-2.5 px-3">Pos Y (m)</th>
                      <th className="py-2.5 px-3">Largeur (m)</th>
                      <th className="py-2.5 px-3">Longueur (m)</th>
                      <th className="py-2.5 px-3">Diamètre (m)</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F0]">
                    {reservations.map((res, idx) => (
                      <tr key={idx} className="hover:bg-[#F8F9FA] transition">
                        <td className="py-2.5 px-3 font-semibold text-[#23272B] capitalize">
                          {res.type_reservation === "piscine" && "🏊 Piscine"}
                          {res.type_reservation === "trappe" && "🚪 Trappe"}
                          {res.type_reservation === "skimmer" && "💧 Skimmer"}
                          {res.type_reservation === "arbre" && "🌳 Arbre"}
                          {res.type_reservation === "poteau" && "🏛️ Poteau"}
                          {res.type_reservation === "autre" && "📦 Autre"}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={res.nom}
                            onChange={(e) => handleUpdateReservation(idx, { nom: e.target.value })}
                            className="rounded-lg border border-[#E5E5E5] bg-[#F8F9FA] focus:bg-white px-2 py-1 text-xs text-[#23272B] focus:border-[#B85B2B]"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={res.x}
                            onChange={(e) => handleUpdateReservation(idx, { x: parseFloat(e.target.value) || 0 })}
                            className="w-20 rounded-lg border border-[#E5E5E5] bg-[#F8F9FA] focus:bg-white px-2 py-1 text-xs text-[#23272B] focus:border-[#B85B2B]"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={res.y}
                            onChange={(e) => handleUpdateReservation(idx, { y: parseFloat(e.target.value) || 0 })}
                            className="w-20 rounded-lg border border-[#E5E5E5] bg-[#F8F9FA] focus:bg-white px-2 py-1 text-xs text-[#23272B] focus:border-[#B85B2B]"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          {res.diametre === undefined && (
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={res.largeur ?? 0.6}
                              onChange={(e) => handleUpdateReservation(idx, { largeur: parseFloat(e.target.value) || 0.6 })}
                              className="w-20 rounded-lg border border-[#E5E5E5] bg-[#F8F9FA] focus:bg-white px-2 py-1 text-xs text-[#23272B] focus:border-[#B85B2B]"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {res.diametre === undefined && (
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={res.longueur ?? 0.6}
                              onChange={(e) => handleUpdateReservation(idx, { longueur: parseFloat(e.target.value) || 0.6 })}
                              className="w-20 rounded-lg border border-[#E5E5E5] bg-[#F8F9FA] focus:bg-white px-2 py-1 text-xs text-[#23272B] focus:border-[#B85B2B]"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {res.diametre !== undefined && (
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={res.diametre ?? 0.8}
                              onChange={(e) => handleUpdateReservation(idx, { diametre: parseFloat(e.target.value) || 0.8 })}
                              className="w-20 rounded-lg border border-[#E5E5E5] bg-[#F8F9FA] focus:bg-white px-2 py-1 text-xs text-[#23272B] focus:border-[#B85B2B]"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleRemoveReservation(idx)}
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 transition"
                            title="Supprimer la réservation"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* CONFIGURATION SPÉCIFIQUE TERRASSE MOBILE COULISSANTE SUR RAILS */}
            {reservations.map((res, idx) => {
              if (res.type_reservation !== "piscine") return null;
              const mob = res.terrasse_mobile || {
                active: true,
                mode: "1_plateau",
                sens_refoulement: "droite",
                hauteur_chassis_alu_mm: 100,
                jeu_fonctionnel_peripherique_mm: 20,
                section_profil_alu_mm: "80x40",
                charge_exploitation_kn_m2: 2.5,
                type_motorisation: "aucune" as TypeMotorisationTerrasse,
              };

              const motSpec = resultat?.terrasseMobile?.motorisation;

              return (
                <div
                  key={`mob-config-${idx}`}
                  className="mt-4 rounded-xl border border-sky-300 bg-gradient-to-br from-sky-50/80 via-white to-sky-50/30 p-4 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🏊</span>
                      <div>
                        <h4 className="text-xs font-bold text-sky-950">
                          Terrasse Mobile Coulissante sur Rails · {res.nom}
                        </h4>
                        <p className="text-3xs text-sky-700">
                          Châssis aluminium porteur + rails inox au sol (conformité DTU 51.4 & NF P90-308)
                        </p>
                      </div>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-sky-900">
                      <input
                        type="checkbox"
                        checked={mob.active}
                        onChange={(e) =>
                          handleUpdateReservation(idx, {
                            terrasse_mobile: { ...mob, active: e.target.checked },
                          })
                        }
                        className="rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                      />
                      Activer la terrasse mobile
                    </label>
                  </div>

                  {mob.active && (
                    <div className="mt-3 space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-3xs font-semibold text-gray-600 mb-1">
                            Mode de plateau
                          </label>
                          <select
                            value={mob.mode}
                            onChange={(e) =>
                              handleUpdateReservation(idx, {
                                terrasse_mobile: {
                                  ...mob,
                                  mode: e.target.value as "1_plateau" | "2_demi_plateaux",
                                },
                              })
                            }
                            className="w-full rounded-lg border border-[#DCDCDC] bg-white px-2.5 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B]"
                          >
                            <option value="1_plateau">1 Plateau monobloc</option>
                            <option value="2_demi_plateaux">2 Demi-plateaux (ouverture centrale symétrique)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-3xs font-semibold text-gray-600 mb-1">
                            Sens de refoulement
                          </label>
                          <select
                            value={mob.sens_refoulement}
                            onChange={(e) =>
                              handleUpdateReservation(idx, {
                                terrasse_mobile: {
                                  ...mob,
                                  sens_refoulement: e.target.value as
                                    | "droite"
                                    | "gauche"
                                    | "bas"
                                    | "haut",
                                },
                              })
                            }
                            className="w-full rounded-lg border border-[#DCDCDC] bg-white px-2.5 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B]"
                          >
                            <option value="droite">➡️ Vers la droite (latéral)</option>
                            <option value="gauche">⬅️ Vers la gauche (latéral)</option>
                            <option value="bas">⬇️ Vers le bas (longitudinal)</option>
                            <option value="haut">⬆️ Vers le haut (longitudinal)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-3xs font-semibold text-gray-600 mb-1">
                            Motorisation (NF P90-308)
                          </label>
                          <select
                            value={mob.type_motorisation || "aucune"}
                            onChange={(e) =>
                              handleUpdateReservation(idx, {
                                terrasse_mobile: {
                                  ...mob,
                                  type_motorisation: e.target.value as TypeMotorisationTerrasse,
                                },
                              })
                            }
                            className="w-full rounded-lg border border-[#DCDCDC] bg-white px-2.5 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B]"
                          >
                            <option value="aucune">Manuelle (sans moteur)</option>
                            <option value="solaire">☀️ Solaire autonome 24V (Batteries + Panneau PV)</option>
                            <option value="filaire">🔌 Filaire 230V / 24V TBTS (Transformateur IP65)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-3xs font-semibold text-gray-600 mb-1">
                            Hauteur châssis alu (mm)
                          </label>
                          <input
                            type="number"
                            min="60"
                            max="200"
                            step="10"
                            value={mob.hauteur_chassis_alu_mm}
                            onChange={(e) =>
                              handleUpdateReservation(idx, {
                                terrasse_mobile: {
                                  ...mob,
                                  hauteur_chassis_alu_mm: parseInt(e.target.value) || 100,
                                },
                              })
                            }
                            className="w-full rounded-lg border border-[#DCDCDC] bg-white px-2.5 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B]"
                          />
                        </div>

                        <div>
                          <label className="block text-3xs font-semibold text-gray-600 mb-1">
                            Jeu périphérique (mm)
                          </label>
                          <input
                            type="number"
                            min="10"
                            max="50"
                            step="5"
                            value={mob.jeu_fonctionnel_peripherique_mm}
                            onChange={(e) =>
                              handleUpdateReservation(idx, {
                                terrasse_mobile: {
                                  ...mob,
                                  jeu_fonctionnel_peripherique_mm: parseInt(e.target.value) || 20,
                                },
                              })
                            }
                            className="w-full rounded-lg border border-[#DCDCDC] bg-white px-2.5 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B]"
                          />
                        </div>

                        <div>
                          <label className="block text-3xs font-semibold text-gray-600 mb-1">
                            Charge exploitation plateau
                          </label>
                          <input
                            type="text"
                            disabled
                            value="2,5 kN/m² (250 kg/m²)"
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-500 cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* DISSOCIATION ESTHÉTIQUE ESSENCE / FINITION PLATEAU MOBILE */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-sky-100">
                        <div>
                          <label className="block text-3xs font-semibold text-gray-600 mb-1">
                            Finition / Essence plateau mobile
                          </label>
                          <select
                            value={mob.essence_bois || ""}
                            onChange={(e) =>
                              handleUpdateReservation(idx, {
                                terrasse_mobile: {
                                  ...mob,
                                  essence_bois: (e.target.value as EssenceBois) || undefined,
                                },
                              })
                            }
                            className="w-full rounded-lg border border-[#DCDCDC] bg-white px-2.5 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B]"
                          >
                            <option value="">Identique à la plage fixe ({config.essence_bois})</option>
                            <option value="ipe">Bois exotique Ipé (brun foncé)</option>
                            <option value="cumaru">Bois exotique Cumaru (brun doré)</option>
                            <option value="pin_cl4">Pin sylvestre autoclave Cl.4 (blond)</option>
                            <option value="douglas">Douglas purgé d'aubier (miel orangé)</option>
                            <option value="meleze">Mélèze de Sibérie (miel clair)</option>
                            <option value="bambou_thermo">Bambou thermo-traité (caramel)</option>
                            <option value="composite">Lames composites</option>
                          </select>
                        </div>

                        {(mob.essence_bois === "composite" ||
                          (!mob.essence_bois && config.essence_bois === "composite")) && (
                          <div>
                            <label className="block text-3xs font-semibold text-gray-600 mb-1">
                              Teinte composite du plateau mobile
                            </label>
                            <select
                              value={mob.teinte_composite || "anthracite"}
                              onChange={(e) =>
                                handleUpdateReservation(idx, {
                                  terrasse_mobile: {
                                    ...mob,
                                    teinte_composite: e.target.value,
                                  },
                                })
                              }
                              className="w-full rounded-lg border border-[#DCDCDC] bg-white px-2.5 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B]"
                            >
                              <option value="anthracite">Gris Anthracite (RAL 7016)</option>
                              <option value="brun">Brun Havane / Marron chaud</option>
                              <option value="gris_clair">Gris Minéral / Clair</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {/* BADGE TECHNIQUE MOTORISATION ENRICHI SI MOTORISÉ */}
                      {motSpec && motSpec.active && motSpec.typeMotorisation !== "aucune" && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
                          <div className="flex items-center justify-between gap-2 border-b border-amber-200/60 pb-1.5 mb-2">
                            <span className="font-bold flex items-center gap-1.5 text-amber-900">
                              <span>⚡</span>
                              Motorisation {motSpec.typeMotorisation === "solaire" ? "Solaire Autonome 24V" : "Filaire 230V / 24V TBTS"}
                            </span>
                            <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900">
                              Norme NF P90-308 Conforme
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-2xs">
                            <div>
                              <span className="text-amber-800">Motoréducteur(s) :</span>{" "}
                              <strong className="text-amber-950">
                                {motSpec.nbMoteurs} × {motSpec.puissanceMoteurUnitaireN} N
                              </strong>{" "}
                              (Total {motSpec.puissanceTractionTotaleN} N)
                            </div>
                            <div>
                              <span className="text-amber-800">Crémaillère M4 :</span>{" "}
                              <strong className="text-amber-950">
                                {motSpec.lineaireCremaillereM} m
                              </strong>{" "}
                              ({motSpec.barresCremaillereCount} barres acier/nylon)
                            </div>
                            <div>
                              <span className="text-amber-800">Alimentation :</span>{" "}
                              <strong className="text-amber-950">
                                {motSpec.typeMotorisation === "solaire"
                                  ? "PV 30 Wc + 2× 12V 14Ah"
                                  : "230V → 24V TBTS IP65"}
                              </strong>
                            </div>
                            <div>
                              <span className="text-amber-800">Sécurité & Pilotage :</span>{" "}
                              <strong className="text-amber-950">
                                Fins de course IP68 + {motSpec.telecommande.nbTelecommandes} télécommandes
                              </strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
