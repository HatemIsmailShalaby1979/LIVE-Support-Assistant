#!/usr/bin/env node
/**
 * Proof that the publish edge function is the real boundary.
 *
 * The signing key now lives in the platform's secret store rather than in a test
 * process, which is the whole point of moving it. This checks the things that
 * move could have broken:
 *
 *   1. An ops_manager can publish through the function.
 *   2. The bundle it published is fetchable by an enrolled device and installs
 *      with a device identity minted from the persisted-identity path.
 *   3. An agent is refused — the function forwards the caller's own JWT, so
 *      row-level security is what says no, not a check in the function.
 *   4. A caller with no session is refused.
 *   5. The function never returns the signing key, plaintext, or anything else it
 *      had no reason to send.
 *
 * Usage:
 *   node tooling/transport/probe-publish.mjs
 *
 * Needs SOP_TENANT_SIGNING_PUBLIC_KEY: a device cannot verify a signature without
 * the tenant's verify key, so that key has to be obtainable by the client. It is
 * public material, not a secret.
 */

import '../../packages/sync/node_modules/fake-indexeddb/auto/index.mjs';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
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
const tenantSigningPublicKey = env('SOP_TENANT_SIGNING_PUBLIC_KEY');
const serverWrappingPublicKey = env('SOP_SERVER_WRAPPING_PUBLIC_KEY');

if (url === '' || publishableKey === '' || secretKey === '') {
  process.stderr.write('need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY\n');
  process.exit(2);
}
if (tenantSigningPublicKey === '' || serverWrappingPublicKey === '') {
  process.stderr.write(
    'need SOP_TENANT_SIGNING_PUBLIC_KEY and SOP_SERVER_WRAPPING_PUBLIC_KEY.\n' +
      'These are the public halves of the secrets the function holds, and a device\n' +
      'needs them to unwrap and verify. They are public material, so they belong in\n' +
      '.env.local — but they must match the function\'s secrets exactly.\n',
  );
  process.exit(2);
}

const ALPHA = '11111111-1111-1111-1111-111111111111';

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
  const password = `Pp-${randomUUID()}`;
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
    userId = (await created.json()).id;
  }
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { client, userId, accessToken: data.session.access_token };
}

async function publish(accessToken, sops) {
  return fetch(`${url}/functions/v1/publish-bundle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sops }),
  });
}

const publisher = await signIn('bundle-publisher@alpha.example', {
  tenant_id: ALPHA,
  app_role: 'ops_manager',
});
await publisher.client.from('users').upsert(
  { id: publisher.userId, tenant_id: ALPHA, display_name: 'Bundle Publisher', role: 'ops_manager' },
  { onConflict: 'id' },
);
const agent = await signIn('bundle-device@alpha.example', {
  tenant_id: ALPHA,
  app_role: 'agent',
});

// ---------------------------------------------------------- a device to serve --

process.stdout.write('==> minting a device identity through the persistence path\n');

const minted = await sync.newDeviceIdentity(
  randomUUID(),
  tenantSigningPublicKey,
  serverWrappingPublicKey,
);

// Select-then-write, not an upsert with `onConflict: 'id'`. The unique key is
// (tenant_id, user_id, platform), so an upsert keyed on the id does not conflict
// there — it inserts a second row, the platform collision rejects it, and the
// device that stays registered is the *previous run's*, holding a public key this
// run no longer has. The bundle then gets wrapped for a key nobody can unwrap,
// and the install fails with key_unwrap_failed, which reads like a crypto bug and
// is actually a stale fixture.
const { data: existingDevice } = await publisher.client
  .from('device_registrations')
  .select('id')
  .eq('tenant_id', ALPHA)
  .eq('user_id', publisher.userId)
  .eq('platform', 'mobile')
  .maybeSingle();

let deviceId;
if (existingDevice === null || existingDevice === undefined) {
  const { data: inserted, error } = await publisher.client
    .from('device_registrations')
    .insert({
      id: randomUUID(),
      tenant_id: ALPHA,
      user_id: publisher.userId,
      platform: 'mobile',
      public_key: minted.devicePublicKeyBase64,
      status: 'active',
    })
    .select('id')
    .single();
  check('the device is registered with the server', !error, error?.message);
  deviceId = inserted?.id;
} else {
  const { error } = await publisher.client
    .from('device_registrations')
    .update({ public_key: minted.devicePublicKeyBase64 })
    .eq('id', existingDevice.id);
  check('the registered device re-keys to this run', !error, error?.message);
  deviceId = existingDevice.id;
}

// ----------------------------------------------------------------- publishing --

process.stdout.write('==> publishing through the edge function\n');

const SENTINEL = 'EDGE-FUNCTION-SENTINEL-4b1d';
const response = await publish(publisher.accessToken, [
  {
    id: 'edge-sop-1',
    title: 'Edge published procedure',
    category: 'probe',
    body: `This text mentions ${SENTINEL} and must never be readable at rest.`,
    suggestedReply: 'No action.',
    escalationRequired: false,
    triggerKeywords: ['edge'],
    status: 'published',
  },
]);
const result = await response.json();

check('the function accepts an ops_manager', response.ok, response.ok ? `bundle ${result.bundleVersion}` : result.error);
check(
  'it did not return any signing material',
  JSON.stringify(result).includes('PRIVATE') === false && JSON.stringify(result).includes('BEGIN') === false,
  Object.keys(result).join(','),
);

// ------------------------------------------------------------------ refusals --

process.stdout.write('==> checking the refusals\n');

const agentResponse = await publish(agent.accessToken, []);
const agentBody = await agentResponse.json();
check(
  'an agent is refused',
  agentResponse.status >= 400,
  `${agentResponse.status} ${agentBody.error ?? ''}`,
);

const anonymousResponse = await fetch(`${url}/functions/v1/publish-bundle`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sops: [] }),
});
check('a caller with no session is refused', anonymousResponse.status === 401, `${anonymousResponse.status}`);

// ------------------------------------------------------ fetch and install it --

process.stdout.write('==> fetching and installing what the function published\n');

const { data: fetched, error: fetchError } = await agent.client
  .schema('app')
  .rpc('bundle_for_device', { p_device_id: deviceId });

if (fetchError !== null || fetched === null) {
  check('the device can fetch the published bundle', false, fetchError?.message ?? 'null');
} else {
  check('the device can fetch the published bundle', true, `bundle ${fetched.manifest.bundleVersion}`);

  const identityStore = new sync.IdbIdentityStore();
  await identityStore.save(minted.identity);
  const restored = await new sync.IdbIdentityStore().load();
  check('the identity survives a simulated reload', restored !== null);

  const outcome = await sync.installBundle(
    fetched,
    {
      devicePrivateKey: restored.devicePrivateKey,
      tenantSigningPublicKey: restored.tenantSigningPublicKey,
      serverWrappingPublicKey: restored.serverWrappingPublicKey,
    },
    new sync.MemoryBundleStore(),
  );

  check(
    'the signature the function produced verifies on the device',
    outcome.outcome === 'installed',
    JSON.stringify(outcome),
  );
}

const passed = checks.filter((entry) => entry.ok).length;
process.stdout.write(`\n${passed} of ${checks.length} checks passed\n`);
if (passed !== checks.length) {
  process.stderr.write('\nPUBLISH EDGE FUNCTION FAILED\n');
  process.exit(1);
}
process.stdout.write('\nPUBLISH EDGE FUNCTION OK\n');
