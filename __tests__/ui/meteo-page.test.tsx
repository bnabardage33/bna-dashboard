import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import MeteoPage from '@/app/terrain/meteo/page';
import { fetchMeteo, type JourMeteo } from '@/lib/meteo';

vi.mock('@/lib/meteo', async () => {
  const actual = await vi.importActual<typeof import('@/lib/meteo')>('@/lib/meteo');
  return {
    ...actual,
    fetchMeteo: vi.fn(),
  };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const MOCK_METEO: JourMeteo = {
  matin: { temp: 11, vent: 12, rafales: 22 },
  apresMidi: { temp: 19, vent: 15, rafales: 28 },
  heures: [
    { heure: '08:00', temp: 11, vent: 12, rafales: 22, pluie: 0, statut: 'avenir', nature: 'prevision' },
    { heure: '12:00', temp: 16, vent: 14, rafales: 25, pluie: 0.4, statut: 'avenir', nature: 'prevision' },
    { heure: '16:00', temp: 19, vent: 15, rafales: 28, pluie: 0, statut: 'avenir', nature: 'prevision' },
  ],
  alerte: { niveau: 'vert', motif: 'Aucune vigilance particulière' },
  icon: 'partly-cloudy-day',
  conditions: 'Éclaircies et passages nuageux',
  source: 'open-meteo',
  tempActuelle: 17,
  tempMaxJour: 20,
  tempMinJour: 9,
  cumulPluie: 0.4,
  genereLe: '12:00',
  prochainsJours: [
    { date: '2026-10-25', tempMax: 18, tempMin: 10, icon: 'rain', conditions: 'Averses', cumulPluie: 4.2 },
    { date: '2026-10-26', tempMax: 16, tempMin: 8, icon: 'clear-day', conditions: 'Ensoleillé', cumulPluie: 0 },
  ],
};

describe('Page Accueil Météo (/terrain/meteo) - Refonte visuelle et structurelle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function monter() {
    await act(async () => {
      root.render(<MeteoPage />);
    });
  }

  it('affiche l\'en-tête et le formulaire de recherche météo', async () => {
    vi.mocked(fetchMeteo).mockResolvedValueOnce(MOCK_METEO);
    await monter();

    expect(container.textContent).toContain('Accueil Météo');
    expect(container.textContent).toContain('Conditions actuelles et prévisions disponibles pour Bordeaux');
    const input = container.querySelector('input#ville-meteo-detaillee');
    expect(input).not.toBeNull();
    const btn = container.querySelector('button[type="submit"]');
    expect(btn?.textContent).toContain('Rechercher');
  });

  it('affiche les conditions actuelles (température, état, min/max, vigilance)', async () => {
    vi.mocked(fetchMeteo).mockResolvedValueOnce(MOCK_METEO);
    await monter();

    expect(container.textContent).toContain('17°');
    expect(container.textContent).toContain('Éclaircies et passages nuageux');
    expect(container.textContent).toContain('20°');
    expect(container.textContent).toContain('9°');
    expect(container.textContent).toContain('Vigilance météo · vert');
    expect(container.textContent).toContain('Aucune vigilance particulière');
  });

  it('affiche les prévisions horaires avec heure, température, vent et pluie', async () => {
    vi.mocked(fetchMeteo).mockResolvedValueOnce(MOCK_METEO);
    await monter();

    expect(container.textContent).toContain('Prévisions horaires');
    expect(container.textContent).toContain('08:00');
    expect(container.textContent).toContain('12:00');
    expect(container.textContent).toContain('16:00');
  });

  it('affiche les prévisions sur plusieurs jours', async () => {
    vi.mocked(fetchMeteo).mockResolvedValueOnce(MOCK_METEO);
    await monter();

    expect(container.textContent).toContain('Prévisions sur plusieurs jours');
    expect(container.textContent).toContain('Averses');
    expect(container.textContent).toContain('Ensoleillé');
    expect(container.textContent).toContain('4.2 mm');
  });

  it('affiche les détails météorologiques (matin, après-midi, précipitations)', async () => {
    vi.mocked(fetchMeteo).mockResolvedValueOnce(MOCK_METEO);
    await monter();

    expect(container.textContent).toContain('Détails météorologiques');
    expect(container.textContent).toContain('Matin');
    expect(container.textContent).toContain('Après-midi');
    expect(container.textContent).toContain('Précipitations prévues');
  });

  it('affiche les actions métier avec liens vers veille intempéries et chantiers', async () => {
    vi.mocked(fetchMeteo).mockResolvedValueOnce(MOCK_METEO);
    await monter();

    const lienVeille = container.querySelector('a[href="/bureau/meteo"]');
    const lienChantier = container.querySelector('a[href="/terrain/accueil"]');
    expect(lienVeille).not.toBeNull();
    expect(lienChantier).not.toBeNull();
    expect(lienVeille?.textContent).toContain('Veille des intempéries');
    expect(lienChantier?.textContent).toContain('Impact météo sur les chantiers');
  });
});
