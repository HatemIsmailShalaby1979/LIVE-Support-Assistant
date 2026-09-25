#!/usr/bin/env node
/**
 * Phase 7 verification — key rotation and device revocation.
 *
 * Phase 3's honest gap: removing a device stopped future wrapping but did not
 * re-key the tenant, so a removed device kept reading every bundle it held.
 * `rotateTenantKeys` closes it: a fresh tenant wrapping keypair, a fresh content
 * key, wrapping only for the devices that keep access.
 *
 * Attacked here, not described:
 *
 *   - the revoked device is refused a wrapped key by the server (`bundleForDevice`)
 *   - the revoked device's cached wrapped key from v1 cannot open the v2 payload
 *     (old KEK unwraps the OLD content key; the GCM tag rejects the new ciphertext)
 *   - an active device that never received the new wrapping public key cannot
 *     unwrap either — distribution is part of revocation
 *   - replay of the pre-rotation bundle is refused after the upgrade
 *   - signing-key rotation is a pure distribution event: same manifest, new
 *     signature verifies against the new key and fails against the old
 *   - and the limitation rotation cannot fix, asserted rather than hidden: the
 *     revoked device still holds and reads the pre-rotation bundle
 *
 * Run after `pnpm build`:
 *     node tooling/sync/verify-rotation.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MemoryBundleStore,
  bundleForDevice,
  exportPublicKey,
  generateSigningKeyPair,
  generateWrappingKeyPair,
  importWrappingPublicKey,
  installBundle,
  manifestBytes,
  publishBundle,
  rotateTenantKeys,
  signBytes,
  verifyBytes,
} from '../../packages/sync/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const corpus = JSON.parse(
  readFileSync(resolve(root, 'apps/web/src/data/knowledgeBase.json'), 'utf8'),
);

const MODEL = {
  id: 'Xenova/all-MiniLM-L6-v2',
  revision: '751bff37182d3f1213fa05d7196b954e230abad9',
  quantization: 'q8',
  dimensions: 384,
};

const TENANT = '11111111-1111-1111-1111-111111111111';

const checks = [];

function expect(name, expected, observed, ok) {
  checks.push({ name, expected: String(expected), observed: String(observed), ok });
}

// ---- setup: tenant keys, two devices, v1 wrapped for both ----
const signing = await generateSigningKeyPair();
const wrappingOld = await generateWrappingKeyPair();
const kekSalt = crypto.getRandomValues(new Uint8Array(16));

const deviceA = await generateWrappingKeyPair();
const deviceB = await generateWrappingKeyPair();

const serverOldWrappingPublicKey = await importWrappingPublicKey(
  await exportPublicKey(wrappingOld.publicKey),
);

function identityFor(deviceKeys, serverWrappingPublicKey) {
  return {
    devicePrivateKey: deviceKeys.privateKey,
    tenantSigningPublicKey: signing.publicKey,
    serverWrappingPublicKey,
    kekSalt,
  };
}

const devices = [
  { deviceId: 'device-a', publicKey: deviceA.publicKey },
  { deviceId: 'device-b', publicKey: deviceB.publicKey },
];

const v1 = await publishBundle({
  tenantId: TENANT,
  bundleVersion: 1,
  sops: corpus,
  model: MODEL,
  signingPrivateKey: signing.privateKey,
  wrappingPrivateKey: wrappingOld.privateKey,
  kekSalt,
  devices,
});

const storeA = new MemoryBundleStore();
const storeB = new MemoryBundleStore();

const installedA1 = await installBundle(bundleForDevice(v1, 'device-a'), identityFor(deviceA, serverOldWrappingPublicKey), storeA);
expect('device A installs pre-rotation v1', 'installed', installedA1.outcome,
  installedA1.outcome === 'installed');
const installedB1 = await installBundle(bundleForDevice(v1, 'device-b'), identityFor(deviceB, serverOldWrappingPublicKey), storeB);
expect('device B installs pre-rotation v1', 'installed', installedB1.outcome,
  installedB1.outcome === 'installed');

// ---- rotation: device B is removed ----
const rotation = await rotateTenantKeys({
  tenantId: TENANT,
  bundleVersion: 2,
  sops: corpus,
  model: MODEL,
  kekSalt,
  activeDevices: [{ deviceId: 'device-a', publicKey: deviceA.publicKey }],
  signingPrivateKey: signing.privateKey,
});

const v2 = rotation.published;
const serverNewWrappingPublicKey = await importWrappingPublicKey(rotation.newWrappingPublicKey);

expect('rotation produced version 2', 2, v2.manifest.bundleVersion, v2.manifest.bundleVersion === 2);
expect('new wrapping public key differs from old', false,
  rotation.newWrappingPublicKey === (await exportPublicKey(wrappingOld.publicKey)),
  rotation.newWrappingPublicKey !== (await exportPublicKey(wrappingOld.publicKey)));

// ---- the revoked device is refused at the server ----
let refused = false;
try {
  bundleForDevice(v2, 'device-b');
} catch {
  refused = true;
}
expect('revoked device receives no wrapped key', true, refused, refused);

// ---- attack 1: revoked device replays its cached v1 wrapped key against v2 ----
const cachedSigned = {
  manifest: v2.manifest,
  signature: v2.signature,
  payloadCiphertext: v2.payloadCiphertext,
  wrappedContentKey: v1.wrappedKeys.get('device-b'),
};
const attack1 = await installBundle(cachedSigned, identityFor(deviceB, serverOldWrappingPublicKey), storeB);
expect('cached v1 wrapped key fails against v2 payload (decrypt_failed)', 'rejected', attack1.outcome,
  attack1.outcome === 'rejected' && attack1.reason === 'decrypt_failed');

// ---- attack 2: revoked device somehow holds the new wrapping public key ----
// Without a wrapped key made for it, unwrap fails on garbage.
const attack2 = await installBundle(
  { ...cachedSigned, wrappedContentKey: v2.wrappedKeys.get('device-a') },
  identityFor(deviceB, serverNewWrappingPublicKey),
  storeB,
);
expect("another device's wrapped key fails under a foreign device key (key_unwrap_failed)", 'rejected',
  attack2.outcome,
  attack2.outcome === 'rejected' && attack2.reason === 'key_unwrap_failed');

// ---- the active device upgrades under the new key ----
const installedA2 = await installBundle(bundleForDevice(v2, 'device-a'), identityFor(deviceA, serverNewWrappingPublicKey), storeA);
expect('active device installs rotated v2', 'installed', installedA2.outcome,
  installedA2.outcome === 'installed' && installedA2.bundleVersion === 2);

// ---- an active device that missed the key distribution cannot upgrade ----
// Fresh store: this attack must reach the unwrap check, so the version check
// must not fire first (the Phase 3 lesson — again).
const missed = await installBundle(
  bundleForDevice(v2, 'device-a'),
  identityFor(deviceA, serverOldWrappingPublicKey),
  new MemoryBundleStore(),
);
expect('active device without the new public key cannot unwrap (key_unwrap_failed)', 'rejected', missed.outcome,
  missed.outcome === 'rejected' && missed.reason === 'key_unwrap_failed');

// ---- replay of the pre-rotation bundle is refused after the upgrade ----
const replay = await installBundle(bundleForDevice(v1, 'device-a'), identityFor(deviceA, serverNewWrappingPublicKey), storeA);
expect('v1 replay refused after v2 (not_monotonic)', 'rejected', replay.outcome,
  replay.outcome === 'rejected' && replay.reason === 'not_monotonic');

// ---- the limitation rotation cannot fix, asserted ----
const heldByB = await storeB.active();
expect('revoked device still reads the pre-rotation bundle (documented)', 1, heldByB?.bundleVersion,
  heldByB?.bundleVersion === 1);

// ---- signing key rotation: distribution, not crypto ----
const signingNew = await generateSigningKeyPair();
const newSignature = await signBytes(signingNew.privateKey, manifestBytes(v2.manifest));

const verifiesNew = await verifyBytes(signingNew.publicKey, newSignature, manifestBytes(v2.manifest));
expect('manifest re-signed by the new key verifies against the new key', true, verifiesNew, verifiesNew);

const verifiesOld = await verifyBytes(signing.publicKey, newSignature, manifestBytes(v2.manifest));
expect('new signature does NOT verify against the old key', false, verifiesOld, !verifiesOld);

// ---- report ----
const failed = checks.filter((check) => !check.ok);

console.log('\n=== key rotation & revocation ===');
console.log('check'.padEnd(78), 'expected'.padEnd(12), 'observed');
console.log('-'.repeat(120));
for (const check of checks) {
  console.log(
    check.name.padEnd(78),
    check.expected.padEnd(12),
    check.observed.padEnd(30),
    check.ok ? 'PASS' : 'FAIL',
  );
}
console.log('-'.repeat(120));
console.log(`checks: ${checks.length}  failures: ${failed.length}`);
console.log(failed.length === 0 ? '\nROTATION VERIFICATION OK' : '\nROTATION VERIFICATION FAILED');

process.exit(failed.length === 0 ? 0 : 1);
