"use client";

import type { Materiau } from "@/lib/meteoAlerte";

import { useState, useEffect, useRef, useMemo } from "react";
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
import {
  extraireEntrees,
  lesEntreesOntChangent,
  serialiserResultatTechnique,
} from "@/lib/metre-serialization";
import type { EntreesMetre, ResultatMetre } from "@/lib/metre-serialization";
import { persistanceNecessaire } from "@/lib/metre-persistance";

type Ouverture = {
  id: string;
  type: "fenetre" | "porte";
  largeur: number;
  hauteur: number;
};

export type Zone = {
  id: string;
  chantier_id: string;
  type: "facade" | "pignon";
  nom: string;
  largeur: number;
  hauteur_mur: number;
  hauteur_faite: number | null;
  materiau: "lames" | "plaques";
  ouvertures: Ouverture[];
  famille_pose: FamillePose | null;
  angle: boolean;
  largeur_lame_mm: number | null;
  plaque_longueur_mm: number | null;
  plaque_largeur_mm: number | null;
  module_largeur_mm?: number | null;
  module_hauteur_mm?: number | null;
  sens_pose: SensPose | null;
  resultats_techniques?: ResultatMetre | null;
};

/**
 * Configuration technique du CHANTIER (source unique, persistée sur `chantiers`).
 * Chaque valeur `null` signifie « non configurée » → les moteurs utilisent alors
 * leur valeur de secours historique. Une valeur réellement saisie (y compris 0
 * pour l'épaisseur d'isolant) est TOUJOURS utilisée, jamais remplacée en silence.
 */
export type ConfigTechnique = {
  type_isolant: "laine_roche" | "laine_verre" | "sans_isolant" | null;
  epaisseur_isolant_mm: number | null;
  surface_paquet_m2: number | null;
  zone_vent_rive: boolean | null;
  coef_perte_rendement: number | null;
};

export type LigneCommande = {
  designation: string;
  quantite: number;
  unite: string;
};

/* ============================================================
   CALCUL GLOBAL DE LA ZONE
   ============================================================ */

