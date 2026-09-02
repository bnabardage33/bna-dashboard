"use client";

import { useState, useEffect } from "react";
import {
  calculerPose,
  FamillePose,
  LABELS_FAMILLE,
} from "@/lib/poseCalcul";
import {
  calculerCalepinage,
  SensPose,
} from "@/lib/calepinageCalcul";
import PlanCalepinage from "@/components/PlanCalepinage";
import FicheDebitPDF from "@/components/FicheDebitPDF";
import VisualiseurDebitPlaques from "@/components/VisualiseurDebitPlaques";

type Ouverture = {
  id: string;
  type: "fenetre" | "porte" | "baie" | "porte_fenetre";
  largeur: number;      // m
  hauteur: number;      // m
  /** X : distance depuis l'angle gauche du mur jusqu'au bord gauche de l'ouverture (en m) */
  distanceAngleGaucheM: number;
  /**
   * Y : hauteur d'allège — distance du sol au bas de l'ouverture (en m).
   * Porte / Baie vitrée / Porte-fenêtre = 0 (allège = sol).
   * Fenêtre = saisie libre.
   */
  hauteurAllegeMm: number; // stocké en mm, affiché en mm
};

export type Zone = {
  id: string;
  chantier_id: string;
  type: "facade" | "pignon";
  nom: string;
  largeur: number;
  hauteur_mur: number;
  hauteur_faite: number | null;
  materiau: "lames" | "plaques" | "plaques_hpl" | "fibres_ciment" | string;
  ouvertures: Ouverture[];
  famille_pose: FamillePose | null;
  angle: boolean;
  largeur_lame_mm: number | null;
  plaque_longueur_mm: number | null;
  plaque_largeur_mm: number | null;
  module_largeur_mm?: number | null;
  module_hauteur_mm?: number | null;
  sens_pose: SensPose | null;
  epaisseur_isolant_mm?: number | null;
  type_isolant?: "laine_roche" | "laine_verre" | "sans_isolant" | null;
  surface_paquet_m2?: number | null;
  zone_vent_rive?: boolean | null;
};

export type LigneCommande = {
  designation: string;
  quantite: number;
  unite: string;
};

/* ============================================================
   CALCUL GLOBAL DE LA ZONE
   ============================================================ */

export function calculerZone(zone: Zone) {
  const bruteFacade =
    zone.type === "facade"
      ? zone.largeur * zone.hauteur_mur
      : 0;

  const hFaite = zone.hauteur_faite ?? 0;

  const rectanglePignon =
    zone.type === "pignon"
      ? zone.largeur * zone.hauteur_mur
      : 0;

  const trianglePignon =
    zone.type === "pignon"
      ? (zone.largeur *
          (hFaite - zone.hauteur_mur)) /
        2
      : 0;

  const brutePignon =
    rectanglePignon + trianglePignon;

  const pente =
    zone.type === "pignon" &&
    zone.largeur > 0
      ? ((hFaite - zone.hauteur_mur) /
          (zone.largeur / 2)) *
        100
      : 0;

  const totalOuvertures =
    zone.ouvertures.reduce(
      (s, o) =>
        s + o.largeur * o.hauteur,
      0
    );

  const nombreOuvertures = zone.ouvertures.length;

  const surfaceNette = Math.max(
    0,
    bruteFacade +
      brutePignon -
      totalOuvertures
  );

  const marge =
    zone.materiau === "lames"
      ? 1.1
      : 1.15;

  const surfaceACommander =
    surfaceNette * marge;

  let totalCoupesML = 0;
  if (zone.famille_pose === "hpl" || zone.materiau === "plaques_hpl" || zone.materiau === "fibres_ciment") {
    // Appel du calepinage pour obtenir les coupes
    const rawLongueurMm = zone.plaque_longueur_mm && zone.plaque_longueur_mm > 0 ? (zone.plaque_longueur_mm < 20 ? zone.plaque_longueur_mm * 1000 : zone.plaque_longueur_mm) : 3050;
    const rawLargeurMm = zone.plaque_largeur_mm && zone.plaque_largeur_mm > 0 ? (zone.plaque_largeur_mm < 20 ? zone.plaque_largeur_mm * 1000 : zone.plaque_largeur_mm) : 1300;
    const modLargeurMm = zone.module_largeur_mm && zone.module_largeur_mm > 0 ? (zone.module_largeur_mm < 20 ? zone.module_largeur_mm * 1000 : zone.module_largeur_mm) : 1000;
    const modHauteurMm = zone.module_hauteur_mm && zone.module_hauteur_mm > 0 ? (zone.module_hauteur_mm < 20 ? zone.module_hauteur_mm * 1000 : zone.module_hauteur_mm) : 600;

    const calep = calculerCalepinage({
      zoneLargeurM: zone.largeur,
      zoneHauteurM: zone.hauteur_mur,
      plaqueLongueurMm: rawLongueurMm,
      plaqueLargeurMm: rawLargeurMm,
      moduleLargeurMm: modLargeurMm,
      moduleHauteurMm: modHauteurMm,
      sensPose: zone.sens_pose,
      typePose: "pose_droite",
      estPignon: zone.type === "pignon",
      hauteurFaiteM: zone.hauteur_faite,
      traitDeScieMm: 3,
      jointMm: 8,
      ouvertures: zone.ouvertures ? zone.ouvertures.map(o => ({
        type: o.type === "baie" || o.type === "porte_fenetre" ? "porte" : o.type,
        largeur: o.largeur,
        hauteur: o.hauteur,
        hauteurLinteauM: ((o.hauteurAllegeMm ?? 0) / 1000) + o.hauteur
      })) : null
    });
    totalCoupesML = calep.totalCoupesML || 0;
  } else {
    // Calcul des mètres linéaires de coupe pour les LAMES (Bois, Composite)
    if (zone.sens_pose === "vertical") {
      const coupesBords = 2 * zone.largeur;
      const coupesOuvertures = zone.ouvertures ? zone.ouvertures.reduce((s, o) => s + (2 * o.largeur), 0) : 0;
      totalCoupesML = coupesBords + coupesOuvertures;
    } else {
      const coupesBords = 2 * zone.hauteur_mur;
      const coupesOuvertures = zone.ouvertures ? zone.ouvertures.reduce((s, o) => s + (2 * o.hauteur), 0) : 0;
      totalCoupesML = coupesBords + coupesOuvertures;
    }

    if (zone.type === "pignon" && zone.largeur > 0 && zone.hauteur_faite && zone.hauteur_faite > zone.hauteur_mur) {
      const demiLargeur = zone.largeur / 2;
      const deltaH = zone.hauteur_faite - zone.hauteur_mur;
      const longueurRampant = Math.sqrt(demiLargeur * demiLargeur + deltaH * deltaH);
      totalCoupesML += 2 * longueurRampant;
    }
  }

  return {
    bruteFacade,
    brutePignon,
    pente,
    totalOuvertures,
    nombreOuvertures,
    surfaceNette,
    surfaceACommander,
    totalCoupesML,
  };
}

