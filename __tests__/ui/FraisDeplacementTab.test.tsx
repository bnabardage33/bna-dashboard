import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import FraisDeplacementTab from "../../components/FraisDeplacementTab";

const mockFetch = vi.fn();
global.fetch = mockFetch;

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => []
  });
  window.confirm = vi.fn().mockReturnValue(true);
  window.alert = vi.fn();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  conteneur.remove();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getButton(text: string): HTMLButtonElement | null {
  return Array.from(conteneur.querySelectorAll("button")).find(b => b.textContent?.includes(text)) || null;
}

function getByTitle(title: string): HTMLElement | null {
  return conteneur.querySelector(`[title="${title}"]`) as HTMLElement | null;
}

async function renderComponent(props: any) {
  await act(async () => {
    root.render(createElement(FraisDeplacementTab, props));
  });
  await act(async () => { await sleep(10); });
}

async function saisir(placeholder: string, valeur: string): Promise<void> {
  const el = Array.from(conteneur.querySelectorAll("input")).find(i => i.placeholder.includes(placeholder));
  expect(el, `input ${placeholder} introuvable`).toBeTruthy();
  const proto = Object.getPrototypeOf(el as HTMLInputElement);
  const descripteur = Object.getOwnPropertyDescriptor(proto, "value");
  descripteur?.set?.call(el, valeur);
  await act(async () => {
    el!.dispatchEvent(new Event("input", { bubbles: true }));
    el!.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(0);
  });
}

async function cliquer(el: Element | null): Promise<void> {
  expect(el, "element à cliquer introuvable").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
    await sleep(10);
  });
}

