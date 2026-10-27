import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));

let root: Root;
let conteneur: HTMLDivElement;

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

afterEach(() => {
  act(() => root.unmount());
  conteneur.remove();
});

async function rendreAccueil(titre?: string): Promise<HTMLElement> {
  conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  root = createRoot(conteneur);
  const { default: AccueilProfessionnel } = await import('@/components/AccueilProfessionnel');

  await act(async () => {
    root.render(createElement(AccueilProfessionnel, { titre }));
  });

  return conteneur;
}

describe('AccueilProfessionnel', () => {
  it('présente le titre et les trois cartes métier', async () => {
    const rendu = await rendreAccueil();

    expect(rendu.querySelector('h1')?.textContent).toBe('Accueil');
    expect(rendu.textContent).toContain('Bardage');
    expect(rendu.textContent).toContain('Terrasse');
    expect(rendu.textContent).toContain('Clôture');
    expect(rendu.querySelectorAll('article')).toHaveLength(2);
  });

  it('permet de nommer explicitement l’accueil chantier', async () => {
    const rendu = await rendreAccueil('Accueil Chantier');

    expect(rendu.querySelector('h1')?.textContent).toBe('Accueil Chantier');
  });

  it('Bardage mène au hub commun et annonce qu’il s’agit des chantiers existants', async () => {
    const rendu = await rendreAccueil();
    const lienBardage = rendu.querySelector<HTMLAnchorElement>('a[href="/terrain/chantier"]');

    expect(lienBardage).not.toBeNull();
    expect(lienBardage?.getAttribute('aria-label')).toMatch(/Bardage.*chantiers existants.*hub commun/i);
    expect(lienBardage?.textContent).toMatch(/chantiers existants.*hub commun/i);
  });

  it('Terrasse et Clôture restent informatives sans lien métier fictif', async () => {
    const rendu = await rendreAccueil();
    const cartes = [...rendu.querySelectorAll('article')];
    const terrasse = cartes.find((carte) => carte.textContent?.includes('Terrasse'));
    const cloture = cartes.find((carte) => carte.textContent?.includes('Clôture'));

    expect(terrasse?.textContent).toMatch(/entrée chantier Terrasse dédiée reste à développer/i);
    expect(cloture?.textContent).toMatch(/espace métier reste à développer/i);
    expect(terrasse?.getAttribute('aria-label')).toMatch(/Terrasse.*reste à développer/i);
    expect(cloture?.getAttribute('aria-label')).toMatch(/Clôture.*reste à développer/i);
    expect(terrasse?.querySelector('a, button')).toBeNull();
    expect(cloture?.querySelector('a, button')).toBeNull();
  });

  it('conserve les six raccourcis communs avec leurs destinations', async () => {
    const rendu = await rendreAccueil();
    const navSocle = rendu.querySelector<HTMLElement>('nav[aria-label="Fonctionnalités communes"]');
    const liens = [...(navSocle?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];

    expect(liens.map((lien) => [lien.textContent?.trim(), lien.getAttribute('href')])).toEqual([
      ['Chantiers', '/terrain/chantier'],
      ['Clients', '/bureau/clients'],
      ['Devis', '/bureau/devis-factures'],
      ['Catalogue Bardage', '/bureau/catalogue'],
      ['Catalogue Terrasse', '/bureau/catalogue-terrasse'],
      ['Finance', '/finance'],
    ]);
  });

  it('ne répète pas le logo déjà affiché par le layout global', async () => {
    const rendu = await rendreAccueil();
    const accueilSource = readFileSync('components/AccueilProfessionnel.tsx', 'utf8');
    const layoutSource = readFileSync('app/layout.tsx', 'utf8');

    expect(rendu.querySelector('img')).toBeNull();
    expect(accueilSource).not.toContain('logo-bna.png');
    expect(layoutSource).toContain('src="/logo-bna.png"');
  });

  it('expose des noms accessibles et une cible clavier pour le lien actif', async () => {
    const rendu = await rendreAccueil();
    const lienBardage = rendu.querySelector<HTMLAnchorElement>('a[href="/terrain/chantier"]');

    expect(rendu.querySelector('nav[aria-label="Métiers"]')).toBeNull();
    expect(lienBardage?.getAttribute('aria-label')).toBe('Bardage — chantiers existants, hub commun');
    expect(lienBardage?.className).toContain('focus-visible:ring-2');
    expect(rendu.querySelector('nav[aria-label="Fonctionnalités communes"]')).not.toBeNull();
  });
});
