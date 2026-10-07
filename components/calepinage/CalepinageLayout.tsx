"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCalepinageZone } from "@/hooks/calepinage/useCalepinageZone";
import PlanCalepinageCanvas from "@/components/calepinage/PlanCalepinageCanvas";
import Vue3DFacade from "@/components/calepinage/Vue3DFacade";
import BordereauDebit from "@/components/calepinage/BordereauDebit";
import CalepinageZoneForm from "@/components/calepinage/CalepinageZoneForm";

export type CalepinageTab = "plan" | "vue3d" | "bordereau" | "parametres";

const TABS: { id: CalepinageTab; label: string }[] = [
  { id: "plan", label: "Plan 2D" },
  { id: "vue3d", label: "Vue 3D" },
  { id: "bordereau", label: "Bordereau" },
  { id: "parametres", label: "Paramètres" },
];

export interface CalepinageLayoutProps {
  zoneId: string;
}

function CalepinageLayoutContent({ zoneId }: CalepinageLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Détermination de l'onglet actif depuis les query params
  const tabParam = searchParams.get("tab") as CalepinageTab | null;
  const activeTab: CalepinageTab =
    tabParam && ["plan", "vue3d", "bordereau", "parametres"].includes(tabParam)
      ? tabParam
      : "plan";

  const {
    zone,
    ouvertures,
    modules,
    groups,
    percages,
    isLoading,
    isCalculating,
    error,
    calculate,
  } = useCalepinageZone(zoneId);

  // État local pour le menu ⋮ et la feuille d'export
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<"excel" | "pdf" | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mémorisation des onglets déjà visités pour le lazy loading
  const [visitedTabs, setVisitedTabs] = useState<Set<CalepinageTab>>(
    () => new Set(["plan", activeTab]),
  );

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  const showToast = useCallback((text: string, isError = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage({ text, isError });
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  const changeTab = useCallback(
    (newTab: CalepinageTab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newTab === "plan") {
        params.delete("tab");
      } else {
        params.set("tab", newTab);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  // Déclenchement du calcul et bascule vers l'onglet "Plan 2D"
  const handleCalculer = useCallback(async () => {
    if (isCalculating) return;
    try {
      await calculate();
      showToast("Calepinage calculé avec succès");
      changeTab("plan");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur lors du calcul";
      showToast(msg, true);
    }
  }, [calculate, changeTab, isCalculating, showToast]);

  // Export de fichier côté serveur
  const handleExport = useCallback(
    async (format: "excel" | "pdf") => {
      if (isExporting) return;
      setIsExporting(format);
      setMenuOpen(false);
      setExportSheetOpen(false);

      const endpoint =
        format === "excel"
          ? "/api/calepinage/export/excel"
          : "/api/calepinage/export/pdf";

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zone_id: zoneId }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(
            json?.error ?? `Échec de l'export (${res.status})`,
          );
        }

        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = /filename="([^"]+)"/.exec(disposition);
        const fileName =
          match?.[1] ?? `bordereau_${zoneId}.${format === "excel" ? "xlsx" : "pdf"}`;

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

        showToast(
          `Export ${format.toUpperCase()} téléchargé avec succès`,
        );
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Erreur lors de l'export";
        showToast(msg, true);
      } finally {
        setIsExporting(null);
      }
    },
    [isExporting, showToast, zoneId],
  );

  // Swipe gesture horizontal pour changer d'onglet
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    // Si l'interaction se fait sur le canvas ou la scène 3D, on ne détourne pas le geste
    const target = e.target as HTMLElement | null;
    if (
      target?.closest("canvas") ||
      target?.closest(".cal3d-module") ||
      target?.closest("[data-prevent-swipe]")
    ) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Déplacement horizontal significatif et supérieur au vertical
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const currentIndex = TABS.findIndex((t) => t.id === activeTab);
      if (dx < 0 && currentIndex < TABS.length - 1) {
        // Swipe vers la gauche -> onglet suivant
        changeTab(TABS[currentIndex + 1].id);
      } else if (dx > 0 && currentIndex > 0) {
        // Swipe vers la droite -> onglet précédent
        changeTab(TABS[currentIndex - 1].id);
      }
    }
  };

  // Fermeture du menu déroulant au clic extérieur
  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-menu-container]")) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [menuOpen]);

  // Dimensions de la zone en mm
  const zoneWidthMm = zone ? Math.round(zone.largeur * 1000) : 0;
  const zoneHeightMm = zone ? Math.round(zone.hauteur_mur * 1000) : 0;

  // URL de retour adaptative (compatible /dashboard/calepinage et /calepinage)
  const returnHref = pathname.startsWith("/dashboard/calepinage")
    ? "/dashboard/calepinage"
    : "/calepinage";

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="flex min-h-screen flex-col bg-[#121212] text-white"
    >
      {/* Toast notifications */}
      {toastMessage && (
        <div
          role="status"
          className={`fixed left-1/2 top-4 z-[350] max-w-[90vw] -translate-x-1/2 rounded-xl border px-4 py-3 text-sm font-bold shadow-2xl transition-all ${
            toastMessage.isError
              ? "border-red-500/50 bg-[#1E1E1E] text-red-400"
              : "border-emerald-500/50 bg-[#1E1E1E] text-emerald-400"
          }`}
        >
          {toastMessage.text}
        </div>
      )}

      {/* 1. Header sticky (56px) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#2e2e2e] bg-[#161616] px-3 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={returnHref}
            aria-label="Retour au calepinage"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg text-gray-300 hover:bg-[#252525] active:bg-[#2e2e2e]"
          >
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-white">
              {zone?.nom ?? (isLoading ? "Chargement..." : "Calepinage")}
            </h1>
            {zone && (
              <p className="truncate text-[11px] text-gray-400">
                {zone.largeur} × {zone.hauteur_mur} m • {zone.materiau ?? "Module"}
              </p>
            )}
          </div>
        </div>

        {/* Menu ⋮ */}
        <div className="relative shrink-0" data-menu-container>
          <button
            type="button"
            aria-label="Options"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-xl text-gray-300 hover:bg-[#252525] active:bg-[#2e2e2e]"
          >
            ⋮
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-12 z-40 w-48 rounded-xl border border-[#333] bg-[#1c1c1c] py-1 shadow-2xl shadow-black/70">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void handleCalculer();
                }}
                disabled={isCalculating || isLoading}
                className="flex h-11 w-full items-center gap-3 px-4 text-left text-sm font-semibold text-white hover:bg-[#292929] disabled:opacity-50"
              >
                <span>⚙️</span> Recalculer
              </button>
              <div className="my-1 border-t border-[#2e2e2e]" />
              <button
                type="button"
                onClick={() => void handleExport("excel")}
                disabled={isExporting !== null || modules.length === 0}
                className="flex h-11 w-full items-center gap-3 px-4 text-left text-sm font-semibold text-white hover:bg-[#292929] disabled:opacity-50"
              >
                <span>📊</span> Exporter Excel
              </button>
              <button
                type="button"
                onClick={() => void handleExport("pdf")}
                disabled={isExporting !== null || modules.length === 0}
                className="flex h-11 w-full items-center gap-3 px-4 text-left text-sm font-semibold text-white hover:bg-[#292929] disabled:opacity-50"
              >
                <span>📄</span> Exporter PDF
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Sous-header avec onglets (48px) */}
      <nav
        aria-label="Onglets de calepinage"
        className="sticky top-14 z-20 flex h-12 items-center border-b border-[#2e2e2e] bg-[#1a1a1a] px-3 overflow-x-auto no-scrollbar"
      >
        <div className="flex gap-1.5 w-full">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => changeTab(tab.id)}
                className={`flex-1 min-w-[76px] h-9 rounded-lg px-2 text-xs font-bold transition-all text-center flex items-center justify-center ${
                  isActive
                    ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                    : "bg-[#252525] text-gray-400 hover:text-gray-200 active:bg-[#2e2e2e]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Message d'erreur initial si la zone n'a pu être chargée */}
      {error && (
        <div className="m-4 rounded-xl border border-red-500/40 bg-red-950/20 p-4 text-sm text-red-400">
          <p className="font-bold">Erreur de chargement</p>
          <p className="text-xs text-gray-300 mt-1">{error}</p>
        </div>
      )}

      {/* 3. Zone de contenu (remplit l'espace disponible) */}
      <main className="flex-1 relative flex flex-col pb-20">
        {/* Onglet Plan 2D : conservé monté pour garder la vue et les interactions, masqué en CSS si inactif */}
        <div
          style={{ display: activeTab === "plan" ? "block" : "none" }}
          className="flex-1 w-full"
        >
          {zone && (
            <PlanCalepinageCanvas
              modules={modules}
              groups={groups}
              openings={ouvertures}
              percages={percages}
              zoneWidthMm={zoneWidthMm}
              zoneHeightMm={zoneHeightMm}
            />
          )}
        </div>

        {/* Onglet Vue 3D : unmount complet hors de l'onglet actif pour libérer GPU/DOM */}
        {activeTab === "vue3d" && zone && (
          <div className="flex-1 w-full">
            <Vue3DFacade
              modules={modules}
              groups={groups}
              openings={ouvertures}
              zoneWidthMm={zoneWidthMm}
              zoneHeightMm={zoneHeightMm}
            />
          </div>
        )}

        {/* Onglet Bordereau : lazy loaded et scrollable */}
        {visitedTabs.has("bordereau") && (
          <div
            style={{ display: activeTab === "bordereau" ? "block" : "none" }}
            className="flex-1 w-full overflow-y-auto"
          >
            {zone && (
              <BordereauDebit
                groups={groups}
                modules={modules}
                percages={percages}
                zone={zone}
                onExport={(fmt) => showToast(`Export ${fmt.toUpperCase()} réussi`)}
              />
            )}
          </div>
        )}

        {/* Onglet Paramètres : formulaire + ouvertures */}
        {visitedTabs.has("parametres") && (
          <div
            style={{ display: activeTab === "parametres" ? "block" : "none" }}
            className="flex-1 w-full overflow-y-auto"
          >
            {zone && (
              <CalepinageZoneForm
                zoneId={zoneId}
                zone={zone}
                onCalculate={() => {
                  showToast("Calepinage calculé");
                  changeTab("plan");
                }}
              />
            )}
          </div>
        )}
      </main>

      {/* 4. Bottom bar (64px) */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 flex h-16 items-center border-t border-[#2e2e2e] bg-[#161616]/95 backdrop-blur-md px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {activeTab === "parametres" ? (
          <button
            type="button"
            onClick={() => void handleCalculer()}
            disabled={isCalculating || isLoading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white shadow-lg shadow-red-600/20 active:bg-red-700 disabled:opacity-50"
          >
            {isCalculating && (
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            )}
            {isCalculating ? "Calcul en cours..." : "Calculer le calepinage"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setExportSheetOpen(true)}
            disabled={isExporting !== null || modules.length === 0}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#252525] border border-[#3a3a3a] text-sm font-bold text-white shadow-md active:bg-[#2e2e2e] disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <span
                  aria-hidden
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
                Export en cours...
              </>
            ) : (
              <>
                <span>📥</span> Exporter
              </>
            )}
          </button>
        )}
      </footer>

      {/* Bottom sheet d'export (activé par le bouton Exporter du footer) */}
      {exportSheetOpen && (
        <div
          className="fixed inset-0 z-[250] flex items-end bg-black/60 backdrop-blur-sm"
          onClick={() => setExportSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Format d'exportation"
            onClick={(e) => e.stopPropagation()}
            className="w-full space-y-3 rounded-t-2xl border-t border-[#333] bg-[#1a1a1a] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-[#444]" />
            <h2 className="text-base font-bold text-white">
              Exporter le bordereau
            </h2>
            <p className="text-xs text-gray-400">
              Choisissez le format de fichier souhaité pour la zone{" "}
              {zone?.nom ?? ""}.
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => void handleExport("excel")}
                className="flex h-12 w-full items-center justify-between rounded-xl border border-[#333] bg-[#222] px-4 text-sm font-bold text-white hover:bg-[#2a2a2a] active:bg-[#333]"
              >
                <span className="flex items-center gap-3">
                  <span>📊</span> Excel (.xlsx)
                </span>
                <span className="text-xs text-gray-400">Complet + modules</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExport("pdf")}
                className="flex h-12 w-full items-center justify-between rounded-xl border border-[#333] bg-[#222] px-4 text-sm font-bold text-white hover:bg-[#2a2a2a] active:bg-[#333]"
              >
                <span className="flex items-center gap-3">
                  <span>📄</span> PDF A4 (.pdf)
                </span>
                <span className="text-xs text-gray-400">Avec mini-plan</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setExportSheetOpen(false)}
              className="mt-2 h-10 w-full rounded-xl text-sm font-bold text-gray-400 hover:text-white"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CalepinageLayout(props: CalepinageLayoutProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#121212] text-gray-400 text-sm">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-red-500/40 border-t-red-500 mr-3" />
          Chargement du calepinage...
        </div>
      }
    >
      <CalepinageLayoutContent {...props} />
    </Suspense>
  );
}
