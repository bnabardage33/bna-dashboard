import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

// @ts-expect-error test act flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import ZoneListCard from "@/components/calepinage/ZoneListCard";
import CalepinageLayout from "@/components/calepinage/CalepinageLayout";
import type { ChantierZoneResume } from "@/types/calepinage";

// Mocks next/navigation
const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockPathname = "/dashboard/calepinage/zone-123";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

// Mock useCalepinageZone
const mockCalculate = vi.fn().mockResolvedValue({ success: true });
vi.mock("@/hooks/calepinage/useCalepinageZone", () => ({
  useCalepinageZone: (zoneId: string) => ({
    zone: {
      id: zoneId,
      nom: "Zone Test Façade",
      type: "facade",
      largeur: 5,
      hauteur_mur: 3,
      hauteur_faite: null,
      materiau: "Zinc",
      chantier_id: "c-1",
      entreprise_id: "e-1",
      angle: false,
      famille_pose: null,
      created_at: "2026-10-05T00:00:00Z",
    },
    ouvertures: [],
    modules: [
      {
        id: "m-1",
        zone_id: zoneId,
        entreprise_id: "e-1",
        group_number: "G-001",
        x_mm: 0,
        y_mm: 0,
        width_mm: 1000,
        height_mm: 600,
        is_cut: false,
        is_rotated: false,
        is_flipped: false,
        treatment: "none",
        material: "Zinc",
        created_at: "2026-10-05T00:00:00Z",
      },
    ],
    groups: [
      {
        id: "g-1",
        zone_id: zoneId,
        entreprise_id: "e-1",
        group_number: "G-001",
        width_mm: 1000,
        height_mm: 600,
        is_rotated: false,
        is_flipped: false,
        treatment: "none",
        material: "Zinc",
        count: 15,
      },
    ],
    isLoading: false,
    isCalculating: false,
    error: null,
    refetch: vi.fn(),
    addOuverture: vi.fn(),
    updateOuverture: vi.fn(),
    deleteOuverture: vi.fn(),
    calculate: mockCalculate,
  }),
}));

// Mock child components that might touch canvas or browser APIs
vi.mock("@/components/calepinage/PlanCalepinageCanvas", () => ({
  default: () => <div data-testid="plan-canvas-mock">PlanCanvas</div>,
}));

vi.mock("@/components/calepinage/Vue3DFacade", () => ({
  default: () => <div data-testid="vue-3d-mock">Vue3D</div>,
}));

vi.mock("@/components/calepinage/BordereauDebit", () => ({
  default: () => <div data-testid="bordereau-mock">Bordereau</div>,
}));

vi.mock("@/components/calepinage/CalepinageZoneForm", () => ({
  default: () => <div data-testid="zone-form-mock">ZoneForm</div>,
}));

describe("ZoneListCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const zone: ChantierZoneResume = {
    id: "zone-abc",
    nom: "Façade Ouest",
    type: "facade",
    largeur: 8.5,
    hauteur_mur: 4.2,
    hauteur_faite: null,
    materiau: "Alucobond",
    chantier_id: "ch-1",
    entreprise_id: "ent-1",
    created_at: "2026-10-05T00:00:00Z",
  };

  it("affiche les détails de la zone et le badge Non calculé par défaut", () => {
    act(() => {
      root.render(<ZoneListCard zone={zone} isCalcule={false} />);
    });

    expect(container.textContent).toContain("Façade Ouest");
    expect(container.textContent).toContain("8.5 × 4.2 m");
    expect(container.textContent).toContain("Alucobond");
    expect(container.textContent).toContain("Non calculé");
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/dashboard/calepinage/zone-abc");
  });

  it("affiche le badge Calculé si isCalcule est true", () => {
    act(() => {
      root.render(<ZoneListCard zone={zone} isCalcule={true} />);
    });

    expect(container.textContent).toContain("Calculé");
    expect(container.textContent).not.toContain("Non calculé");
  });

  it("affiche Pignon et la hauteur au faîtage si type est pignon", () => {
    const pignonZone: ChantierZoneResume = {
      ...zone,
      type: "pignon",
      hauteur_faite: 6.8,
    };
    act(() => {
      root.render(<ZoneListCard zone={pignonZone} isCalcule={true} />);
    });

    expect(container.textContent).toContain("Pignon");
    expect(container.textContent).toContain("faîtage: 6.8 m");
  });
});

describe("CalepinageLayout", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockSearchParams = new URLSearchParams();
    mockPush.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("affiche l'en-tête avec le nom de la zone et les 4 onglets", () => {
    act(() => {
      root.render(<CalepinageLayout zoneId="zone-123" />);
    });

    expect(container.textContent).toContain("Zone Test Façade");
    expect(container.textContent).toContain("Plan 2D");
    expect(container.textContent).toContain("Vue 3D");
    expect(container.textContent).toContain("Bordereau");
    expect(container.textContent).toContain("Paramètres");

    // Bouton de retour
    const backLink = container.querySelector("header a");
    expect(backLink?.getAttribute("href")).toBe("/dashboard/calepinage");

    // Onglet Plan 2D actif par défaut
    expect(container.querySelector('[data-testid="plan-canvas-mock"]')).not.toBeNull();
  });

  it("permet de naviguer vers un autre onglet au clic", () => {
    act(() => {
      root.render(<CalepinageLayout zoneId="zone-123" />);
    });

    const buttons = Array.from(container.querySelectorAll('nav[aria-label="Onglets de calepinage"] button'));
    const vue3dButton = buttons.find((b) => b.textContent?.includes("Vue 3D"));
    expect(vue3dButton).toBeDefined();

    act(() => {
      vue3dButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockPush).toHaveBeenCalledWith("/dashboard/calepinage/zone-123?tab=vue3d");
  });

  it("affiche le bouton Exporter dans le footer sur l'onglet Plan 2D", () => {
    act(() => {
      root.render(<CalepinageLayout zoneId="zone-123" />);
    });

    const footer = container.querySelector("footer");
    expect(footer?.textContent).toContain("Exporter");
  });

  it("affiche le bouton Calculer le calepinage dans le footer sur l'onglet Paramètres", () => {
    mockSearchParams = new URLSearchParams("tab=parametres");

    act(() => {
      root.render(<CalepinageLayout zoneId="zone-123" />);
    });

    const footer = container.querySelector("footer");
    expect(footer?.textContent).toContain("Calculer le calepinage");
  });
});
