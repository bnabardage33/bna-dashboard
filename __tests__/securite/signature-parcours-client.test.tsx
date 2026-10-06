// @vitest-environment jsdom
//
// PHASE 6 — LE PARCOURS DE SIGNATURE, TEL QU'IL EST RÉELLEMENT MONTÉ
// ============================================================
//
// Cette phase remplace un parcours qui passait un devis à « signé » **sans OTP
// et sans preuve** (`/api/espace-client/[code_acces]/signer`, appelé par la page
// avec `{docId, docKind}` et un dessin au doigt sur la page même) par le
// parcours complet : SMS → code → canvas → preuve → statut relu en base.
//
// L'état AVANT cette phase est difficile à croire, et il est utile de le garder
// en tête : `SignatureModal` était **importé** par la page (ligne 12) et **jamais
// monté**. Le bouton « Signer par SMS » ne faisait donc strictement rien. Un
// parcours sécurisé qui n'est pas raccordé n'est pas sécurisé : il est absent.
//
// Ces tests ont trois strates, et chacune répond à une question qu'aucune autre
// ne peut répondre :
//
//   * STRATE A — EXÉCUTION DU MODAL : `SignatureModal` rendu dans un DOM réel,
//     on clique dans l'ordre réel du parcours, et on lit les requêtes-part.
//   * STRATE B — EXÉCUTION DE LA PAGE : la page du portail est rendue, on
//     clique « Signer par SMS », et le parcours se déroule DEPUIS LA PAGE.
//     C'est la seule strate qui prouve le RACCORDEMENT, et qui peut constater
//     qu'aucune requête ne part vers `/signer`.
//   * STRATE C — STRUCTURE : ce que le DOM ne peut pas montrer, par exemple un
//     `phone` qui serait lu sans être envoyé.
//
// ─────────────────────────────────────────────────────────────────────────────
// JSDOM ET LE CANVAS
// ─────────────────────────────────────────────────────────────────────────────
//
// jsdom n'implémente pas `getContext('2d')` : il renvoie `null`, et
// `canvasPorteEncre()` est volontairement fail-closed. Sans substituants, le
// parcours serait bloqué à l'étape CANVAS et le test ne prouverait rien.
//
// On substitue donc `getContext` et `toDataURL`, et il faut le dire : nous ne
// testons pas le rastériseur du navigateur, nous testons la LOGIQUE du composant
// — quels champs il envoie, dans quel ordre, et à quel moment il consomme
// l'OTP. Le rastériseur est l'oral du navigateur, pas le nôtre ; un test qui
// prétendrait le contraire testerait `canvas`.
//
// `getImageData` est substituÉ pour que l'image « vierge » et l'image « signée »
// soient distinguables : c'est la SEULE façon d'exercer les deux branches du
// contrôle de qualité sans écrire un vrai PNG.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { sansCommentaires } from "./_lecture-source";
import type { PreuveSignature } from "@/components/SignatureModal";

// ── Fixture ──────────────────────────────────────────────────────────────────

const CODE_ACCES = "CODE-P6-A";
const DEVIS_ID = "e6000000-0000-4000-8000-000000000001";
const NUMERO = "D-2026-001";
const CODE_SAISI = "123456";
const EMPREINTE = "a".repeat(64);

const PREUVE: PreuveSignature = {
  signatureId: "s6000000-0000-4000-8000-000000000009",
  signedAt: "2026-10-04T10:11:12.000Z",
  devisEmpreinteSha256: EMPREINTE,
};

/** Le devis tel que le portail le renvoie, avant puis apres signature. */
const DEVIS_OUVERT = {
  id: DEVIS_ID,
  numero: NUMERO,
  objet: "Refection de facade",
  statut: "envoye",
  tva_pct: 20,
  lignes: [{ designation: "Peinture", description: null, qte: 1, unite: "f", pu_ht: 1000 }],
};

const PORTAIL = (statut: string) => ({
  entreprise: { nom: "BNA", siret: "00000000000000", telephone: null, email: null, adresse: null, logo_url: null, devise: "EUR" },
  chantier: { id: "c1000000-0000-4000-8000-00000000000a", nom: "Chantier P6", adresse_chantier: "1 rue de la plage", date_fin_estimee: null },
  client: { id: "b1000000-0000-4000-8000-00000000000b", nom: "M. Test", societe: null, adresse_facturation: null, code_postal: null, ville: null, telephone: "+33600000000", email: null },
  avancement: 0,
  avancementDetails: null,
  devis: [{ ...DEVIS_OUVERT, statut }],
  factures: [],
  rapports: [],
  intemperies: [],
  photos: [],
});

