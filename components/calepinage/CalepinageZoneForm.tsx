"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChantierZone, Opening, OpeningType } from "@/types/calepinage";
import { useCalepinageZone } from "@/hooks/calepinage/useCalepinageZone";
import OuvertureSheet, {
  TYPES_OUVERTURE,
  type OuvertureValeurs,
} from "@/components/calepinage/OuvertureSheet";

// Formulaire mobile-first de calepinage d'une zone. Ne duplique PAS ZoneCard :
// paramètres en lecture seule, saisie des ouvertures positionnées (mm) et
// déclenchement du calcul côté serveur. Le rendu du résultat est assuré par
// PlanCalepinageCanvas (hors de ce composant).

export interface CalepinageZoneFormProps {
  zoneId: string;
  zone: ChantierZone;
  /** Appelé après un calcul réussi (ex. pour rafraîchir le canvas du parent). */
  onCalculate?: () => void;
  /** Flèche retour du header (affichée seulement si fournie). */
  onBack?: () => void;
  /** Renvoie vers ZoneCard pour modifier les paramètres. */
  onEditParams?: () => void;
}

const STYLE_TYPE: Record<OpeningType, string> = {
  fenetre: "bg-blue-500/20 text-blue-300",
  porte: "bg-amber-900/40 text-amber-500",
  vide: "bg-gray-500/20 text-gray-300",
};
const LABEL_TYPE = Object.fromEntries(TYPES_OUVERTURE.map((t) => [t.valeur, t.label])) as Record<
  OpeningType,
  string
>;

const messageErreur = (e: unknown, repli: string): string =>
  e instanceof Error ? e.message : repli;

type Toast = { texte: string; erreur: boolean };

