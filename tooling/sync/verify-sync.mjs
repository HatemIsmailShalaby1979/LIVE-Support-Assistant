#!/usr/bin/env node
/**
 * Phase 3 verification — the encrypted sync engine.
 *
 * Exercises the whole protocol locally: a server publishes a signed, encrypted
 * bundle with a per-device wrapped content key, and a client verifies, decrypts
 * and installs it. Nothing here is mocked except the transport, and the transport
 * carries nothing but ciphertext.
 *
 * The four exit criteria from design §8 are each asserted, plus the checks that
 * make them meaningful:
 *
 *   1. offline install on reconnect
 *   2. signature tamper rejected
 *   3. non-monotonic version rejected
 *   4. failed decrypt leaves the previous bundle active
 *
 * The last one is the important one. A rejection that leaves the client unable to
 * serve anything is worse than no sync at all, so every rejection is checked for
 * both the reason it reported *and* the fact that the active bundle did not move.
 *
 * Run after `pnpm build`:
 *     node tooling/sync/verify-sync.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EMBEDDING_MODEL } from '../../packages/embedder/dist/index.js';
import {
  MemoryBundleStore,
  bundleForDevice,
  exportPublicKey,
  fromBase64,
  generateSigningKeyPair,
  generateWrappingKeyPair,
  importWrappingPublicKey,
  installBundle,
  manifestBytes,
  publishBundle,
  sha256Hex,
  signBytes,
  toBase64,
} from '../../packages/sync/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const corpus = JSON.parse(
  readFileSync(resolve(root, 'apps/web/src/data/knowledgeBase.json'), 'utf8'),
);

const checks = [];

function record(name, expected, observed, ok) {
  checks.push({ name, expected: String(expected), observed: String(observed), ok });
}

function expect(name, expected, observed) {
  record(name, expected, observed, expected === observed);
}

function expectTrue(name, condition, detail = '') {
  record(name, 'true', condition ? 'true' : `false ${detail}`, condition === true);
}

const MODEL = {
  id: EMBEDDING_MODEL.id,
  revision: EMBEDDING_MODEL.revision,
  quantization: EMBEDDING_MODEL.dtype,
  dimensions: EMBEDDING_MODEL.dimensions,
};

// ---------------------------------------------------------------------------
// Setup: one tenant, one server, two enrolled devices, one stranger.
// ---------------------------------------------------------------------------

const tenantId = '11111111-1111-1111-1111-111111111111';
const kekSalt = crypto.getRandomValues(new Uint8Array(16));

const tenantSigningKeys = await generateSigningKeyPair();
const serverWrappingKeys = await generateWrappingKeyPair();

const deviceOne = await generateWrappingKeyPair();
const deviceTwo = await generateWrappingKeyPair();
const stranger = await generateWrappingKeyPair();

const enrolledDevices = [
  { deviceId: 'device-1', publicKey: deviceOne.publicKey },
  { deviceId: 'device-2', publicKey: deviceTwo.publicKey },
];

// The device registry, as it would be read back from PostgreSQL.
const registry = new Map();
for (const device of enrolledDevices) {
  registry.set(device.deviceId, await exportPublicKey(device.publicKey));
}

function identityFor(deviceId, privateKey) {
  return {
    devicePrivateKey: privateKey,
    tenantSigningPublicKey: tenantSigningKeys.publicKey,
    serverWrappingPublicKey: serverWrappingKeys.publicKey,
    kekSalt,
  };
}

// ---------------------------------------------------------------------------
// Criterion 1 (part one): publish and install
// ---------------------------------------------------------------------------

const publishedV1 = await publishBundle({
  tenantId,
  bundleVersion: 1,
  sops: corpus,
  model: MODEL,
  signingPrivateKey: tenantSigningKeys.privateKey,
  wrappingPrivateKey: serverWrappingKeys.privateKey,
  kekSalt,
  devices: enrolledDevices,
  publishedAt: '2026-09-25T07:00:00.000Z',
});

// The transport carries ciphertext and nothing else. Prove it.
const ciphertextText = new TextDecoder().decode(fromBase64(publishedV1.payloadCiphertext));
const leaksPlaintext = ciphertextText.includes('Coins') || ciphertextText.includes('escalation');
expectTrue('ciphertext contains no procedure text', leaksPlaintext === false, '(plaintext leaked)');

const storeOne = new MemoryBundleStore();

const firstInstall = await installBundle(
  bundleForDevice(publishedV1, 'device-1'),
  identityFor('device-1', deviceOne.privateKey),
  storeOne,
);

expect('first install outcome', 'installed', firstInstall.outcome);
expect('first install version', 1, firstInstall.bundleVersion);
expect('active version after v1', 1, (await storeOne.active())?.bundleVersion);
expect('active sop count', corpus.length, (await storeOne.active())?.sops.length);
expectTrue(
  'decrypted corpus matches the source',
  (await storeOne.active())?.sops.every(
    (sop, index) => sop.title === corpus[index].title && sop.summary === corpus[index].summary,
  ) === true,
);

// ---------------------------------------------------------------------------
// Criterion 2: signature tamper rejected
// ---------------------------------------------------------------------------

const tamperedManifest = { ...publishedV1.manifest, sopCount: 99 };
const tamperedSignature = await installBundle(
  {
    ...bundleForDevice(publishedV1, 'device-1'),
    manifest: tamperedManifest,
  },
  identityFor('device-1', deviceOne.privateKey),
  storeOne,
);

expect('tampered manifest rejected', 'signature_invalid', tamperedSignature.reason);

const foreignSigningKeys = await generateSigningKeyPair();
const foreignSignature = await installBundle(
  bundleForDevice(publishedV1, 'device-1'),
  {
    ...identityFor('device-1', deviceOne.privateKey),
    tenantSigningPublicKey: foreignSigningKeys.publicKey,
  },
  storeOne,
);

expect('bundle signed by a foreign key rejected', 'signature_invalid', foreignSignature.reason);
expect('active unchanged after signature rejections', 1, (await storeOne.active())?.bundleVersion);
expect('no commit happened on rejection', 1, storeOne.commits);

// ---------------------------------------------------------------------------
// Criterion 3: non-monotonic version rejected
// ---------------------------------------------------------------------------

const replayed = await installBundle(
  bundleForDevice(publishedV1, 'device-1'),
  identityFor('device-1', deviceOne.privateKey),
  storeOne,
);

expect('replayed v1 rejected', 'not_monotonic', replayed.reason);
expect('active still v1 after replay', 1, (await storeOne.active())?.bundleVersion);
expect('still only one commit', 1, storeOne.commits);

// ---------------------------------------------------------------------------
// Payload integrity: ciphertext tampering
//
// The pipeline checks in a fixed order — signature, then version, then payload
// hash, then unwrap, then decrypt. A probe must therefore clear the checks that
// come before the one it is aimed at, or it measures the wrong thing. Two
// probes are run for each case: one against a client with nothing installed, and
// one against a client already serving a bundle, with a newer version so the
// version check does not fire first.
// ---------------------------------------------------------------------------

const corruptedBytes = fromBase64(publishedV1.payloadCiphertext);
corruptedBytes[Math.floor(corruptedBytes.length / 2)] ^= 0xff;
const corruptedCiphertext = toBase64(corruptedBytes);

// Fresh client: nothing installed, so there is no version to be non-monotonic
// against. This also proves a failed first install leaves the client empty rather
// than half-populated.
const freshStore = new MemoryBundleStore();

const corruptedOnFresh = await installBundle(
  {
    ...bundleForDevice(publishedV1, 'device-1'),
    payloadCiphertext: corruptedCiphertext,
  },
  identityFor('device-1', deviceOne.privateKey),
  freshStore,
);

expect('tampered ciphertext rejected (fresh client)', 'payload_hash_mismatch', corruptedOnFresh.reason);
expect('fresh client holds no bundle', 'null', String(await freshStore.active()));
expect('fresh client recorded no commit', 0, freshStore.commits);

// Client already on v1: the same tampering, delivered as version 2, so the
// version check passes and the hash check is the one that fires.
const corruptedV2Manifest = { ...publishedV1.manifest, bundleVersion: 2 };

const corruptedV2 = {
  manifest: corruptedV2Manifest,
  signature: await signBytes(
    tenantSigningKeys.privateKey,
    manifestBytes(corruptedV2Manifest),
  ),
  payloadCiphertext: corruptedCiphertext,
  wrappedContentKey: bundleForDevice(publishedV1, 'device-1').wrappedContentKey,
};

const corruptedInstall = await installBundle(
  corruptedV2,
  identityFor('device-1', deviceOne.privateKey),
  storeOne,
);

expect('tampered ciphertext rejected (upgrade)', 'payload_hash_mismatch', corruptedInstall.reason);
expect('active still v1 after hash mismatch', 1, (await storeOne.active())?.bundleVersion);

// ---------------------------------------------------------------------------
// Criterion 4: a bundle that passes the hash check but fails to decrypt
//
// This is the case a signature alone cannot catch: a compromised or buggy server
// that re-signs a payload it cannot actually produce. The client must reject it
// and keep serving the previous bundle.
// ---------------------------------------------------------------------------

const resignedManifest = {
  ...publishedV1.manifest,
  bundleVersion: 3,
  payloadHash: await sha256Hex(corruptedBytes),
};

const resignedBundle = {
  manifest: resignedManifest,
  signature: await signBytes(tenantSigningKeys.privateKey, manifestBytes(resignedManifest)),
  payloadCiphertext: corruptedCiphertext,
  wrappedContentKey: bundleForDevice(publishedV1, 'device-1').wrappedContentKey,
};

const resignedInstall = await installBundle(
  resignedBundle,
  identityFor('device-1', deviceOne.privateKey),
  storeOne,
);

expect('re-signed corrupt payload rejected', 'decrypt_failed', resignedInstall.reason);
expect('active still v1 after decrypt failure', 1, (await storeOne.active())?.bundleVersion);
expect('still only one commit after decrypt failure', 1, storeOne.commits);

// ---------------------------------------------------------------------------
// A device that was never enrolled
// ---------------------------------------------------------------------------

const strangerStore = new MemoryBundleStore();

const strangerInstall = await installBundle(
  bundleForDevice(publishedV1, 'device-1'),
  identityFor('stranger', stranger.privateKey),
  strangerStore,
);

expect('unenrolled device rejected', 'key_unwrap_failed', strangerInstall.reason);
expect('unenrolled device holds no bundle', 'null', String(await strangerStore.active()));

// ---------------------------------------------------------------------------
// Criterion 1 (part two): offline, then reconnect
// ---------------------------------------------------------------------------

const storeTwo = new MemoryBundleStore();

// Device 2 installs v1 while online.
await installBundle(
  bundleForDevice(publishedV1, 'device-2'),
  identityFor('device-2', deviceTwo.privateKey),
  storeTwo,
);

expect('device 2 on v1 before going offline', 1, (await storeTwo.active())?.bundleVersion);

// The server publishes v2 while device 2 is offline. Nothing is delivered.
const publishedV2 = await publishBundle({
  tenantId,
  bundleVersion: 2,
  sops: corpus,
  model: MODEL,
  signingPrivateKey: tenantSigningKeys.privateKey,
  wrappingPrivateKey: serverWrappingKeys.privateKey,
  kekSalt,
  devices: enrolledDevices,
  publishedAt: '2026-09-25T07:10:00.000Z',
});

expect('device 2 still on v1 while offline', 1, (await storeTwo.active())?.bundleVersion);

// Reconnect: the queued bundle is delivered and installed.
const reconnectInstall = await installBundle(
  bundleForDevice(publishedV2, 'device-2'),
  identityFor('device-2', deviceTwo.privateKey),
  storeTwo,
);

expect('offline install on reconnect', 'installed', reconnectInstall.outcome);
expect('device 2 on v2 after reconnect', 2, (await storeTwo.active())?.bundleVersion);

// Device 1, still online, takes v2 as well.
const deviceOneV2 = await installBundle(
  bundleForDevice(publishedV2, 'device-1'),
  identityFor('device-1', deviceOne.privateKey),
  storeOne,
);

expect('device 1 installs v2', 'installed', deviceOneV2.outcome);
expect('device 1 on v2', 2, (await storeOne.active())?.bundleVersion);

// And now v1 must be refused as a stale replay.
const staleAfterV2 = await installBundle(
  bundleForDevice(publishedV1, 'device-1'),
  identityFor('device-1', deviceOne.privateKey),
  storeOne,
);

expect('stale v1 refused after v2', 'not_monotonic', staleAfterV2.reason);
expect('device 1 still on v2', 2, (await storeOne.active())?.bundleVersion);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const width = {
  name: Math.max(...checks.map((check) => check.name.length), 5),
  expected: Math.max(...checks.map((check) => check.expected.length), 8),
};

console.log('');
console.log(
  `${'CHECK'.padEnd(width.name)}  ${'EXPECTED'.padEnd(width.expected)}  ${'OBSERVED'.padEnd(width.expected)}  RESULT`,
);
console.log('-'.repeat(width.name + width.expected * 2 + 16));

for (const check of checks) {
  console.log(
    `${check.name.padEnd(width.name)}  ${check.expected.padEnd(width.expected)}  ${check.observed.padEnd(width.expected)}  ${check.ok ? 'PASS' : 'FAIL'}`,
  );
}

const failures = checks.filter((check) => !check.ok).length;

console.log('');
console.log(`checks: ${checks.length}  failures: ${failures}`);
console.log('');
console.log(failures === 0 ? 'SYNC VERIFICATION OK' : 'SYNC VERIFICATION FAILED');

process.exit(failures === 0 ? 0 : 1);