describe("Composant FraisDeplacementTab (LOT 5 - React 19 test)", () => {
  it("rend initialement les champs et le bouton d'évaluation", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "123 Rue Principale" });
    
    expect(conteneur.textContent).toContain("Calculer un trajet");
    
    const inputs = conteneur.querySelectorAll("input");
    const departInput = Array.from(inputs).find(i => i.placeholder.includes("12 rue de la Paix"))!;
    const arriveeInput = Array.from(inputs).find(i => i.placeholder.includes("Adresse du chantier"))!;
    
    expect(arriveeInput.value).toBe("123 Rue Principale");
    expect(departInput.value).toBe("");

    const btnEval = getButton("Calculer le trajet");
    expect(btnEval).not.toBeNull();
    expect(btnEval!.disabled).toBe(true);

    expect(mockFetch).toHaveBeenCalledWith("/api/deplacements?chantier_id=c-123");
  });

  it("affiche les lieux que le serveur a retenus pour le calcul", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "8 lotissement Bellevue, 33920" });

    await saisir("12 rue de la Paix", "82 route du Prat, 33920");

    mockFetch.mockImplementation((url: string, options: any) => {
      if (url === "/api/deplacements/evaluer" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            distanceAllerKm: 12.47,
            distanceRetourKm: 12.47,
            tarifKm: 1.0,
            montantHt: 24.94,
            libelleDepart: "33920 Générac",
            libelleArrivee: "33920 Saint-Savin"
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    await cliquer(getButton("Calculer le trajet"));

    // Le lieu retenu doit être visible AVANT enregistrement : c'est le seul
    // moyen pour l'utilisateur de repérer un homonyme géocodé dans la
    // mauvaise commune, qui produirait un chiffrage sans aucun autre signal.
    expect(conteneur.textContent).toContain("33920 Générac");
    expect(conteneur.textContent).toContain("33920 Saint-Savin");
    // Aucun lieu d'un AUTRE code postal ne doit s'afficher : le serveur n'a
    // retenu que les deux ci-dessus.
    expect(conteneur.textContent).not.toContain("44100");
  });

  it("déclenche POST /evaluer uniquement au clic et affiche le résultat retourné", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "123 Rue Principale" });
    
    await saisir("12 rue de la Paix", "Mon Entrepôt");

    const btnEval = getButton("Calculer le trajet");
    expect(btnEval!.disabled).toBe(false);
    
    mockFetch.mockImplementation((url: string, options: any) => {
      if (url === "/api/deplacements/evaluer" && options?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            distanceAllerKm: 15,
            distanceRetourKm: 15,
            tarifKm: 1.0,
            montantHt: 30.0
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    await cliquer(btnEval);

    // Le montant passe par fmtEuro() (LOT 2C) : virgule décimale française et
    // espace INSECABLE (U+00A0) avant le €. L'ancienne assertion attendait
    // « 30.00 € », c'est-à-dire exactement le format artisanal que
    // __tests__/format-monetaire.test.ts interdit — les deux tests se
    // contredisaient depuis l'introduction du composant. L'échappement est
    // explicite : une espace ordinaire passerait le test sans rien garantir.
    expect(conteneur.textContent).toContain("30,00\u00A0€");

    const btnEnregistrer = getButton("Enregistrer ce déplacement");
    expect(btnEnregistrer).not.toBeNull();
    
    await saisir("12 rue de la Paix", "Autre adresse");
    expect(getButton("Enregistrer ce déplacement")).toBeNull();
  });

  it("POST sur /api/deplacements puis refait un GET historique", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] }); 
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris" });
    
    await saisir("12 rue de la Paix", "Marseille");
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ distanceAllerKm: 10, distanceRetourKm: 10, tarifKm: 1.0, montantHt: 20.0 })
    });
    
    await cliquer(getButton("Calculer le trajet"));
    
    const btnEnregistrer = getButton("Enregistrer ce déplacement");
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "dep-999" })
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "dep-999", date: "2026-09-29", distance_aller_km: 10, distance_retour_km: 10, tarif_km: 1.0, montant_ht: 20.0 }]
    });

    await cliquer(btnEnregistrer);

    expect(mockFetch).toHaveBeenCalledTimes(4);
    // Même règle qu'au test précédent : format monétaire français via fmtEuro().
    expect(conteneur.textContent).toContain("20,00\u00A0€");
  });

  it("supprime avec confirmation et rafraîchit l'historique", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "dep-1", date: "2026-09-29", distance_aller_km: 5, distance_retour_km: 5, tarif_km: 1.0, montant_ht: 10.0 }]
    });

    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris" });
    
    const btnTrash = getByTitle("Supprimer");
    
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); 
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] }); 

    await cliquer(btnTrash);
    
    expect(window.confirm).toHaveBeenCalledWith("Voulez-vous vraiment supprimer ce déplacement ?");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("affiche le composant de liaison et déclenche POST /lier", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "dep-non-lie", date: "2026-09-29", distance_aller_km: 10, distance_retour_km: 10, tarif_km: 1.0, montant_ht: 20.0, devis_id: null }
      ]
    });
    const devisMock = [{ id: "devis-1", numero: "DEV-123" }];
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", devisLikables: devisMock });

    const selects = conteneur.querySelectorAll("select");
    expect(selects.length).toBe(1);
    
    const select = selects[0] as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    
    await act(async () => {
      select.value = "devis-1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(10);
    });

    const btnLier = getButton("Lier");
    expect(btnLier).not.toBeNull();
    expect(btnLier!.disabled).toBe(false);

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }); 
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] }); 

    await cliquer(btnLier);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Cette action est irréversible"));
    expect(mockFetch).toHaveBeenCalledWith("/api/deplacements/dep-non-lie/lier", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ devis_id: "devis-1" })
    }));
  });

  it("n'affiche aucun sélecteur quand le chantier n'a pas de devis", async () => {
    // Sans devis sur le chantier, un sélecteur vide ne pourrait aboutir qu'à un
    // refus de la RPC (« même chantier »). Le composant doit l'expliquer et ne
    // rien proposer, plutôt que d'afficher un sélecteur inerte.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "dep-seul", date: "2026-09-29", distance_aller_km: 10, distance_retour_km: 10, tarif_km: 1.0, montant_ht: 20.0, devis_id: null }
      ]
    });

    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", devisLikables: [] });

    expect(conteneur.querySelectorAll("select").length).toBe(0);
    expect(conteneur.textContent).toContain("Aucun devis n’est rattaché à ce chantier");
  });

  it("masque la liaison et refuse la suppression pour un déplacement déjà lié", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "dep-lie", date: "2026-09-29", distance_aller_km: 10, distance_retour_km: 10, tarif_km: 1.0, montant_ht: 20.0, devis_id: "devis-1" }
      ]
    });

    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris" });

    expect(conteneur.textContent).toContain("Inclus dans devis");

    // La liaison disparaît : un déplacement déjà inclus n'a plus de sélecteur.
    expect(conteneur.querySelectorAll("select").length).toBe(0);

    // Le bouton Supprimer reste présent — il était masqué au survol sur
    // ordinateur, donc invisible au repos, et absent des lignes liées. Il doit
    // maintenant s'afficher et expliquer le refus plutôt que disparaître.
    const btnTrash = getByTitle("Supprimer");
    expect(btnTrash).toBeTruthy();

    const confirmMock = window.confirm as unknown as ReturnType<typeof vi.fn>;
    const alertMock = window.alert as unknown as ReturnType<typeof vi.fn>;
    confirmMock.mockClear();
    alertMock.mockClear();

    await cliquer(btnTrash);

    // Refus motivé, et surtout aucune requête de suppression émise.
    expect(alertMock).toHaveBeenCalledWith("Action impossible : déplacement déjà lié au devis.");
    expect(confirmMock).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adresse de départ reprise des Paramètres.
 *
 * La page `app/terrain/chantier/[id]/page.tsx` lit la ligne `id = 1` de
 * `entreprise_settings` et transmet le résultat via `adresseDepartDefaut`. Ce
 * bloc verrouille le comportement du FORMULAIRE ; la mise en forme de la ligne
 * est couverte par `__tests__/metier/deplacement-adresse.test.ts`, et le fait
 * que la page lit bien cette table est vérifié en fin de fichier.
 */
