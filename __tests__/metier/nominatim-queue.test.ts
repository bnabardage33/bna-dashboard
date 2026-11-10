import { beforeEach, describe, expect, it, vi } from "vitest";

describe("file d'attente Nominatim", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("espace les appels concurrents d'au moins 1 100 ms", async () => {
    const instants: number[] = [];

    vi.spyOn(global, "fetch").mockImplementation(async () => {
      instants.push(Date.now());

      return {
        ok: true,
        status: 200,
        json: async () => []
      } as Response;
    });

    const { fetchNominatim } = await import(
      "../../lib/deplacement/nominatimQueue"
    );

    await Promise.all([
      fetchNominatim("https://example.test/1", "BNA-Test"),
      fetchNominatim("https://example.test/2", "BNA-Test"),
      fetchNominatim("https://example.test/3", "BNA-Test")
    ]);

    expect(instants).toHaveLength(3);
    expect(instants[1] - instants[0]).toBeGreaterThanOrEqual(1_050);
    expect(instants[2] - instants[1]).toBeGreaterThanOrEqual(1_050);
  }, 10_000);

  it("respecte Retry-After après un HTTP 429", async () => {
    const instants: number[] = [];

    vi.spyOn(global, "fetch").mockImplementation(async () => {
      instants.push(Date.now());

      if (instants.length === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "Retry-After": "3" })
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => []
      } as Response;
    });

    const { fetchNominatim } = await import(
      "../../lib/deplacement/nominatimQueue"
    );

    const debut = Date.now();

    const premier = await fetchNominatim(
      "https://example.test/429",
      "BNA-Test"
    );

    const second = await fetchNominatim(
      "https://example.test/apres-429",
      "BNA-Test"
    );

    expect(premier.status).toBe(429);
    expect(second.status).toBe(200);
    expect(instants).toHaveLength(2);
    expect(instants[1] - debut).toBeGreaterThanOrEqual(2_900);
  }, 10_000);
});
