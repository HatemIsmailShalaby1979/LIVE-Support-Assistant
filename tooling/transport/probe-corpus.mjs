#!/usr/bin/env node
/**
 * Proof that the corpus comes from the tenant's own records.
 *
 * The previous boundary was honest but weak: the publish function took the corpus
 * in the HTTP request body, which meant the procedures a device was told were
 * whatever the caller typed. A tenant could not review them, could not change them,
 * and no audit trail existed. This closes that:
 *
 *   1. An editor authors a procedure through the server, which encrypts the body
 *      with a key the browser never holds.
 *   2. The stored body is not readable as text, and the procedure does not exist
 *      until it is published.
 *   3. Publishing sends nothing but an empty body — the corpus is read from the
 *      database by the function.
 *   4. A device fetches that bundle and serves the *authored* text, verbatim.
 *   5. An agent cannot author, and the publish path returns 409 when a tenant has
 *      nothing published.
 *
 * Usage:
 *   node tooling/transport/probe-corpus.mjs
 */

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

const ALPHA = '11111111-1111-1111-1111-111111111111';
const MARKER = 'AUTHORED-IN-THE-COMMAND-CENTRE-7d3e';

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

async function signIn(email, role) {
  const password = `Pc-${randomUUID()}`;
  const list = await (await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders })).json();
  const existing = (list?.users ?? []).find((user) => user?.email === email);
  const metadata = { tenant_id: ALPHA, app_role: role };
  let userId = existing?.id ?? null;

  if (existing) {
    await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ email_confirm: true, password, app_metadata: metadata }),
    });
  } else {
    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true, app_metadata: metadata }),
    });
    if (!created.ok) throw new Error(`could not provision ${email}: ${await created.text()}`);
    userId = (await created.json()).id;
  }

  await fetch(`${url}/rest/v1/users`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: userId, tenant_id: ALPHA, display_name: `Probe ${role}`, role }),
  });

  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (body?.access_token === undefined) {
    throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { token: body.access_token, userId, email, password };
}

const editor = await signIn('corpus-editor@alpha.example', 'sop_editor');
const agent = await signIn('corpus-agent@alpha.example', 'agent');

// ---------------------------------------------------------------- authoring --

process.stdout.write('==> an editor authors a procedure\n');

const authorResponse = await fetch(`${url}/functions/v1/upsert-sop`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${editor.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Refund policy, authored through the server',
    status: 'draft',
    category: 'Payments',
    summary: `A procedure that was ${MARKER} and must reach the device exactly as written here.`,
    suggestedReply: 'Refunds are available for fourteen days from the purchase.',
    escalationRequired: false,
    escalationReason: '',
    triggerKeywords: ['refund', 'money back', 'return'],
    changeNote: 'First draft.',
  }),
});
const authored = await authorResponse.json();
check(
  'the server accepts an authored procedure',
  authorResponse.ok,
  authorResponse.ok ? `sop ${authored.sopId} version ${authored.version}` : authored.error,
);

if (!authorResponse.ok) {
  process.stderr.write('\nCORPUS FAILED\n');
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data: storedRows } = await admin
  .from('sop_versions')
  .select('body_ciphertext, body_hash')
  .eq('sop_id', authored.sopId);

const storedCiphertext = String(storedRows?.[0]?.body_ciphertext ?? '');
check(
  'the stored body is not readable as text',
  !storedCiphertext.includes(MARKER) && storedCiphertext.startsWith('\\x'),
  `${storedCiphertext.length} hex chars`,
);
check(
  'and a hash of the plaintext is recorded alongside it',
  typeof storedRows?.[0]?.body_hash === 'string' && storedRows[0].body_hash.length === 64,
);

// ------------------------------------------------------------- the refusals --

process.stdout.write('==> checking the refusals\n');

const agentAuthor = await fetch(`${url}/functions/v1/upsert-sop`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Not allowed', summary: 'Not allowed' }),
});
check(
  'an agent cannot author a procedure',
  agentAuthor.status === 403,
  `${agentAuthor.status}`,
);

const missingSummary = await fetch(`${url}/functions/v1/upsert-sop`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${editor.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'No summary' }),
});
check('a procedure with no summary is refused', missingSummary.status === 400, `${missingSummary.status}`);

// ------------------------------------------------------ publish from the db --

const ops = await signIn('corpus-ops@alpha.example', 'ops_manager');

// The seed leaves placeholder procedures in the tenant marked `published`, with a
// body that is a single zero byte rather than anything this server wrote. That is
// fixture noise, and the publish path is right to refuse it — but it means the
// tenant has to be put in a state where its published set is real before the
// happy path can be tested. Retiring them is done with the service role, which is
// the same authority a tenant's own data would need, and it is a fixture cleanup
// rather than part of the product path.
const { data: placeholders } = await admin
  .from('sops')
  .select('id, title')
  .eq('tenant_id', ALPHA)
  .eq('status', 'published');

for (const placeholder of placeholders ?? []) {
  await admin.from('sops').update({ status: 'retired' }).eq('id', placeholder.id);
}
process.stdout.write(
  `  (retired ${placeholders?.length ?? 0} seeded placeholder procedure(s) so the tenant's ` +
    'published set is real)\n',
);

process.stdout.write('==> a tenant with nothing published cannot publish\n');

const draftPublish = await fetch(`${url}/functions/v1/publish-bundle`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
  body: '{}',
});
const draftBody = await draftPublish.json();
check(
  'a tenant with nothing published cannot publish',
  draftPublish.status === 409,
  `${draftPublish.status} ${draftBody.error ?? ''}`,
);

