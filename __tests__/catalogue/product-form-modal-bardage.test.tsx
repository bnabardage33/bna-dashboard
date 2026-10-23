// Non-régression de l'onglet « Tarifs » du formulaire Bardage
// (`ProductFormModal`) selon `type_cout` : en main-d'œuvre, le fournisseur
// (achat de fournitures) est masqué, mais les champs de tarification
// (Unité de vente, Prix Unitaire HT, Coût de revient HT, Prix TTC) et la marge
// brute restent disponibles. Aucune valeur du brouillon n'est purgée.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProductFormModal from "@/components/catalogue/ProductFormModal";
import {
  emptyBardage,
  type BardageValues,
  type NatureCout,
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
});

/** Brouillon Bardage, surchargeable. */
function brouillon(
  type_cout: NatureCout,
  extra: Partial<BardageValues> = {}
): BardageValues {
  return { ...emptyBardage(), type_cout, ...extra };
}

async function rendre(initial: BardageValues): Promise<void> {
  await act(async () => {
    root.render(
      createElement(ProductFormModal, {
        open: true,
        type: "BARDAGE",
        initial,
        onClose: () => {},
        onSave: () => {},
      })
    );
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

async function choisir(idSelect: string, valeur: string): Promise<void> {
  const select = parId(idSelect) as HTMLSelectElement | null;
  expect(select, `select « ${idSelect} » introuvable`).toBeTruthy();
  await act(async () => {
    select!.value = valeur;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ProductFormModal — onglet Tarifs Bardage selon type_cout", () => {
  describe("type_cout = matière (comportement inchangé)", () => {
    const matiere = brouillon("matiere", {
      fournisseur: "ACME",
      unite: "m²",
      pu_ht: "50",
      pu_revient: "30",
    });

    it("affiche fournisseur et tous les champs de tarification", async () => {
      await rendre(matiere);
      await cliquerOnglet("Tarifs");

      expect(parId("chp-fournisseur")).toBeTruthy();
      expect(parId("chp-unite")).toBeTruthy();
      expect(parId("chp-pu-ht")).toBeTruthy();
      expect(parId("chp-pu-revient")).toBeTruthy();
      expect(parId("chp-prix-ttc")).toBeTruthy();
      expect(libelles()).toContain("Fournisseur");
    });

    it("n'affiche pas de marge (réservée à la main-d'œuvre)", async () => {
      await rendre(matiere);
      await cliquerOnglet("Tarifs");
      expect(conteneur.textContent).not.toContain("Marge brute estimée");
    });

    it("conserve l'intitulé « 3 · Fournisseur & Tarifs »", async () => {
      await rendre(matiere);
      await cliquerOnglet("Tarifs");

      expect(conteneur.textContent).toContain("3 · Fournisseur & Tarifs");
      expect(conteneur.textContent).not.toContain("Tarifs de la prestation");
    });
  });

  describe("type_cout = main-d'œuvre", () => {
    const mo = brouillon("main_oeuvre", {
      fournisseur: "ACME",
      unite: "heure",
      pu_ht: "100",
      pu_revient: "60",
    });

    it("masque le fournisseur (achat de fournitures)", async () => {
      await rendre(mo);
      await cliquerOnglet("Tarifs");

      expect(parId("chp-fournisseur")).toBeNull();
      expect(libelles()).not.toContain("Fournisseur");
    });

    it("conserve les champs de tarification main-d'œuvre", async () => {
      await rendre(mo);
      await cliquerOnglet("Tarifs");

      expect(parId("chp-unite")).toBeTruthy();
      expect(parId("chp-pu-ht")).toBeTruthy();
      expect(parId("chp-pu-revient")).toBeTruthy();
      expect(parId("chp-prix-ttc")).toBeTruthy();
    });

    it("conserve l'affichage de la marge brute", async () => {
      await rendre(mo);
      await cliquerOnglet("Tarifs");

      const texte = conteneur.textContent ?? "";
      expect(texte).toContain("Marge brute estimée");
      expect(texte).toContain(fmtEuro(40)); // 100 - 60
      expect(texte).toContain("(40.0%)");
    });

    it("ne purge pas le fournisseur lors d'un aller-retour matiere → main-d'œuvre → matiere", async () => {
      await rendre(brouillon("matiere", { fournisseur: "ACME" }));

      await choisir("chp-type-presta", "main_oeuvre");
      await cliquerOnglet("Tarifs");
      expect(parId("chp-fournisseur")).toBeNull();

      await cliquerOnglet("Général");
      await choisir("chp-type-presta", "matiere");
      await cliquerOnglet("Tarifs");

      expect((parId("chp-fournisseur") as HTMLInputElement).value).toBe("ACME");
    });

    it("affiche « Tarifs de la prestation » à la place de « 3 · Fournisseur & Tarifs »", async () => {
      await rendre(mo);
      await cliquerOnglet("Tarifs");

      expect(conteneur.textContent).toContain("Tarifs de la prestation");
      expect(conteneur.textContent).not.toContain("Fournisseur & Tarifs");
    });
  });
});