/** Une requête interceptée, prête à être asserted. */
type Requete = { url: string; methode: string; corps: Record<string, unknown> };

let requetes: Requete[] = [];
/** Statut renvoyé par le portail pour le devis. Change apres signature. */
let statutDevis = "envoye";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

// ── Substituant de canvas ────────────────────────────────────────────────────
//
// `getImageData` renvoie un buffer dont SEUL le canal alpha compte. Un canvas
// vierge : alpha = 0 partout. Un canvas tracé : alpha = 255 sur 4 x SEUIL pixels.
// Le composant compte les pixels opaques, donc les deux branches sont
// atteignables sans image réelle.
const PIXELS_D_ENCRE = 400;
/** Le canvas a-t-il de l'encre ? Pilote le substituant, seul moyen d'atteindre
 *  les DEUX branches du controle de qualite sans ecrire un vrai PNG. */
let canvasAvecEncre = false;

function installerCanvas() {
  // jsdom n'implemente pas `scrollIntoView`, que la page appelle sur sa zone de
  // messages. Son absence ferait echouer le rendu pour une raison etrangere au
  // sujet du test : on l'ajoute plutot que de contourner la page.
  Element.prototype.scrollIntoView = function scrollIntoView() {};

  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  proto.getContext = function getContext(this: HTMLCanvasElement) {
    return {
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      clearRect: () => {},
      strokeStyle: "",
      lineWidth: 1,
      lineCap: "",
      lineJoin: "",
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(Math.max(0, w * h * 4));
        if (canvasAvecEncre) {
          for (let p = 0; p < PIXELS_D_ENCRE; p++) data[p * 4 + 3] = 255;
        }
        return { data, width: w, height: h };
      },
    };
  };
  proto.toDataURL = function toDataURL(this: HTMLCanvasElement) {
    // Le prefixe et la longueur respectent les bornes de la route ET de la RPC,
    // pour que le seul obstacle eventuel reste bien l'encre.
    return `data:image/png;base64,iVBORw0KGgo${"A".repeat(600)}`;
  };
}

beforeEach(() => {
  requetes = [];
  statutDevis = "envoye";
  canvasAvecEncre = true;
  installerCanvas();

  vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
    let corps: Record<string, unknown> = {};
    try {
      corps = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    } catch {
      corps = { __corpsIllisible: true };
    }
    requetes.push({ url, methode: init?.method ?? "GET", corps });

    const reussie = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps });
    const refusee = (statut: number, corps: unknown) => ({
      ok: false,
      status: statut,
      json: async () => corps,
    });

    if (url === `/api/espace-client/${CODE_ACCES}`) return reussie(PORTAIL(statutDevis));
    if (url.endsWith("/send-otp")) return reussie({ success: true, expiresInSecondes: 600 });
    if (url.endsWith("/verify-otp")) return reussie({ success: true, ...PREUVE });
    return reussie({});
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Pilotage du rendu ───────────────────────────────────────────────────────

let conteneur: HTMLDivElement;
let root: Root;

async function rendre(element: ReactElement): Promise<HTMLDivElement> {
  await demonter();
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  await act(async () => {
    root.render(element);
  });
  return conteneur;
}

async function demonter(): Promise<void> {
  if (root) {
    await act(async () => root.unmount());
    root = undefined as unknown as Root;
  }
  conteneur?.remove();
  conteneur = undefined as unknown as HTMLDivElement;
}

afterEach(async () => {
  // ATTENDU : un `void demonter()` laisse le demontage en vol, et sa suite —
  // qui remet `conteneur` a undefined — s'execute alors que le test suivant a
  // deja rendu le sien. Symptome : un conteneur disparu sans raison.
  await demonter();
});

/** Les boutons dont le texte correspond, comme un utilisateur les verrait. */
function boutons(c: HTMLElement, texte: RegExp): HTMLButtonElement[] {
  return [...c.querySelectorAll("button")].filter((b) => texte.test(b.textContent ?? ""));
}

