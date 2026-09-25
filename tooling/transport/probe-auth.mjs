#!/usr/bin/env node
/**
 * Proof that an authenticated browser session can reach the server and that the
 * server knows who it is.
 *
 * The production-readiness audit's central finding was that `apps/web` contained
 * no network call of any kind, so nothing in the product could know a tenant
 * existed. This is the smallest honest end of that: a real Supabase sign-in, a
 * real JWT, a real PostgREST call into the `app` schema, and the tenant the
 * *server* attributes to the session.
 *
 * It asserts three things, and the third is the one that matters:
 *
 *   1. A provisioned principal can sign in with a password.
 *   2. With that session, app.current_tenant() returns the tenant the server
 *      believes the caller belongs to.
 *   3. Without a session, the same call is refused.
 *
 * If (3) ever starts passing, the boundary is gone.
 *
 * Usage:
 *   node tooling/transport/probe-auth.mjs
 *
 * Reads SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY from the
 * environment or .env.local.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// @supabase/supabase-js is a dependency of @sop/web, not of the tooling tree, so
// resolve it from there rather than duplicating the dependency at the root.
const require = createRequire(resolve(root, 'apps/web/package.json'));
const entry = require.resolve('@supabase/supabase-js');
const { createClient } = await import(pathToFileURL(entry).href);

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
  process.stderr.write(
    'need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in the environment or .env.local\n',
  );
  process.exit(2);
}

// The principal this probe authenticates as. Created on demand with a throwaway
// password, and never used for anything else.
const PROBE_EMAIL = 'transport-probe@alpha.example';
const PROBE_PASSWORD = `Tp-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
const PROBE_TENANT = '11111111-1111-1111-1111-111111111111';
const PROBE_ROLE = 'agent';

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}\n`);
}

const adminHeaders = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------- provision --

process.stdout.write('==> provisioning the probe principal\n');

const listResponse = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, {
  headers: adminHeaders,
});
const listBody = await listResponse.json();
const existing = (listBody?.users ?? []).find((user) => user?.email === PROBE_EMAIL);

let probeUserId = existing?.id ?? null;

async function writeMetadata(userId) {
  const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      email_confirm: true,
      password: PROBE_PASSWORD,
      app_metadata: { tenant_id: PROBE_TENANT, app_role: PROBE_ROLE },
    }),
  });
  if (!response.ok) {
    throw new Error(`could not set metadata on ${userId}: HTTP ${response.status} ${await response.text()}`);
  }
}

if (existing) {
  await writeMetadata(existing.id);
  process.stdout.write(`  reused ${existing.id}\n`);
} else {
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      email: PROBE_EMAIL,
      password: PROBE_PASSWORD,
      email_confirm: true,
      app_metadata: { tenant_id: PROBE_TENANT, app_role: PROBE_ROLE },
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`could not create the probe user: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  probeUserId = body.id;
  process.stdout.write(`  created ${probeUserId}\n`);
}

check('probe principal exists on the platform', typeof probeUserId === 'string', probeUserId ?? '');

// ------------------------------------------------------------------- sign in --

process.stdout.write('==> signing in\n');

const client = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data: session, error: signInError } = await client.auth.signInWithPassword({
  email: PROBE_EMAIL,
  password: PROBE_PASSWORD,
});

check(
  'a real sign-in returns a session',
  !signInError && typeof session?.session?.access_token === 'string',
  signInError ? signInError.message : 'access token issued',
);

if (signInError || !session?.session) {
  report();
  process.exit(1);
}

check(
  'the access token is a real JWT, not an opaque handle',
  session.session.access_token.split('.').length === 3,
);

// ------------------------------------------------------------ the RPC calls --

process.stdout.write('==> calling app.current_tenant() with that session\n');

const { data: tenant, error: tenantError } = await client
  .schema('app')
  .rpc('current_tenant');

if (tenantError) {
  check('app.current_tenant() is reachable', false, tenantError.message);
  process.stdout.write(
    '\n  If this says the function could not be found, the hosted project does not\n' +
      '  expose the app schema. config.toml only configures local `supabase start`;\n' +
      '  on the hosted project this is Settings -> API -> Exposed schemas.\n',
  );
  report();
  process.exit(1);
}

check('app.current_tenant() is reachable', true);
check(
  'the server attributes the session to the right tenant',
  tenant === PROBE_TENANT,
  `got ${tenant}`,
);

const { data: role, error: roleError } = await client.schema('app').rpc('current_role');
check(
  'the server attributes the session to the right role',
  !roleError && role === PROBE_ROLE,
  roleError ? roleError.message : `got ${role}`,
);

// -------------------------------------------------------------- the boundary --

process.stdout.write('==> calling app.current_tenant() with no session\n');

const anonymous = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data: anonTenant, error: anonError } = await anonymous.schema('app').rpc('current_tenant');

check(
  'an unauthenticated caller is refused',
  anonError !== null || anonTenant === null,
  anonError ? anonError.message : 'returned null',
);

report();

// --------------------------------------------------------------------------- --

function report() {
  const passed = checks.filter((entry) => entry.ok).length;
  process.stdout.write(`\n${passed} of ${checks.length} checks passed\n`);
  const failed = checks.filter((entry) => !entry.ok);
  if (failed.length > 0) {
    process.stderr.write('\nAUTH TRANSPORT FAILED\n');
    process.exit(1);
  }
  process.stdout.write('\nAUTH TRANSPORT OK\n');
}
