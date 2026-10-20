// Accueil — dictée vocale : bouton compact, bulle, et non-perte du texte
// ============================================================================
//
// La refonte a supprimé la grande carte « Assistant vocal (IA) » et déplacé le
// bouton « Dicter une note » dans l'en-tête. Ces tests vérifient que :
//
//   1. le composant vocal RESTE l'unique implémentation (aucune seconde
//      reconnaissance) et relaie son état à un parent qui affiche une bulle ;
//   2. le texte transcrit est livré AVANT la reformulation : si celle-ci échoue,
//      il n'est pas perdu ;
//   3. une erreur laisse la bulle en état d'erreur (elle ne se referme pas en
//      silence) ;
//   4. côté accueil, la bulle est branchée sur ces rappels, distingue écoute /
//      traitement / erreur, et n'utilise plus `alert()`.
//
// Le vrai `BoutonMicroNote` est monté (avec de faux `MediaRecorder`,
// `getUserMedia` et `fetch`) : on observe le comportement réel, pas la source.
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";

// ── Doublures navigateur ────────────────────────────────────────────────────

/**
 * Faux `MediaRecorder` : `stop()` fabrique un fragment de plus de 1000 octets
 * (le seuil en dessous duquel le composant abandonne) puis déclenche `onstop`.
 */
class FauxMediaRecorder {
  static isTypeSupported() {
    return true;
  }
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, _options?: { mimeType?: string }) {}
  start() {
    /* l'enregistrement démarre : rien à simuler */
  }
  stop() {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(1500)]) });
    this.onstop?.();
  }
}

const reponse = (ok: boolean, corps: unknown, status = 200) => ({
  ok,
  status,
  json: async () => corps,
});

let conteneur: HTMLDivElement;
let root: Root;

const ENV = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ENV.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete ENV.IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  vi.stubGlobal("MediaRecorder", FauxMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => {} }] })),
    },
  });
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Monte le vrai composant et renvoie ses enregistrements d'appels. */
async function rendreBouton() {
  const etats: string[] = [];
  const transcriptions: string[] = [];
  const reformules: string[] = [];
  const erreurs: string[] = [];
  const mod = (await import("@/components/BoutonMicroNote")) as {
    default: (p: unknown) => unknown;
  };
  await act(async () => {
    root.render(
      createElement(mod.default as never, {
        onTexteReformule: (t: string) => reformules.push(t),
        onErreur: (m: string) => erreurs.push(m),
        onEtat: (e: string) => etats.push(e),
        onTranscription: (t: string) => transcriptions.push(t),
      }),
    );
  });
  return { etats, transcriptions, reformules, erreurs };
}

function bouton(): HTMLButtonElement {
  return conteneur.querySelector("button") as HTMLButtonElement;
}

/**
 * Laisse la chaîne asynchrone se dérouler jusqu'au bout.
 *
 * La transcription enchaîne plusieurs `await` de promesses (deux `fetch`, leurs
 * `json()`), tous en microtâches : une microtâche « macrotâche » (setTimeout 0)
 * suffit à ce que toutes les microtâches en attente soient purgées avant.
 */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("BoutonMicroNote — états et transcription", () => {
  it("relaie écoute → transcription → reformulation → inactif, et livre le texte", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/transcrire-note")) return reponse(true, { texteBrut: "Bonjour le chantier" });
      return reponse(true, { texteReformule: "Note propre" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { etats, transcriptions, reformules } = await rendreBouton();

    await act(async () => {
      bouton().click(); // démarrer
    });
    await act(async () => {
      bouton().click(); // arrêter → transcription → reformulation
    });
    await flush();

    expect(etats).toEqual(["enregistrement", "transcription", "reformulation", "inactif"]);
    expect(transcriptions).toEqual(["Bonjour le chantier"]);
    expect(reformules).toEqual(["Note propre"]);
  });

  it("ne perd PAS la transcription si la reformulation échoue", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/api/transcrire-note")) return reponse(true, { texteBrut: "Bonjour" });
      return reponse(false, {}, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { etats, transcriptions, reformules, erreurs } = await rendreBouton();

    await act(async () => {
      bouton().click();
    });
    await act(async () => {
      bouton().click();
    });
    await flush();

    // Le texte transcrit a bien été livré AVANT l'échec…
    expect(transcriptions).toEqual(["Bonjour"]);
    // …et il n'a pas été « reformulé » (aucune fausse note).
    expect(reformules).toEqual([]);
    // L'état final est `erreur`, pas `inactif` : la bulle reste ouverte.
    expect(etats[etats.length - 1]).toBe("erreur");
    expect(erreurs.join(" ")).toMatch(/reformulation/i);
  });

  it("signale un micro refusé de façon compréhensible", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => Promise.reject(new Error("Permission denied"))) },
    });

    const { etats, erreurs } = await rendreBouton();

    await act(async () => {
      bouton().click();
    });
    await flush();

    expect(etats).toEqual(["erreur"]);
    expect(erreurs.join(" ")).toMatch(/micro/i);
    // Le bouton revient utilisable : on peut relancer une dictée.
    expect(bouton().disabled).toBe(false);
  });
});

