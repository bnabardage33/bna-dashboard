import crypto from 'node:crypto';

export interface ChallengePayload {
  challenge: string;
  userId?: string;
  purpose: 'register' | 'login';
  rpId: string;
  origins: string[];
  exp: number;
}

export interface ParsedAuthData {
  rpIdHash: Buffer;
  flags: number;
  userPresent: boolean;
  userVerified: boolean;
  signCount: number;
  credentialId?: Buffer;
  coseKey?: Record<number, unknown>;
}

export function toBase64Url(input: Uint8Array | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

export function getChallengeSecret(): string {
  return (
    process.env.WEBAUTHN_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'bna-dev-passkey-secret'
  );
}

export function signChallengeCookie(payload: ChallengePayload, secret: string): string {
  const data = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = toBase64Url(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyChallengeCookie(token: string, secret: string): ChallengePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  if (!data || !sig) return null;

  const expectedSig = toBase64Url(crypto.createHmac('sha256', secret).update(data).digest());
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(data).toString('utf8')) as ChallengePayload;
    if (!parsed || typeof parsed.challenge !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function deriveRpIdAndOrigins(
  hostHeader: string | null,
  originHeader: string | null,
  forwardedProto: string | null
): { rpId: string; origins: string[] } {
  const rawHost = (hostHeader || 'localhost:3000').split(',')[0].trim();
  const hostname = rawHost.replace(/:\d+$/, '').toLowerCase();
  const rpId = hostname || 'localhost';

  const origins = new Set<string>();
  if (originHeader) {
    origins.add(originHeader.trim());
  }
  const proto = (forwardedProto || (hostname === 'localhost' || hostname === '127.0.0.1' ? 'http' : 'https'))
    .split(',')[0]
    .trim();
  origins.add(`${proto}://${rawHost}`);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    origins.add(`https://${rawHost}`);
  }

  return { rpId, origins: Array.from(origins) };
}

function readCborLength(buf: Uint8Array, offset: number, additionalInfo: number): { length: number; nextOffset: number } {
  if (additionalInfo < 24) {
    return { length: additionalInfo, nextOffset: offset };
  }
  if (additionalInfo === 24) {
    return { length: buf[offset], nextOffset: offset + 1 };
  }
  if (additionalInfo === 25) {
    return { length: (buf[offset] << 8) | buf[offset + 1], nextOffset: offset + 2 };
  }
  if (additionalInfo === 26) {
    const val =
      ((buf[offset] << 24) >>> 0) +
      (buf[offset + 1] << 16) +
      (buf[offset + 2] << 8) +
      buf[offset + 3];
    return { length: val, nextOffset: offset + 4 };
  }
  throw new Error(`CBOR additionalInfo non supporté: ${additionalInfo}`);
}

export function decodeCbor(buf: Uint8Array, offset = 0): { value: unknown; nextOffset: number } {
  if (offset >= buf.length) {
    throw new Error('CBOR incomplet');
  }
  const initial = buf[offset];
  const majorType = initial >> 5;
  const additionalInfo = initial & 0x1f;
  let pos = offset + 1;

  if (majorType === 0) {
    const { length, nextOffset } = readCborLength(buf, pos, additionalInfo);
    return { value: length, nextOffset };
  }

  if (majorType === 1) {
    const { length, nextOffset } = readCborLength(buf, pos, additionalInfo);
    return { value: -1 - length, nextOffset };
  }

  if (majorType === 2) {
    const { length, nextOffset } = readCborLength(buf, pos, additionalInfo);
    const bytes = Buffer.from(buf.slice(nextOffset, nextOffset + length));
    return { value: bytes, nextOffset: nextOffset + length };
  }

  if (majorType === 3) {
    const { length, nextOffset } = readCborLength(buf, pos, additionalInfo);
    const text = Buffer.from(buf.slice(nextOffset, nextOffset + length)).toString('utf8');
    return { value: text, nextOffset: nextOffset + length };
  }

  if (majorType === 4) {
    const { length, nextOffset } = readCborLength(buf, pos, additionalInfo);
    pos = nextOffset;
    const arr: unknown[] = [];
    for (let i = 0; i < length; i++) {
      const item = decodeCbor(buf, pos);
      arr.push(item.value);
      pos = item.nextOffset;
    }
    return { value: arr, nextOffset: pos };
  }

  if (majorType === 5) {
    const { length, nextOffset } = readCborLength(buf, pos, additionalInfo);
    pos = nextOffset;
    const obj: Record<string | number, unknown> = {};
    for (let i = 0; i < length; i++) {
      const keyRes = decodeCbor(buf, pos);
      const valRes = decodeCbor(buf, keyRes.nextOffset);
      const key = typeof keyRes.value === 'number' || typeof keyRes.value === 'string'
        ? keyRes.value
        : String(keyRes.value);
      obj[key] = valRes.value;
      pos = valRes.nextOffset;
    }
    return { value: obj, nextOffset: pos };
  }

  if (majorType === 7) {
    if (additionalInfo === 20) return { value: false, nextOffset: pos };
    if (additionalInfo === 21) return { value: true, nextOffset: pos };
    if (additionalInfo === 22) return { value: null, nextOffset: pos };
    if (additionalInfo === 23) return { value: undefined, nextOffset: pos };
  }

  throw new Error(`Type CBOR non supporté: ${majorType}/${additionalInfo}`);
}

function encodeAsn1Length(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len <= 0xff) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function wrapAsn1(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeAsn1Length(content.length), content]);
}