/* ============================================================
   PARAMÈTRES DE POSE
   ============================================================ */

function labelModule(
  famille: FamillePose | null
) {
  if (famille === "cassette") {
    return "Largeur module cassette (mm)";
  }

  return "Largeur lame (mm)";
}

function defautModule(
  famille: FamillePose | null
) {
  return famille === "cassette"
    ? 600
    : 125;
}

/* ============================================================
   ZONE CARD
   ============================================================ */

export default function ZoneCard({
  zone,
  zoneVent,
  onChange,
  onDelete,
  onCreerCommande,
}: {
  zone: Zone;
  zoneVent: number;
  onChange: (zone: Zone) => void;
  onDelete: (id: string) => void;
  onCreerCommande?: (
    lignes: LigneCommande[],
    zoneNom: string
  ) => void;
}) {
  const [modalDebitOuvert, setModalDebitOuvert] = useState(false);
  const [ongletDebit, setOngletDebit] = useState<"nesting" | "fiche_a4">("nesting");
  const [replie, setReplie] = useState(false);

  const formatPlaquesStd = ["3050x1300", "3650x1860", "2550x1860", "2800x1300", "4100x1300"];
  const currentPlaque = `${zone.plaque_longueur_mm ?? 3050}x${zone.plaque_largeur_mm ?? 1300}`;
  const [isPlaqueCustom, setIsPlaqueCustom] = useState(!formatPlaquesStd.includes(currentPlaque));

  const formatModulesStd = ["1000x600", "1200x800", "1500x450", "600x1200"];
  const currentModule = `${zone.module_largeur_mm ?? 1000}x${zone.module_hauteur_mm ?? 600}`;
  const [isModuleCustom, setIsModuleCustom] = useState(!formatModulesStd.includes(currentModule));

  useEffect(() => {
    const isCustom = !formatPlaquesStd.includes(`${zone.plaque_longueur_mm ?? 3050}x${zone.plaque_largeur_mm ?? 1300}`);
    if (!isCustom && isPlaqueCustom) setIsPlaqueCustom(false);
  }, [zone.plaque_longueur_mm, zone.plaque_largeur_mm]);

  useEffect(() => {
    const isCustom = !formatModulesStd.includes(`${zone.module_largeur_mm ?? 1000}x${zone.module_hauteur_mm ?? 600}`);
    if (!isCustom && isModuleCustom) setIsModuleCustom(false);
  }, [zone.module_largeur_mm, zone.module_hauteur_mm]);

  const calc = calculerZone(zone);

  /*
   * Pour le calcul de pose :
   *
   * façade = hauteur du mur
   * pignon = hauteur totale au faîtage
   */
  const hauteurTotale =
    zone.type === "pignon" &&
    zone.hauteur_faite
      ? zone.hauteur_faite
      : zone.hauteur_mur;

  const pose =
    zone.famille_pose &&
    zone.largeur > 0 &&
    hauteurTotale > 0
      ? calculerPose(
          zone.famille_pose,
          zone.largeur,
          hauteurTotale,
          zone.angle,
          zoneVent,
          zone.largeur_lame_mm ??
            defautModule(
              zone.famille_pose
            ),
          {
            zoneVentRive: zone.zone_vent_rive ?? zone.angle,
            epaisseurIsolantMm: zone.epaisseur_isolant_mm ?? 120,
            typeIsolant: zone.type_isolant ?? "laine_roche",
            surfacePaquetM2: zone.surface_paquet_m2 ?? 4.8,
          }
        )
      : null;

  /* ============================================================
     CALEPINAGE HPL
     ============================================================ */

  /*
   * Le calepinage peut être calculé uniquement
   * lorsque toutes les dimensions nécessaires
   * sont renseignées.
   *
   * Pour un pignon, calculerCalepinage reçoit
   * également la hauteur du faîtage afin de
   * traiter toute la géométrie du pignon.
   */
  const rawLongueurMm =
    zone.plaque_longueur_mm && zone.plaque_longueur_mm > 0
      ? zone.plaque_longueur_mm < 20
        ? zone.plaque_longueur_mm * 1000
        : zone.plaque_longueur_mm
      : 3050;

  const rawLargeurMm =
    zone.plaque_largeur_mm && zone.plaque_largeur_mm > 0
      ? zone.plaque_largeur_mm < 20
        ? zone.plaque_largeur_mm * 1000
        : zone.plaque_largeur_mm
      : 1300;

  const modLargeurMm =
    zone.module_largeur_mm && zone.module_largeur_mm > 0
      ? zone.module_largeur_mm < 20
        ? zone.module_largeur_mm * 1000
        : zone.module_largeur_mm
      : 1000;

  const modHauteurMm =
    zone.module_hauteur_mm && zone.module_hauteur_mm > 0
      ? zone.module_hauteur_mm < 20
        ? zone.module_hauteur_mm * 1000
        : zone.module_hauteur_mm
      : 600;

  const sensPoseActif = zone.sens_pose ?? "horizontal";

  const peutCalepiner =
    zone.largeur > 0 &&
    hauteurTotale > 0;

  const calepinage =
    peutCalepiner
      ? calculerCalepinage({
          zoneLargeurM: zone.largeur,
          zoneHauteurM: zone.hauteur_mur,
          plaqueLongueurMm: rawLongueurMm,
          plaqueLargeurMm: rawLargeurMm,
          moduleLargeurMm: modLargeurMm,
          moduleHauteurMm: modHauteurMm,
          sensPose: sensPoseActif,
          estPignon: zone.type === "pignon",
          hauteurFaiteM: zone.hauteur_faite,
          // DTU 45.4 Mode A : ouvertures avec position absolue (X, Y) pour alignement joint sur linteau
          ouvertures: zone.ouvertures.length > 0
            ? zone.ouvertures.map((o) => {
                const allegeM = (o.hauteurAllegeMm ?? 0) / 1000;
                return {
                  id: o.id,
                  type: o.type === "fenetre" ? "fenetre" as const : "porte" as const,
                  largeur: o.largeur,
                  hauteur: o.hauteur,
                  // Hauteur du bas du linteau = allège + hauteur de l'ouverture
                  hauteurLinteauM: allegeM + o.hauteur,
                };
              })
            : null,
        })
      : null;

  /* ============================================================
     MISE À JOUR
     ============================================================ */

  function update(
    patch: Partial<Zone>
  ) {
    onChange({
      ...zone,
      ...patch,
    });
  }

  /* ============================================================
     OUVERTURES
     ============================================================ */

  function ajouterOuverture(
    type: Ouverture["type"]
  ) {
    const allegeParDefautMm =
      type === "fenetre" ? 900 : 0; // fenêtre : 90 cm d'allège standard ; porte/baie/pf : sol
    update({
      ouvertures: [
        ...zone.ouvertures,
        {
          id: crypto.randomUUID(),
          type,
          largeur: 0,
          hauteur: 0,
          distanceAngleGaucheM: 0,
          hauteurAllegeMm: allegeParDefautMm,
        },
      ],
    });
  }

  function updateOuverture(
    id: string,
    patch: Partial<Ouverture>
  ) {
    update({
      ouvertures:
        zone.ouvertures.map(
          (o) =>
            o.id === id
              ? { ...o, ...patch }
              : o
        ),
    });
  }

  function supprimerOuverture(
    id: string
  ) {
    update({
      ouvertures:
        zone.ouvertures.filter(
          (o) => o.id !== id
        ),
    });
  }

  /* ============================================================
     CRÉATION COMMANDE
     ============================================================ */

  function creerCommande() {
    if (!onCreerCommande) {
      return;
    }

    const lignes: LigneCommande[] =
      [];

    /*
     * PLAQUES HPL
     *
     * Si le calepinage existe,
     * on utilise directement son nombre
     * de plaques nécessaires.
     */
    if (calepinage) {
      lignes.push({
        designation: `${LABELS_FAMILLE.hpl} ${zone.plaque_longueur_mm}×${zone.plaque_largeur_mm}mm — ${zone.nom}`,
        quantite:
          calepinage.nbPlaquesNecessaires,
        unite: "plaques",
      });
    }

    /*
     * AUTRES MATÉRIAUX
     */
    else if (
      calc.surfaceACommander > 0
    ) {
      const nomMateriau =
        zone.famille_pose
          ? LABELS_FAMILLE[
              zone.famille_pose
            ]
          : "Bardage";

      lignes.push({
        designation: `${nomMateriau} — ${zone.nom}`,
        quantite:
          Math.round(
            calc.surfaceACommander * 100
          ) / 100,
        unite: "m²",
      });
    }

    /*
     * OSSATURE & INFRASTRUCTURE
     */
    if (pose) {
      // 1. ISOLANT ITE (si activé)
      if (pose.isolant.actif) {
        lignes.push({
          designation: `Isolant ITE ${pose.isolant.typeIsolant} ép. ${pose.isolant.epaisseurMm}mm (${pose.isolant.surfaceACommanderM2} m² avec +8% perte — ${pose.isolant.nbPaquetsACommander} paquets de ${pose.isolant.surfacePaquetM2} m²) — ${zone.nom}`,
          quantite: pose.isolant.nbPaquetsACommander,
          unite: "paquets",
        });

        lignes.push({
          designation: `Chevilles rosaces d'isolant à frapper (5/m²) — ${zone.nom}`,
          quantite: pose.isolant.nbChevillesRosaces,
          unite: "chevilles",
        });
      }

      // 2. OSSATURE CHEVRONS & ÉQUERRES
      lignes.push({
        designation: `Chevrons / Montants (${pose.lineaireChevronsM.toFixed(1)} ml — ${pose.nbSegmentsChevrons} pièces max 3m) — ${zone.nom}`,
        quantite: pose.nbSegmentsChevrons,
        unite: "pièces",
      });

      lignes.push({
        designation: `Équerres ${pose.isolant.modeleEquerreIsolco} (${pose.nbEquerresPorteuses} porteuses + ${pose.nbEquerresGuides} guides) — ${zone.nom}`,
        quantite: pose.nbFixationsTotal,
        unite: "équerres",
      });

      lignes.push({
        designation: `Chevilles maçonnerie Spit MP3-S Ø12×70mm (2/équerre) — ${zone.nom}`,
        quantite: pose.nbChevillesMurales,
        unite: "chevilles",
      });

      lignes.push({
        designation: `Vis Inox assemblage chevron/équerre (4/porteuse, 2/guide) — ${zone.nom}`,
        quantite: pose.nbVisChevronEquerre,
        unite: "vis inox",
      });

      lignes.push({
        designation: `Bande de protection EPDM 80-100mm — ${zone.nom}`,
        quantite: pose.lineaireBandeEPDMM,
        unite: "ml",
      });

      if (pose.nbVisParement > 0) {
        lignes.push({
          designation: `Vis / Clips fixation parement — ${zone.nom}`,
          quantite: pose.nbVisParement,
          unite: "vis",
        });
      }
    }

    if (lignes.length === 0) {
      return;
    }

    onCreerCommande(
      lignes,
      zone.nom
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-[#1A1D24] p-4 shadow-md transition-all">

      {/* ====================================================== */}
      {/* EN-TÊTE ACCORDÉON */}
      {/* ====================================================== */}

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <button
            type="button"
            onClick={() => setReplie(!replie)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#0B0F19] text-gray-300 hover:bg-slate-750 transition-colors"
            title={replie ? "Déplier la zone" : "Replier la zone"}
          >
            <span className="text-xs">{replie ? "▶" : "▼"}</span>
          </button>

          <input
            value={zone.nom}
            onChange={(e) => update({ nom: e.target.value })}
            placeholder="Nom de la zone (ex. Façade Nord)"
            className="flex-1 rounded-xl border border-white/10 bg-[#0B0F19] px-3 py-1.5 text-sm font-bold text-white focus:border-red-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#0B0F19] border border-white/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
            {calc.surfaceNette.toFixed(1)} m² net
          </span>

          <button
            type="button"
            onClick={() => onDelete(zone.id)}
            className="rounded-xl border border-red-500/30 bg-red-950/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-950/40 transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>

      {!replie && (
        <div className="space-y-4 pt-1">

      {/* ====================================================== */}
      {/* TYPE DE ZONE */}
      {/* ====================================================== */}

      <div className="flex flex-wrap gap-2">
        {(
          ["facade", "pignon"] as const
        ).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() =>
              update({
                type: t,
              })
            }
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              zone.type === t
                ? "bg-red-600 text-white"
                : "border border-white/10 text-gray-300"
            }`}
          >
            {t === "facade"
              ? "Façade"
              : "Pignon"}
          </button>
        ))}

        <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={zone.angle}
            onChange={(e) =>
              update({
                angle:
                  e.target.checked,
              })
            }
          />

          Zone d&apos;angle
        </label>
      </div>

      {/* ====================================================== */}
      {/* DIMENSIONS */}
      {/* ====================================================== */}

      <div className="grid grid-cols-2 gap-3">

        <Field
          label="Largeur (m)"
          value={zone.largeur}
          onChange={(v) =>
            update({
              largeur: v,
            })
          }
        />

        <Field
          label={
            zone.type === "pignon"
              ? "H. mur (rectangle, m)"
              : "H. mur / rampant (m)"
          }
          value={
            zone.hauteur_mur
          }
          onChange={(v) =>
            update({
              hauteur_mur: v,
            })
          }
        />

        {zone.type ===
          "pignon" && (
          <Field
            label="H. faîte / totale (m)"
            value={
              zone.hauteur_faite ??
              0
            }
            onChange={(v) =>
              update({
                hauteur_faite:
                  v,
              })
            }
          />
        )}

        <div>
          <label className="text-xs uppercase tracking-wide text-gray-500">
            Matériau (marge commande)
          </label>

          <select
            value={zone.materiau}
            onChange={(e) =>
              update({
                materiau:
                  e.target.value as Zone["materiau"],
              })
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white"
          >
            <option value="lames">
              Lames (+10%)
            </option>

            <option value="plaques">
              Plaques (+15%)
            </option>
          </select>
        </div>
      </div>

      {/* ====================================================== */}
      {/* FAMILLE DE POSE */}
      {/* ====================================================== */}

      <div className="space-y-2 border-t border-white/10 pt-3">

        <label className="text-xs uppercase tracking-wide text-gray-500">
          Famille de pose (calcul technique)
        </label>

        <select
          value={
            zone.famille_pose ??
            ""
          }
          onChange={(e) =>
            update({
              famille_pose:
                (e.target.value ||
                  null) as
                  | FamillePose
                  | null,
            })
          }
          className="w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white"
        >
          <option value="">
            — Aucun calcul —
          </option>

          {Object.entries(
            LABELS_FAMILLE
          ).map(([v, l]) => (
            <option
              key={v}
              value={v}
            >
              {l}
            </option>
          ))}
        </select>

        {/* MODULE LAME / CASSETTE */}

        {(zone.famille_pose ===
          "bois_naturel" ||
          zone.famille_pose ===
            "cassette") && (
          <Field
            label={labelModule(
              zone.famille_pose
            )}
            value={
              zone.largeur_lame_mm ??
              defautModule(
                zone.famille_pose
              )
            }
            onChange={(v) =>
              update({
                largeur_lame_mm:
                  v,
              })
            }
          />
        )}

        {/* ==================================================== */}
        {/* ISOLATION ITE & ÉQUERRES */}
        {/* ==================================================== */}
        {zone.famille_pose && (
          <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-950/10 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">
                🧱 Isolation ITE & Équerres Isolco
              </p>
              {pose && pose.isolant.actif && (
                <span className="rounded bg-emerald-900/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {pose.isolant.nbPaquetsACommander} paquets ({pose.isolant.surfaceACommanderM2} m²)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Épaisseur Isolant */}
              <div>
                <label className="text-[11px] text-gray-400">Épaisseur Isolant</label>
                <select
                  value={zone.epaisseur_isolant_mm ?? 120}
                  onChange={(e) => update({ epaisseur_isolant_mm: parseInt(e.target.value, 10) })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-2.5 py-1.5 text-xs text-white"
                >
                  <option value={0}>0 mm (Sans isolant / Lame d'air seule)</option>
                  <option value={80}>80 mm (R = 2.25)</option>
                  <option value={100}>100 mm (R = 2.85)</option>
                  <option value={120}>120 mm (R = 3.40 — Standard)</option>
                  <option value={140}>140 mm (R = 4.00)</option>
                  <option value={160}>160 mm (R = 4.55)</option>
                  <option value={180}>180 mm (R = 5.10)</option>
                  <option value={200}>200 mm (R = 5.70 — Haute perf.)</option>
                </select>
              </div>

              {/* Type d'isolant */}
              <div>
                <label className="text-[11px] text-gray-400">Type d'isolant</label>
                <select
                  value={zone.type_isolant ?? "laine_roche"}
                  onChange={(e) => update({ type_isolant: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="laine_roche">Laine de roche (Rockwool Fixrock)</option>
                  <option value="laine_verre">Laine de verre (ISOVER / Knauf)</option>
                  <option value="sans_isolant">Sans isolant rapporté</option>
                </select>
              </div>
            </div>

            {/* Conditionnement paquet & Options vent */}
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Surface / Paquet (m²)"
                value={zone.surface_paquet_m2 ?? 4.8}
                onChange={(v) => update({ surface_paquet_m2: v || null })}
              />

              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={() => update({ zone_vent_rive: !(zone.zone_vent_rive ?? zone.angle) })}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    (zone.zone_vent_rive ?? zone.angle)
                      ? "border-red-600 bg-sky-950/40 text-gray-400"
                      : "border-white/10 bg-[#0B0F19] text-gray-400 hover:text-white"
                  }`}
                >
                  <span>💨 Rives renforcées (40cm)</span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      (zone.zone_vent_rive ?? zone.angle) ? "bg-gray-300" : "bg-slate-600"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Badge de synthèse technique */}
            {pose && (
              <div className="rounded-md border border-white/10 bg-[#0B0F19]/80 p-2 text-[11px] text-gray-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Modèle d'équerre auto :</span>
                  <span className="font-semibold text-gray-300">{pose.isolant.modeleEquerreIsolco}</span>
                </div>
                {pose.isolant.actif && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Chevilles rosaces isolant (5/m²) :</span>
                    <span className="font-semibold text-emerald-400">{pose.isolant.nbChevillesRosaces} chevilles à frapper</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Vis Inox chevron/équerre :</span>
                  <span className="font-semibold text-amber-400">{pose.nbVisChevronEquerre} vis (4/porteuse, 2/guide)</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* PARAMÈTRES HPL */}
        {/* ==================================================== */}

        {/* PARAMETRES HPL DEPLACES AU CHANTIER */}
      </div>

      {/* ====================================================== */}
      {/* OUVERTURES */}
      {/* ====================================================== */}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Ouvertures — Position (X, Y) depuis angle bas-gauche
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { type: "fenetre" as const, label: "🪟 Fenêtre" },
                { type: "porte" as const, label: "🚪 Porte" },
                { type: "baie" as const, label: "🪟 Baie vitrée" },
                { type: "porte_fenetre" as const, label: "🚪 Porte-fenêtre" },
              ] as { type: Ouverture["type"]; label: string }[]
            ).map(({ type, label }) => (
              <button
                key={type}
                type="button"
                onClick={() => ajouterOuverture(type)}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-gray-300 hover:bg-slate-700"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>

        {/* En-tête colonnes */}
        {zone.ouvertures.length > 0 && (
          <div className="grid grid-cols-[80px_68px_68px_72px_72px_1fr_28px] gap-1.5 text-[10px] uppercase font-bold text-gray-500 px-1">
            <span>Type</span>
            <span>L (m)</span>
            <span>H (m)</span>
            <span>X depuis ←</span>
            <span>Allège Y</span>
            <span>Linteau</span>
            <span></span>
          </div>
        )}

        {zone.ouvertures.map((o) => {
          const estPorte = o.type === "porte" || o.type === "baie" || o.type === "porte_fenetre";
          const allegeM = (o.hauteurAllegeMm || 0) / 1000;
          const linteauM = allegeM + (o.hauteur || 0);
          const typeLabel =
            o.type === "fenetre" ? "Fenêtre" :
            o.type === "porte" ? "Porte" :
            o.type === "baie" ? "Baie" : "Pte-Fen.";
          const typeColor =
            o.type === "fenetre" ? "text-gray-400" :
            o.type === "porte" ? "text-amber-300" : "text-violet-300";

          return (
            <div
              key={o.id}
              className="grid grid-cols-[80px_68px_68px_72px_72px_1fr_28px] gap-1.5 items-center"
            >
              {/* Type */}
              <span className={`text-xs font-bold truncate ${typeColor}`}>
                {typeLabel}
              </span>

              {/* Largeur */}
              <input
                type="number"
                step="0.01"
                min="0"
                value={o.largeur || ""}
                onChange={(e) =>
                  updateOuverture(o.id, { largeur: parseFloat(e.target.value) || 0 })
                }
                placeholder="L (m)"
                className="rounded-lg border border-white/10 bg-[#0B0F19] px-2 py-1 text-sm text-white w-full"
              />

              {/* Hauteur */}
              <input
                type="number"
                step="0.01"
                min="0"
                value={o.hauteur || ""}
                onChange={(e) =>
                  updateOuverture(o.id, { hauteur: parseFloat(e.target.value) || 0 })
                }
                placeholder="H (m)"
                className="rounded-lg border border-white/10 bg-[#0B0F19] px-2 py-1 text-sm text-white w-full"
              />

              {/* X — distance de l'angle gauche (en mm) */}
              <div className="relative">
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={Math.round((o.distanceAngleGaucheM || 0) * 1000) || ""}
                  onChange={(e) =>
                    updateOuverture(o.id, {
                      distanceAngleGaucheM: (parseFloat(e.target.value) || 0) / 1000,
                    })
                  }
                  placeholder="X (mm)"
                  className="rounded-lg border border-amber-600/50 bg-[#0B0F19] px-2 py-1 text-sm text-amber-200 w-full"
                  title="Distance depuis l'angle gauche du mur jusqu'au bord gauche de l'ouverture (mm)"
                />
              </div>

              {/* Y — hauteur d'allège (en mm), fixée à 0 pour les portes */}
              {estPorte ? (
                <div className="flex items-center px-2 py-1 text-xs text-gray-400 rounded-lg border border-white/10 bg-[#0B0F19]/50">
                  Y = 0 mm (sol)
                </div>
              ) : (
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={o.hauteurAllegeMm || ""}
                  onChange={(e) =>
                    updateOuverture(o.id, {
                      hauteurAllegeMm: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="Allège (mm)"
                  className="rounded-lg border border-red-700/50 bg-[#0B0F19] px-2 py-1 text-sm text-sky-200 w-full"
                  title="Hauteur d'allège : distance du sol au bas de la fenêtre (mm)"
                />
              )}

              {/* Linteau calculé automatiquement */}
              <div className="text-[10px] text-emerald-400 font-mono px-1">
                {o.hauteur > 0
                  ? `⬆ ${Math.round(linteauM * 1000)} mm`
                  : <span className="text-slate-600">—</span>
                }
              </div>

              {/* Supprimer */}
              <button
                type="button"
                onClick={() => supprimerOuverture(o.id)}
                className="rounded-lg p-1 text-red-400 hover:text-red-300 hover:bg-[#1A1D24]"
              >
                ✕
              </button>
            </div>
          );
        })}

        {zone.ouvertures.length === 0 && (
          <p className="text-xs text-slate-600 italic">
            Aucune ouverture — le calepinage utilisera le Mode B (symétrique depuis le centre).
          </p>
        )}
      </div>

      {/* ====================================================== */}
      {/* RÉSULTATS MÉTRÉS */}
      {/* ====================================================== */}

      <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 sm:grid-cols-3">

        <Resultat
          label="Brute façade"
          value={
            calc.bruteFacade
          }
        />

        <Resultat
          label="Brute pignon"
          value={
            calc.brutePignon
          }
        />

        <Resultat
          label="Ouvertures"
          value={
            calc.totalOuvertures
          }
        />

        {zone.type ===
          "pignon" && (
          <Resultat
            label="Pente"
            value={calc.pente}
            unite="%"
          />
        )}

        <Resultat
          label="Nette à couvrir"
          value={
            calc.surfaceNette
          }
          highlight
        />

        <Resultat
          label="À commander"
          value={
            calc.surfaceACommander
          }
          highlight
        />

      </div>

      {/* ====================================================== */}
      {/* CALCUL TECHNIQUE */}
      {/* ====================================================== */}

      {pose && (
        <div className="space-y-2 rounded-lg border border-red-700/30 bg-red-700/5 p-3">

          <p className="text-xs font-semibold uppercase tracking-wide text-gray-300">
            Calcul technique —{" "}
            {
              LABELS_FAMILLE[
                zone.famille_pose!
              ]
            }
          </p>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">

            <Chiffre
              label="Entraxe vertical"
              value={`${(
                pose.entraxeVertical *
                100
              ).toFixed(0)} cm`}
            />

            {pose.entraxeHorizontal !==
              undefined && (
              <Chiffre
                label="Entraxe horizontal"
                value={`${(
                  pose.entraxeHorizontal *
                  100
                ).toFixed(0)} cm`}
              />
            )}

            <Chiffre
              label="Montants / chevrons"
              value={
                pose.nbMontants
              }
            />

            <Chiffre
              label="Fixations / montant"
              value={
                pose.fixationsParMontant
              }
            />

            <Chiffre
              label="Équerres / fixations totales"
              value={
                pose.nbFixationsTotal
              }
            />

            <Chiffre
              label="Vis (total estimé)"
              value={pose.nbVis}
            />

          </div>

          <p className="text-xs text-gray-400">
            {pose.joint}
          </p>

          {pose.remarques.length >
            0 && (
            <ul className="list-inside list-disc text-xs text-gray-500">
              {pose.remarques.map(
                (r, i) => (
                  <li key={i}>
                    {r}
                  </li>
                )
              )}
            </ul>
          )}

          <p className="text-xs italic text-amber-400">
            ⚠️ Calcul indicatif · vérifie sur un premier chantier avant de commander en grande quantité.
          </p>

        </div>
      )}

      {/* ====================================================== */}
      {/* PLAN DE CALEPINAGE */}
      {/* ====================================================== */}

      {zone.famille_pose ===
        "hpl" && (
        <PlanCalepinage
          largeurM={
            zone.largeur
          }
          hauteurM={
            zone.hauteur_mur
          }
          hauteurFaiteReelleM={
            zone.hauteur_faite
          }
          pose={pose}
          calepinage={
            calepinage
          }
          estPignon={
            zone.type ===
            "pignon"
          }
          ouvertures={
            zone.ouvertures
          }
        />
      )}

      {/* ====================================================== */}
      {/* MESSAGE PARAMÈTRES MANQUANTS */}
      {/* ====================================================== */}

      {zone.famille_pose ===
        "hpl" &&
        !peutCalepiner && (
          <p className="text-xs text-gray-500">
            Renseigne la longueur, la
            largeur de plaque et le sens
            de pose ci-dessus pour voir le
            plan de calepinage.
          </p>
        )}

      {/* ====================================================== */}
      {/* ACTIONS : DÉBIT ATELIER & COMMANDE */}
      {/* ====================================================== */}

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        {(calc.surfaceNette > 0 || pose) && (
          <button
            type="button"
            onClick={() => setModalDebitOuvert(true)}
            className="flex-1 rounded-lg border border-white/10 bg-[#1A1D24] py-2 text-sm font-medium text-white hover:border-slate-500 hover:bg-slate-700 transition-colors text-center"
          >
            📄 Fiche Débit & Atelier
          </button>
        )}

        {onCreerCommande &&
          (calc.surfaceACommander >
            0 ||
            pose) && (
            <button
              type="button"
              onClick={
                creerCommande
              }
              className="flex-1 rounded-lg border border-red-600/40 bg-red-600/10 py-2 text-sm font-medium text-red-400 hover:bg-red-600/20 transition-colors text-center"
            >
              ➕ Créer une commande
            </button>
          )}
      </div>

      {/* MODAL FICHE DÉBIT & OPTIMISEUR DE COUPE */}
      {modalDebitOuvert && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
          onClick={() => setModalDebitOuvert(false)}
        >
          <div className="relative w-full max-w-4xl space-y-3 rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#0B0F19] p-4 sm:p-6 pb-20 sm:pb-6 shadow-2xl max-h-[85vh] sm:max-h-[90dvh] overflow-y-auto animate-in fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0B0F19]/90 pb-3 rounded-2xl print:hidden">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOngletDebit("nesting")}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                    ongletDebit === "nesting"
                      ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                      : "border border-white/10 bg-[#1A1D24] text-gray-300 hover:bg-slate-700"
                  }`}
                >
                  <span>📐</span> Plan de Découpe &amp; Nesting
                </button>
                <button
                  type="button"
                  onClick={() => setOngletDebit("fiche_a4")}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                    ongletDebit === "fiche_a4"
                      ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                      : "border border-white/10 bg-[#1A1D24] text-gray-300 hover:bg-slate-700"
                  }`}
                >
                  <span>📑</span> Fiche Débit Atelier A4
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all"
                >
                  <span>🖨️</span> Imprimer / Exporter PDF
                </button>
                <button
                  type="button"
                  onClick={() => setModalDebitOuvert(false)}
                  className="rounded-xl border border-white/10 bg-[#1A1D24] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-slate-700"
                >
                  Fermer
                </button>
              </div>
            </div>

            {ongletDebit === "nesting" && calepinage ? (
              <div className="rounded-2xl border border-white/10 bg-[#1A1D24]/90 p-4 shadow-2xl">
                <VisualiseurDebitPlaques calepinage={calepinage} titreZone={zone.nom} />
              </div>
            ) : (
              <FicheDebitPDF
                zone={zone}
                chantier={{ nom: "Chantier BNA", adresse: null }}
                entreprise={{
                  raison_sociale: "BNA Bardage",
                  telephone: null,
                  email: null,
                  logo_url: "/logo-bna.png",
                }}
                pose={pose}
                calepinage={calepinage}
              />
            )}
          </div>
        </div>
      )}

        </div>
      )}
    </div>
  );
}

/* ==============================================================
   CHAMP NUMÉRIQUE
   ============================================================== */

function Field({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </label>

      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(
            parseFloat(
              e.target.value
            ) || 0
          )
        }
        className={`mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      />
    </div>
  );
}

/* ==============================================================
   RÉSULTAT
   ============================================================== */

function Resultat({
  label,
  value,
  unite = "m²",
  highlight,
}: {
  label: string;
  value: number;
  unite?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">
        {label}
      </p>

      <p
        className={`text-sm font-semibold ${
          highlight
            ? "text-red-400"
            : "text-white"
        }`}
      >
        {value.toFixed(2)}{" "}
        {unite}
      </p>
    </div>
  );
}

/* ==============================================================
   CHIFFRE TECHNIQUE
   ============================================================== */

function Chiffre({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">
        {label}
      </p>

      <p className="font-semibold text-white">
        {value}
      </p>
    </div>
  );
}
 
