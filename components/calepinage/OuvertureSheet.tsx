"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { Opening, OpeningType } from "@/types/calepinage";

// Bottom sheet de saisie d'une ouverture (fenêtre / porte / vide).
// Monté/démonté par le parent (rendu conditionnel) : aucun état ni DOM conservé
// quand il est fermé.
// Coordonnées en mm depuis le coin supérieur gauche de la zone.

export interface OuvertureValeurs {
  type: OpeningType;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
}

export const TYPES_OUVERTURE: { valeur: OpeningType; label: string }[] = [
  { valeur: "fenetre", label: "Fenêtre" },
  { valeur: "porte", label: "Porte" },
  { valeur: "vide", label: "Vide" },
];

const DEBOUNCE_MS = 300;
const PAS_MM = 10;

/**
 * Valide une ouverture : positive, entièrement dans la zone, sans chevauchement
 * avec les autres (deux ouvertures qui se touchent par un bord sont acceptées).
 * `autres` doit déjà exclure l'ouverture en cours de modification.
 * Retourne la liste des erreurs (vide = valide).
 */
export function validerOuverture(
  v: OuvertureValeurs,
  zoneLargeurMm: number,
  zoneHauteurMm: number,
  autres: Pick<Opening, "x_mm" | "y_mm" | "width_mm" | "height_mm">[],
): string[] {
  const erreurs: string[] = [];
  const nombres = [v.x_mm, v.y_mm, v.width_mm, v.height_mm];
  if (!nombres.every((n) => Number.isFinite(n))) {
    return ["Renseignez tous les champs."];
  }
  if (v.x_mm < 0) erreurs.push("X doit être ≥ 0.");
  if (v.y_mm < 0) erreurs.push("Y doit être ≥ 0.");
  if (v.width_mm <= 0) erreurs.push("La largeur doit être > 0.");
  if (v.height_mm <= 0) erreurs.push("La hauteur doit être > 0.");
  if (v.x_mm + v.width_mm > zoneLargeurMm) {
    erreurs.push(`X + largeur dépasse la zone (${zoneLargeurMm} mm).`);
  }
  if (v.y_mm + v.height_mm > zoneHauteurMm) {
    erreurs.push(`Y + hauteur dépasse la zone (${zoneHauteurMm} mm).`);
  }
  if (erreurs.length === 0) {
    const chevauche = autres.some(
      (o) =>
        v.x_mm < o.x_mm + o.width_mm &&
        o.x_mm < v.x_mm + v.width_mm &&
        v.y_mm < o.y_mm + o.height_mm &&
        o.y_mm < v.y_mm + v.height_mm,
    );
    if (chevauche) erreurs.push("Chevauchement avec une autre ouverture.");
  }
  return erreurs;
}

type Brut = { x: string; y: string; w: string; h: string };

const versNombre = (s: string): number => (s.trim() === "" ? NaN : Number(s));

function useValeurDifferee<T>(valeur: T, delaiMs: number): T {
  const [differee, setDifferee] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setDifferee(valeur), delaiMs);
    return () => clearTimeout(t);
  }, [valeur, delaiMs]);
  return differee;
}

