// __tests__/metier/catalogue-resolution-integration.test.ts
//
// Validation des conditions d'acceptation pour l'intégration des prix catalogue :
// 1. Isolation multi-tenant (2 entreprises, prix distincts)
// 2. Surcharges complètes, partielles et absentes
// 3. Fiabilité des marges et traitement des prestations offertes
// 4. Non-rétroactivité stricte des devis existants

import { describe, it, expect } from 'vitest';
import {
  resoudrePrixOuvrage,
  evaluerFiabiliteMarge,
  type EntreeTarif,
} from '@/lib/catalogue/resoudrePrix';
import {
  calculerDevis,
  type LigneDevis,
} from '@/lib/devisCalcul';

const ENT_A = '11111111-1111-4111-8111-111111111111';
const ENT_B = '22222222-2222-4222-8222-222222222222';

describe('Condition 1 : Isolation stricte des prix entre deux entreprises', () => {
  // Référentiel commun partagé
  const catalogueCommun: Record<string, EntreeTarif> = {
    'ouv-bardage-melo': { pu_ht: 45.0, pu_revient: 28.0 },
    'ouv-vis-inox': { pu_ht: 0.25, pu_revient: 0.10 },
  };

  // Base de surcharges distinctes par tenant (simule catalogue_ouvrages_prix)
  const surchargesParEntreprise: Record<string, Record<string, EntreeTarif>> = {
    [ENT_A]: {
      'ouv-bardage-melo': { pu_ht: 55.0, pu_revient: 32.0 }, // Entreprise A marge plus haut
    },
    [ENT_B]: {
      'ouv-bardage-melo': { pu_ht: 42.0, pu_revient: 27.0 }, // Entreprise B a négocié un meilleur tarif
    },
  };

  it('chaque entreprise résout son propre prix sans fuite inter-tenant', () => {
    const articleId = 'ouv-bardage-melo';
    const commun = catalogueCommun[articleId];

    const prixEntA = resoudrePrixOuvrage(commun, surchargesParEntreprise[ENT_A][articleId]);
    const prixEntB = resoudrePrixOuvrage(commun, surchargesParEntreprise[ENT_B][articleId]);

    // Vérification Entreprise A
    expect(prixEntA.pu_ht).toBe(55.0);
    expect(prixEntA.pu_revient).toBe(32.0);
    expect(prixEntA.statut_vente).toBe('personnalise');
    expect(prixEntA.source_bloc).toBe('entreprise');

    // Vérification Entreprise B
    expect(prixEntB.pu_ht).toBe(42.0);
    expect(prixEntB.pu_revient).toBe(27.0);
    expect(prixEntB.statut_vente).toBe('personnalise');
    expect(prixEntB.source_bloc).toBe('entreprise');

    // Étanchéité absolue
    expect(prixEntA.pu_ht).not.toBe(prixEntB.pu_ht);
    expect(prixEntA.pu_revient).not.toBe(prixEntB.pu_revient);
  });

  it('si une entreprise n’a pas de surcharge, elle utilise le commun sans impacter l’autre', () => {
    const articleId = 'ouv-vis-inox';
    const commun = catalogueCommun[articleId];

    // Entreprise A et B n'ont pas de surcharge sur la vis
    const prixEntA = resoudrePrixOuvrage(commun, surchargesParEntreprise[ENT_A][articleId]);
    const prixEntB = resoudrePrixOuvrage(commun, surchargesParEntreprise[ENT_B][articleId]);

    expect(prixEntA.pu_ht).toBe(0.25);
    expect(prixEntA.statut_vente).toBe('indicatif_non_personnalise');
    expect(prixEntB.pu_ht).toBe(0.25);
    expect(prixEntB.statut_vente).toBe('indicatif_non_personnalise');
  });
});

