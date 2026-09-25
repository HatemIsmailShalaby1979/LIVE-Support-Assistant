/**
 * Key rotation and device revocation.
 *
 * What Phase 3 left open: removing a device from the roster stopped future
 * wrapping but did not re-key the tenant, so a removed device kept reading every
 * bundle it already held, forever.
 *
 * The fix has two halves, and both are needed:
 *
 *   1. A fresh content key per publish (already true of `publishBundle`) — a
 *      removed device simply receives no wrapped key for any new bundle, so
 *      `bundleForDevice` refuses it. Going forward it is blind.
 *   2. A fresh tenant *wrapping* keypair — because the removed device still
 *      knows the ECDH shared secret of the old one, every bundle that remains
 *      wrapped under it is readable to it. Re-keying the tenant wrapping pair
 *      and distributing the new public key to active devices only, cuts that
 *      thread for everything published after the rotation.
 *
 * What rotation cannot do, stated plainly: it does not reach backwards in time.
 * A removed device keeps every bundle it downloaded before the rotation. That
 * content becomes stale and, once a newer version is required for serving, it
 * becomes useless — but if a leaked corpus itself must be invalidated, that is
 * a content decision, not a key decision, and it belongs to the tenant.
 */

import type { SopDocument } from '@sop/core';

import { exportPublicKey, generateWrappingKeyPair } from './crypto.js';
import { publishBundle, type EnrolledDevice, type ModelIdentity, type PublishedBundle } from './server.js';

export interface RotateParams {
  readonly tenantId: string;
  /** Exactly one greater than the tenant's current maximum, as for any publish. */
  readonly bundleVersion: number;
  readonly sops: readonly SopDocument[];
  readonly model: ModelIdentity;
  readonly kekSalt: Uint8Array;
  /**
   * The devices that keep access after this rotation. Every device not in this
   * list is revoked: it receives no wrapped key and the new wrapping public key
   * is not distributed to it.
   */
  readonly activeDevices: readonly EnrolledDevice[];
  readonly signingPrivateKey: CryptoKey;
  readonly publishedAt?: string;
}

export interface RotatedKeys {
  /** The rotation bundle: fresh CEK, wrapped only for the active devices. */
  readonly published: PublishedBundle;
  /** The new tenant wrapping keypair. The private key stays with the server. */
  readonly newWrappingKeyPair: CryptoKeyPair;
  /** Base64 raw public key, distributed to active devices only. */
  readonly newWrappingPublicKey: string;
}

/**
 * Rotate the tenant's wrapping keypair and publish the first bundle under it.
 *
 * The signing keypair is deliberately NOT rotated here. Manifest signatures are
 * verified against a public key the device already holds, so rotating signing is
 * a distribution problem with no crypto content; pass the new signing private
 * key to a subsequent `publishBundle` once every active device holds the new
 * public key.
 */
export async function rotateTenantKeys(params: RotateParams): Promise<RotatedKeys> {
  const wrappingKeyPair = await generateWrappingKeyPair();

  // exactOptionalPropertyTypes: the key must be absent, not present-undefined.
  const published = await publishBundle({
    tenantId: params.tenantId,
    bundleVersion: params.bundleVersion,
    sops: params.sops,
    model: params.model,
    signingPrivateKey: params.signingPrivateKey,
    wrappingPrivateKey: wrappingKeyPair.privateKey,
    kekSalt: params.kekSalt,
    devices: params.activeDevices,
    ...(params.publishedAt === undefined ? {} : { publishedAt: params.publishedAt }),
  });

  return {
    published,
    newWrappingKeyPair: wrappingKeyPair,
    newWrappingPublicKey: await exportPublicKey(wrappingKeyPair.publicKey),
  };
}
