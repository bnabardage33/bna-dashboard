"use client";

import React from "react";
import type {
  ChantierTerrasseConfig,
  EssenceBois,
  HauteurReglagePlots,
  SystemeTerrasse,
  TypeFixation,
  TypeGardeCorps,
  TypeLambourde,
  TypePlots,
  TypePose,
  TypeSol,
  ZoneEnvironnement,
} from "@/lib/terrasse/types";
import {
  FABRICANTS_COMPOSITE,
  estDTAExpire,
  getFabricantComposite,
} from "@/lib/terrasse/composite/fabricants";

interface TerrasseConfigFormProps {
  config: ChantierTerrasseConfig;
  onChange: (updated: Partial<ChantierTerrasseConfig>) => void;
}

export default function TerrasseConfigForm({
  config,
  onChange,
}: TerrasseConfigFormProps) {
  const systemeActuel: SystemeTerrasse =
    config.systeme_terrasse ||
    (config.essence_bois === "composite"
      ? "composite_clip"
      : config.type_fixation === "clips_invisibles"
      ? "bois_clip"
      : "bois_vis");

  const zoneActuelle: ZoneEnvironnement = config.zone_environnement || "normal";
  const fabricantComposite = getFabricantComposite(config.fabricant_composite);
  const dtaExpire = estDTAExpire(fabricantComposite.dta);

  return (
    <div className="space-y-6">
      {/* 0. SYSTÈME MÉTIER & ENVIRONNEMENT */}
      <div className="rounded-2xl border border-sky-500/30 bg-[#12161f] p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-2">
            ⚙️ Système Constructif & Environnement
          </h3>
          {(zoneActuelle === "piscine" || zoneActuelle === "littoral") && (
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-3xs font-medium text-emerald-300 border border-emerald-500/30">
              ⚓ Inox A4 Marine (AISI 316) obligatoire
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Sélection du système constructif */}
          <div>
            <label className="text-3xs font-medium text-gray-300">Système de terrasse</label>
            <select
              value={systemeActuel}
              onChange={(e) => {
                const val = e.target.value as SystemeTerrasse;
                if (val === "composite_clip") {
                  onChange({
                    systeme_terrasse: val,
                    essence_bois: "composite",
                    type_fixation: "clips_invisibles",
                    fabricant_composite: config.fabricant_composite || "silvadec",
                  });
                } else if (val === "bois_clip") {
                  onChange({
                    systeme_terrasse: val,
                    essence_bois: config.essence_bois === "composite" ? "ipe" : config.essence_bois,
                    type_fixation: "clips_invisibles",
                  });
                } else {
                  onChange({
                    systeme_terrasse: val,
                    essence_bois: config.essence_bois === "composite" ? "pin_cl4" : config.essence_bois,
                    type_fixation: "vis_inox",
                  });
                }
              }}
              className="mt-1 w-full rounded-xl border border-sky-500/40 bg-sky-950/20 px-3 py-2 text-xs font-semibold text-white focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
            >
              <option value="bois_vis">🪵 Bois Naturel — Vissage Apparent (DTU 51.4)</option>
              <option value="bois_clip">🪚 Bois Naturel — Clips Invisibles (Avis Techniques)</option>
              <option value="composite_clip">🧱 Terrasse Composite — Clips Invisibles (DTA GS 2.1)</option>
            </select>
          </div>

          {/* Sélection de la zone environnementale */}
          <div>
            <label className="text-3xs font-medium text-gray-300">Zone Environnementale</label>
            <select
              value={zoneActuelle}
              onChange={(e) => onChange({ zone_environnement: e.target.value as ZoneEnvironnement })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            >
              <option value="normal">Normal / Standard (Inox A2)</option>
              <option value="piscine">🏊 Plage de Piscine (Chlore / Sel → Inox A4)</option>
              <option value="littoral">🌊 Zone Littorale & Marine (Embruns → Inox A4)</option>
              <option value="montagne">🏔️ Montagne (Amplitude thermique & Gel)</option>
            </select>
          </div>

          {/* Si composite : Fabricant ciblé & DTA */}
          {systemeActuel === "composite_clip" && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-3xs font-medium text-gray-300">Fabricant Composite</label>
                <span
                  className={`text-3xs font-bold px-1.5 py-0.5 rounded ${
                    dtaExpire
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {dtaExpire ? "⚠️ DTA expiré" : "✅ DTA CSTB actif"}
                </span>
              </div>
              <select
                value={config.fabricant_composite || "silvadec"}
                onChange={(e) => {
                  const fabId = e.target.value;
                  const fab = getFabricantComposite(fabId);
                  const defGamme = fab.gammes[0];
                  onChange({
                    fabricant_composite: fabId,
                    gamme_composite: defGamme.gamme,
                    largeur_lame_mm: defGamme.largeurMm,
                    epaisseur_lame_mm: defGamme.epaisseurMm,
                    entraxe_lambourdes_cm: defGamme.entraxeMaxCm,
                    pente_pct: defGamme.penteMinimalePct,
                  });
                }}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                {Object.values(FABRICANTS_COMPOSITE).map((fab) => (
                  <option key={fab.id} value={fab.id}>
                    {fab.nom} ({fab.dta.numero})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-3xs text-gray-400">
                DTA {fabricantComposite.dta.numero} • Expiration {fabricantComposite.dta.expirationDTA}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 1. GÉOMÉTRIE & SOL */}
      <div className="rounded-2xl border border-white/10 bg-[#16181d] p-5 shadow-lg">
        <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-2 mb-4">
          📐 1. Géométrie & Implantation
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="text-3xs font-medium text-gray-400">Longueur (m)</label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              value={config.longueur_m}
              onChange={(e) => onChange({ longueur_m: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Largeur (m)</label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              value={config.largeur_m}
              onChange={(e) => onChange({ largeur_m: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Hauteur sol fini (cm)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={config.hauteur_sol_cm}
              onChange={(e) => onChange({ hauteur_sol_cm: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Type de support / sol</label>
            <select
              value={config.type_sol}
              onChange={(e) => onChange({ type_sol: e.target.value as TypeSol })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            >
              <option value="dalle_beton">Dalle béton existante</option>
              <option value="terre_meuble">Terre naturelle / Sol meuble</option>
              <option value="stabilise_grave">Grave / Tout-venant stabilisé</option>
              <option value="etancheite_toit">Toiture terrasse / Étanchéité</option>
            </select>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Pente d&apos;écoulement (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={config.pente_pct}
              onChange={(e) => onChange({ pente_pct: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
            <p className="mt-1 text-3xs text-gray-500">Min 1.5% selon DTU 51.4</p>
          </div>
        </div>
      </div>

      {/* 2. LAMES DE PLATELAGE */}
      <div className="rounded-2xl border border-white/10 bg-[#16181d] p-5 shadow-lg">
        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2 mb-4">
          🌲 2. Lames de platelage (DTU 51.4)
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-3xs font-medium text-gray-400">Essence de bois</label>
            <select
              value={config.essence_bois}
              onChange={(e) => onChange({ essence_bois: e.target.value as EssenceBois })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              <option value="pin_cl4">Pin sylvestre autoclave Classe 4</option>
              <option value="douglas">Douglas purgé d&apos;aubier (Cl. 3b)</option>
              <option value="meleze">Mélèze de Sibérie / Alpes</option>
              <option value="cumaru">Cumaru rouge (Bois exotique Cl. 4)</option>
              <option value="ipe">Ipé véritable (Bois exotique Cl. 4)</option>
              <option value="composite">Bois composite co-extrudé (WPC)</option>
              <option value="bambou_thermo">Bambou thermo-traité haute densité</option>
            </select>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Largeur de lame (mm)</label>
            <input
              type="number"
              min="70"
              max="200"
              value={config.largeur_lame_mm}
              onChange={(e) => onChange({ largeur_lame_mm: parseInt(e.target.value, 10) || 145 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Épaisseur de lame (mm)</label>
            <input
              type="number"
              min="19"
              max="35"
              value={config.epaisseur_lame_mm}
              onChange={(e) => onChange({ epaisseur_lame_mm: parseInt(e.target.value, 10) || 21 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Longueur lame std (m)</label>
            <input
              type="number"
              step="0.1"
              min="2.0"
              max="6.0"
              value={config.longueur_lame_m}
              onChange={(e) => onChange({ longueur_lame_m: parseFloat(e.target.value) || 4.0 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Espacement / jeu entre lames (mm)</label>
            <input
              type="number"
              min="2"
              max="10"
              value={config.espacement_lames_mm}
              onChange={(e) => onChange({ espacement_lames_mm: parseInt(e.target.value, 10) || 5 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
            <p className="mt-1 text-3xs text-gray-500">DTU 51.4 : 4 à 7 mm</p>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Orientation de pose</label>
            <select
              value={config.type_pose}
              onChange={(e) => onChange({ type_pose: e.target.value as TypePose })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              <option value="parallele">Parallèle à la façade / longueur</option>
              <option value="perpendiculaire">Perpendiculaire à la façade</option>
              <option value="diagonale">Diagonale (45°)</option>
            </select>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Type de fixation</label>
            <select
              value={config.type_fixation}
              onChange={(e) => onChange({ type_fixation: e.target.value as TypeFixation })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              <option value="vis_inox">Vissage apparent inox A2 / A4 (2 vis/appui)</option>
              <option value="clips_invisibles">Clips invisibles (lames rainurées)</option>
            </select>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Majoration chutes platelage (%)</label>
            <input
              type="number"
              step="0.01"
              min="1.0"
              max="1.3"
              value={config.coef_perte_lames}
              onChange={(e) => onChange({ coef_perte_lames: parseFloat(e.target.value) || 1.1 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
            <p className="mt-1 text-3xs text-gray-500">1.10 = +10% de commande</p>
          </div>
        </div>
      </div>

      {/* 3. LAMBOURDES & STRUCTURE */}
      <div className="rounded-2xl border border-white/10 bg-[#16181d] p-5 shadow-lg">
        <h3 className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-2 mb-4">
          🪵 3. Lambourdes & Ossature porteuse
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-3xs font-medium text-gray-400">Type de lambourde</label>
            <select
              value={config.type_lambourde}
              onChange={(e) => onChange({ type_lambourde: e.target.value as TypeLambourde })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            >
              <option value="bois_cl4">Pin traité autoclave Classe 4</option>
              <option value="bois_exotique">Bois exotique (Badi / Itauba Cl. 4)</option>
              <option value="alu_structure">Structure profilé aluminium</option>
            </select>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Section Largeur × Hauteur (mm)</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min="40"
                value={config.section_largeur_mm}
                onChange={(e) => onChange({ section_largeur_mm: parseInt(e.target.value, 10) || 45 })}
                className="w-1/2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                placeholder="Larg."
              />
              <span className="text-gray-500">×</span>
              <input
                type="number"
                min="40"
                value={config.section_hauteur_mm}
                onChange={(e) => onChange({ section_hauteur_mm: parseInt(e.target.value, 10) || 70 })}
                className="w-1/2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                placeholder="Haut."
              />
            </div>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Entraxe des lambourdes (cm)</label>
            <input
              type="number"
              min="20"
              max="80"
              value={config.entraxe_lambourdes_cm}
              onChange={(e) => onChange({ entraxe_lambourdes_cm: parseInt(e.target.value, 10) || 40 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
            <p className="mt-1 text-3xs text-gray-500">DTU : ≤ 20× épaisseur de lame</p>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Longueur barre lambourde (m)</label>
            <input
              type="number"
              step="0.5"
              min="2.0"
              value={config.longueur_lambourde_m}
              onChange={(e) => onChange({ longueur_lambourde_m: parseFloat(e.target.value) || 4.0 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Options de protection DTU */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-white/5">
          <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-black/20 border border-white/5 hover:border-white/20">
            <input
              type="checkbox"
              checked={config.double_lambourdage_aboutage}
              onChange={(e) => onChange({ double_lambourdage_aboutage: e.target.checked })}
              className="rounded border-white/20 text-orange-600 focus:ring-0"
            />
            <span className="text-2xs text-gray-300 font-medium">Double lambourdage aux aboutages (DTU 51.4)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-black/20 border border-white/5 hover:border-white/20">
            <input
              type="checkbox"
              checked={config.bande_etancheite_epdm}
              onChange={(e) => onChange({ bande_etancheite_epdm: e.target.checked })}
              className="rounded border-white/20 text-orange-600 focus:ring-0"
            />
            <span className="text-2xs text-gray-300 font-medium">Bande de protection bitumineuse / EPDM</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-black/20 border border-white/5 hover:border-white/20">
            <input
              type="checkbox"
              checked={config.cales_isolation}
              onChange={(e) => onChange({ cales_isolation: e.target.checked })}
              className="rounded border-white/20 text-orange-600 focus:ring-0"
            />
            <span className="text-2xs text-gray-300 font-medium">Cales d&apos;isolation sous lambourdes</span>
          </label>
        </div>
      </div>

      {/* 4. PLOTS & SUPPORTS */}
      <div className="rounded-2xl border border-white/10 bg-[#16181d] p-5 shadow-lg">
        <h3 className="text-xs font-bold uppercase tracking-wider text-yellow-400 flex items-center gap-2 mb-4">
          🟡 4. Plots & Fondations
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-3xs font-medium text-gray-400">Type de plots</label>
            <select
              value={config.type_plots}
              onChange={(e) => onChange({ type_plots: e.target.value as TypePlots })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
            >
              <option value="reglables">Plots réglables PVC haute résistance</option>
              <option value="autonivelants">Plots autonivelants (rattrapage pente)</option>
              <option value="cales_plates">Cales plates crantées</option>
              <option value="plots_beton">Plots béton préfabriqués</option>
              <option value="vis_fondation">Vis de fondation / pieux vissés</option>
            </select>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Entraxe des plots (cm)</label>
            <input
              type="number"
              min="30"
              max="100"
              value={config.entraxe_plots_cm}
              onChange={(e) => onChange({ entraxe_plots_cm: parseInt(e.target.value, 10) || 60 })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
            />
            <p className="mt-1 text-3xs text-gray-500">Portée max lambourde : ~60-70 cm</p>
          </div>
          <div>
            <label className="text-3xs font-medium text-gray-400">Plage de réglage des plots</label>
            <select
              value={config.hauteur_reglage_plots}
              onChange={(e) => onChange({ hauteur_reglage_plots: e.target.value as HauteurReglagePlots })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
            >
              <option value="20_30">20 à 30 mm</option>
              <option value="40_60">40 à 60 mm (Standard)</option>
              <option value="60_90">60 à 90 mm</option>
              <option value="90_150">90 à 150 mm</option>
              <option value="150_260">150 à 260 mm</option>
            </select>
          </div>
          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-black/20 border border-white/5 hover:border-white/20 w-full">
              <input
                type="checkbox"
                checked={config.geotextile}
                onChange={(e) => onChange({ geotextile: e.target.checked })}
                className="rounded border-white/20 text-yellow-500 focus:ring-0"
              />
              <span className="text-2xs text-gray-300 font-medium">Feutre géotextile anti-repousse</span>
            </label>
          </div>
        </div>
      </div>

      {/* 5. ESCALIERS & GARDE-CORPS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ESCALIER */}
        <div className="rounded-2xl border border-white/10 bg-[#16181d] p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              🪜 Escaliers & Marches
            </h3>
            <label className="flex items-center gap-2 cursor-pointer text-2xs text-gray-400">
              <input
                type="checkbox"
                checked={config.presence_escalier}
                onChange={(e) => onChange({ presence_escalier: e.target.checked })}
                className="rounded border-white/20 text-emerald-500 focus:ring-0"
              />
              Activer l&apos;escalier
            </label>
          </div>

          {config.presence_escalier && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-3xs font-medium text-gray-400">Nombre de marches</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={config.escalier_nb_marches}
                  onChange={(e) => onChange({ escalier_nb_marches: parseInt(e.target.value, 10) || 1 })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-3xs font-medium text-gray-400">Largeur emmarchement (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.8"
                  value={config.escalier_largeur_m}
                  onChange={(e) => onChange({ escalier_largeur_m: parseFloat(e.target.value) || 1.5 })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-3xs font-medium text-gray-400">Giron de marche (cm)</label>
                <input
                  type="number"
                  min="20"
                  max="40"
                  value={config.escalier_giron_cm}
                  onChange={(e) => onChange({ escalier_giron_cm: parseFloat(e.target.value) || 28 })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-3xs font-medium text-gray-400">Hauteur de marche (cm)</label>
                <input
                  type="number"
                  min="12"
                  max="22"
                  value={config.escalier_hauteur_marche_cm}
                  onChange={(e) => onChange({ escalier_hauteur_marche_cm: parseFloat(e.target.value) || 16 })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* GARDE-CORPS */}
        <div className="rounded-2xl border border-white/10 bg-[#16181d] p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-2">
              🛡️ Garde-corps (NF P01-012)
            </h3>
            <label className="flex items-center gap-2 cursor-pointer text-2xs text-gray-400">
              <input
                type="checkbox"
                checked={config.presence_garde_corps}
                onChange={(e) => onChange({ presence_garde_corps: e.target.checked })}
                className="rounded border-white/20 text-sky-500 focus:ring-0"
              />
              Activer le garde-corps
            </label>
          </div>

          {config.presence_garde_corps && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="text-3xs font-medium text-gray-400">Longueur totale (ml)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={config.garde_corps_longueur_ml}
                  onChange={(e) => onChange({ garde_corps_longueur_ml: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-3xs font-medium text-gray-400">Modèle</label>
                <select
                  value={config.garde_corps_type}
                  onChange={(e) => onChange({ garde_corps_type: e.target.value as TypeGardeCorps })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                >
                  <option value="bois_cables">Poteaux bois + câbles inox</option>
                  <option value="alu_verre">Aluminium + verre trempé</option>
                  <option value="tout_bois">Tout bois (lisses & main courante)</option>
                  <option value="metal_barreaudage">Métal barreaudé</option>
                </select>
              </div>
              <div>
                <label className="text-3xs font-medium text-gray-400">Hauteur (cm)</label>
                <input
                  type="number"
                  min="80"
                  value={config.garde_corps_hauteur_cm}
                  onChange={(e) => onChange({ garde_corps_hauteur_cm: parseInt(e.target.value, 10) || 100 })}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white"
                />
                <p className="mt-1 text-3xs text-gray-500">Norme : min 100 cm</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
