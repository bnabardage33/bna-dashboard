import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import LoginPage from '@/app/login/page';
import { supabase } from '@/lib/supabase';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(),
    },
  },
}));

describe('Page de connexion (/login) - Refonte visuelle et fonctionnelle', () => {
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
      root.render(<LoginPage />);
    });
  }

  it('affiche le logo BNA officiel depuis public/logo.bna.png', async () => {
    await monter();
    const logo = container.querySelector('img[alt="BNA - Bâtiment Nouvelle Aquitaine"]');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toBe('/logo.bna.png');
  });

  it('affiche les textes hiérarchiques de la carte dans le bon ordre', async () => {
    await monter();
    expect(container.textContent).toContain('ESPACE PROFESSIONNEL');
    expect(container.textContent).toContain('Connexion BNA');
    expect(container.textContent).toContain('Connectez-vous à votre espace de travail.');
    expect(container.textContent).toContain('BNA · Bâtiment Nouvelle Aquitaine');
  });

  it('affiche les champs email, mot de passe et le bouton Se connecter', async () => {
    await monter();
    const emailInput = container.querySelector('input[type="email"]');
    const passwordInput = container.querySelector('input[placeholder="Mot de passe"]');
    const submitButton = container.querySelector('button[type="submit"]');

    expect(emailInput).not.toBeNull();
    expect(passwordInput).not.toBeNull();
    expect(submitButton).not.toBeNull();
    expect(passwordInput?.getAttribute('type')).toBe('password');
    expect(submitButton?.textContent).toContain('Se connecter');
  });

  it('permet de basculer la visibilité du mot de passe', async () => {
    await monter();
    const passwordInput = container.querySelector('input[placeholder="Mot de passe"]');
    const toggleButton = container.querySelector('button[aria-label*="mot de passe"]');

    expect(passwordInput?.getAttribute('type')).toBe('password');
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(passwordInput?.getAttribute('type')).toBe('text');
    await act(async () => {
      toggleButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(passwordInput?.getAttribute('type')).toBe('password');
  });

  function setInputValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('soumet les identifiants à Supabase lors de la validation du formulaire', async () => {
    const signInMock = vi.mocked(supabase.auth.signInWithPassword);
    signInMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>);

    await monter();
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[placeholder="Mot de passe"]') as HTMLInputElement;
    const form = container.querySelector('form');

    await act(async () => {
      setInputValue(emailInput, 'artisan@bna.fr');
      setInputValue(passwordInput, 'Secret123!');
    });

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(signInMock).toHaveBeenCalledWith({
      email: 'artisan@bna.fr',
      password: 'Secret123!',
    });
  });

  it('affiche un message d\'erreur si l\'authentification échoue', async () => {
    const signInMock = vi.mocked(supabase.auth.signInWithPassword);
    signInMock.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: new Error('Invalid credentials') as unknown as import('@supabase/supabase-js').AuthError,
    });

    await monter();
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[placeholder="Mot de passe"]') as HTMLInputElement;
    const form = container.querySelector('form');

    await act(async () => {
      setInputValue(emailInput, 'mauvais@bna.fr');
      setInputValue(passwordInput, 'faux');
    });

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain('Email ou mot de passe incorrect.');
  });
});
