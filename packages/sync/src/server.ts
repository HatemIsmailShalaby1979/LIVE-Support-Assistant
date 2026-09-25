/**
 * The server half of the sync protocol.
 *
 * Lives in this package beside the client half on purpose. The two sides must
 * agree on canonical serialisation, on the KEK derivation and on what the
 * signature covers; keeping them in one package with one set of helpers means
 * they cannot drift apart. The Supabase Edge Function imports from here rather
 * than reimplementing any of it.
 *
 * The server's property that makes this worth building: it assembles a bundle
 * without ever holding the plaintext in a durable store, and each device receives
 * a content key wrapped to that device alone. Compromising the transport does not
 * expose the corpus, and revoking one device does not require re-keying the rest.
 */

import type { SopDocument } from '@sop/core';

import {
  KEK_INFO,
  deriveKek,
  encryptPayload,
  encodeUtf8,
  fromBase64,
  generateContentKey,
  sha256Hex,
  signBytes,
  wrapContentKey,
} from './crypto.js';
import { manifestBytes, type BundleManifest, type SignedBundle } from './manifest.js';

/** Model identity recorded in every manifest. */
export interface ModelIdentity {
  readonly id: string;
  readonly revision: string;
  readonly quantization: string;
  readonly dimensions: number;
}

/** An enrolled device that will receive this bundle. */
export interface EnrolledDevice {
  readonly deviceId: string;
  readonly publicKey: CryptoKey;
}

export interface PublishParams {
  readonly tenantId: string;
  /** Must be exactly one greater than the tenant's current maximum. */
  readonly bundleVersion: number;
  readonly sops: readonly SopDocument[];
  readonly model: ModelIdentity;
  readonly signingPrivateKey: CryptoKey;
  readonly wrappingPrivateKey: CryptoKey;
  readonly kekSalt: Uint8Array;
  readonly devices: readonly EnrolledDevice[];
  readonly publishedAt?: string;
}

/** A published bundle: one ciphertext, one signature, one wrapped key per device. */
export interface PublishedBundle {
  readonly manifest: BundleManifest;
  readonly signature: string;
  readonly payloadCiphertext: string;
  /** deviceId to base64 AES-KW wrapped content key. */
  readonly wrappedKeys: ReadonlyMap<string, string>;
}

/**
 * Encrypt, sign and wrap a policy bundle.
 *
 * @param params Tenant, corpus, model identity and keys.
 * @returns The published bundle, ready to hand to {@link bundleForDevice}.
 */
export async function publishBundle(
  params: PublishParams,
): Promise<PublishedBundle> {
  const contentKey = await generateContentKey();

  const payload = encodeUtf8(
    JSON.stringify({ sops: params.sops } satisfies { sops: readonly SopDocument[] }),
  );

  const { iv, ciphertext } = await encryptPayload(contentKey, payload);

  // The hash covers the ciphertext, not the plaintext: a client must be able to
  // check integrity before it holds a key to decrypt with.
  const payloadHash = await sha256Hex(fromBase64(ciphertext));

  const manifest: BundleManifest = {
    tenantId: params.tenantId,
    bundleVersion: params.bundleVersion,
    modelId: params.model.id,
    modelRevision: params.model.revision,
    quantization: params.model.quantization,
    dimensions: params.model.dimensions,
    payloadHash,
    iv,
    sopCount: params.sops.length,
    publishedAt: params.publishedAt ?? new Date().toISOString(),
  };

  const signature = await signBytes(
    params.signingPrivateKey,
    manifestBytes(manifest),
  );

  const wrappedKeys = new Map<string, string>();

  for (const device of params.devices) {
    const kek = await deriveKek(
      params.wrappingPrivateKey,
      device.publicKey,
      params.kekSalt,
      KEK_INFO,
    );

    wrappedKeys.set(device.deviceId, await wrapContentKey(kek, contentKey));
  }

  return { manifest, signature, payloadCiphertext: ciphertext, wrappedKeys };
}

/**
 * Assemble the per-device view of a published bundle.
 *
 * @throws If the device has no wrapped key, which means it was not enrolled when
 * the bundle was published. It will receive the next one.
 */
export function bundleForDevice(
  published: PublishedBundle,
  deviceId: string,
): SignedBundle {
  const wrappedContentKey = published.wrappedKeys.get(deviceId);

  if (wrappedContentKey === undefined) {
    throw new Error(`device ${deviceId} has no wrapped key in this bundle`);
  }

  return {
    manifest: published.manifest,
    signature: published.signature,
    payloadCiphertext: published.payloadCiphertext,
    wrappedContentKey,
  };
}