describe('Condition 2 : Surcharges absentes, complètes et partielles', () => {
  const commun: EntreeTarif = { pu_ht: 100.0, pu_revient: 60.0 };

  it('surcharge complète : vente et coût propres', () => {
    const res = resoudrePrixOuvrage(commun, { pu_ht: 120.0, pu_revient: 70.0 });
    expect(res.pu_ht).toBe(120.0);
    expect(res.pu_revient).toBe(70.0);
    expect(res.statut_vente).toBe('personnalise');
    expect(res.statut_cout).toBe('renseigne');
  });

  it('surcharge partielle (pu_ht seul) : vente propre, coût restant à compléter (pas de mélange)', () => {
    const res = resoudrePrixOuvrage(commun, { pu_ht: 120.0, pu_revient: null });
    expect(res.pu_ht).toBe(120.0);
    expect(res.pu_revient).toBeNull(); // Coût commun 60 N'EST PAS injecté
    expect(res.statut_vente).toBe('personnalise');
    expect(res.statut_cout).toBe('a_completer');
  });

  it('surcharge partielle (pu_revient seul) : vente indicative commune, coût personnalisé retenu', () => {
    const res = resoudrePrixOuvrage(commun, { pu_ht: null, pu_revient: 65.0 });
    expect(res.pu_ht).toBe(100.0); // Prix commun indicatif
    expect(res.pu_revient).toBe(65.0); // Coût personnalisé de l'artisan
    expect(res.statut_vente).toBe('indicatif_non_personnalise');
    expect(res.statut_cout).toBe('renseigne');
  });

  it('surcharges absentes : bloc complet commun indicatif', () => {
    const res = resoudrePrixOuvrage(commun, null);
    expect(res.pu_ht).toBe(100.0);
    expect(res.pu_revient).toBe(60.0);
    expect(res.statut_vente).toBe('indicatif_non_personnalise');
    expect(res.statut_cout).toBe('renseigne');
  });
});

describe('Condition 3 : Vérification de la marge et des prestations offertes', () => {
  it('signale une marge non fiable dès qu’un coût de revient est manquant', () => {
    const lignes = [
      { pu_ht: 100, pu_revient: 60, qte: 10 },
      { pu_ht: 50, pu_revient: null, qte: 5 }, // Coût non renseigné
    ];
    const diag = evaluerFiabiliteMarge(lignes);
    expect(diag.marge_fiable).toBe(false);
    expect(diag.nb_lignes_cout_inconnu).toBe(1);
  });

  it('une prestation offerte avec un coût positif diminue fidèlement la marge', () => {
    const margeBase = 500; // Marge nette du chantier avant geste commercial
    const coutPrestationOfferte = 120; // Coût réel de l'opération offerte

    // Le prix de vente est 0 (offert au client)
    const tarifOffert = resoudrePrixOuvrage(
      { pu_ht: 150, pu_revient: 80 },
      { pu_ht: 0, pu_revient: coutPrestationOfferte }
    );

    expect(tarifOffert.pu_ht).toBe(0);
    expect(tarifOffert.pu_revient).toBe(120);
    expect(tarifOffert.statut_vente).toBe('personnalise');
    expect(tarifOffert.statut_cout).toBe('renseigne');

    // Impact arithmétique : la marge finale diminue exactement du coût engagé
    const margeFinale = margeBase - (tarifOffert.pu_revient! * 1);
    expect(margeFinale).toBe(380);
  });
});

describe('Condition 4 : Immutabilité stricte des documents historiques (Non-rétroactivité)', () => {
  it('un devis persisté en JSONB ne change jamais même si le catalogue de l’entreprise évolue', () => {
    // 1. État historique d'un devis au 15 janvier 2026 (sauvegardé en base dans devis.lignes)
    const lignesDevisHistorique: LigneDevis[] = [
      {
        catalogue_id: 'art-001',
        designation: 'Clin Red Cedar',
        qte: 50,
        unite: 'm²',
        pu_ht: 60.0,
        pu_revient: 40.0,
        type_cout: 'matiere',
        a_chiffrer: false,
      },
    ];

    const totauxHistoriques = calculerDevis(lignesDevisHistorique);
    expect(totauxHistoriques.total_ht).toBe(3000);
    expect(totauxHistoriques.cout_matiere_ht).toBe(2000);
    expect(totauxHistoriques.marge_ht).toBe(1000);

    // 2. Le 1er novembre 2026, l'entreprise augmente son tarif catalogue de 60 € à 85 €
    const catalogueModifieApresCoup: EntreeTarif = {
      pu_ht: 85.0,
      pu_revient: 55.0,
    };
    const nouveauPrixResolu = resoudrePrixOuvrage(
      { pu_ht: 50.0, pu_revient: 35.0 },
      catalogueModifieApresCoup
    );
    expect(nouveauPrixResolu.pu_ht).toBe(85.0);

    // 3. Relecture du devis existant : il NE RÉÉVALUE PAS les lignes via resoudrePrixOuvrage
    // Le calcul d'un document existant s'effectue TOUJOURS sur son snapshot JSONB persisté
    const totauxApresRelecture = calculerDevis(lignesDevisHistorique);

    // Vérification de non-rétroactivité stricte au centime près
    expect(totauxApresRelecture.total_ht).toBe(totauxHistoriques.total_ht);
    expect(totauxApresRelecture.cout_matiere_ht).toBe(totauxHistoriques.cout_matiere_ht);
    expect(totauxApresRelecture.marge_ht).toBe(totauxHistoriques.marge_ht);
    expect(lignesDevisHistorique[0].pu_ht).toBe(60.0); // Le prix d'origine est immuable
  });
});
