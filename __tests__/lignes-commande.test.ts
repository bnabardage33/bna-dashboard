// Tests du helper de construction des lignes_commande (ÉTAPE 7).
//
// Vérifie le rattachement de chaque ligne à sa commande et à sa zone
// d'origine (zone_id nullable, sans aucune mutation des données fournies).

import { describe, it, expect } from "vitest";
import { construireLignesCommande } from "@/lib/lignesCommande";

describe("construireLignesCommande", () => {
  const lignes = [
    {
      article_id: "art-1",
      fournisseur_id: "four-1",
      quantite: 12,
      prix_unitaire: 15.5,
      total_ligne: 186,
    },
    {
      article_id: "art-2",
      fournisseur_id: "four-1",
      quantite: 4,
      prix_unitaire: 8.25,
      total_ligne: 33,
    },
  ];

  it("rattache commande_id et zone_id à chaque ligne, valeurs inchangées", () => {
    const resultat = construireLignesCommande("cmd-1", "z-1", lignes);

    expect(resultat).toHaveLength(2);

    for (const ligne of resultat) {
      expect(ligne.commande_id).toBe("cmd-1");
      expect(ligne.zone_id).toBe("z-1");
    }

    // Les champs métier sont préservés à l'identique.
    expect(resultat[0]).toMatchObject({
      article_id: "art-1",
      fournisseur_id: "four-1",
      quantite: 12,
      prix_unitaire: 15.5,
      total_ligne: 186,
    });
    expect(resultat[1]).toMatchObject({
      article_id: "art-2",
      fournisseur_id: "four-1",
      quantite: 4,
      prix_unitaire: 8.25,
      total_ligne: 33,
    });
  });

  it("zone_id null accepté (flux sans zone / commandes historiques)", () => {
    const resultat = construireLignesCommande("cmd-2", null, lignes);

    expect(resultat).toHaveLength(2);
    for (const ligne of resultat) {
      expect(ligne.zone_id).toBeNull();
      expect(ligne.commande_id).toBe("cmd-2");
    }
    expect(resultat[0].article_id).toBe("art-1");
  });

  it("aucune mutation des entrées fournies (copies strictes)", () => {
    const avant = JSON.stringify(lignes);
    construireLignesCommande("cmd-3", "z-2", lignes);
    expect(JSON.stringify(lignes)).toBe(avant);
    // Les objets insérés sont de nouvelles références.
    const resultat = construireLignesCommande("cmd-3", "z-2", lignes);
    expect(resultat[0]).not.toBe(lignes[0]);
  });

  it("lignes vides → tableau vide", () => {
    expect(construireLignesCommande("cmd-4", "z-3", [])).toEqual([]);
  });
});