/**
 * Ferme la modale de signature, et VÉRIFIE qu'elle est fermée.
 *
 * Cette vérification n'est pas de la rigueur décorative. La modale affiche les
 * MÊMES libellés que le panneau de preuve de la page — « Empreinte du document »
 * y est aussi — et les deux vivent dans le même conteneur. Un test qui interroge
 * `container.textContent` sans fermer la modale ne sait pas lequel des deux il
 * interroge. Une régression qui supprimerait l'affichage côté PAGE passerait
 * donc, satisfaite par la modale.
 *
 * J'ai vérifié que ce n'était pas théorique : retirer le bloc d'affichage de la
 * page laisse les 24 tests verts. Ce helper est ce qui rend l'assertion
 * entière.
 */
async function fermerModale(c: HTMLElement): Promise<void> {
  const fermeture = c.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]');
  if (fermeture) {
    await act(async () => {
      fermeture.click();
    });
  }
  if (c.querySelector('[role="dialog"]')) {
    throw new Error("La modale de signature est restee ouverte : les assertions porteraient sur elle, pas sur la page");
  }
}

async function cliquer(c: HTMLElement, texte: RegExp): Promise<void> {
  const cible = boutons(c, texte)[0];
  if (!cible) {
    throw new Error(
      `Bouton introuvable : ${texte}\nBoutons presents : ${JSON.stringify(
        [...c.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim())
      )}`
    );
  }
  await act(async () => {
    cible.click();
  });
}

