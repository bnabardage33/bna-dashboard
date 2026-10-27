import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UrlScrapeRefusee } from "@/lib/validationUrlScrape";
import { messagePourEchec, useScraping } from "@/components/catalogue/useScraping";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ session: vi.fn(), scrape: vi.fn() }));
vi.mock("@/lib/auth", () => ({ verifierSession: mocks.session }));
vi.mock("@/lib/validationUrlScrape", async (orig) => {
  const reel = await orig<typeof import("@/lib/validationUrlScrape")>();
  return { ...reel, scrapeUrlSecurisee: mocks.scrape };
});
import { GET } from "@/app/api/scrape/route";

const { scrapeUrlSecurisee } = await vi.importActual<typeof import("@/lib/validationUrlScrape")>("@/lib/validationUrlScrape");
const resolveur = async () => ["93.184.216.34"];
const html = (status: number, headers: Record<string, string> = { "content-type": "text/html" }) =>
  (async () => new Response("<html></html>", { status, headers })) as unknown as typeof fetch;
const code = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as UrlScrapeRefusee; }
  throw new Error("aucune erreur levée");
};

describe("codes d'erreur — couche réseau (simulée)", () => {
  it.each([
    [403, "SITE_REFUSE"], [429, "SITE_REFUSE"], [404, "PAGE_INTROUVABLE"],
    [503, "SITE_INDISPONIBLE"],
  ])("HTTP %i -> %s", async (st, c) => {
    const e = await code(scrapeUrlSecurisee("https://exemple.test/p", { resolveur, fetcher: html(st) }));
    expect(e.code).toBe(c);
  });
  it("DNS en échec -> HOTE_INTROUVABLE", async () => {
    const e = await code(scrapeUrlSecurisee("https://exemple.test/p", { resolveur: async () => { throw new Error("ENOTFOUND"); } }));
    expect(e.code).toBe("HOTE_INTROUVABLE");
  });
  it("exception fetch -> ERREUR_RESEAU sans URL ni détail dans le message client", async () => {
    const fetcher = (async () => { throw Object.assign(new TypeError("fetch failed https://secret.test/x?t=1"), { cause: { code: "ECONNRESET" } }); }) as unknown as typeof fetch;
    const e = await code(scrapeUrlSecurisee("https://exemple.test/p", { resolveur, fetcher }));
    expect(e.code).toBe("ERREUR_RESEAU");
    expect(e.statut).toBe(502);
    expect(e.message).not.toMatch(/secret|http|ECONN/);
    expect(e.messageTechnique).toContain("ECONNRESET");
    expect(e.messageTechnique).not.toMatch(/secret|http/);
  });
  it("timeout -> DELAI_DEPASSE", async () => {
    const fetcher = ((_u: string, init?: RequestInit) => new Promise((_r, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
    })) as unknown as typeof fetch;
    vi.useFakeTimers();
    const p = code(scrapeUrlSecurisee("https://exemple.test/p", { resolveur, fetcher }));
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await p).code).toBe("DELAI_DEPASSE");
    vi.useRealTimers();
  });
  it("non HTML -> CONTENU_NON_HTML ; trop gros -> TROP_VOLUMINEUX ; URL invalide -> URL_INVALIDE", async () => {
    expect((await code(scrapeUrlSecurisee("https://exemple.test/p", { resolveur, fetcher: html(200, { "content-type": "application/json" }) }))).code).toBe("CONTENU_NON_HTML");
    expect((await code(scrapeUrlSecurisee("https://exemple.test/p", { resolveur, fetcher: html(200, { "content-type": "text/html", "content-length": "99999999" }) }))).code).toBe("TROP_VOLUMINEUX");
    expect((await code(scrapeUrlSecurisee("ftp://exemple.test/p", { resolveur }))).code).toBe("URL_INVALIDE");
  });
  it("redirection sans Location -> REDIRECTION_INVALIDE", async () => {
    const e = await code(scrapeUrlSecurisee("https://exemple.test/p", { resolveur, fetcher: html(301, { "content-type": "text/html" }) }));
    expect(e.code).toBe("REDIRECTION_INVALIDE");
  });
});

