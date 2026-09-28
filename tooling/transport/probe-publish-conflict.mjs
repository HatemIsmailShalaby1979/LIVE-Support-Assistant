#!/usr/bin/env node
/**
 * Smoke test of the publish conflict block against the DEV Supabase project.
 *
 * This is the real wire, not a unit test. It provisions a dedicated, fictional
 * "simulated" tenant (the whole dev project is data_mode "simulated"; the
 * tenants table carries no data_mode column, so the tag is the project plus the
 * name we give the row), authors procedures through the live upsert-sop edge
 * function, then calls the live publish-bundle edge function — which assembles
 * its corpus from the tenant's own published procedures in the database, runs
 * the conflict lint, and either signs a bundle or returns 422.
 *
 * Coverage (mirrors the owner's brief):
 *   A   clean 7-procedure simulated corpus                       -> expect 200
 *   B   clean corpus + injected wc-payout-conflict              -> expect 422
 *   B'  confirm no policy_bundles row was created for the block
 *   C1  two procedures in one category stating the same window  -> expect 200 (no FP)
 *   C2  a procedure whose routing text says "more than seven
 *       business days" (same category)                          -> expect 200 (no FP)
 *   C3  two procedures in one category with unrelated numbers   -> expect 200 (no FP)
 *
 * Usage:
 *   node tooling/transport/probe-publish-conflict.mjs
 *
 * Exit code is 0 only when every scenario matched its expectation. Any deviation
 * is reported in full so a real deviation from the design is visible, not hidden.
 */

import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------------------------------------------------------- env ----
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

// A fixed UUID so re-runs are idempotent; fictional data only.
const SIM_TENANT = '9b3f1c2a-7e6d-4f5a-8b1c-0d2e4f6a8b0c';
const SIM_TENANT_NAME = 'simulated-publish-conflict-smoke';

// ---------------------------------------------------------------- http ----
const adminHeaders = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
};

