import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  coseKeyToSpkiBase64,
  decodeCbor,
  fromBase64Url,
  parseAuthenticatorData,
  signChallengeCookie,
  toBase64Url,
  verifyAssertionSignature,
  verifyChallengeCookie,
  verifyClientDataJson,
  verifyRpIdHash,
} from '@/lib/webauthnPasskey';

describe('webauthnPasskey', () => {
  it('roundtrips base64url encoding', () => {
    const raw = Buffer.from([0x00, 0xff, 0x3e, 0x3f, 0xab, 0xcd]);
    const encoded = toBase64Url(raw);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    expect(fromBase64Url(encoded)).toEqual(raw);
  });

  it('signs and verifies challenge cookie, rejecting tampered or expired tokens', () => {
    const secret = 'test-secret-key';
    const payload = {
      challenge: 'abc123',
      purpose: 'login' as const,
      rpId: 'localhost',
      origins: ['http://localhost:3000'],
      exp: Date.now() + 60_000,
    };
    const token = signChallengeCookie(payload, secret);
    expect(verifyChallengeCookie(token, secret)).toEqual(payload);
    expect(verifyChallengeCookie(token, 'wrong-secret')).toBeNull();
    expect(verifyChallengeCookie(`${token}x`, secret)).toBeNull();

    const expired = signChallengeCookie({ ...payload, exp: Date.now() - 1000 }, secret);
    expect(verifyChallengeCookie(expired, secret)).toBeNull();
  });

  it('decodes CBOR map and verifies EC2 P-256 COSE key -> SPKI + assertion signature', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const xBuf = fromBase64Url(jwk.x);
    const yBuf = fromBase64Url(jwk.y);

    const { spkiBase64, algorithm } = coseKeyToSpkiBase64({
      1: 2, // EC2
      3: -7, // ES256
      [-1]: 1, // P-256
      [-2]: xBuf,
      [-3]: yBuf,
    });
    expect(algorithm).toBe(-7);

    const rpId = 'bna.example.com';
    const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
    const flags = Buffer.from([0x05]); // UP | UV
    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(42, 0);
    const authData = Buffer.concat([rpIdHash, flags, signCount]);

    const parsed = parseAuthenticatorData(authData);
    expect(parsed.userPresent).toBe(true);
    expect(parsed.userVerified).toBe(true);
    expect(parsed.signCount).toBe(42);
    expect(verifyRpIdHash(parsed.rpIdHash, rpId)).toBe(true);

    const challenge = 'random-challenge-123';
    const clientDataObj = {
      type: 'webauthn.get',
      challenge,
      origin: 'https://bna.example.com',
    };
    const clientDataB64Url = toBase64Url(Buffer.from(JSON.stringify(clientDataObj), 'utf8'));
    const clientCheck = verifyClientDataJson(
      clientDataB64Url,
      'webauthn.get',
      challenge,
      ['https://bna.example.com']
    );
    expect(clientCheck.ok).toBe(true);
    if (!clientCheck.ok) return;

    const clientDataHash = crypto.createHash('sha256').update(clientCheck.clientDataBuf).digest();
    const signedData = Buffer.concat([authData, clientDataHash]);
    const signature = crypto.sign('sha256', signedData, privateKey);

    expect(
      verifyAssertionSignature({
        publicKeySpkiBase64: spkiBase64,
        authenticatorData: authData,
        clientDataJson: clientCheck.clientDataBuf,
        signature,
      })
    ).toBe(true);
  });

  it('decodes minimal CBOR structures', () => {
    // CBOR map { "fmt": "none" } -> A1 63 66 6D 74 64 6E 6F 6E 65
    const bytes = Buffer.from('a163666d74646e6f6e65', 'hex');
    const decoded = decodeCbor(bytes);
    expect(decoded.value).toEqual({ fmt: 'none' });
  });
});
