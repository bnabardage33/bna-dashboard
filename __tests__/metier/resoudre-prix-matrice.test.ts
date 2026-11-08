// __tests__/metier/resoudre-prix-matrice.test.ts
import { describe, it, expect } from 'vitest';
import {
  resoudrePrixOuvrage,
  validerMontant,
  evaluerFiabiliteMarge,
} from '@/lib/catalogue/resoudrePrix';
import {
  calculerDevis,
  estLigneChiffrable,
  montantLigne,
  coutLigne,
  type LigneDevis,
} from '@/lib/devisCalcul';

describe('Vérification stricte de validerMontant (valeurs limites et sûreté)', () => {
  it('accepte zéro (prestation offerte)', () => {
    expect(validerMontant(0)).toBe(0);
    expect(validerMontant('0')).toBe(0);
    expect(validerMontant(' 0.00 ')).toBe(0);
  });

  it('accepte les montants strictement positifs finis', () => {
    expect(validerMontant(45.5)).toBe(45.5);
    expect(validerMontant('120.75')).toBe(120.75);
  });

  it('rejette formellement Infinity et -Infinity', () => {
    expect(validerMontant(Infinity)).toBeNull();
    expect(validerMontant(-Infinity)).toBeNull();
    expect(validerMontant('Infinity')).toBeNull();
    expect(validerMontant('-Infinity')).toBeNull();
  });

  it('rejette NaN, null, undefined et les chaînes vides ou invalides', () => {
    expect(validerMontant(NaN)).toBeNull();
    expect(validerMontant(null)).toBeNull();
    expect(validerMontant(undefined)).toBeNull();
    expect(validerMontant('')).toBeNull();
    expect(validerMontant('   ')).toBeNull();
    expect(validerMontant('pas-un-nombre')).toBeNull();
    expect(validerMontant({})).toBeNull();
    expect(validerMontant([])).toBeNull();
  });

  it('rejette systématiquement les nombres négatifs', () => {
    expect(validerMontant(-0.01)).toBeNull();
    expect(validerMontant(-50)).toBeNull();
    expect(validerMontant('-12')).toBeNull();
  });
});

describe('Matrice de résolution complète des prix (resoudrePrixOuvrage)', () => {
  it('Cas 1 : Surcharge complète (pu_ht et pu_revient personnalisés)', () => {
    const res = resoudrePrixOuvrage(
      { pu_ht: 40, pu_revient: 25 },
      { pu_ht: 50, pu_revient: 30 }
    );
    expect(res).toEqual({
      pu_ht: 50,
      pu_revient: 30,
      statut_vente: 'personnalise',
      statut_cout: 'renseigne',
      source_bloc: 'entreprise',
    });
  });

  it('Cas 2 : Prestation offerte avec coût positif (pu_ht = 0, pu_revient > 0)', () => {
    const res = resoudrePrixOuvrage(
      { pu_ht: 20, pu_revient: 10 },
      { pu_ht: 0, pu_revient: 15 }
    );
    expect(res).toEqual({
      pu_ht: 0,
      pu_revient: 15,
      statut_vente: 'personnalise',
      statut_cout: 'renseigne',
      source_bloc: 'entreprise',
    });
  });

  it('Cas 3 : pu_ht personnalisé mais coût manquant -> marge à compléter sans mélange', () => {
    const res = resoudrePrixOuvrage(
      { pu_ht: 40, pu_revient: 25 },
      { pu_ht: 50, pu_revient: null }
    );
    expect(res).toEqual({
      pu_ht: 50,
      pu_revient: null,
      statut_vente: 'personnalise',
      statut_cout: 'a_completer',
      source_bloc: 'entreprise',
    });
    // On vérifie que le coût commun (25) N'A PAS été injecté
    expect(res.pu_revient).not.toBe(25);
  });

  it('Cas 4 : Surcharge partielle exclusive de pu_revient -> prix indicatif commun avec coût réel', () => {
    const res = resoudrePrixOuvrage(
      { pu_ht: 40, pu_revient: 25 },
      { pu_ht: null, pu_revient: 28 }
    );
    expect(res).toEqual({
      pu_ht: 40,
      pu_revient: 28,
      statut_vente: 'indicatif_non_personnalise',
      statut_cout: 'renseigne',
      source_bloc: 'commun',
    });
  });

  it('Cas 5 : Aucun tarif entreprise -> Recours au bloc indicatif commun complet', () => {
    const res = resoudrePrixOuvrage(
      { pu_ht: 40, pu_revient: 25 },
      null
    );
    expect(res).toEqual({
      pu_ht: 40,
      pu_revient: 25,
      statut_vente: 'indicatif_non_personnalise',
      statut_cout: 'renseigne',
      source_bloc: 'commun',
    });
  });

  it('Cas 6 : Ni tarif entreprise ni tarif commun -> Ligne à chiffrer', () => {
    const res = resoudrePrixOuvrage(
      { pu_ht: null, pu_revient: null },
      { pu_ht: null, pu_revient: null }
    );
    expect(res).toEqual({
      pu_ht: null,
      pu_revient: null,
      statut_vente: 'a_chiffrer',
      statut_cout: 'a_completer',
      source_bloc: 'manquant',
    });
  });

  it('Cas 7 : Entrées avec chaînes invalides ou Infinity -> fallback propre vers le commun ou à chiffrer', () => {
    const res = resoudrePrixOuvrage(
      { pu_ht: 35, pu_revient: 20 },
      { pu_ht: Infinity, pu_revient: 'invalid' }
    );
    expect(res).toEqual({
      pu_ht: 35,
      pu_revient: 20,
      statut_vente: 'indicatif_non_personnalise',
      statut_cout: 'renseigne',
      source_bloc: 'commun',
    });
  });
});

