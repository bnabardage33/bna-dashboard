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

      window.location.href = '/';
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
    <div id="login-page" className="fixed inset-0 z-[100000] overflow-y-auto bg-[#F3F3F1] text-[#23272B] selection:bg-[#D97732]/20 selection:text-[#B85B2B]">
      <main className="min-h-full w-full flex flex-col items-center justify-start pt-4 sm:pt-8 pb-12 sm:pb-16 px-4">
        {/* 1. Logo BNA XXL centré, remonté vers le haut et nettement décollé du formulaire */}
        <div
          className="w-full flex justify-center mb-8 sm:mb-12 mt-1 sm:mt-3"
          style={{ marginBottom: 'clamp(32px, 5vh, 52px)' }}
        >
          <div
            className="relative w-[95%] max-w-[580px] sm:max-w-[620px]"
            style={{ width: '95%', maxWidth: '620px' }}
          >
            <Image
              src="/logo.bna.png"
              alt="BNA - Bâtiment Nouvelle Aquitaine"
              width={1774}
              height={887}
              priority
              className="w-full h-auto object-contain pointer-events-none drop-shadow-sm"
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
        </div>

        {/* 2. Carte de connexion blanche */}
        <div className="w-[calc(100%-36px)] max-w-[620px] bg-white rounded-[28px] sm:rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.06)] p-6 sm:p-9 md:p-[42px] transition-all">
          {/* En-tête de la carte */}
          <div className="text-center mb-5 sm:mb-7">
            <p className="text-[15px] sm:text-[18px] font-bold text-[#B85B2B] uppercase tracking-[4px] mb-1 sm:mb-2">
              ESPACE PROFESSIONNEL
            </p>
            <h1 className="text-[28px] sm:text-[38px] font-bold text-[#23272B] tracking-tight mb-1 sm:mb-2 leading-tight">
              Connexion BNA
            </h1>
            <p className="text-[16px] sm:text-[21px] text-[#777777] leading-snug">
              Connectez-vous à votre espace de travail.
            </p>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
            {/* Champ Email */}
            <div>
              <input
                type="email"
                placeholder="Adresse e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full h-[70px] sm:h-[94px] bg-white border border-[#D8D8D8] rounded-[18px] sm:rounded-[22px] px-5 sm:px-[28px] text-[18px] sm:text-[27px] text-[#23272B] placeholder:text-[#999999] focus:outline-none focus:border-[#D97732] focus:ring-2 focus:ring-[#D97732]/20 transition-all"
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
                className="w-full h-[70px] sm:h-[94px] bg-white border border-[#D8D8D8] rounded-[18px] sm:rounded-[22px] px-5 sm:px-[28px] pr-14 sm:pr-20 text-[18px] sm:text-[27px] text-[#23272B] placeholder:text-[#999999] focus:outline-none focus:border-[#D97732] focus:ring-2 focus:ring-[#D97732]/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-4 sm:right-6 top-1/2 -translate-y-1/2 p-2 text-[#777777] hover:text-[#23272B] focus:outline-none transition-colors"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? (
                  <EyeOff className="w-6 h-6 sm:w-8 sm:h-8" />
                ) : (
                  <Eye className="w-6 h-6 sm:w-8 sm:h-8" />
                )}
              </button>
            </div>

            {/* Message d'erreur */}
            {error && (
              <div className="rounded-[16px] bg-red-50 border border-red-200 p-3.5 sm:p-4 text-center">
                <p className="text-red-600 text-[15px] sm:text-[18px] font-medium">{error}</p>
              </div>
            )}

            {/* Bouton Se connecter */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[68px] sm:h-[90px] bg-[#D97732] hover:bg-[#C26526] text-white text-[19px] sm:text-[27px] font-bold rounded-[18px] sm:rounded-[20px] shadow-md shadow-[#D97732]/25 focus:outline-none focus:ring-4 focus:ring-[#D97732]/30 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin" />
                  <span>Connexion...</span>
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>

          {/* Signature en bas de carte */}
          <p className="mt-[26px] sm:mt-[35px] text-center text-[15px] sm:text-[20px] font-medium text-[#8F6A4C]">
            BNA · Bâtiment Nouvelle Aquitaine
          </p>
        </div>
      </main>
    </div>
  );
}
