import { describe, it, expect } from 'vitest';
import { composerAdresseDepart } from '@/lib/deplacement/adresse';

// `composerAdresseDepart` ne fait QUE mettre en forme la ligne
// `entreprise_settings` déjà enregistrée : aucune base, aucun géocodage, aucun
// calcul de distance n'est en jeu. Ces tests verrouillent donc uniquement la
// mise en forme — en particulier l'absence de séparateur orphelin, qui
// produirait une adresse que le géocodeur lirait mal.

describe('metier/deplacement — adresse de départ par défaut', () => {
  it('compose « voie, code postal ville »', () => {
    expect(
      composerAdresseDepart({ adresse: '12 rue de la Paix', code_postal: '75002', ville: 'Paris' }),
    ).toBe('12 rue de la Paix, 75002 Paris');
  });

  it('garde le code postal dans la chaîne, car le géocodage en a besoin', () => {
    // `extraireCodePostal()` (lib/deplacement/geocodage.ts) recherche un motif
    // à cinq chiffres DANS l'adresse : c'est ce qui permet de signaler une
    // commune homonyme. Une adresse sans code postal perdrait ce repère.
    const compose = composerAdresseDepart({
      adresse: '12 rue de la Paix',
      code_postal: '75002',
      ville: 'Paris',
    });
    expect(compose).toMatch(/(?:^|\D)\d{5}(?:\D|$)/);
  });

  it('n\'invente pas de séparateur quand une partie manque', () => {
    // Le cas `code_postal` vide est celui qui produirait le défaut le plus
    // visible : « 12 rue X,  Bordeaux », avec une virgule orpheline.
    expect(
      composerAdresseDepart({ adresse: '12 rue X', code_postal: null, ville: 'Bordeaux' }),
    ).toBe('12 rue X, Bordeaux');

    expect(
      composerAdresseDepart({ adresse: '12 rue X', code_postal: '33000', ville: '' }),
    ).toBe('12 rue X, 33000');
  });

  it('renvoie une chaîne vide si rien n\'est renseigné', () => {
    expect(composerAdresseDepart({ adresse: null, code_postal: null, ville: null })).toBe('');
    expect(composerAdresseDepart({ adresse: '', code_postal: '', ville: '' })).toBe('');
    expect(composerAdresseDepart({ adresse: '   ', code_postal: '  ', ville: null })).toBe('');
  });

  it('renvoie une chaîne vide quand la ligne est absente', () => {
    // `maybeSingle()` renvoie `data: null` quand les Paramètres n'ont jamais
    // été enregistrés. L'onglet Déplacements doit alors laisser son champ vide,
    // jamais afficher « null ».
    expect(composerAdresseDepart(null)).toBe('');
    expect(composerAdresseDepart(undefined)).toBe('');
  });

  it('tolère des colonnes absentes de la sélection', () => {
    // Une lecture ciblée peut ne pas renvoyer toutes les colonnes ; `undefined`
    // doit se comporter comme `null`, jamais produire « undefined ».
    expect(composerAdresseDepart({ adresse: '12 rue X' })).toBe('12 rue X');
    expect(composerAdresseDepart({ ville: 'Bordeaux' })).toBe('Bordeaux');
  });

  it('rogne les espaces parasites', () => {
    expect(
      composerAdresseDepart({
        adresse: '  12 rue X  ',
        code_postal: ' 33000 ',
        ville: '  Bordeaux ',
      }),
    ).toBe('12 rue X, 33000 Bordeaux');
  });

  it('n\'ajoute jamais de colonne : c\'est une fonction de formatage', () => {
    // Garde-fou de périmètre : cette fonction ne doit pas devenir un point
    // d'écriture. Elle ne renvoie qu'une chaîne, ne prend qu'une ligne.
    expect(typeof composerAdresseDepart({ adresse: 'a', code_postal: 'b', ville: 'c' })).toBe('string');
  });
});