describe("Adresse de départ reprise des Paramètres", () => {
  const ADRESSE = "12 rue de la Paix, 75002 Paris";

  function champDepart(): HTMLInputElement {
    const el = Array.from(conteneur.querySelectorAll("input"))
      .find(i => i.placeholder.includes("12 rue de la Paix"));
    expect(el, "champ de départ introuvable").toBeTruthy();
    return el as HTMLInputElement;
  }

  function champArrivee(): HTMLInputElement {
    const el = Array.from(conteneur.querySelectorAll("input"))
      .find(i => i.placeholder.includes("Adresse du chantier"));
    expect(el, "champ d'arrivée introuvable").toBeTruthy();
    return el as HTMLInputElement;
  }

  it("1 — une adresse enregistrée préremplit le champ de départ", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    expect(champDepart().value).toBe(ADRESSE);
  });

  it("1b — l'adresse qui n'arrive qu'APRÈS le montage préremplit quand même", async () => {
    // Le cas réel : la page ne lit `entreprise_settings` qu'après avoir rendu
    // le composant. Un `useState(adresseDepartDefaut || "")` ne verrait jamais
    // la valeur et laisserait le champ vide — la correction serait invisible.
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: null });
    expect(champDepart().value).toBe("");

    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    expect(champDepart().value).toBe(ADRESSE);
  });

  it("2 — sans adresse enregistrée, le champ reste vide ET garde son placeholder", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: null });
    expect(champDepart().value).toBe("");
    expect(champDepart().placeholder).toBe("Ex: 12 rue de la Paix, Paris");
  });

  it("2b — une adresse vide ne préremplit rien non plus", async () => {
    // Ce que renvoie `composerAdresseDepart(...) || null` quand les Paramètres
    // n'enregistrent aucune adresse.
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: "" });
    expect(champDepart().value).toBe("");
    expect(champDepart().placeholder).toBe("Ex: 12 rue de la Paix, Paris");
  });

  it("3 — le champ reste modifiable après le préremplissage", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    await saisir("12 rue de la Paix", "Entrepôt annexe, 33000 Bordeaux");
    expect(champDepart().value).toBe("Entrepôt annexe, 33000 Bordeaux");
  });

  it("3b — une saisie faite AVANT l'arrivée de l'adresse n'est pas écrasée", async () => {
    // La course : l'utilisateur tape pendant que la lecture est en vol. Sans
    // le garde `departSaisi`, l'adresse des Paramètres écraserait sa saisie
    // quelques centaines de millisecondes plus tard.
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: null });
    await saisir("12 rue de la Paix", "Saisie avant chargement");

    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    expect(champDepart().value).toBe("Saisie avant chargement");
  });

  it("4 — l'adresse d'arrivée reste celle du chantier", async () => {
    // Exigence explicite : le préremplissage ne touche que le DÉPART.
    await renderComponent({
      chantierId: "c-123",
      adresseChantier: "8 lotissement Bellevue, 33920",
      adresseDepartDefaut: ADRESSE,
    });
    expect(champArrivee().value).toBe("8 lotissement Bellevue, 33920");
    // Et les deux champs ne se contaminent pas.
    expect(champDepart().value).toBe(ADRESSE);
  });

  it("5 — le composant n'émet aucune requête pour obtenir l'adresse", async () => {
    // L'adresse arrive par prop : le composant ne lit pas Supabase. Cette
    // assertion est aussi le fil qui garde les comptes d'appels des tests
    // existants — si quelqu'un déplaçait la lecture ici, elle échouerait au
    // lieu de gonfler silencieusement les compteurs voisins.
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("/api/deplacements?chantier_id=c-123");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Câblage de la source.
 *
 * Les tests comportementaux ci-dessus parties d'une PROPRE et vérifient le
 * formulaire. Ceux-ci vérifient que la prop est bien alimentée par les
 * Paramètres — sinon le préremplissage serait du code mort parfaitement vert.
 */
describe("Adresse de départ — source unique et câblage", () => {
  const PAGE = readFileSync("app/terrain/chantier/[id]/page.tsx", "utf8");
  const COMPOSANT = readFileSync("components/FraisDeplacementTab.tsx", "utf8");
  const PARAMETRES = readFileSync("app/parametres/page.tsx", "utf8");

  it("la fiche chantier lit la ligne id = 1 de entreprise_settings", () => {
    expect(PAGE).toMatch(/from\("entreprise_settings"\)/);
    expect(PAGE).toMatch(/\.eq\("id", 1\)/);
  });

  it("elle ne sélectionne que les trois colonnes d'adresse", () => {
    // Aucune colonne nouvelle n'est requise : les trois existent déjà, le
    // préremplissage ne demande qu'à les lire.
    expect(PAGE).toMatch(/select\("adresse, code_postal, ville"\)/);
  });

  it("la valeur transmise provient bien du composeur, pas d'une autre source", () => {
    expect(PAGE).toMatch(/setAdresseDepartDefaut\(composerAdresseDepart\(data\) \|\| null\)/);
    expect(PAGE).toMatch(/adresseDepartDefaut=\{adresseDepartDefaut\}/);
  });

  it("c'est exactement la table que les Paramètres lisent ET écrivent", () => {
    // Source UNIQUE : si les Paramètres changeaient de table ou de clé, le
    // préremplissage suivrait la même ligne par construction.
    expect(PARAMETRES).toMatch(/from\("entreprise_settings"\)/);
    expect(PARAMETRES).toMatch(/\.eq\("id", 1\)/);
    expect(PARAMETRES).toMatch(/\.update\(payload\)\.eq\("id", 1\)/);
  });

  it("la lecture n'écrit rien : aucune duplication dans le chantier", () => {
    const debut = PAGE.indexOf('from("entreprise_settings")');
    expect(debut).toBeGreaterThan(-1);
    // Une fois la lecture engagée, aucune écriture ne doit suivre dans le bloc.
    expect(PAGE.slice(debut, debut + 400)).not.toMatch(/\.update\(|\.insert\(/);
  });

  it("le composant ne lit pas Supabase : l'accès reste dans la page", () => {
    // invariant d'architecture. Il protège aussi les comptes d'appels réseau des
    // tests ci-dessus, qui comptent chaque requête au `fetch` global.
    expect(COMPOSANT).not.toMatch(/@\/lib\/supabase/);
  });

  it("le composant ne touche pas à l'adresse d'arrivée", () => {
    // Elle reste initialisée depuis le chantier, et rien n'y écrit d'autre.
    expect(COMPOSANT).toMatch(/useState\(adresseChantier \|\| ""\)/);
  });
});


/**
 * Indication d'origine sous le champ de départ.
 *
 * Elle ne doit afficher que ce qui est VRAI : l'adresse est-elle encore celle
 * des Paramètres ? Dès que l'utilisateur la remplace, l'affirmation devient
 * fausse et le texte a disparu de l'écran. Ces tests verrouillent les deux
 * moitiés — apparaître et disparaître — parce qu'une indication qui reste
 * après une saisie manuelle est pire que pas d'indication du tout : elle
 * affirme une origine qui n'est plus celle du lieu.
 */
describe("Adresse de départ — indication d'origine", () => {
  const ADRESSE = "12 rue de la Paix, 75002 Paris";
  const TEXTE = "Adresse de départ récupérée depuis vos paramètres";

  function indication(): HTMLElement | null {
    return Array.from(conteneur.querySelectorAll("p"))
      .find(p => p.textContent?.trim() === TEXTE) ?? null;
  }

  it("6 — l'indication s'affiche quand l'adresse vient des Paramètres", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    expect(indication()).toBeTruthy();
  });

  it("6b — elle s'affiche aussi quand l'adresse n'arrive qu'après le montage", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: null });
    expect(indication()).toBeNull();
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    expect(indication()).toBeTruthy();
  });

  it("7 — aucune adresse dans les Paramètres → aucune indication", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: null });
    expect(indication()).toBeNull();
  });

  it("8 — l'indication disparaît dès que l'utilisateur remplace l'adresse", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    expect(indication()).toBeTruthy();
    await saisir("12 rue de la Paix", "Entrepôt annexe, 33000 Bordeaux");
    expect(indication()).toBeNull();
  });

  it("8b — une saisie faite AVANT l'arrivée de l'adresse n'affiche aucune indication", async () => {
    // L'indication ne doit pas dependre du seul chargement : c'est la VALEUR
    // affichee qui commande, sinon elle mentirait sur une saisie manuelle.
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: null });
    await saisir("12 rue de la Paix", "Saisie avant chargement");
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    expect(indication()).toBeNull();
  });

  it("9 — le libellé est discret et sans rouge", async () => {
    await renderComponent({ chantierId: "c-123", adresseChantier: "Paris", adresseDepartDefaut: ADRESSE });
    const el = indication();
    expect(el, "indication introuvable").toBeTruthy();
    expect(el!.textContent?.trim()).toBe(TEXTE);
    const cls = el!.className;
    expect(cls).toContain("text-xs");
    expect(cls).toContain("text-gray-500");
    // Cohérence palette : la couleur de marque n'a rien à faire sur une
    // indication d'origine, qui n'est pas une action ni une alerte.
    expect(cls).not.toMatch(/red|e53935|e30613/i);
  });

  it("10 — l'indication est purement cosmétique", async () => {
    await renderComponent({
      chantierId: "c-123",
      adresseChantier: "8 lotissement Bellevue, 33920",
      adresseDepartDefaut: ADRESSE,
    });
    const champ = Array.from(conteneur.querySelectorAll("input"))
      .find(i => i.placeholder.includes("12 rue de la Paix")) as HTMLInputElement;
    expect(champ.value).toBe(ADRESSE);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
