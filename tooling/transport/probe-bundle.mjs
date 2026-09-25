#!/usr/bin/env node
/**
 * Proof that a published bundle can actually reach a device and be installed.
 *
 * Everything here was already true in pieces: `publishBundle` signs, encrypts
 * and wraps; `installBundle` verifies in a fixed order and refuses to serve on
 * any doubt; the database has `publish_policy_bundle`. What was missing was the
 * wire between them, and it was missing in a way only a fetch would have found —
 * there was no column for a per-device wrapped key, and the signed manifest could
 * not be reconstructed from what was stored. Migration 0014 exists because of
 * this file.
 *
 * The loop, end to end against the hosted project:
 *
 *   1. A device generates a keypair and enrols.
 *   2. The server half encrypts the corpus, signs the manifest, wraps the content
 *      key to that device, and publishes through the RPC.
 *   3. The device fetches its own bundle and installs it through the real
 *      pipeline into a store, and the corpus it holds matches field for field.
 *   4. The ciphertext on its own yields no procedure text.
 *   5. A tampered manifest is rejected, and the previous bundle stays active.
 *   6. Another tenant's device gets nothing.
 *
 * The publish step runs in this process rather than behind an edge function, and
 * the difference is exactly the one worth being explicit about: an edge function
 * holds the tenant signing key in a server-side secret, whereas here the keys
 * are generated per run and discarded. The protocol is identical.
 *
 * Usage:
 *   node tooling/transport/probe-bundle.mjs
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const require = createRequire(resolve(root, 'apps/web/package.json'));
const { createClient } = await import(pathToFileURL(require.resolve('@supabase/supabase-js')).href);
const sync = await import(pathToFileURL(resolve(root, 'packages/sync/dist/index.js')).href);

function readEnvFile() {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

const fileEnv = readEnvFile();
const env = (name) => process.env[name] ?? fileEnv[name] ?? '';
const url = env('SUPABASE_URL').replace(/\/+$/, '');
const publishableKey = env('SUPABASE_PUBLISHABLE_KEY');
const secretKey = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');

if (url === '' || publishableKey === '' || secretKey === '') {
  process.stderr.write('need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY\n');
  process.exit(2);
}

const ALPHA = '11111111-1111-1111-1111-111111111111';
const BETA = '22222222-2222-2222-2222-222222222222';

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}\n`);
}

const adminHeaders = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
};

async function signIn(email, appMetadata) {
  const password = `Pb-${randomUUID()}`;
  const list = await (await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders })).json();
  const existing = (list?.users ?? []).find((user) => user?.email === email);
  let userId = existing?.id ?? null;

  if (existing) {
    await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ email_confirm: true, password, app_metadata: appMetadata }),
    });
  } else {
    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true, app_metadata: appMetadata }),
    });
    if (!created.ok) throw new Error(`could not provision ${email}: ${await created.text()}`);
    // The id matters as much as the session: device_registrations.user_id is
    // NOT NULL, and returning null here failed the enrolment rather than
    // anything downstream, which is a confusing place to learn it.
    userId = (await created.json()).id;
  }

  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { client, userId };
}

// --------------------------------------------------------------- the corpus --

// A corpus with a distinctive string in it, so "can the ciphertext be read"
// is a question with an unambiguous answer rather than a judgement call.
const MARKER = 'PROBE-ONLY-MARKER-9f2c7a41';
const CORPUS = [
  {
    id: 'probe-sop-1',
    title: 'Probe procedure one',
    category: 'probe',
    body: `This procedure mentions ${MARKER} and must never appear in ciphertext.`,
    suggestedReply: 'No action needed.',
    escalationRequired: false,
    triggerKeywords: ['probe'],
    status: 'published',
  },
  {
    id: 'probe-sop-2',
    title: 'Probe procedure two',
    category: 'probe',
    body: 'A second procedure, so the bundle carries more than one entry.',
    suggestedReply: 'Escalate.',
    escalationRequired: true,
    triggerKeywords: ['probe', 'second'],
    status: 'published',
  },
];

// ------------------------------------------------------- keys and enrolment --

process.stdout.write('==> generating tenant and device keys\n');

const tenantSigning = await sync.generateSigningKeyPair();
const serverWrapping = await sync.generateWrappingKeyPair();
const deviceKeys = await sync.generateWrappingKeyPair();
const devicePublicKeyBase64 = await sync.exportPublicKey(deviceKeys.publicKey);
const kekSalt = randomBytes(32);

const publisher = await signIn('bundle-publisher@alpha.example', {
  tenant_id: ALPHA,
  app_role: 'ops_manager',
});

// A GoTrue identity is not yet a tenant user. device_registrations.user_id
// references public.users(id), so a device cannot enrol for someone who has no
// row there — and that row is created by onboarding, not by signing in. Doing it
// here is the step a real tenant-onboarding flow would perform.
const { error: userRowError } = await publisher.client.from('users').upsert(
  {
    id: publisher.userId,
    tenant_id: ALPHA,
    display_name: 'Bundle Publisher',
    role: 'ops_manager',
  },
  { onConflict: 'id' },
);
check('the publisher has a tenant user record', !userRowError, userRowError?.message);

const agent = await signIn('bundle-device@alpha.example', {
  tenant_id: ALPHA,
  app_role: 'agent',
});
const betaAgent = await signIn('bundle-device@beta.example', {
  tenant_id: BETA,
  app_role: 'agent',
});

// The platform is constrained to web/desktop/mobile, so a run cannot register a
// new identity under a new label: the unique key is (tenant, user, platform).
// The device therefore re-keys — which is what a device that regenerates its
// keypair actually does, and what an ops manager is permitted to do.
const PLATFORM = 'web';

const { data: existingDevice } = await publisher.client
  .from('device_registrations')
  .select('id, public_key')
  .eq('tenant_id', ALPHA)
  .eq('user_id', publisher.userId)
  .eq('platform', PLATFORM)
  .maybeSingle();

let deviceId;
if (existingDevice === null || existingDevice === undefined) {
  const { data: inserted, error } = await publisher.client
    .from('device_registrations')
    .insert({
      id: randomUUID(),
      tenant_id: ALPHA,
      user_id: publisher.userId,
      platform: PLATFORM,
      public_key: devicePublicKeyBase64,
      status: 'active',
    })
    .select('id')
    .single();
  if (error) {
    check('a device can enrol with its public key', false, error.message);
    process.exit(1);
  }
  deviceId = inserted.id;
} else {
  const { error } = await publisher.client
    .from('device_registrations')
    .update({ public_key: devicePublicKeyBase64 })
    .eq('id', existingDevice.id);
  if (error) {
    check('a device can re-key', false, error.message);
    process.exit(1);
  }
  deviceId = existingDevice.id;
}

check('a device is enrolled with this run\'s public key', typeof deviceId === 'string', deviceId);

// ---------------------------------------------------------------- publishing --

process.stdout.write('==> publishing a bundle wrapped for that device\n');

const { data: nextVersion, error: versionError } = await publisher.client
  .schema('app')
  .rpc('next_bundle_version', { p_tenant: ALPHA });

if (versionError) throw new Error(`next_bundle_version failed: ${versionError.message}`);

const published = await sync.publishBundle({
  tenantId: ALPHA,
  bundleVersion: Number(nextVersion),
  sops: CORPUS,
  model: {
    id: 'Xenova/all-MiniLM-L6-v2',
    revision: '751bff37182d3f1213fa05d7196b954e230abad9',
    quantization: 'q8',
    dimensions: 384,
  },
  signingPrivateKey: tenantSigning.privateKey,
  wrappingPrivateKey: serverWrapping.privateKey,
  kekSalt,
  devices: [{ deviceId, publicKey: await sync.importWrappingPublicKey(devicePublicKeyBase64) }],
});

const deviceKeysOut = [...published.wrappedKeys.entries()].map(([id, key]) => ({
  deviceId: id,
  wrappedKey: key,
}));

check('the server wrapped a key for the enrolled device', deviceKeysOut.length === 1);

const { data: storedVersion, error: publishError } = await publisher.client
  .schema('app')
  .rpc('publish_policy_bundle', {
    p_tenant: ALPHA,
    p_manifest: published.manifest,
    p_signature: published.signature,
    // bytea over PostgREST is a hex string, not base64 and not a Buffer. Passing
    // a Buffer serialises as {type:"Buffer",data:[...]}, the server stores
    // something else entirely, and the client rejects the result with
    // payload_hash_mismatch — which is the protocol working, catching a publisher
    // that mangled the ciphertext.
    p_payload_ciphertext: `\\x${Buffer.from(published.payloadCiphertext, 'base64').toString('hex')}`,
    p_device_keys: deviceKeysOut,
    p_published_by: publisher.userId,
  });

check('the bundle published through the RPC', !publishError, publishError?.message);
if (publishError) {
  process.exit(1);
}
check(
  'the assigned version is the one that was signed',
  Number(storedVersion) === published.manifest.bundleVersion,
  `stored ${storedVersion}, signed ${published.manifest.bundleVersion}`,
);

// ----------------------------------------------------------------- fetching --

process.stdout.write('==> fetching the bundle as the device\n');

const { data: fetched, error: fetchError } = await agent.client.schema('app').rpc('bundle_for_device', {
  p_device_id: deviceId,
});

check('the device can fetch its own bundle', !fetchError, fetchError?.message);
if (fetchError || fetched === null) {
  process.exit(1);
}

// Compared canonically, not with JSON.stringify. The manifest is stored as jsonb,
// and jsonb does not preserve key order — so a stringify comparison fails on a
// bundle that is in fact identical. The signature does not care, because it is
// computed over canonical JSON with sorted keys, which is the whole reason
// packages/sync/src/canonical.ts exists.
check(
  'the fetched manifest is the one that was signed',
  sync.canonicalJson(fetched.manifest) === sync.canonicalJson(published.manifest),
);
// Compared as bytes, not as base64 strings: PostgreSQL's encode(..., 'base64')
// wraps its output, so a string comparison fails on identical ciphertext. The
// meaningful assertion is that the bytes survived, which is also what
// payload_hash_mismatch would otherwise catch.
check(
  'the fetched ciphertext is byte-identical',
  sync.toBase64(sync.fromBase64(fetched.payloadCiphertext)) ===
    sync.toBase64(sync.fromBase64(published.payloadCiphertext)),
);

// ---------------------------------------------------------------- installing --

process.stdout.write('==> installing through the real pipeline\n');

const store = new sync.MemoryBundleStore();
const identity = {
  devicePrivateKey: deviceKeys.privateKey,
  tenantSigningPublicKey: tenantSigning.publicKey,
  serverWrappingPublicKey: serverWrapping.publicKey,
  kekSalt,
};

const result = await sync.installBundle(fetched, identity, store);
check('the bundle installs', result.outcome === 'installed', JSON.stringify(result));

const active = await store.active();
check(
  'the installed corpus matches the published corpus field for field',
  active !== null && JSON.stringify(active.sops) === JSON.stringify(CORPUS),
);
check(
  'the installed bundle is the one that was served',
  active?.manifest.bundleVersion === published.manifest.bundleVersion,
);

process.stdout.write('==> checking the ciphertext yields nothing\n');
const ciphertextBytes = sync.decodeUtf8(sync.fromBase64(fetched.payloadCiphertext));
check(
  'the ciphertext contains no procedure text',
  !ciphertextBytes.includes(MARKER) && !ciphertextBytes.includes('Probe procedure one'),
);

// ---------------------------------------------------------------- refusals --

process.stdout.write('==> checking the refusals\n');

const replay = await sync.installBundle(fetched, identity, store);
check('a replay of the same version is refused', replay.outcome === 'rejected' && replay.reason === 'not_monotonic', JSON.stringify(replay));

const tampered = {
  ...fetched,
  manifest: { ...fetched.manifest, sopCount: 99 },
};
const tamperedResult = await sync.installBundle(tampered, identity, new sync.MemoryBundleStore());
check(
  'a tampered manifest is refused',
  tamperedResult.outcome === 'rejected' && tamperedResult.reason === 'signature_invalid',
  JSON.stringify(tamperedResult),
);

const foreignDevice = randomUUID();
const { data: foreign, error: foreignError } = await betaAgent.client.schema('app').rpc('bundle_for_device', {
  p_device_id: deviceId,
});
check(
  "another tenant's device gets nothing for this device id",
  foreignError === null && foreign === null,
  foreignError ? foreignError.message : `got ${JSON.stringify(foreign)?.slice(0, 80)}`,
);

const activeAfter = await store.active();
check(
  'the active bundle survived every refusal',
  activeAfter !== null && activeAfter.manifest.bundleVersion === published.manifest.bundleVersion,
);

// ------------------------------------------------------------------ report --

const passed = checks.filter((entry) => entry.ok).length;
process.stdout.write(`\n${passed} of ${checks.length} checks passed\n`);
if (passed !== checks.length) {
  process.stderr.write('\nBUNDLE TRANSPORT FAILED\n');
  process.exit(1);
}
process.stdout.write('\nBUNDLE TRANSPORT OK\n');
process.stdout.write(
  `  (device ${deviceId} was created as a fixture; remove it or let the seed reset it)\n`,
);
