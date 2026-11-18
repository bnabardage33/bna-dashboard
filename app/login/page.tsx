'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Fingerprint, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  base64UrlToUint8Array,
  bufferToBase64Url,
  isWebAuthnSupported,
} from '@/lib/webauthnClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    setBiometricSupported(isWebAuthnSupported());
  }, []);

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

  const handleBiometricLogin = async () => {
    setError('');
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Pas de connexion internet. Vérifiez votre réseau et réessayez.');
      return;
    }

    setBiometricLoading(true);
    try {
      const optRes = await fetch('/api/auth/passkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login-options' }),
      });
      const opts = (await optRes.json()) as {
        challenge?: string;
        rpId?: string;
        timeout?: number;
        userVerification?: UserVerificationRequirement;
        error?: string;
      };

      if (!optRes.ok || !opts.challenge) {
        setError(opts.error || 'Impossible d’initialiser la connexion biométrique.');
        setBiometricLoading(false);
        return;
      }

      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge: base64UrlToUint8Array(opts.challenge) as BufferSource,
          rpId: opts.rpId,
          timeout: opts.timeout ?? 60000,
          userVerification: opts.userVerification ?? 'required',
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        setError('Authentification biométrique annulée.');
        setBiometricLoading(false);
        return;
      }

      const assertion = credential.response as AuthenticatorAssertionResponse;
      const verifyRes = await fetch('/api/auth/passkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login-verify',
          credentialId: bufferToBase64Url(credential.rawId),
          clientDataJSON: bufferToBase64Url(assertion.clientDataJSON),
          authenticatorData: bufferToBase64Url(assertion.authenticatorData),
          signature: bufferToBase64Url(assertion.signature),
        }),
      });

      const verifyData = (await verifyRes.json()) as {
        ok?: boolean;
        tokenHash?: string;
        error?: string;
      };

      if (!verifyRes.ok || !verifyData.tokenHash) {
        setError(verifyData.error || 'Empreinte non reconnue.');
        setBiometricLoading(false);
        return;
      }

      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: verifyData.tokenHash,
        type: 'magiclink',
      });

      if (otpError) {
        setError('Impossible d’ouvrir la session Supabase après vérification biométrique.');
        setBiometricLoading(false);
        return;
      }

      window.location.href = '/terrain/meteo';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Authentification biométrique annulée ou aucune empreinte enregistrée sur cet appareil.');
      } else {
        setError('Connexion biométrique impossible sur cet appareil.');
      }
      setBiometricLoading(false);
    }
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
      className="fixed inset-0 z-[100000] overflow-y-auto bg-[#120F0D] text-white selection:bg-[#D96B27]/30 selection:text-amber-200"
    >
      <div className="min-h-screen bg-[#120F0D] grid lg:grid-cols-2">
        {/* Panneau identitaire gauche (bandeau immersif sur mobile/tablette, colonne complète sur lg:) */}
        <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#161311] via-[#1C1510] to-[#261911] px-6 py-10 sm:py-12 lg:px-12 lg:border-r lg:border-white/[0.06]">
          {/* Motif géométrique architectural évoquant les lames de bardage */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid grid-cols-6 opacity-80"
          >
            <div className="border-r border-white/[0.04]" />
            <div className="border-r border-white/[0.04]" />
            <div className="border-r border-white/[0.04]" />
            <div className="border-r border-white/[0.04]" />
            <div className="border-r border-white/[0.04]" />
            <div />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 border-t border-white/[0.04] opacity-70"
            style={{
              backgroundImage:
                "repeating-linear-gradient(180deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 18px)",
            }}
          />

          <div className="relative z-10 flex max-w-md flex-col items-center text-center">
            {/* Lueur radiale cuivrée derrière le logo */}
            <div className="relative mb-5 flex items-center justify-center">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute h-44 w-72 rounded-full bg-[#D96B27]/15 blur-3xl"
              />
              <div className="relative w-[240px] sm:w-[290px] lg:w-[320px]">
                <Image
                  src="/logo-bna.png"
                  alt="BNA - Bâtiment Nouvelle Aquitaine"
                  width={1774}
                  height={887}
                  priority
                  className="w-full h-auto object-contain pointer-events-none drop-shadow-xl"
                />
              </div>
            </div>

            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
              BNA <span className="text-[#D96B27]">•</span> Bâtiment Nouvelle Aquitaine
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-amber-100/70">
              Pilotage Chantiers, Calepinage &amp; Chiffrage
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {["Bardage Façade", "Terrasse", "Clôture"].map((metier) => (
                <span
                  key={metier}
                  className="rounded-full border border-[#D96B27]/30 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-amber-100/85"
                >
                  {metier}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Panneau de connexion droite */}
        <main className="flex items-center justify-center px-4 py-8 sm:px-8 lg:px-12 bg-[#120F0D]">
          <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#1B1613]/95 p-6 sm:p-8 shadow-2xl">
            {/* Liseré supérieur cuivré subtil */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-[#D96B27] to-transparent"
            />

            <div className="text-center mb-6">
              <p className="text-[11px] font-bold text-[#D96B27] uppercase tracking-[3px] mb-1.5">
                Accès Espace Pro
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
                Connexion à votre poste de pilotage
              </h1>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <input
                  type="email"
                  placeholder="Votre adresse e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email webauthn"
                  required
                  className="w-full h-12 bg-[#120F0D] border border-white/15 rounded-xl px-4 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#D96B27] focus:ring-1 focus:ring-[#D96B27] transition-all"
                />
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full h-12 bg-[#120F0D] border border-white/15 rounded-xl px-4 pr-12 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-[#D96B27] focus:ring-1 focus:ring-[#D96B27] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/50 hover:text-white focus:outline-none transition-colors"
                  aria-label="Afficher ou masquer le mot de passe"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {error && (
                <div className="rounded-xl bg-red-950/60 border border-red-500/40 p-3 text-center">
                  <p className="text-red-200 text-xs font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || biometricLoading}
                className="w-full h-12 bg-gradient-to-r from-[#D96B27] to-[#B85316] hover:from-[#E57732] hover:to-[#C95D1B] text-white text-sm font-semibold rounded-xl shadow-lg shadow-[#D96B27]/20 focus:outline-none focus:ring-2 focus:ring-[#D96B27]/50 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connexion...</span>
                  </>
                ) : (
                  'Se connecter'
                )}
              </button>

              {biometricSupported && (
                <>
                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-white/10" />
                    <span className="mx-3 shrink-0 text-[11px] font-medium uppercase tracking-widest text-white/40">
                      ou
                    </span>
                    <div className="flex-grow border-t border-white/10" />
                  </div>

                  <button
                    type="button"
                    onClick={handleBiometricLogin}
                    disabled={loading || biometricLoading}
                    className="w-full h-12 rounded-xl border border-white/15 bg-[#120F0D] hover:border-[#D96B27]/60 hover:bg-[#161311] text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D96B27]/40 active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    {biometricLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-[#D96B27]" />
                        <span>Vérification de l’empreinte...</span>
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-4 h-4 text-[#D96B27]" />
                        <span>Connexion par empreinte digitale</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </form>

            <p className="mt-6 text-center text-xs font-medium text-white/45">
              Bâtiment Nouvelle Aquitaine • Nouvelle-Aquitaine
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
