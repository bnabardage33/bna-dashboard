// Non-régression de l'onglet « Tarifs » du formulaire catalogue
// (`ProductFormModal`) selon `type_cout` :
//   * main-d'œuvre  → fournisseur et achats/conditionnement masqués, mais
//                     Unité de mesure + Prix unitaire HT + Coût de revient HT
//                     et la marge brute conservés ;
//   * matière       → comportement intégralement inchangé.
// Le brouillon n'est jamais purgé : repasser en « matiere » restaure les valeurs.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProductFormModal from "@/components/catalogue/ProductFormModal";
import type { ProductFormModalProps } from "@/components/catalogue/ProductFormModal";
import {
  emptyTerrasseAccessoire,
  emptyTerrasseLame,
  type NatureCout,
  type TerrasseAccessoireValues,
} from "@/components/catalogue/types";
import { fmtEuro } from "@/lib/financeCalculs";

let conteneur: HTMLDivElement;
let root: Root;

beforeEach(() => {
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
  vi.restoreAllMocks();
});

/** Brouillon d'accessoire Terrasse, surchargeable. */
function brouillon(
  type_cout: NatureCout,
  extra: Partial<TerrasseAccessoireValues> = {}
): TerrasseAccessoireValues {
  return { ...emptyTerrasseAccessoire(), categorie: "CLIP", type_cout, ...extra };
}

async function rendre(initial: TerrasseAccessoireValues): Promise<void> {
  await act(async () => {
    root.render(
      createElement(ProductFormModal, {
        open: true,
        type: "TERRASSE_ACCESSOIRE",
        initial,
        importContextKey: 0,
        onClose: () => {},
        onSave: () => {},
      })
    );
  });
}

async function rendreLame(overrides: Partial<ProductFormModalProps> = {}): Promise<void> {
  await act(async () => {
    root.render(createElement(ProductFormModal, {
      open: true,
      type: "TERRASSE_LAME",
      initial: emptyTerrasseLame(),
      importContextKey: 0,
      onClose: () => {},
      onSave: () => {},
      ...overrides,
    }));
  });
}

function parId(id: string): HTMLElement | null {
  return conteneur.querySelector(`#${id}`);
}

function libelles(): string[] {
  return Array.from(conteneur.querySelectorAll("label")).map((l) => l.textContent?.trim() ?? "");
}

function bouton(libelle: string): HTMLButtonElement {
  const btn = Array.from(conteneur.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === libelle
  );
  expect(btn, `bouton « ${libelle} » introuvable`).toBeTruthy();
  return btn as HTMLButtonElement;
}

