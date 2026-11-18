import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  deriveRpIdAndOrigins,
  extractAttestedCredential,
  fromBase64Url,
  getChallengeSecret,
  parseAuthenticatorData,
  signChallengeCookie,
  toBase64Url,
  verifyAssertionSignature,
  verifyChallengeCookie,
  verifyClientDataJson,
  verifyRpIdHash,
} from '@/lib/webauthnPasskey';

const CHALLENGE_COOKIE = 'bna_passkey_challenge';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    Boolean(error.message?.includes('user_passkeys'))
  );
}

function setChallengeCookie(res: NextResponse, token: string) {
  res.cookies.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/passkey',
    maxAge: 300,
  });
}

function clearChallengeCookie(res: NextResponse) {
  res.cookies.set(CHALLENGE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/passkey',
    maxAge: 0,
  });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Session requise' }, { status: 401 });
  }

  const action = request.nextUrl.searchParams.get('action') || 'register-options';

  if (action === 'list') {
    const { data, error } = await supabaseAdmin
      .from('user_passkeys')
      .select('id, device_name, created_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ passkeys: [], migrationRequired: true });
      }
      return NextResponse.json({ error: 'Erreur lecture passkeys' }, { status: 500 });
    }

    return NextResponse.json({ passkeys: data ?? [] });
  }

  // register-options
  const { rpId, origins } = deriveRpIdAndOrigins(
    request.headers.get('host'),
    request.headers.get('origin'),
    request.headers.get('x-forwarded-proto')
  );

  const challenge = toBase64Url(crypto.randomBytes(32));
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('user_passkeys')
    .select('credential_id')
    .eq('user_id', user.id);

  if (existingErr && isMissingTableError(existingErr)) {
    return NextResponse.json(
      { error: 'Table user_passkeys absente. Appliquez la migration SQL Supabase.' },
      { status: 503 }
    );
  }

  const excludeCredentials = (existing ?? []).map((row) => ({
    id: row.credential_id,
    type: 'public-key' as const,
  }));

  const token = signChallengeCookie(
    {
      challenge,
      userId: user.id,
      purpose: 'register',
      rpId,
      origins,
      exp: Date.now() + CHALLENGE_TTL_MS,
    },
    getChallengeSecret()
  );

  const displayName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) ||
    user.email ||
    'Utilisateur BNA';

  const res = NextResponse.json({
    challenge,
    rp: {
      name: 'BNA • Bâtiment Nouvelle Aquitaine',
      id: rpId,
    },
    user: {
      id: toBase64Url(Buffer.from(user.id, 'utf8')),
      name: user.email || user.id,
      displayName,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      requireResidentKey: false,
      userVerification: 'required',
    },
    excludeCredentials,
  });

  setChallengeCookie(res, token);
  return res;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : '';

  if (action === 'register-verify') {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Session requise' }, { status: 401 });
    }

    const cookieVal = request.cookies.get(CHALLENGE_COOKIE)?.value;
    const challengeData = cookieVal ? verifyChallengeCookie(cookieVal, getChallengeSecret()) : null;
    if (!challengeData || challengeData.purpose !== 'register' || challengeData.userId !== user.id) {
      return NextResponse.json({ error: 'Session biométrique expirée, réessayez.' }, { status: 400 });
    }

    const clientDataJSON = typeof body.clientDataJSON === 'string' ? body.clientDataJSON : '';
    const attestationObject = typeof body.attestationObject === 'string' ? body.attestationObject : '';
    const deviceName =
      typeof body.deviceName === 'string' && body.deviceName.trim()
        ? body.deviceName.trim().slice(0, 80)
        : 'Appareil biométrique';
    const transports = Array.isArray(body.transports)
      ? body.transports.filter((t): t is string => typeof t === 'string')
      : [];

    if (!clientDataJSON || !attestationObject) {
      return NextResponse.json({ error: 'Données WebAuthn incomplètes' }, { status: 400 });
    }

    const clientCheck = verifyClientDataJson(
      clientDataJSON,
      'webauthn.create',
      challengeData.challenge,
      challengeData.origins
    );
    if (!clientCheck.ok) {
      return NextResponse.json({ error: clientCheck.error }, { status: 400 });
    }

    try {
      const attested = extractAttestedCredential(attestationObject);
      if (!verifyRpIdHash(attested.parsedAuthData.rpIdHash, challengeData.rpId)) {
        return NextResponse.json({ error: 'rpIdHash invalide' }, { status: 400 });
      }
      if (!attested.parsedAuthData.userPresent) {
        return NextResponse.json({ error: 'Présence utilisateur non confirmée' }, { status: 400 });
      }

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('user_passkeys')
        .insert({
          user_id: user.id,
          credential_id: attested.credentialIdBase64Url,
          public_key_spki: attested.spkiBase64,
          algorithm: attested.algorithm,
          counter: attested.parsedAuthData.signCount,
          device_name: deviceName,
          transports,
        })
        .select('id, device_name, created_at, last_used_at')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          return NextResponse.json({ error: 'Cet appareil est déjà enregistré.' }, { status: 409 });
        }
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      const res = NextResponse.json({ ok: true, passkey: inserted });
      clearChallengeCookie(res);
      return res;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Erreur vérification attestation' },
        { status: 400 }
      );
    }
  }

  if (action === 'delete') {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Session requise' }, { status: 401 });
    }

    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) {
      return NextResponse.json({ error: 'Identifiant manquant' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('user_passkeys')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === 'login-options') {
    const { rpId, origins } = deriveRpIdAndOrigins(
      request.headers.get('host'),
      request.headers.get('origin'),
      request.headers.get('x-forwarded-proto')
    );

    const challenge = toBase64Url(crypto.randomBytes(32));
    const token = signChallengeCookie(
      {
        challenge,
        purpose: 'login',
        rpId,
        origins,
        exp: Date.now() + CHALLENGE_TTL_MS,
      },
      getChallengeSecret()
    );

    const res = NextResponse.json({
      challenge,
      rpId,
      timeout: 60000,
      userVerification: 'required',
    });
    setChallengeCookie(res, token);
    return res;
  }

  if (action === 'login-verify') {
    const cookieVal = request.cookies.get(CHALLENGE_COOKIE)?.value;
    const challengeData = cookieVal ? verifyChallengeCookie(cookieVal, getChallengeSecret()) : null;
    if (!challengeData || challengeData.purpose !== 'login') {
      return NextResponse.json({ error: 'Défi biométrique expiré, veuillez réessayer.' }, { status: 400 });
    }

    const credentialId = typeof body.credentialId === 'string' ? body.credentialId : '';
    const clientDataJSON = typeof body.clientDataJSON === 'string' ? body.clientDataJSON : '';
    const authenticatorData = typeof body.authenticatorData === 'string' ? body.authenticatorData : '';
    const signature = typeof body.signature === 'string' ? body.signature : '';

    if (!credentialId || !clientDataJSON || !authenticatorData || !signature) {
      return NextResponse.json({ error: 'Réponse biométrique incomplète' }, { status: 400 });
    }

    const { data: passkey, error: lookupError } = await supabaseAdmin
      .from('user_passkeys')
      .select('id, user_id, public_key_spki, counter')
      .eq('credential_id', credentialId)
      .maybeSingle();

    if (lookupError) {
      if (isMissingTableError(lookupError)) {
        return NextResponse.json(
          { error: 'Connexion biométrique non configurée sur la base.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: 'Erreur serveur lors de la vérification' }, { status: 500 });
    }

    if (!passkey) {
      return NextResponse.json(
        { error: 'Empreinte non reconnue. Connectez-vous par mot de passe puis enregistrez cet appareil dans Paramètres.' },
        { status: 401 }
      );
    }

    const clientCheck = verifyClientDataJson(
      clientDataJSON,
      'webauthn.get',
      challengeData.challenge,
      challengeData.origins
    );
    if (!clientCheck.ok) {
      return NextResponse.json({ error: clientCheck.error }, { status: 400 });
    }

    try {
      const authDataBuf = fromBase64Url(authenticatorData);
      const parsedAuth = parseAuthenticatorData(authDataBuf);

      if (!verifyRpIdHash(parsedAuth.rpIdHash, challengeData.rpId)) {
        return NextResponse.json({ error: 'Domaine rpId invalide' }, { status: 400 });
      }
      if (!parsedAuth.userPresent) {
        return NextResponse.json({ error: 'Présence utilisateur non confirmée' }, { status: 400 });
      }

      const signatureOk = verifyAssertionSignature({
        publicKeySpkiBase64: passkey.public_key_spki,
        authenticatorData: authDataBuf,
        clientDataJson: clientCheck.clientDataBuf,
        signature: fromBase64Url(signature),
      });

      if (!signatureOk) {
        return NextResponse.json({ error: 'Signature biométrique invalide' }, { status: 401 });
      }

      if (passkey.counter > 0 && parsedAuth.signCount > 0 && parsedAuth.signCount <= passkey.counter) {
        return NextResponse.json({ error: 'Compteur WebAuthn incohérent' }, { status: 401 });
      }

      await supabaseAdmin
        .from('user_passkeys')
        .update({
          counter: parsedAuth.signCount,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', passkey.id);

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(passkey.user_id);
      if (userErr || !userRes?.user?.email) {
        return NextResponse.json({ error: 'Compte utilisateur introuvable' }, { status: 404 });
      }

      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: userRes.user.email,
      });

      const tokenHash = linkData?.properties?.hashed_token;
      if (linkErr || !tokenHash) {
        return NextResponse.json(
          { error: 'Impossible de générer la session Supabase' },
          { status: 500 }
        );
      }

      const res = NextResponse.json({
        ok: true,
        tokenHash,
        email: userRes.user.email,
      });
      clearChallengeCookie(res);
      return res;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Erreur vérification signature' },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: 'Action non supportée' }, { status: 400 });
}
