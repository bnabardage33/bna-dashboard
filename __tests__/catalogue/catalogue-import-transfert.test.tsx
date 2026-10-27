import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import CataloguePage from "@/app/bureau/catalogue/page";

const { queryMock, supabaseMock } = vi.hoisted(() => {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  query.update = vi.fn(() => query);
  query.delete = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.then = (resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject);
  const supabase = { from: vi.fn(() => query) };
  return { queryMock: query, supabaseMock: supabase };
});

vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

let conteneur: HTMLDivElement;
let root: Root;

function urlFetch(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("transfert d'import Bardage", () => {
  it("ouvre le brouillon, préserve les paramètres non import et ne scrape ni n'enregistre", async () => {
    window.history.replaceState(
      {},
      "",
      "/bureau/catalogue?importUrl=https%3A%2F%2Ffournisseur.example%2Fx" +
        "&importTitle=Produit%20test&importFabricant=Marque&keep=oui#section"
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(CataloguePage)));
      await Promise.resolve();
    });

    expect((conteneur.querySelector("#chp-auto-url") as HTMLInputElement).value)
      .toBe("https://fournisseur.example/x");
    expect((conteneur.querySelector("#chp-designation") as HTMLInputElement).value)
      .toBe("Produit test");
    expect(conteneur.textContent).toContain("Marque");
    expect(window.location.search).toContain("keep=oui");
    expect(window.location.search).not.toContain("importUrl");
    expect(window.location.search).not.toContain("importTitle");
    expect(window.location.hash).toBe("#section");
    expect(fetchSpy.mock.calls.filter(([input]) => urlFetch(input).startsWith("/api/scrape?")))
      .toHaveLength(0);
    expect(queryMock.insert).not.toHaveBeenCalled();

    await act(async () => {
      (conteneur.querySelector('button[aria-label="Fermer"]') as HTMLButtonElement)
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const creation = Array.from(conteneur.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Nouvel Ouvrage")
    );
    expect(creation).toBeTruthy();
    await act(async () => {
      creation!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect((conteneur.querySelector("#chp-auto-url") as HTMLInputElement).value).toBe("");
    expect(conteneur.textContent).not.toContain("Marque");

    fetchSpy.mockRestore();
  });
});
