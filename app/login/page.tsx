'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const autoSubmitted = useRef(false);

  const submit = useCallback(async () => {
    setError('');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Pas de connexion internet. Vérifiez votre réseau et réessayez.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError('Email ou mot de passe incorrect.');
        setLoading(false);
        return;
      }

      window.location.href = '/terrain/meteo';
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau et réessayez.');
      setLoading(false);
    }
  }, [email, password]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  // Auto-connexion quand les 2 champs sont remplis d'un coup (autofill Bitwarden / gestionnaire de mots de passe)
  useEffect(() => {
    if (autoSubmitted.current) return;
    if (!email || !password) return;

    autoSubmitted.current = true;
    const timer = setTimeout(() => {
      submit();
    }, 400);

    return () => clearTimeout(timer);
  }, [email, password, submit]);

  // Auto-redirection si une session valide existe déjà
  useEffect(() => {
    let actif = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (actif && data.session) {
          router.replace('/');
          router.refresh();
        }
      })
      .catch(() => {
        // hors-ligne : on reste sur le formulaire
      });
    return () => {
      actif = false;
    };
  }, [router]);

  // Masquer l'en-tête global du dashboard pour supprimer le logo dupliqué du layout
  useEffect(() => {
    const header = document.querySelector('header');
    if (header) {
      const prevDisplay = header.style.display;
      header.style.display = 'none';
      return () => {
        header.style.display = prevDisplay;
      };
    }
  }, []);

  return (
    <div
      id="login-page"
      className="fixed inset-0 z-[100000] overflow-y-auto bg-gradient-to-b from-[#161311] via-[#1B1511] to-[#231811] text-white selection:bg-[#D96B27]/30 selection:text-amber-200"
    >
      <main className="min-h-full w-full flex flex-col items-center justify-start md:justify-center pt-4 sm:pt-6 md:py-10 px-4">
        {/* 1. Logo BNA centré et proportionné sur fond sombre */}
        <div className="w-full flex justify-center mb-6 md:mb-8 mt-1 md:mt-0">
          <div className="relative w-[95%] max-w-[440px] md:max-w-[340px]">
            <Image
              src="/logo-bna.png"
              alt="BNA - Bâtiment Nouvelle Aquitaine"
              width={1774}
              height={887}
              priority
              className="w-full h-auto object-contain pointer-events-none drop-shadow-md"
            />
          </div>
        </div>

        {/* 2. Carte de connexion sombre vitrée (Dark Wood & Copper) */}
        <div className="w-[calc(100%-36px)] max-w-[440px] md:max-w-[420px] bg-[#1E1916]/90 backdrop-blur-md border border-white/10 rounded-[26px] md:rounded-[32px] shadow-2xl p-6 sm:p-7 md:p-8 transition-all">
          {/* En-tête de la carte */}
          <div className="text-center mb-5 md:mb-6">
            <p className="text-[14px] md:text-[13px] font-bold text-[#D96B27] uppercase tracking-[3px] md:tracking-[3.5px] mb-1">
              ESPACE PROFESSIONNEL
            </p>
            <h1 className="text-[26px] md:text-[28px] font-bold text-white tracking-tight mb-1 leading-tight">
              Connexion BNA
            </h1>
            <p className="text-[15px] md:text-[15px] text-white/60 leading-snug">
              Connectez-vous à votre espace de travail.
            </p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleLogin} className="space-y-4 md:space-y-4">
            {/* Champ Email */}
            <div>
              <input
                type="email"
                placeholder="Adresse e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full h-[64px] md:h-[52px] bg-[#14110F] border border-white/15 rounded-[16px] md:rounded-[14px] px-5 text-[17px] md:text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:border-[#D96B27] focus:ring-2 focus:ring-[#D96B27]/25 transition-all"
              />
            </div>

            {/* Champ Mot de passe */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full h-[64px] md:h-[52px] bg-[#14110F] border border-white/15 rounded-[16px] md:rounded-[14px] px-5 pr-14 text-[17px] md:text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:border-[#D96B27] focus:ring-2 focus:ring-[#D96B27]/25 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/60 hover:text-white focus:outline-none transition-colors"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Message d'erreur */}
            {error && (
              <div className="rounded-[14px] bg-red-950/60 border border-red-500/40 p-3 text-center">
                <p className="text-red-200 text-[14px] font-medium">{error}</p>
              </div>
            )}

            {/* Bouton Se connecter */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[62px] md:h-[50px] bg-[#D96B27] hover:bg-[#C25B1B] text-white text-[18px] md:text-[16px] font-bold rounded-[16px] md:rounded-[14px] shadow-lg shadow-[#D96B27]/25 focus:outline-none focus:ring-4 focus:ring-[#D96B27]/30 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Connexion...</span>
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>

          {/* Signature en bas de carte */}
          <p className="mt-6 md:mt-7 text-center text-[14px] md:text-[13px] font-medium text-amber-200/60">
            BNA · Bâtiment Nouvelle Aquitaine
          </p>
        </div>
      </main>
    </div>
  );
}
