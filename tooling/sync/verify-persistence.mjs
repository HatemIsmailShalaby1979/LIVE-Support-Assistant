#!/usr/bin/env node
/**
 * Phase 6 verification — device persistence.
 *
 * The BundleStore contract is what makes the sync engine portable across web,
 * desktop and mobile. This suite proves both production adapters satisfy it
 * under the REAL install pipeline (not against mocks of the pipeline):
 *
 *   - IdbBundleStore, driven by fake-indexeddb (the IndexedDB spec, in memory)
 *   - SqliteBundleStore, driven by a minimal driver double
 *
 * The property under test is the atomic swap: a commit replaces the active
 * bundle in one step, so a reader sees the old bundle or the new one, never a
 * mixture — and a rejected install leaves the previous bundle active.
 *
 * Run after `pnpm build`:
 *     node tooling/sync/verify-persistence.mjs
 */

// fake-indexeddb is a devDependency of @sop/sync; resolve it there explicitly,
// because tooling/ is not a workspace package and sees no hoisted copy.
import '../../packages/sync/node_modules/fake-indexeddb/auto/index.mjs';

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  IdbBundleStore,
  MemoryBundleStore,
  SqliteBundleStore,
  bundleForDevice,
  exportPublicKey,
  generateSigningKeyPair,
  generateWrappingKeyPair,
  importWrappingPublicKey,
  installBundle,
  manifestBytes,
  publishBundle,
  signBytes,
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

const checks = [];