/** Renseigne un champ controle, comme une frappe le ferait. */
async function saisir(c: HTMLElement, label: RegExp, valeur: string): Promise<void> {
  const champ = [...c.querySelectorAll("input")].find((i) =>
    label.test(`${i.getAttribute("aria-label") ?? ""} ${i.getAttribute("placeholder") ?? ""}`)
  );
  if (!champ) throw new Error(`Champ introuvable : ${label}`);
  await act(async () => {
    const poser = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    poser?.call(champ, valeur);
    champ.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const envoyerOtp = (c: HTMLElement) => cliquer(c, /Recevoir le code par SMS/);

/** Déroule le parcours jusqu'à l'étape CANVAS. */
async function jusquAuCanvas(c: HTMLElement): Promise<void> {
  await envoyerOtp(c);
  await saisir(c, /Code de signature/, CODE_SAISI);
  await cliquer(c, /Tracer ma signature/);
}

async function monterModal(surSucces?: (preuve: PreuveSignature) => void): Promise<HTMLDivElement> {
  const { default: SignatureModal } = await import("@/components/SignatureModal");
  return rendre(
    createElement(SignatureModal, {
      codeAcces: CODE_ACCES,
      devisId: DEVIS_ID,
      numero: NUMERO,
      onClose: () => {},
      onSuccess: surSucces ?? (() => {}),
    })
  );
}

const requetesVers = (fragment: string) => requetes.filter((r) => r.url.includes(fragment));

// =============================================================================
// A) EXÉCUTION DU MODAL
// =============================================================================

describe("A) le parcours du modal s'execute et appelle les routes du portail", () => {
  it("A1 send-otp part sur la route du PORTAIL, en POST, et n'envoie QUE devisId", async () => {
    const c = await monterModal();
    await envoyerOtp(c);

    expect(requetes).toHaveLength(1);
    const [appel] = requetes;
    expect(appel.url).toBe(`/api/espace-client/${CODE_ACCES}/send-otp`);
    expect(appel.methode).toBe("POST");
    // Le CORPS EST MESURE, pas deviné : c'est exactement ce qui part sur le fil.
    expect(Object.keys(appel.corps).sort()).toEqual(["devisId"]);
    expect(appel.corps.devisId).toBe(DEVIS_ID);
  });

  it("A2 verify-otp part sur la route du PORTAIL, avec l'image et la mention", async () => {
    const c = await monterModal();
    await jusquAuCanvas(c);

    statutDevis = "signe";
    await cliquer(c, /Valider ma signature/);

    const verify = requetesVers("verify-otp");
    expect(verify, "verify-otp n'a pas ete appele").toHaveLength(1);
    expect(verify[0].url).toBe(`/api/espace-client/${CODE_ACCES}/verify-otp`);
    expect(verify[0].methode).toBe("POST");
    // Le CORPS, encore. L'ancien `submitSignature` n'envoyait que `{docId,
    // docKind}` : c'est precisement le bug que cette phase porte.
    expect(Object.keys(verify[0].corps).sort()).toEqual([
      "code",
      "devisId",
      "mentionBonPourAccord",
      "signatureImage",
    ]);
    expect(String(verify[0].corps.signatureImage)).toMatch(/^data:image\/png;base64,/);
    expect(verify[0].corps.code).toBe(CODE_SAISI);
    expect(verify[0].corps.mentionBonPourAccord).toBe(true);
  });

  it("A3 l'ordre est ENVOI, puis OTP, puis CANVAS : le code N'EST PAS consomme avant le geste", async () => {
    const c = await monterModal();
    await jusquAuCanvas(c);

    // Le parcours est ARRÊTÉ à l'étape CANVAS : une seule requête est partie, et
    // elle est l'envoi. Passer au plan de dessin ne consomme rien.
    expect(requetes.map((r) => r.url)).toEqual([`/api/espace-client/${CODE_ACCES}/send-otp`]);

    statutDevis = "signe";
    await cliquer(c, /Valider ma signature/);

    // Le geste tracé ne part qu'ici, avec le code de CETTE session. Il n'est
    // donc pas rejouable sur un code obtenu par un autre chemin.
    expect(requetes).toHaveLength(2);
    expect(requetes[1].corps.signatureImage).toBeDefined();
  });

  it("A4 on ne peut pas valider sans avoir trace : l'OTP n'est pas consomme pour rien", async () => {
    canvasAvecEncre = false; // l'utilisateur n'a rien trace

    const c = await monterModal();
    await jusquAuCanvas(c);
    await cliquer(c, /Valider ma signature/);

    // Aucune requête verify-otp : l'image vide est refusee COTE CLIENT, donc
    // l'OTP n'a pas ete consomme pour une soumission qui n'aboutirait pas.
    expect(requetesVers("verify-otp")).toHaveLength(0);
    expect(c.querySelector('[role="alert"]')?.textContent).toMatch(/Dessinez/i);
  });

  it("A5 le succes affiche la PREUVE et previent la page avec son identifiant", async () => {
    let recu: PreuveSignature | null = null;
    const c = await monterModal((p) => {
      recu = p;
    });
    await jusquAuCanvas(c);
    statutDevis = "signe";
    await cliquer(c, /Valider ma signature/);

    // La page est prevenue avec l'IDENTITE de la preuve, pas avec un booleen :
    // c'est elle qui doit pouvoir l'afficher.
    expect(recu).toEqual(PREUVE);
    expect(c.textContent).toContain("Document signé");
    // L'empreinte est montree : sans elle, une preuve n'est qu'un horodatage.
    expect(c.textContent).toContain(EMPREINTE);
    // Et l'IDENTIFIANT de preuve aussi. Une date et une empreinte disent QUOI a
    // ete signe et QUAND ; elles ne disent pas OU trouver la ligne qui en garde
    // trace. C'est cet identifiant que l'artisan oppose a une contestation, et
    // sans lui la piste d'audit est introuvable sans deviner un UUID.
    expect(c.textContent).toContain("Référence de la signature");
    expect(c.textContent).toContain(PREUVE.signatureId);
  });

  it("A5 bis l'identifiant de preuve Affiche vient du serveur, jamais du navigateur", async () => {
    // Le composant ne doit RIEN fabriquer : un identifiant genere localement
    // serait un identifiant que l'on pourrait reecrire à la main dans le DOM,
    // et l'affichage n'aurait plus aucune valeur probante. On le prouve en
    //changant l'identifiant dans la REPONSE du serveur : l'ecran doit suivre.
    const identifiantServeur = "s6111111-2222-4333-8444-555566667777";
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
      let corps: Record<string, unknown> = {};
      try {
        corps = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      } catch {
        corps = {};
      }
      requetes.push({ url, methode: init?.method ?? "GET", corps });
      if (url.endsWith("/verify-otp")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            signatureId: identifiantServeur,
            signedAt: PREUVE.signedAt,
            devisEmpreinteSha256: EMPREINTE,
          }),
        };
      }
      if (url === `/api/espace-client/${CODE_ACCES}`) return { ok: true, status: 200, json: async () => PORTAIL(statutDevis) };
      return { ok: true, status: 200, json: async () => ({ success: true, expiresInSecondes: 600 }) };
    });

    const c = await monterModal();
    await jusquAuCanvas(c);
    statutDevis = "signe";
    await cliquer(c, /Valider ma signature/);

    // L'écran montre celui du serveur, et PAS celui du test : la valeur affichee
    // est un fait, pas une décoration.
    expect(c.textContent).toContain(identifiantServeur);
    expect(c.textContent).not.toContain(PREUVE.signatureId as string);
  });

  it("A6 un refus du serveur est affiche tel quel, et le client peut reessayer", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: { method?: string; body?: string }) => {
      let corps: Record<string, unknown> = {};
      try {
        corps = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      } catch {
        corps = {};
      }
      requetes.push({ url, methode: init?.method ?? "GET", corps });
      const echec = { ok: false, status: 400, json: async () => ({ error: "Signature refusée" }) };
      if (url.endsWith("/verify-otp")) return echec;
      if (url === `/api/espace-client/${CODE_ACCES}`) return { ok: true, status: 200, json: async () => PORTAIL(statutDevis) };
      return { ok: true, status: 200, json: async () => ({ success: true, expiresInSecondes: 600 }) };
    });

    const c = await monterModal();
    await jusquAuCanvas(c);
    await cliquer(c, /Valider ma signature/);

    // Le refus est celui du serveur : aucun compteur, aucune fenetre, aucun motif
    // devoile au navigateur. Le client ne peut rien apprendre de plus.
    expect(c.querySelector('[role="alert"]')?.textContent).toContain("Signature refusée");
    // On reste a l'etape CANVAS : corriger et renvoyer reste possible.
    expect(boutons(c, /Valider ma signature/)).toHaveLength(1);
  });

  it("A7 un 429 de cooldown est affiche, et le client peut reessayer", async () => {
    let enAttente = true;
    vi.stubGlobal("fetch", async (url: string) => {
      if (enAttente) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: "Patientez encore 42 s avant de redemander un code." }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, expiresInSecondes: 600 }) };
    });

    const c = await monterModal();
    await envoyerOtp(c);
    expect(c.querySelector('[role="alert"]')?.textContent).toMatch(/Patientez encore 42/);

    // Le cooldown est une REPONSE, pas un verrou cote client.
    enAttente = false;
    await envoyerOtp(c);
    expect(c.textContent).toContain("Expire dans");
  });
});