describe("route /api/scrape", () => {
  const appel = () => GET(new Request("http://localhost/api/scrape?url=https%3A%2F%2Fsecret.test%2Fx%3Ftoken%3D1"));
  beforeEach(() => { mocks.session.mockResolvedValue({ authentifie: true }); mocks.scrape.mockReset(); });

  it("session absente : réponse d'auth inchangée, aucun scraping", async () => {
    const reponse = new Response("{}", { status: 401 });
    mocks.session.mockResolvedValue({ authentifie: false, reponse });
    expect(await appel()).toBe(reponse);
    expect(mocks.scrape).not.toHaveBeenCalled();
  });
  it("UrlScrapeRefusee : statut + code stables, rien de sensible", async () => {
    mocks.scrape.mockRejectedValue(new UrlScrapeRefusee("Impossible de récupérer la ressource demandée", 403, "Erreur HTTP distante : 403 https://secret.test/x?token=1", "SITE_REFUSE"));
    const r = await appel();
    const corps = await r.json();
    expect(r.status).toBe(403);
    expect(corps).toEqual({ error: "Impossible de récupérer la ressource demandée", code: "SITE_REFUSE" });
    expect(JSON.stringify(corps)).not.toMatch(/secret|token|stack/);
  });
  it("erreur inattendue : ERREUR_INTERNE sans message ni stack", async () => {
    mocks.scrape.mockRejectedValue(new Error("boom https://secret.test/x"));
    const r = await appel();
    const corps = await r.json();
    expect(r.status).toBe(500);
    expect(corps.code).toBe("ERREUR_INTERNE");
    expect(JSON.stringify(corps)).not.toMatch(/boom|secret|at /);
  });
  it("page sans données produit : avertissement ; page produit : aucun", async () => {
    mocks.scrape.mockResolvedValue("<html><head><title>Un instant</title></head><body></body></html>");
    expect((await (await appel()).json()).avertissements).toEqual(["PAGE_SANS_DONNEES_PRODUIT"]);
    mocks.scrape.mockResolvedValue("<html><body><h1>Bardage acier</h1></body></html>");
    expect((await (await appel()).json()).avertissements).toEqual([]);
  });
});

describe("hook useScraping — messages", () => {
  const racines: Root[] = [];
  afterEach(() => { act(() => { racines.splice(0).forEach((r) => r.unmount()); }); vi.unstubAllGlobals(); });
  const alerte = vi.fn();
  beforeEach(() => { alerte.mockReset(); vi.stubGlobal("alert", alerte); vi.spyOn(console, "error").mockImplementation(() => {}); });
  const lancer = async (reponse: () => Promise<Response>) => {
    vi.stubGlobal("fetch", vi.fn(reponse));
    const onData = vi.fn();
    const result: { current: ReturnType<typeof useScraping> } = {} as never;
    function Harness() {
      result.current = useScraping("TERRASSE_LAME", onData);
      return null;
    }
    const conteneur = document.createElement("div");
    const root: Root = createRoot(conteneur);
    racines.push(root);
    await act(async () => { root.render(<Harness />); });
    act(() => result.current.setImportUrl("https://exemple.test/p"));
    await act(async () => { await result.current.scrape(); });
    return { result, onData };
  };
  it("messagePourEchec : chaque code a un message distinct, repli générique sinon", () => {
    const codes = ["URL_INVALIDE","HOTE_INTROUVABLE","SITE_REFUSE","PAGE_INTROUVABLE","SITE_INDISPONIBLE","DELAI_DEPASSE","CONTENU_NON_HTML","TROP_VOLUMINEUX","REDIRECTION_INVALIDE","ERREUR_RESEAU","ERREUR_INTERNE"];
    const msgs = codes.map((c) => messagePourEchec(502, { code: c }));
    expect(new Set(msgs).size).toBe(codes.length);
    expect(messagePourEchec(500, null)).toMatch(/Impossible de lire/);
    expect(messagePourEchec(500, { code: "INCONNU" })).toMatch(/Impossible de lire/);
    expect(messagePourEchec(401, null)).toMatch(/Session/);
  });
  it("403 SITE_REFUSE : message précis, aucune donnée appliquée", async () => {
    const { result, onData } = await lancer(async () => Response.json({ error: "x", code: "SITE_REFUSE" }, { status: 403 }));
    expect(alerte.mock.calls[0][0]).toMatch(/refusé la lecture automatique/);
    expect(result.current.error).toMatch(/refusé/);
    expect(onData).not.toHaveBeenCalled();
  });
  it("réponse d'erreur non JSON : message générique", async () => {
    const { result } = await lancer(async () => new Response("<html>502</html>", { status: 502 }));
    expect(result.current.error).toMatch(/Impossible de lire cette page/);
  });
  it("fetch qui échoue : message réseau côté BNA", async () => {
    const { result } = await lancer(async () => { throw new TypeError("Failed to fetch"); });
    expect(result.current.error).toMatch(/serveur BNA/);
  });
  it("succès 200 non JSON : message dédié", async () => {
    const { result, onData } = await lancer(async () => new Response("pas du json", { status: 200 }));
    expect(result.current.error).toMatch(/illisible/);
    expect(onData).not.toHaveBeenCalled();
  });
  it("page sans données produit : avertissement distinct du succès", async () => {
    await lancer(async () => Response.json({ avertissements: ["PAGE_SANS_DONNEES_PRODUIT"], prix_candidats: [] }));
    expect(alerte.mock.calls[0][0]).toMatch(/aucune donnée produit/);
  });
});
