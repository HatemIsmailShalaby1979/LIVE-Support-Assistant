#!/usr/bin/env node
/**
 * Provision the fixture principals on a hosted Supabase project.
 *
 * The SQL suites need seven users to exist. Locally the auth shim lets the seed
 * invent their UUIDs. Hosted, `public.users.id` references `auth.users(id)`, that
 * table belongs to GoTrue, and `postgres` has neither CREATE on the auth schema
 * nor membership of the role that owns it — both proven, not assumed. The only
 * supported door is the Auth Admin API, and it assigns its own UUID.
 *
 * So this creates the users, then writes the mapping the suites are invoked
 * with. It prints nothing secret: the generated passwords are never stored and
 * never displayed, because nothing ever needs to log in as these accounts — the
 * suites assert claims directly, as a request from GoTrue would.
 *
 * Usage:
 *   node tooling/db/provision-hosted-fixtures.mjs
 *
 * Reads SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) from
 * the environment or .env.local, and writes the mapping to
 * supabase/.temp/fixture-uuids.env, which is gitignored.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Key order matches the seed's, and the suite variable names. */
const PRINCIPALS = [
  ['alpha_ops', 'ops@alpha.example'],
  ['alpha_editor', 'editor@alpha.example'],
  ['alpha_lead', 'lead@alpha.example'],
  ['alpha_agent', 'agent@alpha.example'],
  ['alpha_auditor', 'auditor@alpha.example'],
  ['beta_ops', 'ops@beta.example'],
  ['beta_agent', 'agent@beta.example'],
];

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
const url = (process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL ?? '').replace(/\/+$/, '');
const key =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  fileEnv.SUPABASE_SECRET_KEY ??
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ??
  '';

if (url === '' || key === '') {
  process.stderr.write(
    'need SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)\n' +
      'in the environment or .env.local\n',
  );
  process.exit(2);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function call(path, options) {
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: response.status, body };
}

async function listUsers() {
  const found = new Map();
  for (let page = 1; page <= 10; page += 1) {
    const { status, body } = await call(`/auth/v1/admin/users?page=${page}&per_page=1000`, {
      method: 'GET',
    });
    if (status !== 200) {
      throw new Error(`listing users failed with ${status}: ${JSON.stringify(body)}`);
    }
    const users = body?.users ?? [];
    for (const user of users) {
      if (typeof user?.email === 'string') found.set(user.email, user.id);
    }
    if (users.length < 1000) break;
  }
  return found;
}

async function resolvePrincipal(email, existing) {
  const known = existing.get(email);
  if (known) return { id: known, created: false };

  // A throwaway password, generated and discarded. Nothing logs in as these.
  const password = `Fx-${randomBytes(24).toString('base64url')}`;

  const { status, body } = await call('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (status === 200 || status === 201) {
    if (typeof body?.id !== 'string') {
      throw new Error(`${email}: created but the response carried no id`);
    }
    return { id: body.id, created: true };
  }

  // Already registered under a different shape than we detect, or a transient
  // conflict. Fall back to a listing rather than guessing.
  const after = await listUsers();
  const found = after.get(email);
  if (found) return { id: found, created: false };

  throw new Error(`${email}: could not create or find the user (HTTP ${status}) ${JSON.stringify(body)}`);
}

const existing = await listUsers();
const mapping = [];
const failures = [];

for (const [name, email] of PRINCIPALS) {
  try {
    const { id, created } = await resolvePrincipal(email, existing);
    mapping.push([name, id]);
    process.stdout.write(`  ${created ? 'created' : 'existing'}  ${email}  ${id}\n`);
  } catch (error) {
    failures.push(String(error instanceof Error ? error.message : error));
  }
}

if (failures.length > 0) {
  process.stderr.write(`\ncould not provision every principal:\n${failures.map((f) => `  ${f}\n`).join('')}`);
  process.exit(1);
}

const outDir = resolve(root, 'supabase/.temp');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'fixture-uuids.env');
writeFileSync(
  outPath,
  `${mapping.map(([name, id]) => `${name}=${id}`).join('\n')}\n`,
  'utf8',
);

process.stdout.write(`\nwrote ${mapping.length} principal UUIDs to supabase/.temp/fixture-uuids.env\n`);