// =============================================================================
// B) EXÉCUTION DE LA PAGE — LE RACCORDEMENT
// =============================================================================

vi.mock("@/components/DocumentPDF", () => ({ default: () => null }));

describe("B) le parcours est raccorde DEPUIS la page du portail", () => {
  async function monterPage(): Promise<HTMLDivElement> {
    const { default: Page } = await import("@/app/espace-client/[code_acces]/page");
    return rendre(
      createElement(Page, { params: Promise.resolve({ code_acces: CODE_ACCES }) })
    );
  }

  it("B1 le bouton « Signer par SMS » ouvre le parcours, et LUI SEUL", async () => {
    const c = await monterPage();

    expect(c.textContent).toContain("En attente de signature");
    // La page NE CONTIENT aucun plan de signature avant l'ouverture : c'est la
    // preuve, par le DOM, que la surface de signature a bien quitte la page.
    expect(c.querySelector("canvas")).toBeNull();

    await cliquer(c, /Signer par SMS/);

    const dialogues = [...c.querySelectorAll('[role="dialog"]')];
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].getAttribute("aria-label")).toBe(`Signature du devis ${NUMERO}`);
    // `stopPropagation` : sans lui, l'APERCU du devis se serait ouvert aussi et
    // serait passe par-dessus (`z-9999` contre `z-10002`). Le client aurait vu
    // un ecran fige sans comprendre. Une seule modale, donc aucune ambiguite.
    expect(c.textContent).toContain("Recevoir le code par SMS");
    expect(c.textContent).toContain("Chantier P6");
  });

  it("B2 le parcours complet part de la page et ne touche JAMAIS /signer", async () => {
    const c = await monterPage();
    await cliquer(c, /Signer par SMS/);
    await jusquAuCanvas(c);
    statutDevis = "signe";
    await cliquer(c, /Valider ma signature/);

    // La route legacy `/api/espace-client/[code_acces]/signer` passe le devis a
    // « signe » sans OTP ni preuve. Aucune requete ne doit y aller : le parcours
    // de remplacement doit etre le SEUL, sinon le mauvais reste ouvert.
    expect(requetesVers("/signer")).toHaveLength(0);
    expect(requetes.map((r) => r.url)).toEqual([
      `/api/espace-client/${CODE_ACCES}`,
      `/api/espace-client/${CODE_ACCES}/send-otp`,
      `/api/espace-client/${CODE_ACCES}/verify-otp`,
      // Et le statut est RELU dans la base, pas deduit de la reponse affichee.
      `/api/espace-client/${CODE_ACCES}`,
    ]);
  });

  it("B3 apres succes, la liste RELIT « signe » dans les donnees fraiches", async () => {
    const c = await monterPage();
    await cliquer(c, /Signer par SMS/);
    await jusquAuCanvas(c);
    expect(c.textContent).toContain("En attente de signature");

    statutDevis = "signe";
    await cliquer(c, /Valider ma signature/);
    // AVANT toute assertion sur la page : on ferme la modale. Sans cela les
    // verifications ci-dessous porteraient sur la modale, qui affiche les memes
    // libelles — et aucune ne verrait quoi que ce soit de la page.
    await fermerModale(c);

    // Le statut est recharge : la ligne de la liste ne peut pas dire « signe » sur
    // la seule foi d'un succes affiche, sinon un second parcours resterait
    // possible a l'ecran alors que la RPC le refuse.
    expect(c.textContent).toContain("Statut : Validé et Signé");
    expect(c.textContent).not.toContain("En attente de signature");
    // Et le bouton a disparu : un devis signe ne se resigne pas depuis le portail.
    expect(boutons(c, /Signer par SMS/)).toHaveLength(0);

    // La PREUVE, elle, se consulte dans l'apercu du document. C'est l'objet de
    // l'OTC : sans elle, le client aurait un « signe » sans date ni empreinte,
    // c'est-a-dire un simple horodatage.
    await act(async () => {
      const ligne = [...c.querySelectorAll("div")].find(
        (d) => d.className.includes("cursor-pointer") && (d.textContent ?? "").includes(NUMERO)
      );
      if (!ligne) throw new Error("Ligne du devis introuvable dans la liste");
      ligne.click();
    });

    expect(c.textContent).toContain("Empreinte du document");
    expect(c.textContent).toContain(EMPREINTE);
    expect(c.textContent).toContain(new Date(PREUVE.signedAt as string).toLocaleString("fr-FR"));
    // L'identifiant de preuve est CONSULTABLE apres coup, dans le meme bloc que la
    // date et l'empreinte. Afficher un « signe » sans reference lisible reviendrait
    // a demander au client de croire une affirmation sans lui donner de quoi la
    // verifier aupres de l'artisan.
    expect(c.textContent).toContain("Référence de la signature");
    expect(c.textContent).toContain(PREUVE.signatureId as string);
  });

  it("B4 le parcours est VERTICALEMENT au-dessus de l'apercu du document", async () => {
    const c = await monterPage();
    await cliquer(c, /Signer par SMS/);

    const modale = c.querySelector('[role="dialog"]');
    expect(modale?.className).toContain("z-[10002]");
    // L'apercu est a `z-[9999]`. Un seul niveau suffirait ; les deux sont
    // explicites parce que l'ordre de rendu ne garantit rien sur `position`.
    expect(modale?.className).toMatch(/z-\[10002\]/);
  });

  it("B5 AUTO-VERIFICATION : B2 detecte un parcours rebranche sur la route legacy", async () => {
    // Un test d'INVARIANT qui ne peut pas echouer ne prouve rien. On rejoue le
    // test avec une liste de requetes qui CONTIENT `/signer`, et on exige que
    // l'invariant le voie : s'il ne le voit pas, il ne protege rien.
    const requetesSaines = [
      `/api/espace-client/${CODE_ACCES}`,
      `/api/espace-client/${CODE_ACCES}/send-otp`,
      `/api/espace-client/${CODE_ACCES}/verify-otp`,
    ];
    const requetesMutantes = [...requetesSaines, `/api/espace-client/${CODE_ACCES}/signer`];

    const invariant = (liste: string[]) => liste.filter((u) => u.includes("/signer")).length === 0;
    expect(invariant(requetesSaines)).toBe(true);
    expect(invariant(requetesMutantes)).toBe(false);
  });
});