const CarteOuverture = memo(function CarteOuverture({
  ouverture,
  menuOuvert,
  onMenu,
  onModifier,
  onSupprimer,
}: {
  ouverture: Opening;
  menuOuvert: boolean;
  onMenu: (id: string | null) => void;
  onModifier: (o: Opening) => void;
  onSupprimer: (o: Opening) => void;
}) {
  return (
    <li className="relative flex items-center gap-3 rounded-xl border border-[#333] bg-[#1E1E1E] p-3">
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STYLE_TYPE[ouverture.type]}`}
      >
        {LABEL_TYPE[ouverture.type]}
      </span>
      <div className="min-w-0 flex-1 text-xs text-gray-300">
        <p className="font-bold text-white">
          {ouverture.width_mm} × {ouverture.height_mm} mm
        </p>
        <p>
          x : {ouverture.x_mm} · y : {ouverture.y_mm} mm
        </p>
      </div>
      <button
        type="button"
        aria-label="Actions sur l'ouverture"
        aria-haspopup="menu"
        aria-expanded={menuOuvert}
        onClick={() => onMenu(menuOuvert ? null : ouverture.id)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-gray-400 active:bg-[#2a2a2a]"
      >
        ⋮
      </button>
      {menuOuvert && (
        <div
          role="menu"
          className="absolute right-3 top-14 z-10 w-36 overflow-hidden rounded-xl border border-[#333] bg-[#121212] shadow-xl shadow-black/40"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => onModifier(ouverture)}
            className="block h-11 w-full px-4 text-left text-sm font-bold text-white active:bg-[#2a2a2a]"
          >
            Modifier
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onSupprimer(ouverture)}
            className="block h-11 w-full px-4 text-left text-sm font-bold text-red-400 active:bg-[#2a2a2a]"
          >
            Supprimer
          </button>
        </div>
      )}
    </li>
  );
});

export default function CalepinageZoneForm({
  zoneId,
  zone,
  onCalculate,
  onBack,
  onEditParams,
}: CalepinageZoneFormProps) {
  const {
    ouvertures,
    isLoading,
    isCalculating,
    error,
    addOuverture,
    updateOuverture,
    deleteOuverture,
    calculate,
  } = useCalepinageZone(zoneId);

  const [paramsOuverts, setParamsOuverts] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  // `null` = feuille fermée (donc démontée) ; "nouvelle" = création ; sinon édition.
  const [feuille, setFeuille] = useState<"nouvelle" | Opening | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const afficherToast = useCallback((texte: string, erreur = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ texte, erreur });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const zoneLargeurMm = Math.round(zone.largeur * 1000);
  const zoneHauteurMm = Math.round(zone.hauteur_mur * 1000);

  const autresOuvertures = useMemo(
    () =>
      feuille && feuille !== "nouvelle" ? ouvertures.filter((o) => o.id !== feuille.id) : ouvertures,
    [ouvertures, feuille],
  );

  async function lancerCalcul() {
    if (isCalculating) return;
    try {
      await calculate();
      afficherToast("Calepinage calculé");
      onCalculate?.();
    } catch (e: unknown) {
      afficherToast(messageErreur(e, "Échec du calcul"), true);
    }
  }

  async function enregistrer(v: OuvertureValeurs) {
    try {
      if (feuille && feuille !== "nouvelle") {
        await updateOuverture(feuille.id, v);
      } else {
        await addOuverture(v);
      }
      setFeuille(null);
    } catch (e: unknown) {
      // La feuille reste ouverte pour permettre de corriger / réessayer.
      afficherToast(messageErreur(e, "Enregistrement impossible"), true);
    }
  }

  const modifier = useCallback((o: Opening) => {
    setMenuId(null);
    setFeuille(o);
  }, []);

  const supprimer = useCallback(
    async (o: Opening) => {
      setMenuId(null);
      if (!window.confirm("Supprimer cette ouverture ?")) return;
      try {
        await deleteOuverture(o.id);
      } catch (e: unknown) {
        afficherToast(messageErreur(e, "Suppression impossible"), true);
      }
    },
    [deleteOuverture, afficherToast],
  );

  const fermerFeuille = useCallback(() => setFeuille(null), []);

  return (
    <div className="flex min-h-full flex-col bg-[#121212] text-white">
      {toast && (
        <div
          role="status"
          className={`fixed left-1/2 top-16 z-[300] max-w-[90vw] -translate-x-1/2 rounded-xl border bg-[#1E1E1E] px-4 py-3 text-sm font-bold shadow-xl shadow-black/40 ${
            toast.erreur ? "border-red-500/40 text-red-400" : "border-emerald-500/40 text-emerald-400"
          }`}
        >
          {toast.texte}
        </div>
      )}

      {/* 1. Header sticky 56px */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-[#333] bg-[#121212] px-3">
        {onBack && (
          <button
            type="button"
            aria-label="Retour"
            onClick={onBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl text-gray-300 active:bg-[#1E1E1E]"
          >
            ←
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">{zone.nom}</h1>
        <button
          type="button"
          onClick={() => void lancerCalcul()}
          disabled={isCalculating || isLoading}
          aria-busy={isCalculating}
          className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white shadow-lg shadow-red-600/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCalculating && (
            <span
              aria-hidden
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {isCalculating ? "Calcul…" : "Calculer"}
        </button>
      </header>

      <main className="flex-1 space-y-4 p-4">
        {/* 2. Paramètres (lecture seule, accordion) */}
        <section className="rounded-xl border border-[#333] bg-[#1E1E1E]">
          <button
            type="button"
            aria-expanded={paramsOuverts}
            onClick={() => setParamsOuverts((o) => !o)}
            className="flex h-12 w-full items-center justify-between px-4 text-sm font-bold"
          >
            Paramètres de la zone
            <span aria-hidden className={`transition-transform ${paramsOuverts ? "rotate-180" : ""}`}>
              ▾
            </span>
          </button>
          {paramsOuverts && (
            <div className="space-y-3 border-t border-[#333] p-4 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-gray-400">Dimensions</dt>
                  <dd className="font-bold">
                    {zone.largeur} × {zone.hauteur_mur} m
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Module</dt>
                  <dd className="font-bold">
                    {zone.module_largeur_mm != null && zone.module_hauteur_mm != null
                      ? `${zone.module_largeur_mm} × ${zone.module_hauteur_mm} mm`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Sens de pose</dt>
                  <dd className="font-bold">{zone.sens_pose ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400">Matériau</dt>
                  <dd className="font-bold">{zone.materiau ?? "—"}</dd>
                </div>
              </dl>
              {onEditParams && (
                <button
                  type="button"
                  onClick={onEditParams}
                  className="h-11 w-full rounded-xl border border-[#333] text-sm font-bold text-white active:bg-[#2a2a2a]"
                >
                  Modifier
                </button>
              )}
            </div>
          )}
        </section>

        {/* 3. Ouvertures */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">Ouvertures</h2>
            <span className="rounded-full bg-[#2a2a2a] px-2 py-0.5 text-xs font-bold text-gray-300">
              {ouvertures.length}
            </span>
          </div>

          {error && <p className="text-sm font-bold text-red-400">{error}</p>}

          {isLoading ? (
            <p className="text-sm text-gray-400">Chargement…</p>
          ) : ouvertures.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#333] p-4 text-center text-sm text-gray-400">
              Aucune ouverture. Appuyez sur + pour ajouter.
            </p>
          ) : (
            <ul className="space-y-2">
              {ouvertures.map((o) => (
                <CarteOuverture
                  key={o.id}
                  ouverture={o}
                  menuOuvert={menuId === o.id}
                  onMenu={setMenuId}
                  onModifier={modifier}
                  onSupprimer={supprimer}
                />
              ))}
            </ul>
          )}
        </section>
      </main>

      {/* Bouton sticky en bas */}
      <div className="sticky bottom-0 z-20 border-t border-[#333] bg-[#121212] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setFeuille("nouvelle")}
          disabled={isLoading}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white shadow-lg shadow-red-600/10 disabled:opacity-60"
        >
          <span aria-hidden className="text-lg leading-none">
            +
          </span>
          Ajouter une ouverture
        </button>
      </div>

      {/* 4. Bottom sheet : monté seulement quand ouvert */}
      {feuille && (
        <OuvertureSheet
          ouverture={feuille === "nouvelle" ? undefined : feuille}
          autresOuvertures={autresOuvertures}
          zoneLargeurMm={zoneLargeurMm}
          zoneHauteurMm={zoneHauteurMm}
          onSubmit={enregistrer}
          onCancel={fermerFeuille}
        />
      )}
    </div>
  );
}
