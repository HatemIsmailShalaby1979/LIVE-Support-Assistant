/**
 * @sop/sync — the encrypted policy-bundle sync engine.
 *
 * Server half and client half live together so the protocol cannot drift.
 */

export { canonicalJson } from './canonical.js';
export type { CanonicalValue } from './canonical.js';

export {
  KEK_INFO,
  decodeUtf8,
  decryptPayload,
  deriveKek,
  encodeUtf8,
  encryptPayload,
  exportPublicKey,
  fromBase64,
  generateContentKey,
  generateSigningKeyPair,
  generateWrappingKeyPair,
  importWrappingPublicKey,
  sha256Hex,
  signBytes,
  toBase64,
  unwrapContentKey,
  verifyBytes,
  wrapContentKey,
} from './crypto.js';

export { manifestBytes } from './manifest.js';
export type { BundleManifest, BundlePayload, SignedBundle } from './manifest.js';

export { installBundle } from './install.js';
export type {
  BundleStore,
  InstallRejectReason,
  InstallResult,
  InstalledBundle,
  SyncIdentity,
} from './install.js';

export { MemoryBundleStore } from './memory-store.js';
export { IdbBundleStore } from './idb-store.js';
export { SqliteBundleStore } from './sqlite-store.js';
export type { SqliteDriver } from './sqlite-store.js';

export { rotateTenantKeys } from './rotation.js';
export type { RotateParams, RotatedKeys } from './rotation.js';

export { bundleForDevice, publishBundle } from './server.js';
export type {
  EnrolledDevice,
  ModelIdentity,
  PublishParams,
  PublishedBundle,
} from './server.js';