function encodeAsn1Integer(bytes: Buffer): Buffer {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start++;
  }
  let trimmed = bytes.subarray(start);
  if (trimmed[0] & 0x80) {
    trimmed = Buffer.concat([Buffer.from([0x00]), trimmed]);
  }
  return wrapAsn1(0x02, trimmed);
}

export function coseKeyToSpkiBase64(coseKey: Record<number, unknown>): { spkiBase64: string; algorithm: number } {
  const kty = Number(coseKey[1]);
  const alg = Number(coseKey[3] ?? (kty === 2 ? -7 : -257));

  // EC2 (P-256 / ES256)
  if (kty === 2) {
    const crv = Number(coseKey[-1]);
    const x = coseKey[-2];
    const y = coseKey[-3];
    if (crv !== 1 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) {
      throw new Error('Clé EC2 non supportée (seule P-256 est acceptée)');
    }
    // SPKI prefix for id-ecPublicKey + prime256v1 (P-256)
    const spkiPrefix = Buffer.from(
      '3059301306072a8648ce3d020106082a8648ce3d03010703420004',
      'hex'
    );
    const spkiDer = Buffer.concat([spkiPrefix, x, y]);
    // Validation via Node crypto
    crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
    return { spkiBase64: spkiDer.toString('base64'), algorithm: alg };
  }

  // RSA (RS256)
  if (kty === 3) {
    const n = coseKey[-1];
    const e = coseKey[-2];
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e)) {
      throw new Error('Clé RSA invalide');
    }
    const rsaPubKey = wrapAsn1(0x30, Buffer.concat([encodeAsn1Integer(n), encodeAsn1Integer(e)]));
    // AlgorithmIdentifier: rsaEncryption (1.2.840.113549.1.1.1) + NULL
    const algId = Buffer.from('300d06092a864886f70d0101010500', 'hex');
    const bitString = wrapAsn1(0x03, Buffer.concat([Buffer.from([0x00]), rsaPubKey]));
    const spkiDer = wrapAsn1(0x30, Buffer.concat([algId, bitString]));
    crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
    return { spkiBase64: spkiDer.toString('base64'), algorithm: alg };
  }

  throw new Error(`Type de clé COSE non supporté: kty=${kty}`);
}