async function restAdmin(method, table, query, body) {
  const res = await fetch(`${url}/rest/v1/${table}${query ?? ''}`, {
    method,
    headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text === '' ? null : JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function authAdmin(method, path, body) {
  const res = await fetch(`${url}/auth/v1/${path}`, {
    method,
    headers: adminHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text === '' ? null : JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function restUser(token, method, table, query, body) {
  const res = await fetch(`${url}/rest/v1/${table}${query ?? ''}`, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text === '' ? null : JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function fn(token, name, body) {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text === '' ? null : JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

// ---------------------------------------------------------------- setup ----
const results = [];
function record(name, expect, status, json, note) {
  const ok = status === expect;
  results.push({ name, expect, status, ok, note });
  const flag = ok ? 'OK  ' : 'DIFF';
  process.stdout.write(
    `  [${flag}] ${name}: HTTP ${status} (expect ${expect})` +
      (note ? `  — ${note}` : '') + '\n',
  );
}

async function ensureTenant() {
  const { status, json } = await restAdmin('post', 'tenants?on_conflict=id', '', {
    id: SIM_TENANT,
    name: SIM_TENANT_NAME,
    threshold: 0,
    min_margin: 0.15,
    plan: 'standard',
  });
  // A 409/error on conflict is fine; we upsert by id.
  if (status >= 400 && status !== 409) {
    process.stderr.write(`  (ensureTenant note: ${status} ${JSON.stringify(json)})\n`);
  }
}

async function signIn(email, role) {
  const password = `Sp-${randomUUID()}`;
  const list = await authAdmin('get', 'admin/users?page=1&per_page=1000');
  const existing = (list.json?.users ?? []).find((u) => u.email === email);
  let userId;
  if (existing) {
    await authAdmin('put', `admin/users/${existing.id}`, {
      email_confirm: true,
      password,
      app_metadata: { tenant_id: SIM_TENANT, app_role: role },
    });
    userId = existing.id;
  } else {
    const created = await authAdmin('post', 'admin/users', {
      email,
      password,
      email_confirm: true,
      app_metadata: { tenant_id: SIM_TENANT, app_role: role },
    });
    if (created.status >= 400) {
      throw new Error(`could not provision ${email}: ${JSON.stringify(created.json)}`);
    }
    userId = created.json.id;
  }
  await restAdmin('post', 'users', '', {
    id: userId,
    tenant_id: SIM_TENANT,
    display_name: `Smoke ${role}`,
    role,
  });
  const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await resp.json();
  if (body?.access_token === undefined) {
    throw new Error(`sign-in failed for ${email}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return { token: body.access_token, userId, email, password };
}

let devicePublicKeyBase64 = '';
async function ensureDevice(ops) {
  const kp = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  devicePublicKeyBase64 = Buffer.from(raw).toString('base64');

  const existing = await restUser(
    ops.token,
    'get',
    'device_registrations',
    `?tenant_id=eq.${SIM_TENANT}&user_id=eq.${ops.userId}&platform=eq.desktop`,
  );
  if (!Array.isArray(existing.json) || existing.json.length === 0) {
    const ins = await restUser(ops.token, 'post', 'device_registrations', '', {
      id: randomUUID(),
      tenant_id: SIM_TENANT,
      user_id: ops.userId,
      platform: 'desktop',
      public_key: devicePublicKeyBase64,
      status: 'active',
    });
    if (ins.status >= 400) {
      throw new Error(`device enrolment failed: ${ins.status} ${JSON.stringify(ins.json)}`);
    }
  }
}

async function wipeSops() {
  await restAdmin('delete', 'sops', `?tenant_id=eq.${SIM_TENANT}`);
}

async function upsertProcedures(editor, sops) {
  const out = [];
  for (const sop of sops) {
    const res = await fn(editor.token, 'upsert-sop', {
      title: sop.title,
      status: 'published',
      category: sop.category,
      summary: sop.summary,
      suggestedReply: sop.suggestedReply,
      escalationRequired: !!sop.escalationRequired,
      escalationReason: sop.escalationReason ?? '',
      triggerKeywords: sop.triggerKeywords ?? [],
      changeNote: 'simulated publish-conflict smoke',
    });
    out.push({ status: res.status, json: res.json, id: sop.id });
  }
  return out;
}

async function publish(ops) {
  return fn(ops.token, 'publish-bundle', {});
}

async function countBundles() {
  const res = await restAdmin('get', 'policy_bundles', `?tenant_id=eq.${SIM_TENANT}&select=id,bundle_version`);
  return Array.isArray(res.json) ? res.json.length : 0;
}

// ---------------------------------------------------------------- data ----
const corpusDoc = JSON.parse(
  readFileSync(resolve(root, 'tooling/eval/simulated-tenant/corpus.json'), 'utf8'),
);
const cleanSops = corpusDoc.sops;

const batch = JSON.parse(
  readFileSync(resolve(root, 'tooling/eval/simulated-tenant/chaos-500.json'), 'utf8'),
);
const ticket = batch.tickets.find((c) => c.ticketId === 'SIM-TICKET-00272');
const conflictSop = ticket?.testEnvironment?.additionalSops?.[0];
if (conflictSop === undefined) throw new Error('SIM-TICKET-00272 injected SOP missing');

// ---------------------------------------------------------------- run ----
async function main() {
  process.stdout.write(`==> dev publish conflict smoke (tenant ${SIM_TENANT}, data_mode simulated)\n`);
  await ensureTenant();
  const editor = await signIn('smoke-editor@example.com', 'sop_editor');
  const ops = await signIn('smoke-ops@example.com', 'ops_manager');
  await ensureDevice(ops);
  process.stdout.write('  (tenant, editor, ops and device ready)\n');

  // ---- A: clean corpus -> 200 -----------------------------------------
  process.stdout.write('==> A: clean 7-procedure corpus\n');
  await wipeSops();
  const aUpsert = await upsertProcedures(editor, cleanSops);
  const aUpsertFail = aUpsert.filter((u) => u.status >= 400);
  if (aUpsertFail.length) {
    process.stderr.write(`  upsert failures: ${JSON.stringify(aUpsertFail)}\n`);
  }
  const aBefore = await countBundles();
  const aPub = await publish(ops);
  record('A clean publish', 200, aPub.status, aPub.json);
  const aAfter = await countBundles();
  record(
    'A bundle row created',
    aBefore + 1,
    aAfter,
    null,
    `bundles ${aBefore} -> ${aAfter}`,
  );

  // ---- B: conflict corpus -> 422, no bundle row -----------------------
  process.stdout.write('==> B: clean corpus + wc-payout-conflict\n');
  await wipeSops();
  await upsertProcedures(editor, [...cleanSops, conflictSop]);
  const bBefore = await countBundles();
  const bPub = await publish(ops);
  record('B conflict publish', 422, bPub.status, bPub.json);
  const bAfter = await countBundles();
  record(
    'B no bundle row for the block',
    bBefore,
    bAfter,
    null,
    `bundles ${bBefore} -> ${bAfter}`,
  );
  if (bPub.status === 422) {
    process.stdout.write(
      `  conflict detail: ${typeof bPub.json === 'object' ? bPub.json?.detail ?? '' : ''}\n`,
    );
    const conflicts = (bPub.json && bPub.json.conflicts) || [];
    for (const c of conflicts) {
      process.stdout.write(`    - category "${c.category}" field "${c.key}": ` +
        `${c.left.sopId} vs ${c.right.sopId}\n`);
    }
  }

  // ---- C1: same window stated twice -----------------------------------
  process.stdout.write('==> C1: same window stated twice (same category)\n');
  await wipeSops();
  const c1 = [
    ...cleanSops,
    {
      id: 'wc-payout-dup',
      title: 'Creator Payout Timing — Duplicate Standard',
      category: 'Creator payouts',
      triggerKeywords: ['payout', 'deposit'],
      summary: 'A creator payout marked processed takes two to five business days to arrive.',
      suggestedReply: 'Payouts arrive in two to five business days.',
      escalationRequired: false,
      escalationReason: '',
    },
  ];
  await upsertProcedures(editor, c1);
  const c1Pub = await publish(ops);
  record('C1 same-window-twice publish', 200, c1Pub.status, c1Pub.json,
    c1Pub.status === 422 ? 'FALSE POSITIVE' : 'no FP');

  // ---- C2: "more than seven business days" routing text ---------------
  process.stdout.write('==> C2: routing text "more than seven business days" (same category)\n');
  await wipeSops();
  const c2 = [
    ...cleanSops,
    {
      id: 'wc-payout-route',
      title: 'Creator Payout — Late Routing',
      category: 'Creator payouts',
      triggerKeywords: ['payout', 'late'],
      summary: 'If a creator payout is more than seven business days late, route it to Payments for review.',
      suggestedReply: 'Escalate payouts older than seven business days to Payments.',
      escalationRequired: true,
      escalationReason: 'Late payout needs Payments review.',
    },
  ];
  await upsertProcedures(editor, c2);
  const c2Pub = await publish(ops);
  record('C2 routing-text publish', 200, c2Pub.status, c2Pub.json,
    c2Pub.status === 422 ? 'FALSE POSITIVE' : 'no FP');

  // ---- C3: same category, unrelated numbers ---------------------------
  process.stdout.write('==> C3: same category, unrelated numbers (different fact keys)\n');
  await wipeSops();
  const c3 = [
    {
      id: 'wc-payout-min',
      title: 'Creator Payout Minimum',
      category: 'Creator payouts',
      triggerKeywords: ['payout', 'minimum'],
      summary: 'The minimum creator payout is fifty dollars.',
      suggestedReply: 'Minimum payout is $50.',
      escalationRequired: false,
      escalationReason: '',
    },
    {
      id: 'wc-payout-fee',
      title: 'Creator Payout Processing Fee',
      category: 'Creator payouts',
      triggerKeywords: ['payout', 'fee'],
      summary: 'A processed creator payout usually arrives within three business days.',
      suggestedReply: 'Payouts arrive in three business days.',
      escalationRequired: false,
      escalationReason: '',
    },
  ];
  await upsertProcedures(editor, c3);
  const c3Pub = await publish(ops);
  record('C3 unrelated-numbers publish', 200, c3Pub.status, c3Pub.json,
    c3Pub.status === 422 ? 'FALSE POSITIVE' : 'no FP');

  // ---------------------------------------------------------------- report ----
  process.stdout.write('\n== smoke summary ==\n');
  for (const r of results) {
    process.stdout.write(
      `  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (got ${r.status}, want ${r.expect}` +
        (r.note ? `, ${r.note}` : '') + ')\n',
    );
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    process.stderr.write(`\nSMOKE DEVIATION: ${failed.length} scenario(s) did not match expectation\n`);
    process.exit(1);
  }
  process.stdout.write('\nSMOKE OK\n');
}

main().catch((err) => {
  process.stderr.write(`\nSMOKE ERROR: ${err?.stack || err?.message || String(err)}\n`);
  process.exit(1);
});