// ── Côté accueil : câblage et contenu de la bulle (sources) ─────────────────

const ACCUEIL = readFileSync("components/DashboardAccueil.tsx", "utf8");
const BOUTON_SRC = readFileSync("components/BoutonMicroNote.tsx", "utf8");

describe("Accueil — câblage de la bulle de dictée", () => {
  it("branche les trois rappels du composant vocal existant", () => {
    expect(ACCUEIL).toContain("onEtat={handleEtatDictee}");
    expect(ACCUEIL).toContain("onTranscription={setTexteDictee}");
    expect(ACCUEIL).toContain("onErreur={setErreurDictee}");
    expect(ACCUEIL).toContain("BoutonMicroNote");
  });

  it("n'utilise plus `alert()` pour les erreurs vocales", () => {
    expect(ACCUEIL).not.toMatch(/\balert\(/);
  });

  it("la bulle distingue écoute, traitement et erreur", () => {
    expect(ACCUEIL).toContain('role="status"');
    expect(ACCUEIL).toContain("aria-live");
    expect(ACCUEIL).toContain("Écoute en cours");
    expect(ACCUEIL).toContain("Transcription de votre note");
    expect(ACCUEIL).toContain("Reformulation en cours");
    expect(ACCUEIL).toContain("La dictée a échoué");
    // Le texte transcrit est affiché tel quel, entre guillemets.
    expect(ACCUEIL).toContain("texteDictee");
  });

  it("la bulle n'est jamais en surimpression (ni absolute ni fixed)", () => {
    const bulle = ACCUEIL.slice(
      ACCUEIL.indexOf('role="status"'),
      ACCUEIL.indexOf("</div>", ACCUEIL.indexOf('role="status"')),
    );
    expect(bulle).not.toMatch(/\b(?:absolute|fixed|sticky)\b/);
  });

  it("l'implémentation vocale reste unique et honnête sur le « direct »", () => {
    // Un seul moteur : la reconnaissance vit dans `BoutonMicroNote`.
    expect(ACCUEIL).not.toContain("webkitSpeechRecognition");
    expect(ACCUEIL).not.toContain("SpeechRecognition");
    expect(BOUTON_SRC).toContain("MediaRecorder");
    // Et le commentaire rappelle qu'il n'y a pas de résultat intermédiaire.
    expect(BOUTON_SRC).toMatch(/AUCUN résultat intermédiaire/i);
  });

  it("le texte transcrit est livré avant la reformulation", () => {
    const iTranscription = BOUTON_SRC.indexOf("onTranscription?.(texteBrut)");
    const iReformulation = BOUTON_SRC.indexOf("changerEtat('reformulation')");
    expect(iTranscription).toBeGreaterThan(-1);
    expect(iReformulation).toBeGreaterThan(iTranscription);
  });
});
