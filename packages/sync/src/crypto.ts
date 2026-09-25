/**
 * Cryptographic primitives for the encrypted sync engine.
 *
 * Everything here runs on WebCrypto, so the same code path executes in a browser,
 * in the Tauri webview and under Node. The capability probe run before this
 * module was written confirmed that this runtime supports Ed25519, X25519,
 * AES-KW (RFC 3394), AES-256-GCM and HKDF.
 *
 * Key hierarchy:
 *
 *   tenant signing keypair      Ed25519, signs bundle manifests
 *   tenant wrapping keypair     X25519, one half of every device KEK
 *   device wrapping keypair     X25519, generated on the device at enrolment
 *   KEK                         HKDF(ECDH(device private, server public))
 *   content key (CEK)           AES-256-GCM, encrypts the bundle payload
 *   wrapped CEK                 AES-KW(KEK, CEK), one per enrolled device
 *
 * Note the correction against design §3: RFC 3394 wraps a key under a *symmetric*
 * key, so it cannot wrap "for a device's public key" as that section originally
 * said. The asymmetric step is ECDH, and AES-KW is applied to the derived KEK —
 * which is what the design intended and what is implemented here.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * HKDF info string for the device key-encryption key.
 *
 * Shared by both sides of the protocol and fixed, so a KEK derived for one
 * purpose can never collide with one derived for another.
 */
export const KEK_INFO = 'sop-bundle-kek-v1';

/** Base64 without Buffer, so the module works in browsers too. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/** Inverse of {@link toBase64}. */
export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/** SHA-256 as lowercase hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Generate the tenant's manifest-signing keypair. */
export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
}

/** Generate an X25519 keypair — the tenant's, or a device's. */
export async function generateWrappingKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
}

/** Export an X25519 public key as base64 for the device registry. */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);

  return toBase64(new Uint8Array(raw));
}

/** Import a base64 X25519 public key from the device registry. */
export async function importWrappingPublicKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    fromBase64(base64) as BufferSource,
    { name: 'X25519' },
    true,
    [],
  );
}

/** Sign a UTF-8 payload with the tenant signing key. */
export async function signBytes(
  privateKey: CryptoKey,
  payload: Uint8Array,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    payload as BufferSource,
  );

  return toBase64(new Uint8Array(signature));
}

/**
 * Verify a signature over a UTF-8 payload.
 *
 * @returns False rather than throwing: a bad signature is an expected input, not
 * an exceptional condition, and callers must treat it as a rejection.
 */
export async function verifyBytes(
  publicKey: CryptoKey,
  signatureBase64: string,
  payload: Uint8Array,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      fromBase64(signatureBase64) as BufferSource,
      payload as BufferSource,
    );
  } catch {
    return false;
  }
}

/**
 * Derive a device's key-encryption key.
 *
 * Both sides compute the same value: the server from its private key and the
 * device's public key, the device from its private key and the server's public
 * key. The salt and info are fixed per tenant so a KEK cannot be reused across
 * tenants or purposes.
 */
export async function deriveKek(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  salt: Uint8Array,
  info: string,
): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits(
    { name: 'X25519', public: peerPublicKey },
    privateKey,
    256,
  );

  const hkdfKey = await crypto.subtle.importKey('raw', shared, 'HKDF', false, [
    'deriveBits',
  ]);

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: encoder.encode(info),
    },
    hkdfKey,
    256,
  );

  return crypto.subtle.importKey('raw', bits, { name: 'AES-KW' }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

/** Wrap a content key under a device KEK, per RFC 3394. */
export async function wrapContentKey(
  kek: CryptoKey,
  contentKey: CryptoKey,
): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey('raw', contentKey, kek, 'AES-KW');

  return toBase64(new Uint8Array(wrapped));
}

/**
 * Unwrap a content key.
 *
 * @returns Null when the KEK is wrong or the wrapped bytes are damaged, which is
 * what a device that was never enrolled will see.
 */
export async function unwrapContentKey(
  kek: CryptoKey,
  wrappedBase64: string,
): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      fromBase64(wrappedBase64) as BufferSource,
      kek,
      'AES-KW',
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
  } catch {
    return null;
  }
}

/** Generate a fresh AES-256-GCM content key. */
export async function generateContentKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/** Encrypt a bundle payload. A fresh 96-bit IV is generated per bundle. */
export async function encryptPayload(
  contentKey: CryptoKey,
  plaintext: Uint8Array,
): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    contentKey,
    plaintext as BufferSource,
  );

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt a bundle payload.
 *
 * @returns Null when the authentication tag fails — a damaged payload, a wrong
 * key, or a tampered ciphertext. The caller must treat null as a rejection and
 * leave the previously installed bundle in place.
 */
export async function decryptPayload(
  contentKey: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string,
): Promise<Uint8Array | null> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivBase64) as BufferSource },
      contentKey,
      fromBase64(ciphertextBase64) as BufferSource,
    );

    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}

/** UTF-8 decode helper, exported so callers do not each build an encoder. */
export function decodeUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** UTF-8 encode helper. */
export function encodeUtf8(value: string): Uint8Array {
  return encoder.encode(value);
}