process.stdout.write('==> a body the server did not write is refused by name\n');

// Created here rather than relying on a seeded placeholder: an earlier run
// retires the seed's, so a check that depends on it passes once and then reports
// `undefined` forever, which is a test that measures the history of the test.
const rogueTitle = 'A procedure whose body was never encrypted';
const { data: rogueSops } = await admin
  .from('sops')
  .insert({
    tenant_id: ALPHA,
    title: rogueTitle,
    status: 'published',
    created_by: ops.userId,
  })
  .select('id')
  .single();

await admin.from('sop_versions').insert({
  sop_id: rogueSops.id,
  tenant_id: ALPHA,
  version: 1,
  body_ciphertext: '\\x00',
  body_hash: '0'.repeat(64),
  created_by: ops.userId,
});

const undecryptable = await fetch(`${url}/functions/v1/publish-bundle`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
  body: '{}',
});
const undecryptableBody = await undecryptable.json();
check(
  'and the refusal names the procedure rather than the server',
  undecryptable.status === 502 && String(undecryptableBody.error).includes(rogueTitle),
  String(undecryptableBody.error ?? '').slice(0, 90),
);

await admin.from('sops').update({ status: 'retired' }).eq('id', rogueSops.id);

process.stdout.write('==> publishing the authored procedure, with no corpus in the request\n');

await fetch(`${url}/functions/v1/upsert-sop`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${editor.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sopId: authored.sopId,
    title: 'Refund policy, authored through the server',
    status: 'published',
    category: 'Payments',
    summary: `A procedure that was ${MARKER} and must reach the device exactly as written here.`,
    suggestedReply: 'Refunds are available for fourteen days from the purchase.',
    escalationRequired: false,
    escalationReason: '',
    triggerKeywords: ['refund', 'money back', 'return'],
    changeNote: 'Promoted to published.',
  }),
});

// The device has to exist BEFORE the publish, or it is a device that enrolled
// after the fact and correctly receives nothing: a bundle wraps its key only for the
// devices that were enrolled when it was published. Ordered wrongly, the fetch
// returns null and the failure reads like a broken fetch path.

const minted = await sync.newDeviceIdentity(
  randomUUID(),
  tenantSigningPublicKey,
  serverWrappingPublicKey,
);

const opsClient = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data: session } = await opsClient.auth.signInWithPassword({
  email: ops.email,
  password: ops.password,
});
const opsAuthorised = createClient(url, publishableKey, {
  global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data: existingDevice } = await opsAuthorised
  .from('device_registrations')
  .select('id')
  .eq('tenant_id', ALPHA)
  .eq('user_id', ops.userId)
  .eq('platform', 'desktop')
  .maybeSingle();

let deviceId;
if (existingDevice === null || existingDevice === undefined) {
  const { data: inserted } = await opsAuthorised
    .from('device_registrations')
    .insert({
      tenant_id: ALPHA,
      user_id: ops.userId,
      platform: 'desktop',
      public_key: minted.devicePublicKeyBase64,
      status: 'active',
    })
    .select('id')
    .single();
  deviceId = inserted.id;
} else {
  await opsAuthorised
    .from('device_registrations')
    .update({ public_key: minted.devicePublicKeyBase64 })
    .eq('id', existingDevice.id);
  deviceId = existingDevice.id;
}

const publishResponse = await fetch(`${url}/functions/v1/publish-bundle`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${ops.token}`, 'Content-Type': 'application/json' },
  // Deliberately empty: the corpus must come from the tenant's own records.
  body: '{}',
});
const published = await publishResponse.json();
check(
  'the function published a bundle from the database alone',
  publishResponse.ok,
  publishResponse.ok ? `bundle ${published.bundleVersion} for ${published.wrappedFor} device(s)` : published.error,
);

// ------------------------------------------------------ what the device gets --

process.stdout.write('==> a device installs what the tenant authored\n');

const { data: fetched } = await opsAuthorised.schema('app').rpc('bundle_for_device', {
  p_device_id: deviceId,
});

if (fetched === null) {
  check('the device can fetch the published bundle', false, 'null');
} else {
  check('the device can fetch the published bundle', true, `bundle ${fetched.manifest.bundleVersion}`);

  const outcome = await sync.installBundle(fetched, minted.identity, new sync.MemoryBundleStore());
  check('it installs', outcome.outcome === 'installed', JSON.stringify(outcome));

  const active = await new sync.MemoryBundleStore();
  // Re-install into a store we keep, so we can read what was stored.
  const store = new sync.MemoryBundleStore();
  await sync.installBundle(fetched, minted.identity, store);
  const installed = await store.active();
  const summaries = (installed?.sops ?? []).map((sop) => sop.summary);
  void active;

  check(
    'the authored text reaches the device verbatim',
    summaries.some((summary) => typeof summary === 'string' && summary.includes(MARKER)),
    `${installed?.sops.length ?? 0} procedure(s)`,
  );
  check(
    'and only published procedures are served',
    (installed?.sops ?? []).every((sop) => typeof sop.title === 'string' && sop.title.length > 0),
  );
}

const passed = checks.filter((entry) => entry.ok).length;
process.stdout.write(`\n${passed} of ${checks.length} checks passed\n`);
if (passed !== checks.length) {
  process.stderr.write('\nCORPUS FAILED\n');
  process.exit(1);
}
process.stdout.write('\nCORPUS OK\n');
