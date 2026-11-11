import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';

const etat = vi.hoisted(() => ({
  user: null as { id: string } | null,
  destinationRedirect: null as string | null,
  from: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: etat.user }, error: null }) },
    from: etat.from,
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    etat.destinationRedirect = destination;
    throw new Error(`REDIRECT:${destination}`);
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    <a href={href} {...rest}>{children}</a>,
}));

import Home from '@/app/page';

const lire = (chemin: string) => readFileSync(chemin, 'utf8');

function elements(noeud: ReactNode): ReactElement[] {
  if (Array.isArray(noeud)) return noeud.flatMap(elements);
  if (!isValidElement(noeud)) return [];
  const props = noeud.props as { children?: ReactNode };
  return [noeud, ...elements(props.children)];
}

beforeEach(() => {
  etat.user = null;
  etat.destinationRedirect = null;
  etat.from.mockReset();
});

describe('Accueils Météo et Chantier', () => {
  it('redirige immédiatement les visiteurs non connectés vers /login', async () => {
    await expect(Home()).rejects.toThrow('REDIRECT:/login');
    expect(etat.destinationRedirect).toBe('/login');
    expect(etat.from).not.toHaveBeenCalled();
  });

  it('redirige une session active avant tout chargement du cockpit', async () => {
    etat.user = { id: 'utilisateur-connecte' };

    await expect(Home()).rejects.toThrow('REDIRECT:/terrain/meteo');
    expect(etat.destinationRedirect).toBe('/terrain/meteo');
    expect(etat.from).not.toHaveBeenCalled();
  });

  it('protège le nouvel Accueil Chantier et réutilise les blocs du cockpit', () => {
    const page = lire('app/terrain/accueil/page.tsx');
    const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const dashboard = lire('components/DashboardAccueil.tsx');
    const dashboardCode = dashboard.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(pageCode.indexOf('if (!user) redirect')).toBeGreaterThanOrEqual(0);
    expect(pageCode.indexOf('if (!user) redirect')).toBeLessThan(pageCode.indexOf('chargerDonneesAccueil(supabase)'));
    expect(pageCode).toContain('<AccueilProfessionnel titre="Accueil Chantier"');
    expect(pageCode).toContain('<DashboardAccueil');
    expect(pageCode).toContain('blocMeteo={<ChantiersMeteoCards />}');
    expect(pageCode).toContain('notesInitiales={notes}');
    expect(pageCode).toContain('chantiersAPreparer={chantiersAPreparer}');
    expect(pageCode).toContain('notifications={notifications}');
    expect((dashboardCode.match(/<MeteoGeneraleAccueil\s*\/>/g) ?? [])).toHaveLength(1);
    expect(dashboardCode).toContain('Impact météo sur les chantiers');
    expect(dashboardCode).toContain('Chantiers à préparer');
    expect(dashboardCode).toContain('notifications');
    expect(dashboardCode).toContain('Notes & alertes');
  });

  it('préserve les destinations métier météo distinctes et les routes historiques', () => {
    const drawer = lire('components/Drawer.tsx');
    const meteo = lire('app/terrain/meteo/page.tsx');
    const veille = lire('app/bureau/meteo/page.tsx');

    expect(drawer).toContain('href: "/terrain/meteo", label: "Accueil Météo"');
    expect(drawer).toContain('href: "/terrain/accueil", label: "Accueil Chantier"');
    const items = drawer
      .slice(drawer.indexOf('const NAV_ITEMS'), drawer.indexOf('export default function Drawer'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(items.match(/href: "\/terrain\/meteo"/g) ?? []).toHaveLength(1);
    expect(items).not.toContain('label: "Météo générale"');
    expect(items).not.toContain('href: "/", label: "Accueil"');
    expect(items.match(/href: "\/terrain\/accueil"/g) ?? []).toHaveLength(1);
    expect(meteo.match(/fetchMeteo\(ville\)/g) ?? []).toHaveLength(1);
    expect(meteo).toContain('max-w-7xl');
    expect(meteo).toContain('Accueil Météo');
    expect(meteo).toContain('Prévisions horaires');
    expect(meteo).toContain('Prévisions sur plusieurs jours');
    expect(meteo).toContain('meteo.heures.map');
    expect(meteo).toContain('meteo.prochainsJours.map');
    expect(meteo).toContain('href="/terrain/accueil"');
    expect(meteo).toContain('href="/bureau/meteo"');
    expect(meteo).toContain('function MeteoPage');
    expect(veille).toContain('Veille Météo Intempéries');
    expect(lire('app/terrain/page.tsx')).toContain('redirect("/terrain/chantier")');
    expect(lire('app/bureau/page.tsx')).toContain('redirect("/")');
  });
});
