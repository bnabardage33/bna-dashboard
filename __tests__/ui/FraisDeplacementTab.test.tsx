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
    expect(conteneur.textContent).not.toContain("Branne");
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
