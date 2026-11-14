"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import type {
  ChantierTerrasseConfig,
  ConfigTerrasseMobile,
  EssenceBois,
  HauteurReglagePlots,
  ModeTerrasseMobile,
  SensRefoulementTerrasseMobile,
  SystemeTerrasse,
  TypeFixation,
  TypeGardeCorps,
  TypeLambourde,
  TypeMotorisationTerrasse,
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
import { useCatalogueTerrasse } from "@/hooks/useCatalogueTerrasse";
import { fmtEuro } from "@/lib/financeCalculs";
import { estPrestationMainOeuvre, filtrerAccessoiresCompatibles } from "@/lib/terrasse/compatAccessoires";

const formatLame = (l: {
  essence: string | null
  longueur_mm: number | null
  largeur_utile_mm: number | null
  epaisseur_mm: number | null
}) => {
  const essence = l.essence || "?"
  const lon = l.longueur_mm ?? "?"
  const lar = l.largeur_utile_mm ?? "?"
  const ep = l.epaisseur_mm ?? "?"
  return `${essence} | ${lon}mm x ${lar}mm x ${ep}mm`
}

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
  const { lames, accessoires, loading } = useCatalogueTerrasse();

  const lamesTriees = useMemo(() => {
    return [...lames].sort((a, b) => {
      const ea = (a.essence || "").localeCompare(b.essence || "");
      if (ea !== 0) return ea;
      const la = (a.longueur_mm || 0) - (b.longueur_mm || 0);
      if (la !== 0) return la;
      const lb = (a.largeur_utile_mm || 0) - (b.largeur_utile_mm || 0);
      if (lb !== 0) return lb;
      return (a.epaisseur_mm || 0) - (b.epaisseur_mm || 0);
    });
  }, [lames]);

  const lameSelectionnee = useMemo(
    () => lamesTriees.find((l) => l.id === ((config as any)?.lame_id ?? "") as string),
    [lamesTriees, config]
  );

  const surfaceTotale = useMemo(() => (config.longueur_m || 0) * (config.largeur_m || 0), [config]);

  // Les prestations de main-d'œuvre (`type_cout === "main_oeuvre"`) ne sont pas
  // des accessoires matériels : elles sont écartées AVANT toute sélection et
  // tout calcul de prix (cf. audit « Prestations / Main-d'œuvre »). Les lignes
  // antérieures sans `type_cout` restent traitées comme matérielles.
  const accessoiresMateriels = useMemo(
    () => accessoires.filter((a) => !estPrestationMainOeuvre(a)),
    [accessoires]
  );

  const accessoiresCompatibles = useMemo(() => {
    if (!lameSelectionnee) return [];
    return filtrerAccessoiresCompatibles(
      accessoiresMateriels,
      lameSelectionnee.id,
      lameSelectionnee.type_material
    );
  }, [accessoiresMateriels, lameSelectionnee]);

  const clips = accessoiresCompatibles.filter((a) => (a.categorie || "").toLowerCase() === "clip");
  const lambourdes = accessoiresCompatibles.filter((a) => (a.categorie || "").toLowerCase() === "lambourde");
  const plots = accessoiresCompatibles.filter((a) => (a.categorie || "").toLowerCase() === "plot");

  const nbLames = useMemo(() => {
    const largeurUtile = lameSelectionnee?.largeur_utile_mm || config.largeur_lame_mm || 0;
    if (!surfaceTotale || !largeurUtile) return 0;
    const esp = (config.espacement_lames_mm || 0) / 1000;
    const effective = (largeurUtile / 1000) + esp;
    const ratio = surfaceTotale / (config.longueur_m * effective);
    const base = (config.longueur_m * config.largeur_m) / ((largeurUtile / 1000) * (config.longueur_lame_m || 1));
    const nb = Math.ceil(base * (config.coef_perte_lames || 1.1));
    return nb > 0 ? nb : Math.ceil(ratio * (config.coef_perte_lames || 1.1) || 0);
  }, [lameSelectionnee, config, surfaceTotale]);

  const prixEstimeHT = useMemo(() => {
    let total = 0;
    let auMoinsUnPrixConnu = false;

    // 1. Lames (prix unitaire ou repli prix m² * surface)
    const surfaceACommander = surfaceTotale * (config.coef_perte_lames || 1.1);
    if (lameSelectionnee) {
      if (
        typeof lameSelectionnee.prix_unitaire_lame === "number" &&
        Number.isFinite(lameSelectionnee.prix_unitaire_lame) &&
        lameSelectionnee.prix_unitaire_lame > 0
      ) {
        total += lameSelectionnee.prix_unitaire_lame * (nbLames || 0);
        auMoinsUnPrixConnu = true;
      } else if (
        typeof lameSelectionnee.prix_m2_ht === "number" &&
        Number.isFinite(lameSelectionnee.prix_m2_ht) &&
        lameSelectionnee.prix_m2_ht > 0
      ) {
        total += lameSelectionnee.prix_m2_ht * surfaceACommander;
        auMoinsUnPrixConnu = true;
      }
    }

    // 2. Accessoires sélectionnés (uniquement ceux explicitement choisis ou uniques)
    const qtyAcc = ((config as any)?.quantite_accessoires ?? {}) || {};

    // Clips
    const clipId = (config as any)?.clip_id;
    const clipSel = clipId
      ? clips.find((c) => c.id === clipId)
      : clips.length === 1
      ? clips[0]
      : null;
    if (clipSel && clipSel.type_cout !== "main_oeuvre") {
      const qte =
        typeof qtyAcc.clip === "number"
          ? qtyAcc.clip
          : clipId
          ? 1
          : Object.prototype.hasOwnProperty.call(qtyAcc, "clip")
          ? 1
          : 0;
      if (
        typeof clipSel.prix_conditionnement === "number" &&
        Number.isFinite(clipSel.prix_conditionnement) &&
        clipSel.prix_conditionnement >= 0 &&
        qte > 0
      ) {
        total += clipSel.prix_conditionnement * qte;
        auMoinsUnPrixConnu = true;
      }
    }

    // Lambourdes
    const lambourdeId = (config as any)?.lambourde_id;
    const lambSel = lambourdeId
      ? lambourdes.find((l) => l.id === lambourdeId)
      : lambourdes.length === 1
      ? lambourdes[0]
      : null;
    if (lambSel && lambSel.type_cout !== "main_oeuvre") {
      const qte =
        typeof qtyAcc.lambourde === "number"
          ? qtyAcc.lambourde
          : lambourdeId
          ? 1
          : Object.prototype.hasOwnProperty.call(qtyAcc, "lambourde")
          ? 1
          : 0;
      if (
        typeof lambSel.prix_conditionnement === "number" &&
        Number.isFinite(lambSel.prix_conditionnement) &&
        lambSel.prix_conditionnement >= 0 &&
        qte > 0
      ) {
        total += lambSel.prix_conditionnement * qte;
        auMoinsUnPrixConnu = true;
      }
    }

    // Plots
    const plotId = (config as any)?.plot_id;
    const plotSel = plotId
      ? plots.find((p) => p.id === plotId)
      : plots.length === 1
      ? plots[0]
      : null;
    if (plotSel && plotSel.type_cout !== "main_oeuvre") {
      const qte =
        typeof qtyAcc.plot === "number"
          ? qtyAcc.plot
          : plotId
          ? 1
          : Object.prototype.hasOwnProperty.call(qtyAcc, "plot")
          ? 1
          : 0;
      if (
        typeof plotSel.prix_conditionnement === "number" &&
        Number.isFinite(plotSel.prix_conditionnement) &&
        plotSel.prix_conditionnement >= 0 &&
        qte > 0
      ) {
        total += plotSel.prix_conditionnement * qte;
        auMoinsUnPrixConnu = true;
      }
    }

    return auMoinsUnPrixConnu ? total : null;
  }, [lameSelectionnee, nbLames, surfaceTotale, clips, lambourdes, plots, config]);

  return (
    <div className="space-y-6">
      {/* 0. SYSTÈME MÉTIER & ENVIRONNEMENT */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
            ⚙️ Système Constructif & Environnement
          </h3>
          {(zoneActuelle === "piscine" || zoneActuelle === "littoral") && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
              ⚓ Inox A4 Marine (AISI 316) obligatoire
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Sélection du système constructif */}
          <div>
            <label className="text-xs font-semibold text-[#777777]">Système de terrasse</label>
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
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            >
              <option value="bois_vis">🪵 Bois Naturel — Vissage Apparent (DTU 51.4)</option>
              <option value="bois_clip">🪚 Bois Naturel — Clips Invisibles (Avis Techniques)</option>
              <option value="composite_clip">🧱 Terrasse Composite — Clips Invisibles (DTA GS 2.1)</option>
            </select>
          </div>

          {/* Sélection de la zone environnementale */}
          <div>
            <label className="text-xs font-semibold text-[#777777]">Zone Environnementale</label>
            <select
              value={zoneActuelle}
              onChange={(e) => onChange({ zone_environnement: e.target.value as ZoneEnvironnement })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
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
                <label className="text-xs font-semibold text-[#777777]">Fabricant Composite</label>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    dtaExpire
                      ? "bg-amber-50 text-amber-900 border border-amber-200"
                      : "bg-emerald-50 text-emerald-800 border border-emerald-200"
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
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
              >
                {Object.values(FABRICANTS_COMPOSITE).map((fab) => (
                  <option key={fab.id} value={fab.id}>
                    {fab.nom} ({fab.dta.numero})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-[#777777]">
                DTA {fabricantComposite.dta.numero} • Expiration {fabricantComposite.dta.expirationDTA}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 1. GÉOMÉTRIE & SOL */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2 mb-4">
          📐 1. Géométrie & Implantation
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="text-xs font-semibold text-[#777777]">Longueur (m)</label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              value={config.longueur_m}
              onChange={(e) => onChange({ longueur_m: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Largeur (m)</label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              value={config.largeur_m}
              onChange={(e) => onChange({ largeur_m: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Hauteur sol fini (cm)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={config.hauteur_sol_cm}
              onChange={(e) => onChange({ hauteur_sol_cm: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Type de support / sol</label>
            <select
              value={config.type_sol}
              onChange={(e) => onChange({ type_sol: e.target.value as TypeSol })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            >
              <option value="dalle_beton">Dalle béton existante</option>
              <option value="terre_meuble">Terre naturelle / Sol meuble</option>
              <option value="stabilise_grave">Grave / Tout-venant stabilisé</option>
              <option value="etancheite_toit">Toiture terrasse / Étanchéité</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Pente d&apos;écoulement (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={config.pente_pct}
              onChange={(e) => onChange({ pente_pct: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            />
            <p className="mt-1 text-[11px] text-[#777777]">Min 1.5% selon DTU 51.4</p>
          </div>
        </div>
      </div>

      {/* 2. LAMES DE PLATELAGE */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
            🌲 2. Lames de platelage (DTU 51.4)
          </h3>
          <Link
            href="/bureau/catalogue-terrasse"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E5] bg-[#F8F9FA] px-2.5 py-1 text-xs font-semibold text-[#23272B] transition-colors hover:border-[#B85B2B]/40 hover:text-[#B85B2B]"
            title="Ouvrir le catalogue Terrasse (lames & accessoires)"
          >
            <BookOpen className="h-3.5 w-3.5 text-[#B85B2B]" />
            Gérer mes lames
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-[#777777]">Essence de bois</label>
            <select
              value={config.essence_bois}
              onChange={(e) => onChange({ essence_bois: e.target.value as EssenceBois })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
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
            <label className="text-xs font-semibold text-[#777777]">Lame sélectionnée (catalogue Terrasse)</label>
            <select
              value={((config as any)?.lame_id ?? "") as string || ""}
              onChange={(e) => {
                const lid = e.target.value;
                const l = lamesTriees.find((x) => x.id === lid);
                onChange({
                  ...(lid ? { lame_id: lid } : {}),
                  ...(l ? { largeur_lame_mm: l.largeur_utile_mm || config.largeur_lame_mm, epaisseur_lame_mm: l.epaisseur_mm || config.epaisseur_lame_mm, longueur_lame_m: (l.longueur_mm || 0) / 1000 || config.longueur_lame_m, essence_bois: (l.essence || config.essence_bois) as any } : {}),
                } as any);
              }}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            >
              <option value="">-- Choisir une lame --</option>
              {lamesTriees.map((l) => (
                <option key={l.id} value={l.id}>
                  {formatLame(l)}{l.prix_unitaire_lame != null ? ` — ${fmtEuro(Number(l.prix_unitaire_lame))} HT/u` : ""}
                </option>
              ))}
            </select>
            {loading && <p className="mt-1 text-[11px] text-[#777777]">Chargement du catalogue Terrasse...</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Clips compatibles</label>
            <select
              value={((config as any)?.clip_id) || ""}
              onChange={(e) => onChange({ clip_id: e.target.value || undefined } as Partial<ChantierTerrasseConfig> & Record<string, unknown>)}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
              disabled={!lameSelectionnee || clips.length === 0}
            >
              <option value="">{!lameSelectionnee ? "Sélectionner une lame d'abord" : clips.length ? "-- Choisir un clip --" : "Aucun clip compatible"}</option>
              {clips.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.conditionnement || a.id}{a.prix_conditionnement != null ? ` — ${fmtEuro(Number(a.prix_conditionnement))}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Lambourdes compatibles</label>
            <select
              value={((config as any)?.lambourde_id) || ""}
              onChange={(e) => onChange({ lambourde_id: e.target.value || undefined } as Partial<ChantierTerrasseConfig> & Record<string, unknown>)}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
              disabled={!lameSelectionnee || lambourdes.length === 0}
            >
              <option value="">{!lameSelectionnee ? "Sélectionner une lame d'abord" : lambourdes.length ? "-- Choisir une lambourde --" : "Aucune lambourde compatible"}</option>
              {lambourdes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.conditionnement || a.id}{a.prix_conditionnement != null ? ` — ${fmtEuro(Number(a.prix_conditionnement))}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Plots compatibles</label>
            <select
              value={((config as any)?.plot_id) || ""}
              onChange={(e) => onChange({ plot_id: e.target.value || undefined } as Partial<ChantierTerrasseConfig> & Record<string, unknown>)}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
              disabled={!lameSelectionnee || plots.length === 0}
            >
              <option value="">{!lameSelectionnee ? "Sélectionner une lame d'abord" : plots.length ? "-- Choisir un plot --" : "Aucun plot compatible"}</option>
              {plots.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.conditionnement || a.id}{a.prix_conditionnement != null ? ` — ${fmtEuro(Number(a.prix_conditionnement))}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Espacement / jeu entre lames (mm)</label>
            <input
              type="number"
              min="2"
              max="10"
              value={config.espacement_lames_mm}
              onChange={(e) => onChange({ espacement_lames_mm: parseInt(e.target.value, 10) || 5 })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            />
            <p className="mt-1 text-[11px] text-[#777777]">DTU 51.4 : 4 à 7 mm</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Orientation de pose</label>
            <select
              value={config.type_pose}
              onChange={(e) => onChange({ type_pose: e.target.value as TypePose })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            >
              <option value="parallele">Parallèle à la façade / longueur</option>
              <option value="perpendiculaire">Perpendiculaire à la façade</option>
              <option value="diagonale">Diagonale (45°)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Type de fixation</label>
            <select
              value={config.type_fixation}
              onChange={(e) => onChange({ type_fixation: e.target.value as TypeFixation })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            >
              <option value="vis_inox">Vissage apparent inox A2 / A4 (2 vis/appui)</option>
              <option value="clips_invisibles">Clips invisibles (lames rainurées)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Majoration chutes platelage (%)</label>
            <input
              type="number"
              step="0.01"
              min="1.0"
              max="1.3"
              value={config.coef_perte_lames}
              onChange={(e) => onChange({ coef_perte_lames: parseFloat(e.target.value) || 1.1 })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            />
            <p className="mt-1 text-[11px] text-[#777777]">1.10 = +10% de commande</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-3 text-xs text-[#23272B]">
          <div className="flex flex-wrap items-center gap-4">
            <div>Surface : <span className="text-[#23272B] font-bold">{surfaceTotale.toFixed(2)} m²</span></div>
            <div>Nb lames calculé : <span className="text-[#B85B2B] font-bold">{nbLames}</span></div>
            <div>
              Prix estimé HT :{" "}
              {prixEstimeHT !== null ? (
                <span className="text-emerald-700 font-bold">{fmtEuro(prixEstimeHT)}</span>
              ) : (
                <span className="text-amber-700 font-semibold italic">Tarif non renseigné</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. LAMBOURDES & STRUCTURE */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2 mb-4">
          🪵 3. Lambourdes & Ossature porteuse
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-[#777777]">Type de lambourde</label>
            <select
              value={config.type_lambourde}
              onChange={(e) => onChange({ type_lambourde: e.target.value as TypeLambourde })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            >
              <option value="bois_cl4">Pin traité autoclave Classe 4</option>
              <option value="bois_exotique">Bois exotique (Badi / Itauba Cl. 4)</option>
              <option value="alu_structure">Structure profilé aluminium</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Section Largeur × Hauteur (mm)</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min="40"
                value={config.section_largeur_mm}
                onChange={(e) => onChange({ section_largeur_mm: parseInt(e.target.value, 10) || 45 })}
                className="w-1/2 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                placeholder="Larg."
              />
              <span className="text-[#999999]">×</span>
              <input
                type="number"
                min="40"
                value={config.section_hauteur_mm}
                onChange={(e) => onChange({ section_hauteur_mm: parseInt(e.target.value, 10) || 70 })}
                className="w-1/2 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                placeholder="Haut."
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Entraxe des lambourdes (cm)</label>
            <input
              type="number"
              min="20"
              max="80"
              value={config.entraxe_lambourdes_cm}
              onChange={(e) => onChange({ entraxe_lambourdes_cm: parseInt(e.target.value, 10) || 40 })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            />
            <p className="mt-1 text-[11px] text-[#777777]">DTU : ≤ 20× épaisseur de lame</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Longueur barre lambourde (m)</label>
            <input
              type="number"
              step="0.5"
              min="2.0"
              value={config.longueur_lambourde_m}
              onChange={(e) => onChange({ longueur_lambourde_m: parseFloat(e.target.value) || 4.0 })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            />
          </div>
        </div>

        {/* Options de protection DTU */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#F0F0F0]">
          <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5E5] hover:border-[#B85B2B]/40 hover:bg-white transition-all">
            <input
              type="checkbox"
              checked={config.double_lambourdage_aboutage}
              onChange={(e) => onChange({ double_lambourdage_aboutage: e.target.checked })}
              className="rounded border-[#CCCCCC] text-[#B85B2B] focus:ring-0"
            />
            <span className="text-xs text-[#23272B] font-semibold">Double lambourdage aux aboutages (DTU 51.4)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5E5] hover:border-[#B85B2B]/40 hover:bg-white transition-all">
            <input
              type="checkbox"
              checked={config.bande_etancheite_epdm}
              onChange={(e) => onChange({ bande_etancheite_epdm: e.target.checked })}
              className="rounded border-[#CCCCCC] text-[#B85B2B] focus:ring-0"
            />
            <span className="text-xs text-[#23272B] font-semibold">Bande de protection bitumineuse / EPDM</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5E5] hover:border-[#B85B2B]/40 hover:bg-white transition-all">
            <input
              type="checkbox"
              checked={config.cales_isolation}
              onChange={(e) => onChange({ cales_isolation: e.target.checked })}
              className="rounded border-[#CCCCCC] text-[#B85B2B] focus:ring-0"
            />
            <span className="text-xs text-[#23272B] font-semibold">Cales d&apos;isolation sous lambourdes</span>
          </label>
        </div>
      </div>

      {/* 4. PLOTS & SUPPORTS */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2 mb-4">
          🟡 4. Plots & Fondations
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-[#777777]">Type de plots</label>
            <select
              value={config.type_plots}
              onChange={(e) => onChange({ type_plots: e.target.value as TypePlots })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            >
              <option value="reglables">Plots réglables PVC haute résistance</option>
              <option value="autonivelants">Plots autonivelants (rattrapage pente)</option>
              <option value="cales_plates">Cales plates crantées</option>
              <option value="plots_beton">Plots béton préfabriqués</option>
              <option value="vis_fondation">Vis de fondation / pieux vissés</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Entraxe des plots (cm)</label>
            <input
              type="number"
              min="30"
              max="100"
              value={config.entraxe_plots_cm}
              onChange={(e) => onChange({ entraxe_plots_cm: parseInt(e.target.value, 10) || 60 })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            />
            <p className="mt-1 text-[11px] text-[#777777]">Portée max lambourde : ~60-70 cm</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#777777]">Plage de réglage des plots</label>
            <select
              value={config.hauteur_reglage_plots}
              onChange={(e) => onChange({ hauteur_reglage_plots: e.target.value as HauteurReglagePlots })}
              className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B] focus:ring-1 focus:ring-[#B85B2B] transition-all"
            >
              <option value="20_30">20 à 30 mm</option>
              <option value="40_60">40 à 60 mm (Standard)</option>
              <option value="60_90">60 à 90 mm</option>
              <option value="90_150">90 à 150 mm</option>
              <option value="150_260">150 à 260 mm</option>
            </select>
          </div>
          <div className="flex items-center pt-5">
            <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5E5] hover:border-[#B85B2B]/40 hover:bg-white transition-all w-full">
              <input
                type="checkbox"
                checked={config.geotextile}
                onChange={(e) => onChange({ geotextile: e.target.checked })}
                className="rounded border-[#CCCCCC] text-[#B85B2B] focus:ring-0"
              />
              <span className="text-xs text-[#23272B] font-semibold">Feutre géotextile anti-repousse</span>
            </label>
          </div>
        </div>
      </div>

      {/* 5. ESCALIERS & GARDE-CORPS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ESCALIER */}
        <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
              🪜 Escaliers & Marches
            </h3>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#777777]">
              <input
                type="checkbox"
                checked={config.presence_escalier}
                onChange={(e) => onChange({ presence_escalier: e.target.checked })}
                className="rounded border-[#CCCCCC] text-[#B85B2B] focus:ring-0"
              />
              Activer l&apos;escalier
            </label>
          </div>

          {config.presence_escalier && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-xs font-semibold text-[#777777]">Nombre de marches</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={config.escalier_nb_marches}
                  onChange={(e) => onChange({ escalier_nb_marches: parseInt(e.target.value, 10) || 1 })}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#777777]">Largeur emmarchement (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.8"
                  value={config.escalier_largeur_m}
                  onChange={(e) => onChange({ escalier_largeur_m: parseFloat(e.target.value) || 1.5 })}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#777777]">Giron de marche (cm)</label>
                <input
                  type="number"
                  min="20"
                  max="40"
                  value={config.escalier_giron_cm}
                  onChange={(e) => onChange({ escalier_giron_cm: parseFloat(e.target.value) || 28 })}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#777777]">Hauteur de marche (cm)</label>
                <input
                  type="number"
                  min="12"
                  max="22"
                  value={config.escalier_hauteur_marche_cm}
                  onChange={(e) => onChange({ escalier_hauteur_marche_cm: parseFloat(e.target.value) || 16 })}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                />
              </div>
            </div>
          )}
        </div>

        {/* GARDE-CORPS */}
        <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
              🛡️ Garde-corps (NF P01-012)
            </h3>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#777777]">
              <input
                type="checkbox"
                checked={config.presence_garde_corps}
                onChange={(e) => onChange({ presence_garde_corps: e.target.checked })}
                className="rounded border-[#CCCCCC] text-[#B85B2B] focus:ring-0"
              />
              Activer le garde-corps
            </label>
          </div>

          {config.presence_garde_corps && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="text-xs font-semibold text-[#777777]">Longueur totale (ml)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={config.garde_corps_longueur_ml}
                  onChange={(e) => onChange({ garde_corps_longueur_ml: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#777777]">Modèle</label>
                <select
                  value={config.garde_corps_type}
                  onChange={(e) => onChange({ garde_corps_type: e.target.value as TypeGardeCorps })}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                >
                  <option value="bois_cables">Poteaux bois + câbles inox</option>
                  <option value="alu_verre">Aluminium + verre trempé</option>
                  <option value="tout_bois">Tout bois (lisses & main courante)</option>
                  <option value="metal_barreaudage">Métal barreaudé</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#777777]">Hauteur (cm)</label>
                <input
                  type="number"
                  min="80"
                  value={config.garde_corps_hauteur_cm}
                  onChange={(e) => onChange({ garde_corps_hauteur_cm: parseInt(e.target.value, 10) || 100 })}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                />
                <p className="mt-1 text-2xs text-[#777777]">Norme : min 100 cm</p>
              </div>
            </div>
          )}
        </div>

        {/* TERRASSE MOBILE COULISSANTE SUR RAILS (NF P90-308) */}
        {(() => {
          const currentMob: ConfigTerrasseMobile = config.terrasse_mobile || {
            active: false,
            mode: "1_plateau",
            sens_refoulement: "droite",
            hauteur_chassis_alu_mm: 100,
            jeu_fonctionnel_peripherique_mm: 20,
            type_motorisation: "aucune",
          };

          return (
            <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#B85B2B] flex items-center gap-2">
                  🏊 Terrasse Mobile Coulissante (NF P90-308)
                </h3>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#777777]">
                  <input
                    type="checkbox"
                    checked={Boolean(config.terrasse_mobile?.active)}
                    onChange={(e) => {
                      onChange({
                        terrasse_mobile: { ...currentMob, active: e.target.checked },
                      });
                    }}
                    className="rounded border-[#CCCCCC] text-[#B85B2B] focus:ring-0"
                  />
                  Activer la terrasse mobile
                </label>
              </div>

              {config.terrasse_mobile?.active && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-[#777777]">Mode de plateau</label>
                      <select
                        value={currentMob.mode}
                        onChange={(e) =>
                          onChange({
                            terrasse_mobile: {
                              ...currentMob,
                              mode: e.target.value as ModeTerrasseMobile,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                      >
                        <option value="1_plateau">1 Plateau monobloc</option>
                        <option value="2_demi_plateaux">2 Demi-plateaux (ouverture symétrique)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[#777777]">Sens de refoulement</label>
                      <select
                        value={currentMob.sens_refoulement}
                        onChange={(e) =>
                          onChange({
                            terrasse_mobile: {
                              ...currentMob,
                              sens_refoulement: e.target.value as SensRefoulementTerrasseMobile,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                      >
                        <option value="droite">➡️ Vers la droite (latéral)</option>
                        <option value="gauche">⬅️ Vers la gauche (latéral)</option>
                        <option value="bas">⬇️ Vers le bas (longitudinal)</option>
                        <option value="haut">⬆️ Vers le haut (longitudinal)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[#777777]">Motorisation</label>
                      <select
                        value={currentMob.type_motorisation || "aucune"}
                        onChange={(e) =>
                          onChange({
                            terrasse_mobile: {
                              ...currentMob,
                              type_motorisation: e.target.value as TypeMotorisationTerrasse,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                      >
                        <option value="aucune">Manuelle (sans moteur)</option>
                        <option value="solaire">☀️ Solaire autonome 24V</option>
                        <option value="filaire">🔌 Filaire 230V / 24V TBTS</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-[#777777]">
                        Finition / Essence plateau mobile (Dissociation plage)
                      </label>
                      <select
                        value={currentMob.essence_bois || ""}
                        onChange={(e) =>
                          onChange({
                            terrasse_mobile: {
                              ...currentMob,
                              essence_bois: (e.target.value as EssenceBois) || undefined,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
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

                    {(currentMob.essence_bois === "composite" ||
                      (!currentMob.essence_bois && config.essence_bois === "composite")) && (
                      <div>
                        <label className="text-xs font-semibold text-[#777777]">
                          Teinte composite du plateau mobile
                        </label>
                        <select
                          value={currentMob.teinte_composite || "anthracite"}
                          onChange={(e) =>
                            onChange({
                              terrasse_mobile: {
                                ...currentMob,
                                teinte_composite: e.target.value,
                              },
                            })
                          }
                          className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                        >
                          <option value="anthracite">Gris Anthracite (RAL 7016)</option>
                          <option value="brun">Brun Havane / Marron chaud</option>
                          <option value="gris_clair">Gris Minéral / Clair</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-[#777777]">Hauteur châssis alu (mm)</label>
                      <input
                        type="number"
                        min="60"
                        max="200"
                        step="10"
                        value={currentMob.hauteur_chassis_alu_mm}
                        onChange={(e) =>
                          onChange({
                            terrasse_mobile: {
                              ...currentMob,
                              hauteur_chassis_alu_mm: parseInt(e.target.value, 10) || 100,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-[#777777]">Jeu périphérique (mm)</label>
                      <input
                        type="number"
                        min="10"
                        max="50"
                        step="5"
                        value={currentMob.jeu_fonctionnel_peripherique_mm}
                        onChange={(e) =>
                          onChange({
                            terrasse_mobile: {
                              ...currentMob,
                              jeu_fonctionnel_peripherique_mm: parseInt(e.target.value, 10) || 20,
                            },
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