function ChampMm({
  label,
  valeur,
  onChange,
}: {
  label: string;
  valeur: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const ajuster = (delta: number) => {
    const n = versNombre(valeur);
    onChange(String((Number.isFinite(n) ? n : 0) + delta));
  };
  const boutonCls =
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#333] bg-[#1E1E1E] text-xl font-bold text-white active:bg-[#2a2a2a]";
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-gray-400">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Diminuer ${label}`}
          onClick={() => ajuster(-PAS_MM)}
          className={boutonCls}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          step={PAS_MM}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-xl border border-[#333] bg-[#121212] px-3 text-center text-base font-bold text-white outline-none focus:border-red-500"
        />
        <button
          type="button"
          aria-label={`Augmenter ${label}`}
          onClick={() => ajuster(PAS_MM)}
          className={boutonCls}
        >
          +
        </button>
      </div>
    </div>
  );
}

export interface OuvertureSheetProps {
  /** Ouverture à modifier ; absente = création. */
  ouverture?: Opening;
  /** Autres ouvertures de la zone (celle en cours d'édition exclue) pour le chevauchement. */
  autresOuvertures: Opening[];
  zoneLargeurMm: number;
  zoneHauteurMm: number;
  onSubmit: (valeurs: OuvertureValeurs) => Promise<void> | void;
  onCancel: () => void;
}

export default function OuvertureSheet({
  ouverture,
  autresOuvertures,
  zoneLargeurMm,
  zoneHauteurMm,
  onSubmit,
  onCancel,
}: OuvertureSheetProps) {
  const [type, setType] = useState<OpeningType>(ouverture?.type ?? "fenetre");
  const [brut, setBrut] = useState<Brut>({
    x: String(ouverture?.x_mm ?? 0),
    y: String(ouverture?.y_mm ?? 0),
    w: String(ouverture?.width_mm ?? 1000),
    h: String(ouverture?.height_mm ?? 1000),
  });
  const [envoi, setEnvoi] = useState(false);
  const titreId = useId();

  // Validation différée de 300 ms : pas de recalcul à chaque frappe.
  const brutDiffere = useValeurDifferee(brut, DEBOUNCE_MS);
  const enAttente = brutDiffere !== brut;

  const erreurs = useMemo(
    () =>
      validerOuverture(
        {
          type,
          x_mm: versNombre(brutDiffere.x),
          y_mm: versNombre(brutDiffere.y),
          width_mm: versNombre(brutDiffere.w),
          height_mm: versNombre(brutDiffere.h),
        },
        zoneLargeurMm,
        zoneHauteurMm,
        autresOuvertures,
      ),
    [type, brutDiffere, zoneLargeurMm, zoneHauteurMm, autresOuvertures],
  );

  // Fermeture à Échap + blocage du scroll de la page derrière la feuille.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", surTouche);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = avant;
    };
  }, [onCancel]);

  const valide = !enAttente && erreurs.length === 0 && !envoi;

  async function valider() {
    if (!valide) return;
    setEnvoi(true);
    try {
      await onSubmit({
        type,
        x_mm: Math.round(versNombre(brut.x)),
        y_mm: Math.round(versNombre(brut.y)),
        width_mm: Math.round(versNombre(brut.w)),
        height_mm: Math.round(versNombre(brut.h)),
      });
    } finally {
      setEnvoi(false);
    }
  }

  const maj = (cle: keyof Brut) => (v: string) => setBrut((b) => ({ ...b, [cle]: v }));

  return (
    <div className="fixed inset-0 z-[200] flex items-end bg-black/60" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full space-y-4 overflow-y-auto rounded-t-2xl border-t border-[#333] bg-[#181818] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-[#444]" aria-hidden />
        <h2 id={titreId} className="text-lg font-bold text-white">
          {ouverture ? "Modifier l'ouverture" : "Nouvelle ouverture"}
        </h2>

        <div role="radiogroup" aria-label="Type d'ouverture" className="flex gap-2">
          {TYPES_OUVERTURE.map((t) => (
            <button
              key={t.valeur}
              type="button"
              role="radio"
              aria-checked={type === t.valeur}
              onClick={() => setType(t.valeur)}
              className={`h-12 flex-1 rounded-xl border text-sm font-bold ${
                type === t.valeur
                  ? "border-red-500 bg-red-600/20 text-white"
                  : "border-[#333] bg-[#1E1E1E] text-gray-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <ChampMm label="Position X (mm)" valeur={brut.x} onChange={maj("x")} />
          <ChampMm label="Position Y (mm)" valeur={brut.y} onChange={maj("y")} />
          <ChampMm label="Largeur (mm)" valeur={brut.w} onChange={maj("w")} />
          <ChampMm label="Hauteur (mm)" valeur={brut.h} onChange={maj("h")} />
        </div>

        <div aria-live="polite" className="min-h-[1.25rem] space-y-1">
          {!enAttente &&
            erreurs.map((e) => (
              <p key={e} className="text-xs font-bold text-red-400">
                {e}
              </p>
            ))}
        </div>

        <button
          type="button"
          onClick={() => void valider()}
          disabled={!valide}
          className="h-12 w-full rounded-xl bg-red-600 text-sm font-bold text-white shadow-lg shadow-red-600/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {envoi ? "Enregistrement…" : "Valider"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 w-full text-sm font-bold text-gray-400"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
