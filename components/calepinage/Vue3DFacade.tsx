"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Module, ModuleGroup, Opening, ChantierZone } from "@/types/calepinage";
import type { ModuleAffichable } from "@/hooks/calepinage/useCanvasRenderer";
import { use3DGestures } from "@/hooks/calepinage/use3DGestures";
import { couleurGroupe } from "@/lib/calepinage/palette";
import { libelleMateriau, libelleTraitement } from "@/lib/calepinage/bordereau";
import { calculerCalepinage } from "@/lib/calepinageCalcul";
import { calculerPose } from "@/lib/poseCalcul";
import { BardagePlan3D, type Facade3DData } from "@/components/calepinage/BardagePlan3D";
import { Layers, Box } from "lucide-react";
import {
  MAX_ELEMENTS_DOM,
  ELEMENTS_FIXES,
  PERSPECTIVE_PX,
  VUE_DE_FACE,
  Z_MODULE,
  Z_MUR,
  Z_OUVERTURE,
  bornerVue,
  doitSimplifier,
  echelleScene,
  moduleSousTap,
  rectVisible,
  rectanglesGroupes,
  transformProfondeur,
  transformScene,
  type Vue3D,
} from "@/lib/calepinage/css3d";

// Vue 3D légère de la façade : CSS 3D transforms uniquement (perspective, rotateX,
// rotateY, translateZ, preserve-3d) — aucune librairie 3D.
//
// BUDGET DOM : au plus MAX_ELEMENTS_DOM (200) éléments dans le conteneur. Pour ne
// pas gaspiller ce budget, un module n'est qu'UN div : son libellé est un nœud
// texte et le « F » (retourné) est un pseudo-élément ::before. Au-delà de 200 :
// « Vue simplifiée » — seuls les contours des groupes sont dessinés.
//
// PERFORMANCE : la vue (rotation / zoom) vit dans des refs et est écrite
// directement dans le style de la scène (aucun re-render React pendant un geste).
// `will-change: transform` n'est posé que sur la scène, seul élément animé :
// les enfants sont statiques dans son repère. Aucun box-shadow.

export interface Vue3DFacadeProps {
  /** Modules posés (chantier_zones_modules). `repere` (facultatif) sert de libellé. */
  modules: ModuleAffichable[];
  /** Groupes de modules (palette de couleurs). */
  groups: ModuleGroup[];
  /** Ouvertures positionnées, affichées hachurées. */
  openings?: Opening[];
  /** Largeur totale de la zone en mm. */
  zoneWidthMm: number;
  /** Hauteur totale de la zone en mm. */
  zoneHeightMm: number;
  /** Données complètes de la zone Chantier (permet la vue 3D éclatée DTU). */
  zone?: ChantierZone;
  onModuleSelect?: (module: Module) => void;
  /** Appelé quand un tap hors module désélectionne. */
  onModuleDeselect?: () => void;
}

// Hauteur disponible : écran − header (56) − bottom nav (64) − padding (32).
const HAUTEUR = "calc(100dvh - 56px - 64px - 32px)";

const COULEUR_BORD = "#374151";
const COULEUR_COUPE = "#dc2626";
const COULEUR_SELECTION = "#facc15";
const HACHURES =
  "repeating-linear-gradient(45deg, #6b7280 0px, #6b7280 2px, transparent 2px, transparent 8px)";
const OMBRE_TEXTE = "0 0 2px #000, 0 0 3px #000";

