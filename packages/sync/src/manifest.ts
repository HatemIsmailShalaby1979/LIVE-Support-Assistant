/**
 * Bundle manifest.
 *
 * The manifest is the authenticated description of a policy bundle. It is signed
 * as canonical JSON, so any change to any field invalidates the signature — which
 * is the point: the manifest carries the model identity, and a client that loaded
 * a different model build than the manifest names must refuse to serve search.
 */

import type { SopDocument } from '@sop/core';

import { canonicalJson } from './canonical.js';
import { encodeUtf8 } from './crypto.js';

/** Everything a client needs to authenticate and interpret a bundle. */
export interface BundleManifest {
  readonly tenantId: string;
  /** Monotonic and gap-free per tenant, enforced server-side by trigger. */
  readonly bundleVersion: number;
  readonly modelId: string;
  readonly modelRevision: string;
  readonly quantization: string;
  readonly dimensions: number;
  /** SHA-256, lowercase hex, over the ciphertext — not over the plaintext. */
  readonly payloadHash: string;
  /** Base64 AES-GCM initialisation vector. */
  readonly iv: string;
  readonly sopCount: number;
  readonly publishedAt: string;
}

/** A bundle as delivered to one specific device. */
export interface SignedBundle {
  readonly manifest: BundleManifest;
  /** Base64 Ed25519 signature over {@link manifestBytes}. */
  readonly signature: string;
  /** Base64 AES-256-GCM ciphertext of the JSON payload. */
  readonly payloadCiphertext: string;
  /** Base64 AES-KW wrapped content key, wrapped for *this* device. */
  readonly wrappedContentKey: string;
}

/** The plaintext payload inside the ciphertext. */
export interface BundlePayload {
  readonly sops: readonly SopDocument[];
}

/** The exact bytes a signature covers. */
export function manifestBytes(manifest: BundleManifest): Uint8Array {
  return encodeUtf8(canonicalJson(manifest));
}