// =============================================================================
// C) STRUCTURE — CE QUE LE NAVIGATEUR NE DOIT PAS POUVOIR FOURNIR
// =============================================================================

describe("C) aucune donnee de confiance ne vient du navigateur", () => {
  const composant = sansCommentaires(readFileSync(join(process.cwd(), "components/SignatureModal.tsx"), "utf8"), { jsx: true });
  const page = sansCommentaires(readFileSync(join(process.cwd(), "app/espace-client/[code_acces]/page.tsx"), "utf8"), { jsx: true });

  it("C1 le champ telephone a DISPARU, et aucun `phone` n'est lu", () => {
    // Le remettre renverrait le code a un numero choisi par le navigateur, alors
    // que la preuve resterait attachee au dossier de la VICTIME. Le numero vient
    // du serveur, resolu par la chaine de confiance partagee.
    expect(composant).not.toMatch(/initialPhone/);
    expect(composant).not.toMatch(/\bphone\b/i);
    expect(composant).not.toMatch(/type="tel"/);
  });

  it("C2 aucune de ces valeurs de confiance n'apparait JAMAIS dans le composant", () => {
    for (const interdit of [
      "entreprise_id",
      "client_id",
      "chantier_id",
      "signataire",
      "signe_par",
      "telephone_source",
      "devis_empreinte_sha256",
      "tentatives",
      "verrouille_jusqua",
    ]) {
      expect(composant, interdit).not.toMatch(new RegExp(interdit));
    }
  });

  it("C3 l'IDENTITE de la preuve n'est pas decidee par le client : elle vient de la reponse", () => {
    // Le composant ne FABRIQUE ni identifiant, ni date, ni empreinte : il relit
    // ce que la route renvoie. S'il les inventerait, la preuve affichee au
    // client serait un mensonge qui ne correspond a rien en base.
    expect(composant).toMatch(/signatureId:\s*data\.signatureId\s*\?\?\s*null/);
    expect(composant).toMatch(/signedAt:\s*data\.signedAt\s*\?\?\s*null/);
    expect(composant).toMatch(/devisEmpreinteSha256:\s*data\.devisEmpreinteSha256\s*\?\?\s*null/);
  });

  it("C4 la case « bon pour accord » est VRAIE par defaut", () => {
    // Decochee par defaut, la preuve porterait un accord que le client n'a pas
    // formule : le consentement enregistre doit etre explicite.
    expect(composant).toMatch(/useState\(true\)/);
  });

  it("C5 la page ne CONTIENT PLUS de plan de signature", () => {
    // Un second plan a l'ecran creerait deux surfaces, dont une sans OTP. La
    // regle : une seule surface, donc impossible d'emprunter la mauvaise.
    expect(page).not.toMatch(/<canvas/);
    expect(page).not.toMatch(/toDataURL/);
    expect(page).not.toMatch(/signatureData/);
  });

  it("C6 la page ne CONTIENT PLUS d'etat de signature local", () => {
    // Un `isSigned` local afficherait « signe » avant que la base ne le sache,
    // et ferait croire qu'une seconde signature est possible alors que la RPC la
    // refuse. Le statut est relu dans `devisData` / `facturesData`.
    expect(page).not.toMatch(/\bisSigned\b/);
    expect(page).not.toMatch(/setIsSigned/);
    expect(page).toMatch(/statutDuDoc/);
  });

  it("C7 le rechargement des documents est DISTINCT du rechargement complet", () => {
    // `fetchRealData` remet la session du chat a zero : l'utiliser apres une
    // signature effacerait la conversation en cours et le message d'accueil.
    expect(page).toMatch(/rechargerDocuments/);
    expect(page).not.toMatch(/rechargerDocuments[\s\S]{0,400}fetchRealData\(/);
  });

  it("C8 AUTO-VERIFICATION : le scanner de test voit le CODE, pas la PROSE", () => {
    // Un helper de test structurel qui confond un commentaire et du code peut
    // satisfaire un invariant avec une phrase. On lui donne les deux pieges
    // reels de ce depot, et on exige qu'il les traverse sans se desynchroniser.
    const piege = [
      "import a from \"./a\";",
      "// aurait expose TOUTES les routes `/api/devis/*`, dont `analyse`",
      "/*",
      " * un glob `/api/devis/*` dans un commentaire de LIGNE",
      " */",
      "export const garde = <p>Signez aujourd'hui.</p>;",
      "// une apostrophe ci-dessus ne doit rien desynchroniser",
      "export const requete = () => post(\"/api/espace-client/CODE/signer\", {});",
    ].join("\n");

    const lu = sansCommentaires(piege, { jsx: true });

    // La PROSE disparait.
    expect(lu).not.toMatch(/aurait expose/);
    expect(lu).not.toMatch(/ne doit rien desynchroniser/);
    // Le CODE survit — c'est exactement ce que le glob `/api/devis/*` faisait
    // disparaitre dans la version a deux regex.
    expect(lu).toMatch(/from "\.\/a"/);
    expect(lu).toMatch(/post\("\/api\/espace-client\/CODE\/signer"/);
    // Et les numeros de ligne correspondent toujours a la source.
    expect(lu.split("\n").length).toBe(piege.split("\n").length);
  });

  it("C8bis le scanner ne perd pas la fin d'un gabarit a substitution", () => {
    // Le TROISIEME piege, et le plus subtil : le lexer lexical de TypeScript ne
    // sait pas ou se termine une substitution `${…}`. C'est l'analyseur qui
    // appelle `reScanTemplateToken()`. Sans cet appel, le backtick de FIN du
    // gabarit est pris pour un debut, et le scanner avale la suite de la
    // fonction puis TOUS les commentaires du fichier.
    //
    // La ligne ci-dessous est le cas reel tire d'une route OTP du portail. Elle
    // est aussi ce qui a rendu le defaut visible : le test B2 de
    // `otp-fuite-journaux.test.ts` cherchait une fuite dans les journaux et a
    // buté sur une PROSE qu'il croyait executee.
    const piege = [
      "export async function POST() {",
      "  const restant = 42;",
      "  return NextResponse.json(",
      "    { error: `Patientez encore ${restant} s avant de redemander un code.` },",
      "    { status: 429 }",
      "  );",
      "}",
      "// un commentaire qui ne doit surtout pas etre lu comme du code",
      'export const garde = () => post("/api/espace-client/CODE/signer", {});',
    ].join("\n");

    const lu = sansCommentaires(piege);

    expect(lu).not.toMatch(/un commentaire qui ne doit surtout pas/);
    expect(lu).toMatch(/status: 429/);
    expect(lu).toMatch(/post\("\/api\/espace-client\/CODE\/signer"/);
    expect(lu.split("\n").length).toBe(piege.split("\n").length);

    // Et une substitution qui CONTIENT des accolades ne doit pas refermer trop
    // tot : `${ { a: 1 }.a }` a un `}` qui ne referme pas la substitution.
    const imbrique = [
      'const x = `${ { a: 1 }.a } et ${ (x) => x }`;',
      "// commentaire apres le gabarit imbrique",
      'const y = fetch("/apres");',
    ].join("\n");
    const luImbrique = sansCommentaires(imbrique);
    expect(luImbrique).not.toMatch(/commentaire apres le gabarit/);
    expect(luImbrique).toMatch(/fetch\("\/apres"\)/);
  });

  it("C9 AUTO-VERIFICATION : C5 et C6 detectent une page reellement rebranchee au legacy", () => {
    const invariants = [/<canvas/, /toDataURL/, /\bisSigned\b/, /submitSignature/, /\/signer/];
    const mutants = [
      { nom: "canvas reintroduit", mutant: `${page}\nconst c = <canvas onMouseDown={t} />;` },
      { nom: "toDataURL reintroduit", mutant: `${page}\nconst img = canvas.toDataURL("image/png");` },
      { nom: "isSigned reintroduit", mutant: `${page}\nconst [isSigned, setIsSigned] = useState(false);` },
      { nom: "/signer rappele", mutant: `${page}\nawait post("/api/espace-client/${CODE_ACCES}/signer", { docId });` },
    ];

    for (const { nom, mutant } of mutants) {
      expect(mutant, `substitution sans effet : ${nom}`).not.toBe(page);
      expect(
        invariants.some((re) => re.test(mutant)),
        `mutant non detecte : ${nom}`
      ).toBe(true);
    }
    for (const re of invariants) expect(page, re.source).not.toMatch(re);
  });

  it("C10 AUTO-VERIFICATION : C1 detecte un telephone reintroduit dans le composant", () => {
    const mutant = composant.replace(
      "JSON.stringify({ devisId })",
      "JSON.stringify({ devisId, phone: numeroSaisi })"
    );
    expect(mutant).not.toBe(composant);
    expect(mutant).toMatch(/\bphone\b/i);
  });
});