export function calculerZone(
  zone: Zone,
  coefPerteRendement?: number | null
) {
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

  const surfaceNette = Math.max(
    0,
    bruteFacade +
      brutePignon -
      totalOuvertures
  );

  const marge =
    coefPerteRendement && coefPerteRendement > 0
      ? coefPerteRendement
      : zone.materiau === "lames" ? 1.1 : 1.15;

  const surfaceACommander =
    surfaceNette * marge;

  const nombreOuvertures = zone.ouvertures.length;

  let totalCoupesML = 0;
  if ((zone.sens_pose ?? "horizontal").toString().toLowerCase() === "vertical") {
    const coupesBords = 2 * zone.largeur;
    const coupesOuvertures = zone.ouvertures.reduce((s, o) => s + 2 * o.largeur, 0);
    totalCoupesML = coupesBords + coupesOuvertures;
  } else {
    const coupesBords = 2 * zone.hauteur_mur;
    const coupesOuvertures = zone.ouvertures.reduce((s, o) => s + 2 * o.hauteur, 0);
    totalCoupesML = coupesBords + coupesOuvertures;
  }
  if (zone.type === "pignon" && zone.largeur > 0 && hFaite > zone.hauteur_mur) {
    const demiLargeur = zone.largeur / 2;
    const deltaH = hFaite - zone.hauteur_mur;
    const longueurRampant = Math.sqrt(demiLargeur * demiLargeur + deltaH * deltaH);
    totalCoupesML += 2 * longueurRampant;
  }

  return {
    bruteFacade,
    brutePignon,
    pente,
    totalOuvertures,
    surfaceNette,
    surfaceACommander,
    nombreOuvertures,
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
  configTechnique,
  onChange,
  onDelete,
  onCreerCommande,
  onPersistResult,
}: {
  zone: Zone;
  zoneVent: number;
  configTechnique: ConfigTechnique;
  onChange: (zone: Zone) => void;
  onDelete: (id: string) => void;
  onCreerCommande?: (
    lignes: LigneCommande[],
    zoneNom: string,
    zoneId: string
  ) => void;
  onPersistResult?: (result: ResultatMetre) => void;
}) {
  const [modalDebitOuvert, setModalDebitOuvert] = useState(false);
  const [ongletDebit, setOngletDebit] = useState<"nesting" | "fiche_a4">("nesting");
  const [replie, setReplie] = useState(false);

  // Sélecteurs "Trame / Format personnalisé" : une fois l'option custom choisie,
  // le select reste sur "custom" et déverrouille la saisie manuelle des champs.
  const [trameModuleCustom, setTrameModuleCustom] = useState(false);
  const [formatPlaqueCustom, setFormatPlaqueCustom] = useState(false);

  const PRESETS_MODULES = ["1000x600", "1200x800", "1500x450", "600x1200"];
  const PRESETS_PLAQUES = ["3050x1300", "3650x1860", "2550x1860", "2800x1300", "4100x1300"];

  const moduleTrameValeur = (() => {
    if (trameModuleCustom) return "custom";
    const l = zone.module_largeur_mm;
    const h = zone.module_hauteur_mm;
    if (!l || !h) return "1000x600";
    return PRESETS_MODULES.includes(`${l}x${h}`) ? `${l}x${h}` : "custom";
  })();
  const moduleTrameCustom = moduleTrameValeur === "custom";

  const plaqueFormatValeur = (() => {
    if (formatPlaqueCustom) return "custom";
    const l = zone.plaque_longueur_mm;
    const h = zone.plaque_largeur_mm;
    if (!l || !h) return "3050x1300";
    return PRESETS_PLAQUES.includes(`${l}x${h}`) ? `${l}x${h}` : "custom";
  })();
  const plaqueFormatCustom = plaqueFormatValeur === "custom";
  const calc = calculerZone(zone, configTechnique.coef_perte_rendement);

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

  const sensPoseActif: SensPose =
    (zone.sens_pose ?? "horizontal").toString().toLowerCase() === "vertical"
      ? "vertical"
      : "horizontal";

  // En mode "Trame personnalisée", les champs Largeur/Hauteur reflètent déjà
  // les dimensions finales vues sur le mur (Largeur = axe X, Hauteur = axe Y).
  // Le bouton d'orientation sert alors de pivot : il intervertit simplement
  // les deux valeurs. Les calculs restent donc forcés en horizontal.
  const sensPoseEffectif: SensPose = moduleTrameCustom ? "horizontal" : sensPoseActif;

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
              zoneVentRive: configTechnique.zone_vent_rive ?? zone.angle,
              epaisseurIsolantMm: configTechnique.epaisseur_isolant_mm ?? 120,
              typeIsolant: configTechnique.type_isolant ?? "laine_roche",
              surfacePaquetM2: configTechnique.surface_paquet_m2 ?? 4.8,
              moduleLargeurMm: zone.module_largeur_mm ?? null,
              moduleHauteurMm: zone.module_hauteur_mm ?? null,
              sensPose: sensPoseEffectif,
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
          sensPose: sensPoseEffectif,
          estPignon: zone.type === "pignon",
          hauteurFaiteM: zone.hauteur_faite,
        })
      : null;

  /* ============================================================
     PERSISTANCE `resultats_techniques` (source de vérité du métré)
     ============================================================
     On n'écrit sur Supabase QUE si les entrées qui influencent les
     calculs ont réellement changé (comparé aux entrées déjà stockées).
     Le JSONB est construit à partir des objets EXACTEMENT affichés
     (calc / pose / calepinage) : aucun deuxième chemin de calcul,
     aucun recalcul dans la couche de persistance, aucune quantité
     inventée. Les trois moteurs restent la source du calcul.
     ============================================================ */

  // Entrées des moteurs pour CETTE zone, avec la config chantier persistée.
  // Mémoïsées sur les valeurs exactes qui les composent : la structure n'est
  // reconstruite que si l'une de ces valeurs change réellement.
  const entreesActuelles = useMemo(
    () => extraireEntrees(zone, configTechnique),
    [
      zone.type,
      zone.largeur,
      zone.hauteur_mur,
      zone.hauteur_faite,
      zone.materiau,
      zone.ouvertures,
      zone.famille_pose,
      zone.angle,
      zone.largeur_lame_mm,
      zone.plaque_longueur_mm,
      zone.plaque_largeur_mm,
      zone.module_largeur_mm,
      zone.module_hauteur_mm,
      zone.sens_pose,
      configTechnique.type_isolant,
      configTechnique.epaisseur_isolant_mm,
      configTechnique.surface_paquet_m2,
      configTechnique.zone_vent_rive,
      configTechnique.coef_perte_rendement,
    ],
  );

  // Garde-fou anti-boucle : les entrées pour lesquelles on a déjà demandé
  // une persistance (en attendant l'accusé de réception de la page).
  const dernieresEntreesEcrites = useRef<EntreesMetre | null>(null);

  useEffect(() => {
    if (!onPersistResult) return;

    // Initialisation au premier rendu : si le rechargement renvoie un résultat
    // déjà stocké avec des entrées identiques, on ne doit RIEN réécrire.
    if (dernieresEntreesEcrites.current === null) {
      dernieresEntreesEcrites.current = zone.resultats_techniques?.entrees ?? null;
    }

    // Entrées identiques au stocké → aucune écriture Supabase.
    const persister = persistanceNecessaire(zone.resultats_techniques, entreesActuelles);
    if (!persister) {
      dernieresEntreesEcrites.current = entreesActuelles;
      return;
    }

    // Déjà émis pour ces mêmes entrées (écriture en vol) → on attend l'ack.
    if (
      dernieresEntreesEcrites.current &&
      !lesEntreesOntChangent(dernieresEntreesEcrites.current, entreesActuelles)
    ) {
      return;
    }

    // Entrées modifiées (ou premier calcul) → on persiste les résultats
    // exactement affichés, produits par les moteurs.
    const nouveauResultat = serialiserResultatTechnique(
      zone,
      configTechnique,
      calc,
      pose,
      calepinage,
    );
    dernieresEntreesEcrites.current = entreesActuelles;
    onPersistResult(nouveauResultat);
  }, [
    onPersistResult,
    zone,
    zoneVent,
    configTechnique,
    entreesActuelles,
    calc,
    pose,
    calepinage,
  ]);

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
    type: "fenetre" | "porte"
  ) {
    update({
      ouvertures: [
        ...zone.ouvertures,
        {
          id: crypto.randomUUID(),
          type,
          largeur: 0,
          hauteur: 0,
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
      zone.nom,
      zone.id
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-4 shadow-md transition-all">

      {/* ====================================================== */}
      {/* EN-TÊTE ACCORDÉON */}
      {/* ====================================================== */}

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-1 items-center gap-2 min-w-[240px]">
          <button
            type="button"
            onClick={() => setReplie(!replie)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-sky-400 hover:bg-slate-750 transition-colors"
            title={replie ? "Déplier la zone" : "Replier la zone"}
          >
            <span className="text-xs">{replie ? "▶" : "▼"}</span>
          </button>

          <input
            value={zone.nom}
            onChange={(e) => update({ nom: e.target.value })}
            placeholder="Nom de la zone (ex. Façade Nord)"
            className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm font-bold text-white focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs font-bold text-emerald-400">
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
                : "border border-slate-600 text-slate-300"
            }`}
          >
            {t === "facade"
              ? "Façade"
              : "Pignon"}
          </button>
        ))}

        <label className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300">
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
          <label className="text-xs uppercase tracking-wide text-slate-500">
            Matériau (marge commande)
          </label>

          <select
            value={zone.materiau as Materiau}
            onChange={(e) =>
              update({
                materiau:
                  e.target.value as Zone["materiau"],
              })
            }
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
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

      <div className="space-y-2 border-t border-slate-700 pt-3">

        <label className="text-xs uppercase tracking-wide text-slate-500">
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
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
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

            <div className="rounded-md border border-slate-700 bg-slate-900/60 p-2.5 text-[11px] text-slate-400">
              Configuration technique du chantier (onglet « Métrés &amp; Technique ») :
              isolant{" "}
              <span className="font-semibold text-slate-200">
                {configTechnique.type_isolant === "sans_isolant"
                  ? "sans isolant rapporté"
                  : (configTechnique.type_isolant ?? "laine_roche") === "laine_roche"
                    ? "laine de roche"
                    : "laine de verre"}
              </span>
              {" · "}
              <span className="font-semibold text-slate-200">
                ép. {configTechnique.epaisseur_isolant_mm ?? 120} mm
              </span>
              {" · "}
              <span className="font-semibold text-slate-200">
                {configTechnique.surface_paquet_m2 ?? 4.8} m²/paquet
              </span>
              {" · "}
              <span className="font-semibold text-slate-200">
                rives {(configTechnique.zone_vent_rive ?? zone.angle) ? "renforcées (40cm)" : "simples"}
              </span>
            </div>

            {/* Badge de synthèse technique */}
            {pose && (
              <div className="rounded-md border border-slate-700 bg-slate-900/80 p-2 text-[11px] text-slate-300 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Modèle d'équerre auto :</span>
                  <span className="font-semibold text-sky-400">{pose.isolant.modeleEquerreIsolco}</span>
                </div>
                {pose.isolant.actif && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Chevilles rosaces isolant (5/m²) :</span>
                    <span className="font-semibold text-emerald-400">{pose.isolant.nbChevillesRosaces} chevilles à frapper</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Vis Inox chevron/équerre :</span>
                  <span className="font-semibold text-amber-400">{pose.nbVisChevronEquerre} vis (4/porteuse, 2/guide)</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* PARAMÈTRES HPL */}
        {/* ==================================================== */}

        {zone.famille_pose ===
          "hpl" && (
          <div className="space-y-4 rounded-lg border border-slate-600 bg-slate-900/60 p-3.5">
            {/* PARTIE 1 : PLAQUE BRUTE MATIÈRE PREMIÈRE */}
            <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-300">
                  📦 Plaque brute (Approvisionnement / Stock)
                </p>
                <span className="text-[10px] text-slate-400">Matière première</span>
              </div>

              <div>
                <label className="text-[11px] text-slate-400">Format standard fabricant</label>
                <select
                  value={plaqueFormatValeur}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "custom") {
                      // Reste sur "custom" : les champs manuels se déverrouillent.
                      setFormatPlaqueCustom(true);
                      return;
                    }
                    setFormatPlaqueCustom(false);
                    const [lStr, wStr] = v.split("x");
                    if (lStr && wStr) {
                      update({
                        plaque_longueur_mm: parseInt(lStr, 10),
                        plaque_largeur_mm: parseInt(wStr, 10),
                      });
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                >
                  <option value="3050x1300">Trespa Meteon Standard (3050 × 1300 mm)</option>
                  <option value="3650x1860">Trespa Meteon Grand Format (3650 × 1860 mm)</option>
                  <option value="2550x1860">Trespa Meteon Moyen (2550 × 1860 mm)</option>
                  <option value="2800x1300">Fundermax Standard (2800 × 1300 mm)</option>
                  <option value="4100x1300">Fundermax Max Compact (4100 × 1300 mm)</option>
                  <option value="custom">Format personnalisé...</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Longueur brute (mm)"
                  value={zone.plaque_longueur_mm ?? 3050}
                  disabled={!plaqueFormatCustom}
                  onChange={(v) => {
                    const mm = v > 0 && v < 20 ? Math.round(v * 1000) : v;
                    update({ plaque_longueur_mm: mm || null });
                  }}
                />
                <Field
                  label="Largeur brute (mm)"
                  value={zone.plaque_largeur_mm ?? 1300}
                  disabled={!plaqueFormatCustom}
                  onChange={(v) => {
                    const mm = v > 0 && v < 20 ? Math.round(v * 1000) : v;
                    update({ plaque_largeur_mm: mm || null });
                  }}
                />
              </div>
            </div>

            {/* PARTIE 2 : MODULES POSÉS EN FAÇADE */}
            <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-950/10 p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-red-300">
                  🧱 Modules posés en façade (Trame esthétique)
                </p>
                <span className="text-[10px] text-red-400">Dimensions maniables</span>
              </div>

              <div>
                <label className="text-[11px] text-slate-400">Trame cible des modules</label>
                <select
                  value={moduleTrameValeur}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "custom") {
                      // Reste sur "custom" : les champs manuels se déverrouillent.
                      // L'orientation est gérée par la saisie Largeur/Hauteur :
                      // on force Horizontal pour éviter toute inversion en fond.
                      setTrameModuleCustom(true);
                      if (sensPoseActif === "vertical") {
                        update({ sens_pose: "horizontal" });
                      }
                      return;
                    }
                    setTrameModuleCustom(false);
                    const [wStr, hStr] = v.split("x");
                    if (wStr && hStr) {
                      update({
                        module_largeur_mm: parseInt(wStr, 10),
                        module_hauteur_mm: parseInt(hStr, 10),
                      });
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
                >
                  <option value="1000x600">Standard maniable (1000 × 600 mm)</option>
                  <option value="1200x800">Grand format architectural (1200 × 800 mm)</option>
                  <option value="1500x450">Bandeau horizontal élancé (1500 × 450 mm)</option>
                  <option value="600x1200">Module vertical (600 × 1200 mm)</option>
                  <option value="custom">Trame personnalisée...</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Largeur module (mm)"
                  value={zone.module_largeur_mm ?? 1000}
                  disabled={!moduleTrameCustom}
                  onChange={(v) => {
                    const mm = v > 0 && v < 20 ? Math.round(v * 1000) : v;
                    update({ module_largeur_mm: mm || null });
                  }}
                />
                <Field
                  label="Hauteur module (mm)"
                  value={zone.module_hauteur_mm ?? 600}
                  disabled={!moduleTrameCustom}
                  onChange={(v) => {
                    const mm = v > 0 && v < 20 ? Math.round(v * 1000) : v;
                    update({ module_hauteur_mm: mm || null });
                  }}
                />
              </div>

              {/* SENS DE POSE */}
              <div className="pt-1">
                <label className="text-xs uppercase tracking-wide text-slate-400">
                  Orientation de pose
                </label>
                <div className="mt-1 flex gap-2">
                  {(["horizontal", "vertical"] as const).map((s) => {
                    const actif = (zone.sens_pose ?? "horizontal").toString().toLowerCase() === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          if (moduleTrameCustom) {
                            // En trame personnalisée, le bouton pivote la plaque :
                            // il intervertit Largeur et Hauteur (axes X/Y restent
                            // garantis : Largeur = axe X) et met à jour la BDD.
                            update({
                              module_largeur_mm: zone.module_hauteur_mm ?? 600,
                              module_hauteur_mm: zone.module_largeur_mm ?? 1000,
                              sens_pose: s,
                            });
                          } else {
                            update({ sens_pose: s });
                          }
                        }}
                        className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          actif
                            ? "bg-red-600 text-white"
                            : "border border-slate-600 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {s === "horizontal" ? "↔ Horizontal" : "↕ Vertical"}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================== */}
      {/* OUVERTURES */}
      {/* ====================================================== */}

      <div className="space-y-2">

        <div className="flex items-center justify-between">

          <p className="text-xs uppercase tracking-wide text-slate-500">
            Ouvertures
          </p>

          <div className="flex gap-2">

            <button
              type="button"
              onClick={() =>
                ajouterOuverture(
                  "fenetre"
                )
              }
              className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              + Fenêtre
            </button>

            <button
              type="button"
              onClick={() =>
                ajouterOuverture(
                  "porte"
                )
              }
              className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
            >
              + Porte
            </button>

          </div>
        </div>

        {zone.ouvertures.map(
          (o) => (
            <div
              key={o.id}
              className="flex items-center gap-2"
            >

              <span className="w-16 text-xs text-slate-400">
                {o.type ===
                "fenetre"
                  ? "Fenêtre"
                  : "Porte"}
              </span>

              <input
                type="number"
                value={o.largeur}
                onChange={(e) =>
                  updateOuverture(
                    o.id,
                    {
                      largeur:
                        parseFloat(
                          e.target
                            .value
                        ) || 0,
                    }
                  )
                }
                placeholder="L (m)"
                className="w-20 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
              />

              <input
                type="number"
                value={o.hauteur}
                onChange={(e) =>
                  updateOuverture(
                    o.id,
                    {
                      hauteur:
                        parseFloat(
                          e.target
                            .value
                        ) || 0,
                    }
                  )
                }
                placeholder="H (m)"
                className="w-20 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
              />

              <span className="text-xs text-slate-500">
                {(
                  o.largeur *
                  o.hauteur
                ).toFixed(2)}{" "}
                m²
              </span>

              <button
                type="button"
                onClick={() =>
                  supprimerOuverture(
                    o.id
                  )
                }
                className="ml-auto text-xs text-red-400 hover:text-red-300"
              >
                ✕
              </button>

            </div>
          )
        )}
      </div>

      {/* ====================================================== */}
      {/* RÉSULTATS MÉTRÉS */}
      {/* ====================================================== */}

      <div className="grid grid-cols-2 gap-3 border-t border-slate-700 pt-3 sm:grid-cols-3">

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
        <div className="space-y-2 rounded-lg border border-sky-600/30 bg-sky-600/5 p-3">

          <p className="text-xs font-semibold uppercase tracking-wide text-sky-400">
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

          <p className="text-xs text-slate-400">
            {pose.joint}
          </p>

          {pose.remarques.length >
            0 && (
            <ul className="list-inside list-disc text-xs text-slate-500">
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
          <p className="text-xs text-slate-500">
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
            className="flex-1 rounded-lg border border-slate-600 bg-slate-800 py-2 text-sm font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-700 transition-colors text-center"
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
          className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 sm:p-5 backdrop-blur-sm"
          onClick={() => setModalDebitOuvert(false)}
        >
          <div className="mx-auto max-w-4xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-900/90 p-3 rounded-2xl print:hidden">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOngletDebit("nesting")}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                    ongletDebit === "nesting"
                      ? "bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20"
                      : "border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <span>📐</span> Plan de Découpe &amp; Nesting
                </button>
                <button
                  type="button"
                  onClick={() => setOngletDebit("fiche_a4")}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                    ongletDebit === "fiche_a4"
                      ? "bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20"
                      : "border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  <span>📑</span> Fiche Débit Atelier A4
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all"
                >
                  <span>🖨️</span> Imprimer / Exporter PDF
                </button>
                <button
                  type="button"
                  onClick={() => setModalDebitOuvert(false)}
                  className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Fermer
                </button>
              </div>
            </div>

            {ongletDebit === "nesting" && calepinage ? (
              <div className="rounded-2xl border border-slate-700 bg-slate-800/90 p-4 shadow-2xl">
                <VisualiseurDebitPlaques calepinage={calepinage} titreZone={zone.nom} />
              </div>
            ) : (
              <FicheDebitPDF
                zone={zone}
                zoneVentRive={configTechnique.zone_vent_rive ?? zone.angle}
                coefPerteRendement={configTechnique.coef_perte_rendement}
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
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  // État local en TEXTE : l'utilisateur peut effacer librement ("" autorisé)
  // pendant la frappe. La conversion stricte n'a lieu qu'au onBlur (ou au Enter).
  const [texte, setTexte] = useState(String(value));

  // Resynchronisation quand la valeur externe change (commit d'un autre champ,
  // sélection d'un preset, rechargement...) sans écraser la frappe en cours :
  // tant que la saisie locale vaut déjà la valeur externe, on ne touche à rien.
  useEffect(() => {
    setTexte((prev) => {
      const n = parseFloat(String(prev).replace(",", "."));
      if (Number.isFinite(n) && Math.abs(n - value) < 1e-9) return prev;
      return String(value);
    });
  }, [value]);

  function commiter() {
    const n = parseFloat(texte.replace(",", "."));
    onChange(Number.isFinite(n) ? n : 0);
  }

  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </label>

      <input
        type="text"
        inputMode="decimal"
        value={texte}
        disabled={disabled}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={commiter}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
      <p className="text-xs text-slate-500">
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
      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p className="font-semibold text-white">
        {value}
      </p>
    </div>
  );
}
 