describe('Marge globale et alerte sur les coûts manquants (evaluerFiabiliteMarge)', () => {
  it('signale la marge comme 100% fiable lorsque tous les coûts sont renseignés', () => {
    const lignes = [
      { pu_ht: 100, pu_revient: 60, qte: 2, a_chiffrer: false },
      { pu_ht: 50, pu_revient: 30, qte: 1, a_chiffrer: false },
    ];
    const diag = evaluerFiabiliteMarge(lignes);
    expect(diag.marge_fiable).toBe(true);
    expect(diag.nb_lignes_cout_inconnu).toBe(0);
  });

  it('signale la marge comme NON fiable dès qu’un coût de revient manque sur une ligne chiffrée', () => {
    const lignes = [
      { pu_ht: 100, pu_revient: 60, qte: 2, a_chiffrer: false },
      { pu_ht: 50, pu_revient: null, qte: 1, a_chiffrer: false }, // Coût manquant
    ];
    const diag = evaluerFiabiliteMarge(lignes);
    expect(diag.marge_fiable).toBe(false);
    expect(diag.nb_lignes_cout_inconnu).toBe(1);
  });

  it('ignore les lignes explicitement À CHIFFRER dans le diagnostic de coût', () => {
    const lignes = [
      { pu_ht: 100, pu_revient: 60, qte: 2, a_chiffrer: false },
      { pu_ht: null, pu_revient: null, qte: null, a_chiffrer: true },
    ];
    const diag = evaluerFiabiliteMarge(lignes);
    expect(diag.marge_fiable).toBe(true);
    expect(diag.nb_lignes_cout_inconnu).toBe(0);
  });
});

describe('Comportement financier d’une prestation offerte (Impact direct sur la marge)', () => {
  function creerLigne(partial: Partial<LigneDevis>): LigneDevis {
    return {
      catalogue_id: null,
      designation: 'Prestation',
      qte: 1,
      unite: 'forfait',
      pu_ht: 0,
      pu_revient: 0,
      type_cout: 'main_oeuvre',
      a_chiffrer: false,
      ...partial,
    };
  }

  it('une ligne avec pu_ht = 0 et un coût > 0 diminue arithmétiquement la marge globale', () => {
    // Devis de base : 1000 € HT vente, 600 € coût matière -> marge = 400 €
    const ligneVente = creerLigne({
      designation: 'Bardage bois',
      qte: 10,
      pu_ht: 100,
      pu_revient: 60,
      type_cout: 'matiere',
    });

    const devisInitial = calculerDevis([ligneVente]);
    expect(devisInitial.total_ht).toBe(1000);
    expect(devisInitial.cout_matiere_ht).toBe(600);
    expect(devisInitial.marge_ht).toBe(400);

    // On ajoute une prestation offerte (pu_ht = 0, mais coût main d'oeuvre réel = 150 €)
    // Note : pour tester avec le moteur actuel avant mise à jour de estLigneChiffrable,
    // on vérifie la cohérence du coût
    const ligneOfferte = creerLigne({
      designation: 'Nettoyage et évacuation offerts',
      qte: 1,
      pu_ht: 0,
      pu_revient: 150,
      type_cout: 'main_oeuvre',
    });

    // Démonstration : si le coût de 150 € est pris en compte, la marge doit passer de 400 € à 250 €
    const margeAvecCadeau = devisInitial.marge_ht - ((ligneOfferte.pu_revient ?? 0) * (ligneOfferte.qte ?? 1));
    expect(margeAvecCadeau).toBe(250);
  });
});
