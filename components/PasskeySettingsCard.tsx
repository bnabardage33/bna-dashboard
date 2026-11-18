'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Fingerprint, Loader2, ShieldAlert, Smartphone, Trash2 } from 'lucide-react';
import { Surface } from '@/components/ui/Surface';
import {
  base64UrlToUint8Array,
  bufferToBase64Url,
  getFriendlyDeviceName,
  isWebAuthnSupported,
} from '@/lib/webauthnClient';

interface PasskeyItem {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
}

export function PasskeySettingsCard() {
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; message: string } | null>(null);

  const loadPasskeys = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/auth/passkey?action=list');
      const data = (await res.json()) as {
        passkeys?: PasskeyItem[];
        migrationRequired?: boolean;
      };
      if (res.ok) {
        setPasskeys(data.passkeys ?? []);
        setMigrationRequired(Boolean(data.migrationRequired));
      }
    } catch {
      // Ignore silent load errors
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    setSupported(isWebAuthnSupported());
    void loadPasskeys();
  }, [loadPasskeys]);

  const handleRegister = async () => {
    setFeedback(null);
    setRegistering(true);
    try {
      const optRes = await fetch('/api/auth/passkey?action=register-options');
      const opts = (await optRes.json()) as {
        challenge?: string;
        rp?: { name: string; id: string };
        user?: { id: string; name: string; displayName: string };
        pubKeyCredParams?: PublicKeyCredentialParameters[];
        timeout?: number;
        attestation?: AttestationConveyancePreference;
        authenticatorSelection?: AuthenticatorSelectionCriteria;
        excludeCredentials?: Array<{ id: string; type: 'public-key' }>;
        error?: string;
      };

      if (!optRes.ok || !opts.challenge || !opts.rp || !opts.user) {
        setFeedback({
          type: 'error',
          message: opts.error || 'Impossible d’initialiser l’enregistrement biométrique.',
        });
        setRegistering(false);
        return;
      }

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: base64UrlToUint8Array(opts.challenge) as BufferSource,
          rp: opts.rp,
          user: {
            id: base64UrlToUint8Array(opts.user.id) as BufferSource,
            name: opts.user.name,
            displayName: opts.user.displayName,
          },
          pubKeyCredParams: opts.pubKeyCredParams ?? [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          timeout: opts.timeout ?? 60000,
          attestation: opts.attestation ?? 'none',
          authenticatorSelection: opts.authenticatorSelection ?? {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            userVerification: 'required',
          },
          excludeCredentials: (opts.excludeCredentials ?? []).map((c) => ({
            id: base64UrlToUint8Array(c.id) as BufferSource,
            type: 'public-key',
          })),
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        setFeedback({ type: 'error', message: 'Enregistrement biométrique annulé.' });
        setRegistering(false);
        return;
      }

      const attestation = credential.response as AuthenticatorAttestationResponse;
      const transports =
        typeof attestation.getTransports === 'function' ? attestation.getTransports() : [];

      const verifyRes = await fetch('/api/auth/passkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register-verify',
          clientDataJSON: bufferToBase64Url(attestation.clientDataJSON),
          attestationObject: bufferToBase64Url(attestation.attestationObject),
          deviceName: getFriendlyDeviceName(),
          transports,
        }),
      });

      const verifyData = (await verifyRes.json()) as {
        ok?: boolean;
        passkey?: PasskeyItem;
        error?: string;
      };

      if (!verifyRes.ok || !verifyData.ok) {
        setFeedback({
          type: 'error',
          message: verifyData.error || 'Échec de l’enregistrement biométrique.',
        });
        setRegistering(false);
        return;
      }

      setFeedback({
        type: 'ok',
        message: 'Empreinte enregistrée ! Vous pouvez maintenant vous connecter en 1 clic.',
      });
      await loadPasskeys();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setFeedback({
          type: 'error',
          message: 'Enregistrement annulé ou refusé par le navigateur.',
        });
      } else if (err instanceof DOMException && err.name === 'InvalidStateError') {
        setFeedback({
          type: 'error',
          message: 'Cet appareil possède déjà une empreinte enregistrée pour ce compte.',
        });
      } else {
        setFeedback({
          type: 'error',
          message: 'Enregistrement biométrique impossible sur ce navigateur.',
        });
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: string) => {
    setFeedback(null);
    setDeletingId(id);
    try {
      const res = await fetch('/api/auth/passkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      if (res.ok) {
        setPasskeys((prev) => prev.filter((item) => item.id !== id));
        setFeedback({ type: 'ok', message: 'Appareil biométrique supprimé.' });
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Surface className="p-6 space-y-4 border border-white/10 bg-[#1E1916]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Fingerprint className="h-4 w-4 text-[#D96B27]" />
          <span>Connexion biométrique (Empreinte / Passkey)</span>
        </div>

        {supported && (
          <button
            type="button"
            onClick={handleRegister}
            disabled={registering || migrationRequired}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#D96B27] to-[#B85316] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:from-[#E57732] hover:to-[#C95D1B] disabled:opacity-50 cursor-pointer transition-all"
          >
            {registering ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Activation...</span>
              </>
            ) : (
              <>
                <Fingerprint className="h-3.5 w-3.5" />
                <span>Enregistrer l&apos;empreinte de cet appareil</span>
              </>
            )}
          </button>
        )}
      </div>

      <p className="text-xs text-white/60 leading-relaxed">
        Activez la connexion par empreinte digitale, Face ID ou Windows Hello pour accéder rapidement
        à votre poste de pilotage BNA sans ressaisir votre mot de passe.
      </p>

      {!supported && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            Ce navigateur ou contexte ne prend pas en charge WebAuthn / Passkey (HTTPS requis hors localhost).
          </span>
        </div>
      )}

      {migrationRequired && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            Migration SQL requise : appliquez <code>supabase/migrations/20261118_user_passkeys.sql</code> sur Supabase pour activer le stockage des empreintes.
          </span>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl border p-3 text-xs flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200'
              : 'border-red-500/40 bg-red-950/40 text-red-200'
          }`}
        >
          {feedback.type === 'ok' ? (
            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {loadingList ? (
        <div className="flex items-center gap-2 text-xs text-white/50 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Chargement des appareils enregistrés...</span>
        </div>
      ) : passkeys.length > 0 ? (
        <div className="space-y-2 pt-1">
          {passkeys.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#120F0D] px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Smartphone className="h-4 w-4 text-[#D96B27] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{item.device_name}</p>
                  <p className="text-[11px] text-white/45">
                    Ajouté le {new Date(item.created_at).toLocaleDateString('fr-FR')}
                    {item.last_used_at
                      ? ` • Utilisé le ${new Date(item.last_used_at).toLocaleDateString('fr-FR')}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                className="p-1.5 rounded-lg text-white/45 hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer disabled:opacity-50"
                aria-label={`Supprimer ${item.device_name}`}
              >
                {deletingId === item.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-white/40">
          Aucun appareil biométrique enregistré pour ce compte.
        </p>
      )}
    </Surface>
  );
}