async function cliquerOnglet(libelle: string): Promise<void> {
  const btn = bouton(libelle);
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Change la valeur d'un <select> et notifie React (comme l'utilisateur). */
async function choisir(idSelect: string, valeur: string): Promise<void> {
  const select = parId(idSelect) as HTMLSelectElement | null;
  expect(select, `select « ${idSelect} » introuvable`).toBeTruthy();
  await act(async () => {
    select!.value = valeur;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ProductFormModal — onglet Tarifs d'un accessoire Terrasse", () => {
  it("préremplit l'URL, affiche les candidats et ne scrape ni n'enregistre au montage", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onSave = vi.fn();
    await rendreLame({
      importInitialUrl: "https://fournisseur.example/lame",
      importCandidates: { prix: "19,90", reference: "REF-T" },
      onSave,
    });

    expect((parId("chp-auto-url") as HTMLInputElement).value)
      .toBe("https://fournisseur.example/lame");
    expect(conteneur.textContent).toContain("19,90");
    expect(conteneur.textContent).toContain("REF-T");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("efface URL et candidats sur changement de contexte puis fermeture/réouverture", async () => {
    await rendreLame({
      importInitialUrl: "https://fournisseur.example/ancienne-lame",
      importCandidates: { prix: "19,90" },
      importContextKey: 1,
    });
    expect((parId("chp-auto-url") as HTMLInputElement).value)
      .toBe("https://fournisseur.example/ancienne-lame");

    await rendreLame({
      initial: emptyTerrasseLame(),
      importInitialUrl: "",
      importCandidates: null,
      importContextKey: 2,
    });
    expect((parId("chp-auto-url") as HTMLInputElement).value).toBe("");
    expect(conteneur.textContent).not.toContain("19,90");

    await act(async () => {
      root.render(createElement(ProductFormModal, {
        open: false,
        type: "TERRASSE_LAME",
        importInitialUrl: "",
        importCandidates: null,
        importContextKey: 2,
        onClose: () => {},
        onSave: () => {},
      }));
    });
    await rendreLame({ importInitialUrl: "", importCandidates: null, importContextKey: 3 });
    expect((parId("chp-auto-url") as HTMLInputElement).value).toBe("");
    expect(conteneur.textContent).not.toContain("19,90");
  });

  describe("type_cout = matière (comportement inchangé)", () => {
    const matiere = brouillon("matiere", {
      fournisseur: "ACME",
      conditionnement: "boîte de 100",
      unite_mesure: "boîte de 100",
    });

    it("conserve le fournisseur, le conditionnement et le prix de conditionnement", async () => {
      await rendre(matiere);
      await cliquerOnglet("Tarifs");

      expect(parId("chp-fournisseur")).toBeTruthy();
      expect(parId("chp-conditionnement-tarif")).toBeTruthy();
      expect(parId("chp-prix-conditionnement")).toBeTruthy();
      expect(parId("chp-unite-mesure-tarif")).toBeTruthy();
    });

    it("n'affiche ni prix unitaire de prestation ni coût de revient ni marge", async () => {
      await rendre(matiere);
      await cliquerOnglet("Tarifs");

      expect(parId("chp-pu-ht-acc")).toBeNull();
      expect(parId("chp-pu-revient-acc")).toBeNull();
      expect(libelles()).not.toContain("Coût de revient HT (€)");
      expect(conteneur.textContent).not.toContain("Marge brute estimée");
    });

    it("conserve l'intitulé « Fournisseur & Tarifs »", async () => {
      await rendre(matiere);
      await cliquerOnglet("Tarifs");

      expect(conteneur.textContent).toContain("Fournisseur & Tarifs");
      expect(conteneur.textContent).not.toContain("Tarifs de la prestation");
    });
  });

  describe("type_cout = main-d'œuvre", () => {
    it("garde l'onglet Tarifs et masque fournisseur + champs d'achat/conditionnement", async () => {
      await rendre(
        brouillon("main_oeuvre", {
          fournisseur: "ACME",
          conditionnement: "forfait pose",
          unite_mesure: "heure",
        })
      );

      // L'onglet reste disponible.
      expect(() => bouton("Tarifs")).not.toThrow();

      await cliquerOnglet("Tarifs");

      expect(parId("chp-fournisseur")).toBeNull();
      expect(parId("chp-conditionnement-tarif")).toBeNull();
      expect(parId("chp-prix-conditionnement")).toBeNull();
      expect(libelles()).not.toContain("Fournisseur");
      expect(libelles()).not.toContain("Conditionnement");
    });

    it("conserve Unité de mesure, Prix unitaire HT et Coût de revient HT", async () => {
      await rendre(
        brouillon("main_oeuvre", { unite_mesure: "heure", pu_ht: "100", pu_revient: "60" })
      );
      await cliquerOnglet("Tarifs");

      expect(parId("chp-unite-mesure-tarif")).toBeTruthy();
      expect(parId("chp-pu-ht-acc")).toBeTruthy();
      expect(parId("chp-pu-revient-acc")).toBeTruthy();
      expect(libelles()).toEqual(
        expect.arrayContaining(["Unité de mesure", "Prix unitaire HT (€)", "Coût de revient HT (€)"])
      );
    });

    it("conserve le calcul et l'affichage de la marge brute", async () => {
      await rendre(brouillon("main_oeuvre", { pu_ht: "100", pu_revient: "60" }));
      await cliquerOnglet("Tarifs");

      const texte = conteneur.textContent ?? "";
      expect(texte).toContain("Marge brute estimée");
      expect(texte).toContain(fmtEuro(40)); // 100 - 60
      expect(texte).toContain("(40.0%)");
    });

    it("masque la marge tant que les deux prix ne sont pas renseignés", async () => {
      await rendre(brouillon("main_oeuvre", { pu_ht: "100", pu_revient: "" }));
      await cliquerOnglet("Tarifs");

      expect(conteneur.textContent).not.toContain("Marge brute estimée");
    });

    it("ne purge pas les valeurs matière lors d'un aller-retour matiere → main-d'œuvre → matiere", async () => {
      await rendre(
        brouillon("matiere", { fournisseur: "ACME", conditionnement: "boîte de 100" })
      );

      // Général (onglet par défaut) : bascule en main-d'œuvre.
      await choisir("chp-type-presta-acc", "main_oeuvre");
      await cliquerOnglet("Tarifs");
      expect(parId("chp-fournisseur")).toBeNull();

      // Retour en matière : les valeurs saisies réapparaissent intactes.
      await cliquerOnglet("Général");
      await choisir("chp-type-presta-acc", "matiere");
      await cliquerOnglet("Tarifs");

      expect((parId("chp-fournisseur") as HTMLInputElement).value).toBe("ACME");
      expect((parId("chp-conditionnement-tarif") as HTMLInputElement).value).toBe("boîte de 100");
    });

    it("affiche « Tarifs de la prestation » à la place de « Fournisseur & Tarifs »", async () => {
      await rendre(brouillon("main_oeuvre", { pu_ht: "100", pu_revient: "60" }));
      await cliquerOnglet("Tarifs");

      expect(conteneur.textContent).toContain("Tarifs de la prestation");
      expect(conteneur.textContent).not.toContain("Fournisseur & Tarifs");
    });
  });
});