// Une seule balise <style> (1 élément) pour le « F » : évite un enfant par module.
const CSS_MODULE =
  '.cal3d-module[data-f]::before{content:"F";position:absolute;top:1px;left:3px;' +
  "font:700 10px system-ui,sans-serif;color:#dc2626;text-shadow:0 0 2px #fff,0 0 3px #fff}";

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function FicheModule({ module, onClose }: { module: ModuleAffichable; onClose: () => void }) {
  const lignes: [string, string][] = [
    ["Repère", module.repere ?? "—"],
    ["Dimensions", `${module.width_mm} × ${module.height_mm} mm`],
    ["Position", `x ${module.x_mm} · y ${module.y_mm} mm`],
    ["Traitement", libelleTraitement(module.treatment)],
    ["Matériau", libelleMateriau(module.material)],
    [
      "État",
      [module.is_cut && "Coupé", module.is_rotated && "Pivoté", module.is_flipped && "Retourné"]
        .filter(Boolean)
        .join(" · ") || "Standard",
    ],
  ];
  return (
    <section
      aria-label={`Module ${module.group_number}`}
      className="fixed inset-x-0 bottom-0 z-[200] space-y-2 rounded-t-2xl border-t border-[#333] bg-[#181818] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">Module {module.group_number}</h2>
        <button
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-gray-300 active:bg-[#2a2a2a]"
        >
          ✕
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {lignes.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-gray-400">{k}</dt>
            <dd className="font-bold">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function Vue3DFacade({
  modules,
  groups,
  openings,
  zoneWidthMm,
  zoneHeightMm,
  zone,
  onModuleSelect,
  onModuleDeselect,
}: Vue3DFacadeProps) {
  const [modeRendu, setModeRendu] = useState<"css3d" | "dtu">("dtu");
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<Vue3D>({ ...VUE_DE_FACE });
  const rafRef = useRef<number | null>(null);

  const [taille, setTaille] = useState({ w: 0, h: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // null = tout est visible (état initial, avant le premier calcul de culling).
  const [visibles, setVisibles] = useState<Set<string> | null>(null);

  const ouvertures = useMemo(() => openings ?? [], [openings]);
  const echelle = echelleScene(taille.w, taille.h, zoneWidthMm, zoneHeightMm);
  const simplifie = doitSimplifier(modules.length, ouvertures.length);
  const numeros = useMemo(() => groups.map((g) => g.group_number), [groups]);

  // Callbacks parents et paramètres courants gardés en ref : les gestes et le
  // culling (hors cycle de rendu) lisent toujours la dernière valeur.
  const onSelectRef = useRef(onModuleSelect);
  const onDeselectRef = useRef(onModuleDeselect);
  const paramsRef = useRef({ modules, taille, echelle, simplifie, zw: zoneWidthMm, zh: zoneHeightMm });
  useEffect(() => {
    onSelectRef.current = onModuleSelect;
    onDeselectRef.current = onModuleDeselect;
    paramsRef.current = { modules, taille, echelle, simplifie, zw: zoneWidthMm, zh: zoneHeightMm };
  });

  // Taille du conteneur (la hauteur dépend du viewport).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entree]) => {
      const { width, height } = entree.contentRect;
      setTaille((t) => (t.w === width && t.h === height ? t : { w: width, h: height }));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Culling : au plus un calcul par frame ; setState seulement si l'ensemble change.
  const planifierCulling = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const p = paramsRef.current;
      if (p.simplifie || p.echelle <= 0) {
        setVisibles(null);
        return;
      }
      const ids = new Set<string>();
      for (const m of p.modules) {
        if (rectVisible(m, Z_MODULE, viewRef.current, p.echelle, p.zw, p.zh, p.taille.w, p.taille.h)) {
          ids.add(m.id);
        }
      }
      setVisibles((prev) =>
        prev && prev.size === ids.size && [...ids].every((id) => prev.has(id)) ? prev : ids,
      );
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const applyView = useCallback(
    (rotateX: number, rotateY: number, zoom: number) => {
      const v = bornerVue({ rotateX, rotateY, zoom });
      viewRef.current.rotateX = v.rotateX;
      viewRef.current.rotateY = v.rotateY;
      viewRef.current.zoom = v.zoom;
      if (sceneRef.current) sceneRef.current.style.transform = transformScene(v);
      planifierCulling();
    },
    [planifierCulling],
  );

  const resetView = useCallback(() => applyView(0, 0, 1), [applyView]);

  // La scène (re)monte quand la taille devient connue : on lui applique la vue courante.
  useLayoutEffect(() => {
    const v = viewRef.current;
    applyView(v.rotateX, v.rotateY, v.zoom);
  }, [echelle, simplifie, modules, applyView]);

  const onTap = useCallback((x: number, y: number) => {
    const p = paramsRef.current;
    const m = moduleSousTap(p.modules, x - p.taille.w / 2, y - p.taille.h / 2, viewRef.current, p.echelle, p.zw, p.zh);
    setSelectedId(m ? m.id : null);
    if (m) onSelectRef.current?.(m);
    else onDeselectRef.current?.();
  }, []);

  use3DGestures({ surfaceRef: containerRef, viewRef, applyView, resetView, onTap });

  const fermerFiche = useCallback(() => {
    setSelectedId(null);
    onDeselectRef.current?.();
  }, []);

  const zoneValide = zoneWidthMm > 0 && zoneHeightMm > 0;
  const murL = zoneWidthMm * echelle;
  const murH = zoneHeightMm * echelle;
  const selectionne = selectedId ? modules.find((m) => m.id === selectedId) : undefined;

  // Vue simplifiée : le budget DOM restant est réparti ouvertures puis groupes.
  const reste = MAX_ELEMENTS_DOM - ELEMENTS_FIXES - 1; // 1 = bandeau « Vue simplifiée »
  const ouverturesRendues = simplifie ? ouvertures.slice(0, reste) : ouvertures;
  const rectsGroupes = useMemo(
    () => (simplifie ? rectanglesGroupes(modules, groups).slice(0, Math.max(0, reste - ouvertures.length)) : []),
    [simplifie, modules, groups, ouvertures.length, reste],
  );

  // Construction des données Facade3DData pour la vue 3D éclatée DTU (BardagePlan3D)
  const facade3DData = useMemo<Facade3DData | null>(() => {
    const W = zone?.largeur ? zone.largeur : zoneWidthMm / 1000;
    const H = zone?.hauteur_mur ? zone.hauteur_mur : zoneHeightMm / 1000;
    if (W <= 0 || H <= 0) return null;

    const estPignon = zone?.type === "pignon";
    const hFaite = zone?.hauteur_faite ?? (estPignon ? H * 1.3 : undefined);

    const rawLongueurMm = zone?.plaque_longueur_mm && zone.plaque_longueur_mm > 0 ? (zone.plaque_longueur_mm < 20 ? zone.plaque_longueur_mm * 1000 : zone.plaque_longueur_mm) : 3050;
    const rawLargeurMm = zone?.plaque_largeur_mm && zone.plaque_largeur_mm > 0 ? (zone.plaque_largeur_mm < 20 ? zone.plaque_largeur_mm * 1000 : zone.plaque_largeur_mm) : 1300;
    const modLargeurMm = zone?.module_largeur_mm && zone.module_largeur_mm > 0 ? (zone.module_largeur_mm < 20 ? zone.module_largeur_mm * 1000 : zone.module_largeur_mm) : 1000;
    const modHauteurMm = zone?.module_hauteur_mm && zone.module_hauteur_mm > 0 ? (zone.module_hauteur_mm < 20 ? zone.module_hauteur_mm * 1000 : zone.module_hauteur_mm) : 600;

    const cal = calculerCalepinage({
      zoneLargeurM: W,
      zoneHauteurM: H,
      plaqueLongueurMm: rawLongueurMm,
      plaqueLargeurMm: rawLargeurMm,
      moduleLargeurMm: modLargeurMm,
      moduleHauteurMm: modHauteurMm,
      sensPose: "horizontal",
      estPignon,
      hauteurFaiteM: hFaite,
      autoriserRotation: true,
      minRiveWidthMm: 250,
      antiMicroPignon: true,
    });

    const pose = calculerPose(
      (zone?.famille_pose as any) ?? "hpl",
      W,
      hFaite ?? H,
      zone?.angle ?? false,
      1,
      modLargeurMm,
      {
        epaisseurIsolantMm: 120,
        typeIsolant: "laine_roche",
        moduleLargeurMm: modLargeurMm,
        moduleHauteurMm: modHauteurMm,
      }
    );

    const ouverturesCalculees = ouvertures.map((o) => ({
      id: o.id,
      nom: o.type === "porte" ? "Porte" : "Fenêtre",
      type: (o.type === "porte" ? "porte" : "fenetre") as "porte" | "fenetre",
      xM: o.x_mm / 1000,
      yM: o.y_mm / 1000,
      largeurM: o.width_mm / 1000,
      hauteurM: o.height_mm / 1000,
      surfaceM2: (o.width_mm * o.height_mm) / 1000000,
    }));

    return {
      id: zone?.id || "zone-calepinage",
      nom: zone?.nom || "Façade bardage",
      famille: (zone?.famille_pose as any) ?? "hpl",
      L: W,
      Hm: hFaite ?? H,
      hMurM: H,
      hFaiteM: hFaite,
      estPignon,
      surfaceM2: W * H,
      cal,
      pose,
      ouverturesCalculees,
    };
  }, [zone, zoneWidthMm, zoneHeightMm, ouvertures]);

  const placement = (r: { x_mm: number; y_mm: number; width_mm: number; height_mm: number }) => ({
    position: "absolute" as const,
    left: r.x_mm * echelle,
    top: r.y_mm * echelle,
    width: r.width_mm * echelle,
    height: r.height_mm * echelle,
    boxSizing: "border-box" as const,
  });

  return (
    <div className="space-y-2">
      {/* Sélecteur de mode 3D : Vue Éclatée DTU vs Modules CSS 3D */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setModeRendu("dtu")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
              modeRendu === "dtu"
                ? "bg-orange-500 text-white shadow-sm shadow-orange-500/20"
                : "bg-slate-800 text-slate-300 border border-slate-700 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Coupe 3D Éclatée DTU
          </button>
          <button
            type="button"
            onClick={() => setModeRendu("css3d")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
              modeRendu === "css3d"
                ? "bg-sky-500 text-slate-950 shadow-sm shadow-sky-500/20"
                : "bg-slate-800 text-slate-300 border border-slate-700 hover:text-white"
            }`}
          >
            <Box className="w-3.5 h-3.5" /> Modules CSS 3D ({modules.length})
          </button>
        </div>
        <span className="text-[11px] text-slate-400 hidden sm:inline">
          {modeRendu === "dtu" ? "Support + ITE + Chevrons + Panneaux" : "Trame calepinée interactive"}
        </span>
      </div>

      {modeRendu === "dtu" && facade3DData ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-2 sm:p-3">
          <BardagePlan3D activeFacade={facade3DData} allFacades={[facade3DData]} />
        </div>
      ) : (
        <div
          ref={containerRef}
          role="img"
          aria-label={`Vue 3D de la façade, ${modules.length} modules`}
          className="relative select-none rounded-xl"
          style={{
            perspective: `${PERSPECTIVE_PX}px`,
            width: "100%",
            height: HAUTEUR,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f3f4f6",
            touchAction: "none",
          }}
        >
        {zoneValide && echelle > 0 && (
          <div
            ref={sceneRef}
            style={{
              transformStyle: "preserve-3d",
              position: "relative",
              // Dimensions explicites : une scène `fit-content` dont tous les enfants
              // sont en absolute s'effondre à 0×0 et pivoterait autour de son coin.
              width: murL,
              height: murH,
              flexShrink: 0,
              willChange: "transform",
            }}
          >
            <style>{CSS_MODULE}</style>

            {/* Mur de façade (fond) */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: murL,
                height: murH,
                background: "#e5e7eb",
                transform: transformProfondeur(Z_MUR),
              }}
            />

            {/* Ouvertures : entre le mur et les modules */}
            {ouverturesRendues.map((o) => (
              <div
                key={o.id}
                style={{
                  ...placement(o),
                  backgroundColor: "#9ca3af",
                  backgroundImage: HACHURES,
                  transform: transformProfondeur(Z_OUVERTURE),
                }}
              />
            ))}

            {simplifie
              ? rectsGroupes.map((g) => (
                  <div
                    key={g.groupNumber}
                    style={{
                      ...placement(g),
                      border: `2px solid ${g.couleur}`,
                      background: `${g.couleur}33`,
                      transform: transformProfondeur(Z_MODULE),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 12,
                      textShadow: OMBRE_TEXTE,
                      overflow: "hidden",
                    }}
                  >
                    {g.groupNumber}
                  </div>
                ))
              : modules.map((m) => {
                  if (visibles && !visibles.has(m.id)) return null;
                  const w = m.width_mm * echelle;
                  const h = m.height_mm * echelle;
                  const libelle = m.repere ?? m.group_number;
                  const taillePolice = borne(Math.min(w / (libelle.length * 0.6 + 1), h * 0.5), 8, 16);
                  const choisi = m.id === selectedId;
                  const couleurBord = choisi ? COULEUR_SELECTION : m.is_cut ? COULEUR_COUPE : COULEUR_BORD;
                  return (
                    <div
                      key={m.id}
                      className="cal3d-module"
                      data-f={m.is_flipped ? "1" : undefined}
                      style={{
                        ...placement(m),
                        background: couleurGroupe(m.group_number, numeros),
                        border: `${choisi || m.is_cut ? 2 : 1}px solid ${couleurBord}`,
                        transform: transformProfondeur(Z_MODULE),
                        transformStyle: "preserve-3d",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: taillePolice,
                        textShadow: OMBRE_TEXTE,
                      }}
                    >
                      {w >= 14 && h >= 12 ? libelle : null}
                    </div>
                  );
                })}
          </div>
        )}

        {simplifie && zoneValide && (
          <p className="pointer-events-none absolute left-2 top-2 rounded-lg bg-black/60 px-3 py-1 text-xs font-bold text-white">
            Vue simplifiée
          </p>
        )}
        {!zoneValide && (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-slate-500">
            Dimensions de la zone manquantes : la vue 3D ne peut pas être affichée.
          </p>
        )}
      </div>
      )}

      {selectionne && <FicheModule module={selectionne} onClose={fermerFiche} />}
    </div>
  );
}
