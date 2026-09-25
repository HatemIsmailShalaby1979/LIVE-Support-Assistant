/**
 * The client install pipeline.
 *
 * Every check runs before anything is committed, and the commit is the only
 * mutation. That ordering is the whole design: a bundle that fails any check
 * leaves the previously installed bundle active, so a client can never end up
 * serving nothing because a bad payload arrived.
 *
 * The checks are ordered deliberately. The signature is verified first, because
 * nothing from an unauthenticated source should be parsed or acted upon. The
 * version check comes next, so a replayed old bundle is rejected before its
 * payload is even hashed.
 */

import type { SopDocument } from '@sop/core';

import {
  KEK_INFO,
  decodeUtf8,
  deriveKek,
  decryptPayload,
  fromBase64,
  sha256Hex,
  tenantKekSalt,
  unwrapContentKey,
  verifyBytes,
} from './crypto.js';
import { manifestBytes, type BundleManifest, type BundlePayload, type SignedBundle } from './manifest.js';

/** Why an install was refused. Reported to telemetry, never guessed at. */
export type InstallRejectReason =
  | 'signature_invalid'
  | 'not_monotonic'
  | 'payload_hash_mismatch'
  | 'key_unwrap_failed'
  | 'decrypt_failed'
  | 'malformed_payload';

/** A bundle that passed every check and is now active. */
export interface InstalledBundle {
  readonly tenantId: string;
  readonly bundleVersion: number;
  readonly manifest: BundleManifest;
  readonly sops: readonly SopDocument[];
  readonly installedAt: string;
}

/**
 * Where the active bundle lives.
 *
 * Phase 6 supplies IndexedDB and SQLite implementations. The contract is what
 * matters: `commit` replaces the active bundle in one step, and `active` returns
 * either the previous bundle or the new one, never a mixture.
 */
export interface BundleStore {
  active(): Promise<InstalledBundle | null>;
  commit(bundle: InstalledBundle): Promise<void>;
}

/** What the device holds, and what it needs to verify a bundle. */
export interface SyncIdentity {
  readonly devicePrivateKey: CryptoKey;
  readonly tenantSigningPublicKey: CryptoKey;
  readonly serverWrappingPublicKey: CryptoKey;
  /**
   * Optional. Derived from the manifest's tenant id when omitted, which is the
   * case for any real device: the salt has to match the publisher's, and a value
   * both sides had to be handed is a value they can silently disagree on.
   */
  readonly kekSalt?: Uint8Array;
}

export type InstallResult =
  | {
      readonly outcome: 'installed';
      readonly bundleVersion: number;
      readonly sopCount: number;
    }
  | {
      readonly outcome: 'rejected';
      readonly reason: InstallRejectReason;
      readonly detail: string;
    };

function rejected(reason: InstallRejectReason, detail: string): InstallResult {
  return { outcome: 'rejected', reason, detail };
}

/**
 * Verify, decrypt and install a bundle.
 *
 * @param signed Bundle as delivered for this device.
 * @param identity Device keys and the tenant's public keys.
 * @param store Where the active bundle lives. Untouched on rejection.
 * @returns The outcome. A rejection is a normal result, not an exception.
 */
export async function installBundle(
  signed: SignedBundle,
  identity: SyncIdentity,
  store: BundleStore,
): Promise<InstallResult> {
  // 1. Authenticate the manifest before trusting anything in it.
  const signatureValid = await verifyBytes(
    identity.tenantSigningPublicKey,
    signed.signature,
    manifestBytes(signed.manifest),
  );

  if (!signatureValid) {
    return rejected('signature_invalid', 'manifest signature did not verify');
  }

  // 2. Refuse replays and out-of-order bundles.
  const current = await store.active();

  if (current !== null && signed.manifest.bundleVersion <= current.bundleVersion) {
    return rejected(
      'not_monotonic',
      `bundle ${signed.manifest.bundleVersion} is not newer than active ${current.bundleVersion}`,
    );
  }

  // 3. The ciphertext must be exactly what the signed manifest describes.
  const ciphertext = fromBase64(signed.payloadCiphertext);
  const actualHash = await sha256Hex(ciphertext);

  if (actualHash !== signed.manifest.payloadHash) {
    return rejected(
      'payload_hash_mismatch',
      `expected ${signed.manifest.payloadHash}, computed ${actualHash}`,
    );
  }

  // 4. Unwrap the content key. A device that was never enrolled fails here.
  const kek = await deriveKek(
    identity.devicePrivateKey,
    identity.serverWrappingPublicKey,
    identity.kekSalt ?? tenantKekSalt(signed.manifest.tenantId),
    KEK_INFO,
  );

  const contentKey = await unwrapContentKey(kek, signed.wrappedContentKey);

  if (contentKey === null) {
    return rejected('key_unwrap_failed', 'content key could not be unwrapped');
  }

  // 5. Decrypt. A wrong key or damaged bytes fail the GCM tag here.
  const plaintext = await decryptPayload(
    contentKey,
    signed.manifest.iv,
    signed.payloadCiphertext,
  );

  if (plaintext === null) {
    return rejected('decrypt_failed', 'payload failed authentication');
  }

  // 6. Parse, and refuse anything that is not a corpus.
  let payload: BundlePayload;

  try {
    payload = JSON.parse(decodeUtf8(plaintext)) as BundlePayload;
  } catch {
    return rejected('malformed_payload', 'payload was not valid JSON');
  }

  if (!Array.isArray(payload.sops)) {
    return rejected('malformed_payload', 'payload carried no sop array');
  }

  // 7. Commit. The first and only mutation in this function.
  await store.commit({
    tenantId: signed.manifest.tenantId,
    bundleVersion: signed.manifest.bundleVersion,
    manifest: signed.manifest,
    sops: payload.sops,
    installedAt: new Date().toISOString(),
  });

  return {
    outcome: 'installed',
    bundleVersion: signed.manifest.bundleVersion,
    sopCount: payload.sops.length,
  };
}