function expect(name, expected, observed, ok) {
  checks.push({ name, expected: String(expected), observed: String(observed), ok });
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function makeServer() {
  const signing = await generateSigningKeyPair();
  const wrapping = await generateWrappingKeyPair();
  const kekSalt = crypto.getRandomValues(new Uint8Array(16));
  return { signing, wrapping, kekSalt };
}

async function makeDevice() {
  const deviceKeys = await generateWrappingKeyPair();
  return deviceKeys;
}

/**
 * The full environment for one adapter under test: a server with two versions
 * published and one corrupted third, and a device that installs them through
 * the real pipeline into the store being verified.
 */
async function scenario(makeStore, label) {
  const server = await makeServer();
  const device = await makeDevice();

  const serverWrappingPublicKey = await importWrappingPublicKey(
    // exportPublicKey returns base64; import parses it. Round-trip to be honest
    // about what crosses the registry.
    await exportPublicKey(server.wrapping.publicKey),
  );

  const identity = {
    devicePrivateKey: device.privateKey,
    tenantSigningPublicKey: server.signing.publicKey,
    serverWrappingPublicKey,
    kekSalt: server.kekSalt,
  };

  const devices = [{ deviceId: 'device-1', publicKey: device.publicKey }];

  const v1 = await publishBundle({
    tenantId: '11111111-1111-1111-1111-111111111111',
    bundleVersion: 1,
    sops: corpus,
    model: MODEL,
    signingPrivateKey: server.signing.privateKey,
    wrappingPrivateKey: server.wrapping.privateKey,
    kekSalt: server.kekSalt,
    devices,
  });

  const v2 = await publishBundle({
    tenantId: '11111111-1111-1111-1111-111111111111',
    bundleVersion: 2,
    sops: corpus,
    model: MODEL,
    signingPrivateKey: server.signing.privateKey,
    wrappingPrivateKey: server.wrapping.privateKey,
    kekSalt: server.kekSalt,
    devices,
  });

  // A corrupted third bundle: a real signature over the modified manifest, and
  // a hash that matches the *undamaged* ciphertext — so the pipeline's earlier
  // checks pass and the hash check is the one that fires (the Phase 3 lesson:
  // a probe must clear the checks preceding the one it targets).
  const damagedManifest = {
    ...v2.manifest,
    bundleVersion: 3,
    payloadHash: v2.manifest.payloadHash,
  };
  const damaged = {
    manifest: damagedManifest,
    signature: await signBytes(server.signing.privateKey, manifestBytes(damagedManifest)),
    payloadCiphertext: v2.payloadCiphertext.slice(0, -4) + 'AAAA',
  };

  let store = await makeStore(server);

  // 1. first install
  const first = await installBundle(bundleForDevice(v1, 'device-1'), identity, store);
  expect(`${label}: first install succeeds`, 'installed', first.outcome,
    first.outcome === 'installed' && first.bundleVersion === 1);

  // 2. upgrade install
  const second = await installBundle(bundleForDevice(v2, 'device-1'), identity, store);
  expect(`${label}: upgrade install succeeds`, 'installed', second.outcome,
    second.outcome === 'installed' && second.bundleVersion === 2);

  // 3. the atomic swap: active is exactly v2, field for field
  const active = await store.active();
  expect(`${label}: active bundle is v2`, 2, active?.bundleVersion, active?.bundleVersion === 2);
  expect(`${label}: active manifest intact`, true,
    deepEqual(active?.manifest, v2.manifest),
    deepEqual(active?.manifest, v2.manifest));
  expect(`${label}: active corpus intact`, corpus.length, active?.sops.length,
    active?.sops.length === corpus.length);
  expect(`${label}: active corpus matches source`, true,
    deepEqual(active?.sops, corpus), deepEqual(active?.sops, corpus));

  // 4. a rejected install leaves the previous bundle active
  const rejected = await installBundle(damaged, identity, store);
  expect(`${label}: corrupted bundle rejected`, 'rejected', rejected.outcome,
    rejected.outcome === 'rejected' && rejected.reason === 'payload_hash_mismatch');

  const afterRejection = await store.active();
  expect(`${label}: rejection left v2 active`, 2, afterRejection?.bundleVersion,
    afterRejection?.bundleVersion === 2);

  // 5. persistence across a reload: a brand-new store over the same storage
  store = await makeStore(server);
  const afterReload = await store.active();
  expect(`${label}: bundle survives a store restart`, 2, afterReload?.bundleVersion,
    afterReload?.bundleVersion === 2);

  return { identity, v1, v2 };
}

// ---- IndexedDB adapter ----
await scenario(
  () => Promise.resolve(new IdbBundleStore()),
  'idb',
);

// ---- SQLite adapter (fake driver) ----
function fakeSqliteDriver() {
  let tableReady = false;
  let row = null;

  return {
    async runAsync(sql, params = []) {
      if (sql.includes('create table')) {
        tableReady = true;
        return;
      }
      if (sql.startsWith('insert or replace')) {
        row = { manifest: params[0], sops: params[1], installed_at: params[2] };
        return;
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
    async getAllAsync(sql) {
      if (!tableReady) throw new Error('schema not ready');
      if (sql.includes('from active_bundle')) {
        return row === null ? [] : [row];
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
  };
}

// One driver instance shared across the scenario: constructing a fresh driver
// means a fresh database, which would make the "restart" check meaningless.
const sharedSqlite = fakeSqliteDriver();

await scenario(
  () => Promise.resolve(new SqliteBundleStore(sharedSqlite)),
  'sqlite',
);

// ---- sanity: MemoryBundleStore does NOT survive a restart, by design ----
{
  const server = await makeServer();
  const device = await makeDevice();
  const serverWrappingPublicKey = await importWrappingPublicKey(
    await exportPublicKey(server.wrapping.publicKey),
  );
  const identity = {
    devicePrivateKey: device.privateKey,
    tenantSigningPublicKey: server.signing.publicKey,
    serverWrappingPublicKey,
    kekSalt: server.kekSalt,
  };
  const v1 = await publishBundle({
    tenantId: '11111111-1111-1111-1111-111111111111',
    bundleVersion: 1,
    sops: corpus,
    model: MODEL,
    signingPrivateKey: server.signing.privateKey,
    wrappingPrivateKey: server.wrapping.privateKey,
    kekSalt: server.kekSalt,
    devices: [{ deviceId: 'device-1', publicKey: device.publicKey }],
  });

  const first = new MemoryBundleStore();
  await installBundle(bundleForDevice(v1, 'device-1'), identity, first);
  const second = new MemoryBundleStore();
  const after = await second.active();
  expect('memory: restart loses the bundle (documented limitation)', null, after, after === null);
}

// ---- report ----
const failed = checks.filter((check) => !check.ok);

console.log('\n=== device persistence ===');
console.log('check'.padEnd(58), 'expected'.padEnd(12), 'observed');
console.log('-'.repeat(100));
for (const check of checks) {
  console.log(
    check.name.padEnd(58),
    check.expected.padEnd(12),
    check.observed.padEnd(20),
    check.ok ? 'PASS' : 'FAIL',
  );
}
console.log('-'.repeat(100));
console.log(`checks: ${checks.length}  failures: ${failed.length}`);
console.log(failed.length === 0 ? '\nPERSISTENCE VERIFICATION OK' : '\nPERSISTENCE VERIFICATION FAILED');

process.exit(failed.length === 0 ? 0 : 1);