export function parseAuthenticatorData(authData: Buffer): ParsedAuthData {
  if (authData.length < 37) {
    throw new Error('authenticatorData trop court');
  }
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const hasAttestedCredential = (flags & 0x40) !== 0;
  const signCount = authData.readUInt32BE(33);

  const result: ParsedAuthData = {
    rpIdHash,
    flags,
    userPresent,
    userVerified,
    signCount,
  };

  if (hasAttestedCredential) {
    if (authData.length < 55) {
      throw new Error('attestedCredentialData incomplet');
    }
    // 37..53 = AAGUID (16 bytes), 53..55 = credentialIdLength (uint16BE)
    const credIdLen = authData.readUInt16BE(53);
    const credStart = 55;
    const credEnd = credStart + credIdLen;
    if (authData.length < credEnd) {
      throw new Error('credentialId tronqué');
    }
    result.credentialId = authData.subarray(credStart, credEnd);
    const coseDecoded = decodeCbor(authData, credEnd);
    result.coseKey = coseDecoded.value as Record<number, unknown>;
  }

  return result;
}

export function extractAttestedCredential(attestationObjectBase64Url: string): {
  parsedAuthData: ParsedAuthData;
  credentialIdBase64Url: string;
  spkiBase64: string;
  algorithm: number;
} {
  const attBuf = fromBase64Url(attestationObjectBase64Url);
  const decoded = decodeCbor(attBuf).value as Record<string, unknown>;
  const authData = decoded?.authData;
  if (!Buffer.isBuffer(authData)) {
    throw new Error('authData manquant dans attestationObject');
  }

  const parsedAuthData = parseAuthenticatorData(authData);
  if (!parsedAuthData.credentialId || !parsedAuthData.coseKey) {
    throw new Error('Clé publique absente de attestationObject');
  }

  const { spkiBase64, algorithm } = coseKeyToSpkiBase64(parsedAuthData.coseKey);
  return {
    parsedAuthData,
    credentialIdBase64Url: toBase64Url(parsedAuthData.credentialId),
    spkiBase64,
    algorithm,
  };
}

export function verifyClientDataJson(
  clientDataJsonBase64Url: string,
  expectedType: 'webauthn.create' | 'webauthn.get',
  expectedChallenge: string,
  expectedOrigins: string[]
): { ok: true; clientDataBuf: Buffer } | { ok: false; error: string } {
  try {
    const clientDataBuf = fromBase64Url(clientDataJsonBase64Url);
    const parsed = JSON.parse(clientDataBuf.toString('utf8')) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };

    if (parsed.type !== expectedType) {
      return { ok: false, error: `Type WebAuthn invalide: ${parsed.type}` };
    }
    if (parsed.challenge !== expectedChallenge) {
      return { ok: false, error: 'Challenge WebAuthn invalide ou expiré' };
    }
    if (!parsed.origin || !expectedOrigins.includes(parsed.origin)) {
      return { ok: false, error: `Origine non autorisée: ${parsed.origin}` };
    }
    return { ok: true, clientDataBuf };
  } catch {
    return { ok: false, error: 'clientDataJSON illisible' };
  }
}

export function verifyRpIdHash(rpIdHash: Buffer, rpId: string): boolean {
  const expected = crypto.createHash('sha256').update(rpId, 'utf8').digest();
  return rpIdHash.length === expected.length && crypto.timingSafeEqual(rpIdHash, expected);
}

export function verifyAssertionSignature(params: {
  publicKeySpkiBase64: string;
  authenticatorData: Buffer;
  clientDataJson: Buffer;
  signature: Buffer;
}): boolean {
  const clientDataHash = crypto.createHash('sha256').update(params.clientDataJson).digest();
  const signedData = Buffer.concat([params.authenticatorData, clientDataHash]);
  const key = crypto.createPublicKey({
    key: Buffer.from(params.publicKeySpkiBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  return crypto.verify('sha256', signedData, key, params.signature);
}
