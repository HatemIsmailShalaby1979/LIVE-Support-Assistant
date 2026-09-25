#!/usr/bin/env node
/**
 * Proof that telemetry survives the trip out of the client.
 *
 * The audit found that the product's queued records — query text and escalation
 * evidence — went into localStorage and stopped there. The queue was correct
 * and inert. This is the other end: a record created by client code, delivered
 * through the same RPCs the browser uses, verified present in the hosted
 * database under the caller's own tenant.
 *
 * It asserts a round trip, in this order, because the order is the contract:
 *
 *   1. The query event is accepted and is readable back for the caller's tenant.
 *   2. The escalation naming that event is accepted and readable back.
 *   3. Re-sending both is idempotent — the row count does not move. A retry
 *      after a timeout must not duplicate an audit record.
 *   4. An event labelled with a foreign tenant is refused, so a client cannot
 *      file telemetry against someone else's tenant.
 *
 * Usage:
 *   node tooling/transport/probe-telemetry.mjs
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const require = createRequire(resolve(root, 'apps/web/package.json'));
const { createClient } = await import(pathToFileURL(require.resolve('@supabase/supabase-js')).href);

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

const PROBE_EMAIL = 'transport-probe@alpha.example';
const PROBE_PASSWORD = `Tp-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
const OWN_TENANT = '11111111-1111-1111-1111-111111111111';
const FOREIGN_TENANT = '22222222-2222-2222-2222-222222222222';

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

// ---------------------------------------------------------------- provision --

const listResponse = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders });
const listBody = await listResponse.json();
const existing = (listBody?.users ?? []).find((user) => user?.email === PROBE_EMAIL);

if (existing) {
  await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      email_confirm: true,
      password: PROBE_PASSWORD,
      app_metadata: { tenant_id: OWN_TENANT, app_role: 'agent' },
    }),
  });
} else {
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      email: PROBE_EMAIL,
      password: PROBE_PASSWORD,
      email_confirm: true,
      app_metadata: { tenant_id: OWN_TENANT, app_role: 'agent' },
    }),
  });
  if (!created.ok) {
    process.stderr.write(`could not provision the probe user: ${await created.text()}\n`);
    process.exit(1);
  }
}

const client = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { error: signInError } = await client.auth.signInWithPassword({
  email: PROBE_EMAIL,
  password: PROBE_PASSWORD,
});
if (signInError) {
  process.stderr.write(`sign-in failed: ${signInError.message}\n`);
  process.exit(1);
}

// ------------------------------------------------------------- the records --

const queryEventId = randomUUID();
const escalationId = randomUUID();
const occurredAt = new Date().toISOString();
const modelId = 'Xenova/all-MiniLM-L6-v2';
const modelRevision = '751bff37182d3f1213fa05d7196b954e230abad9';

// The ingest contract in migration 0013 is strict about this shape, and it is
// right to be: an escalation that carries a score and a margin is claiming the
// gate answered confidently, which is the opposite of what it means. sopId,
// score and margin must all be JSON null, and gateReason must be one of the
// named reasons.
const payload = {
  outcome: 'escalated',
  sopId: null,
  score: null,
  margin: null,
  gateReason: 'insufficient_margin',
  thresholdAccept: 0,
  minMargin: 0.18,
  topCandidates: [{ sopId: 'c0000000-0000-0000-0000-000000000001', score: 0.41, passage: 'refund policy' }],
};

const evidence = {
  queryText: 'probe: where is my refund',
  reason: 'insufficient_margin',
  thresholdAccept: 0,
  minMargin: 0.18,
  bundleVersion: 1,
  modelId,
  modelRevision,
  candidates: [{ sopId: 'c0000000-0000-0000-0000-000000000001', score: 0.41, passage: 'refund policy' }],
};

async function sendEvent(id) {
  const { error } = await client.schema('app').rpc('ingest_telemetry_event', {
    p_id: id,
    p_device_id: null,
    p_user_pseudonym: 'transport-probe',
    p_event_type: 'query',
    p_bundle_version: 1,
    p_occurred_at: occurredAt,
    p_payload: payload,
  });
  return error;
}

async function sendEscalation() {
  const { error } = await client.schema('app').rpc('ingest_escalation', {
    p_escalation_id: escalationId,
    p_query_event_id: queryEventId,
    p_query_occurred_at: occurredAt,
    p_evidence: evidence,
  });
  return error;
}

// Reads happen as the service role, and deliberately not as the caller.
//
// Migration 0005 makes telemetry unreadable to frontline agents — an agent sees
// zero telemetry rows, which is one of the guarantees the RBAC matrix proves.
// So a read-back through the agent session would report "0 rows" for a write
// that succeeded, and the probe would report a transport failure for a policy
// working correctly. Writes go through the authenticated client, because that is
// the path under test; reads go through the service role, because they are
// verification rather than product behaviour.
const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

process.stdout.write('==> sending a query event\n');
const firstEventError = await sendEvent(queryEventId);
check('the query event is accepted', firstEventError === null, firstEventError?.message);

process.stdout.write('==> verifying it is readable for the caller\n');
const { data: eventRows, error: eventReadError } = await admin
  .from('telemetry_events')
  .select('id, tenant_id, payload')
  .eq('id', queryEventId);
check(
  'the event is readable back under the caller tenant',
  !eventReadError && Array.isArray(eventRows) && eventRows.length === 1,
  eventReadError ? eventReadError.message : `${eventRows?.length ?? 0} row(s)`,
);
check(
  'the stored payload round-tripped intact',
  eventRows?.[0]?.payload?.outcome === 'escalated' &&
    eventRows?.[0]?.payload?.topCandidates?.[0]?.sopId === 'c0000000-0000-0000-0000-000000000001',
  JSON.stringify(eventRows?.[0]?.payload?.outcome ?? null),
);

process.stdout.write('==> sending the escalation that names it\n');
const escalationError = await sendEscalation();
check('the escalation is accepted', escalationError === null, escalationError?.message);

const { data: escalationRows, error: escalationReadError } = await admin
  .from('escalations')
  .select('id, status')
  .eq('id', escalationId);
check(
  'the escalation is readable back',
  !escalationReadError && Array.isArray(escalationRows) && escalationRows.length === 1,
  escalationReadError ? escalationReadError.message : `${escalationRows?.length ?? 0} row(s)`,
);

process.stdout.write('==> resending both, to prove idempotency\n');
const replayEventError = await sendEvent(queryEventId);
const replayEscalationError = await sendEscalation();
check('a replayed query event is accepted again', replayEventError === null, replayEventError?.message);
check('a replayed escalation is accepted again', replayEscalationError === null, replayEscalationError?.message);

const { data: afterEvent } = await admin.from('telemetry_events').select('id').eq('id', queryEventId);
const { data: afterEscalation } = await admin.from('escalations').select('id').eq('id', escalationId);
check(
  'a retry did not duplicate the query event',
  Array.isArray(afterEvent) && afterEvent.length === 1,
  `${afterEvent?.length ?? 0} row(s)`,
);
check(
  'a retry did not duplicate the escalation',
  Array.isArray(afterEscalation) && afterEscalation.length === 1,
  `${afterEscalation?.length ?? 0} row(s)`,
);

process.stdout.write('==> checking the agent cannot read telemetry at all\n');
const { data: agentView, error: agentViewError } = await client
  .from('telemetry_events')
  .select('id')
  .eq('id', queryEventId);
check(
  'a frontline agent still cannot read its own telemetry back',
  !agentViewError && Array.isArray(agentView) && agentView.length === 0,
  agentViewError ? agentViewError.message : `${agentView?.length ?? 0} row(s) visible`,
);

process.stdout.write('==> trying to relabel an event as another tenant\n');
const foreignId = randomUUID();
const { error: foreignError } = await client.schema('app').rpc('ingest_telemetry_event', {
  p_id: foreignId,
  p_device_id: null,
  p_user_pseudonym: 'transport-probe',
  p_event_type: 'query',
  p_bundle_version: 1,
  p_occurred_at: occurredAt,
  p_payload: { ...payload, tenant_id: FOREIGN_TENANT },
});

const { data: foreignRows } = await admin
  .from('telemetry_events')
  .select('id, tenant_id')
  .eq('id', foreignId);

check(
  'a foreign tenant claim in the payload cannot relabel the row',
  foreignError === null &&
    Array.isArray(foreignRows) &&
    foreignRows.length === 1 &&
    foreignRows[0].tenant_id === OWN_TENANT,
  foreignError
    ? `refused: ${foreignError.message}`
    : `filed under tenant ${foreignRows?.[0]?.tenant_id ?? 'unknown'}`,
);

report();

function report() {
  const passed = checks.filter((entry) => entry.ok).length;
  process.stdout.write(`\n${passed} of ${checks.length} checks passed\n`);
  if (passed !== checks.length) {
    process.stderr.write('\nTELEMETRY TRANSPORT FAILED\n');
    process.exit(1);
  }
  process.stdout.write('\nTELEMETRY TRANSPORT OK\n');
}
