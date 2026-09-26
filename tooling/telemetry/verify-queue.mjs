#!/usr/bin/env node
/**
 * Phase 7 verification — telemetry queue hardening.
 *
 * Three failures the Phase 5 prototype would have had, each attacked here:
 *
 *   1. a transport error lost everything sent after it
 *      → per-item attempts; a failed item stays queued with backoff
 *   2. an offline client buffered without bound
 *      → oldest query events shed past a cap, with a flag raised; escalation
 *        records are never shed — the backlog is surfaced instead
 *   3. a poison item blocked the whole queue
 *      → a failure no longer prevents later items in the same pass from sending
 *
 * The clock is injected (`flush(transport, now)`), so backoff is tested in
 * deterministic virtual time — no sleeping.
 *
 * Self-contained: compiles apps/web/src/telemetry.ts to a scratch ESM build,
 * stubs localStorage, then runs.
 *
 * Run: node tooling/telemetry/verify-queue.mjs   (after `pnpm build`)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

function uuid(value) {
  const hex = createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---- compile the queue module to a scratch ESM build ----
const outDir = resolve(here, '.build');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'package.json'), JSON.stringify({ type: 'module' }));

// node + tsc.js directly: spawning through a shell (cmd.exe) hits the
// intermittent EBUSY on this host, and tsc is not installed at the root.
// pnpm keeps typescript inside per-package node_modules or the .pnpm store.
function findTsc() {
  const candidates = [
    resolve(root, 'node_modules/typescript/bin/tsc'),
    resolve(root, 'apps/web/node_modules/typescript/bin/tsc'),
  ];

  const store = resolve(root, 'node_modules/.pnpm');

  try {
    for (const entry of readdirSync(store)) {
      if (entry.startsWith('typescript@')) {
        candidates.push(resolve(store, entry, 'node_modules/typescript/bin/tsc'));
      }
    }
  } catch {
    // no store — the direct candidates above still apply
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

const tscBin = findTsc();

if (tscBin === null) {
  console.error('typescript compiler not found — run pnpm install');
  process.exit(1);
}

// SOP_SKIP_COMPILE=1: the caller compiled already. Spawning a compiler from
// inside this harness fails with EBUSY when another build runs concurrently.
if (process.env.SOP_SKIP_COMPILE !== '1' || !existsSync(resolve(outDir, 'telemetry.js'))) {
  execFileSync(
    process.execPath,
    [
      tscBin,
      resolve(root, 'apps/web/src/telemetry.ts'),
      '--outDir',
      outDir,
      '--target',
      'es2022',
      '--module',
      'es2022',
      '--moduleResolution',
      'bundler',
      '--skipLibCheck',
      '--strict',
    ],
    { cwd: root, stdio: 'inherit' },
  );
}

// ---- localStorage stub, installed before the module is imported ----
const backing = new Map();

globalThis.localStorage = {
  getItem: (key) => (backing.has(key) ? backing.get(key) : null),
  setItem: (key, value) => backing.set(key, String(value)),
  removeItem: (key) => backing.delete(key),
  clear: () => backing.clear(),
};

const { TelemetryQueue, MAX_EVENTS, MAX_ESCALATIONS } = await import(
  pathToFileURL(resolve(outDir, 'telemetry.js')).href
);

// ---- test doubles ----
function event(id) {
  return {
    id: uuid(id),
    deviceId: null,
    userPseudonym: 'test',
    eventType: 'query',
    bundleVersion: 1,
    occurredAt: '2026-09-25T00:00:00Z',
    payload: { outcome: 'answered', sopId: null, score: null, margin: null, gateReason: null, thresholdAccept: 0, minMargin: 0.15, topCandidates: [] },
  };
}

function escalation(id, queryEventId) {
  return {
    escalationId: uuid(id),
    queryEventId: uuid(queryEventId),
    queryOccurredAt: '2026-09-25T00:00:00Z',
    evidence: { queryText: 'q', reason: 'no_candidates', thresholdAccept: 0, minMargin: 0.15, bundleVersion: 1, modelId: 'm', modelRevision: 'r', candidates: [] },
  };
}

function recordingTransport() {
  const sentEvents = [];
  const sentEscalations = [];
  return {
    sentEvents,
    sentEscalations,
    async sendEvent(e) { sentEvents.push(e.id); },
    async sendEscalation(r) { sentEscalations.push(r.escalationId); },
  };
}

function rejectingTransport(shouldReject) {
  return {
    async sendEvent(e) { if (shouldReject(e)) throw new Error('transport down'); },
    async sendEscalation(r) { if (shouldReject(r)) throw new Error('transport down'); },
  };
}

const checks = [];

function expect(name, expected, observed, ok) {
  checks.push({ name, expected: String(expected), observed: String(observed), ok: Boolean(ok) });
}

// ---- 10. the scheduler's contract, without a clock or a browser ----
//
// The app drains the queue on an interval and on `visibilitychange`, and the only
// part of that worth a test is the decision it makes: *is anything due?* Both the
// interval and the tab-hiding handler call the same guard, so a tick is a no-op
// unless `due()` is positive. Getting that wrong is what the guard exists to prevent
// — a poisoned item must back off rather than be retried every tick, and an empty
// queue must not produce a request at all.
{
  // The queue loads from a shared fake localStorage, so every construction has to
  // start from an empty backing store or it inherits the previous block's items.
  backing.clear();
  const empty = new TelemetryQueue();
  expect('an empty queue has nothing due, so a tick is a no-op', 0, empty.due(1_000), empty.due(1_000) === 0);

  backing.clear();
  const queued = new TelemetryQueue();
  queued.enqueueEvent(event('sched-1'));
  expect('a freshly enqueued record is due immediately', 1, queued.due(1_000), queued.due(1_000) === 1);

  // A failed send is what puts an item into backoff, and that is the state a
  // repeating tick has to respect. Waiting for real time is not acceptable in a
  // harness, so the clock is passed explicitly, which is why `due` and `flush` take
  // one at all.
  backing.clear();
  const poison = new TelemetryQueue();
  poison.enqueueEvent(event('sched-2'));
  const refusing = {
    async sendEvent() { throw new Error('transport down'); },
    async sendEscalation() { throw new Error('transport down'); },
  };
  const failed = await poison.flush(refusing, 1_000);
  expect('the failed item is not due again immediately', 0, poison.due(1_000), poison.due(1_000) === 0);
  expect(
    'and it becomes due again once its backoff has elapsed',
    1,
    poison.due(1_000 + 60_000),
    poison.due(1_000 + 60_000) === 1,
  );
  expect('the failed flush reported it rather than losing it', 1, failed.failed, failed.failed === 1);
}


// ---- 1. clean drain ----
  backing.clear();
{
  const queue = new TelemetryQueue();
  const transport = recordingTransport();
  queue.enqueueEvent(event('e1'));
  queue.enqueueEvent(event('e2'));
  queue.enqueueEvent(event('e3'));

  expect('enqueue counts all pending items', 3, queue.pending, queue.pending === 3);

  const result = await queue.flush(transport, 0);
  expect('clean flush sends every event', 3, result.eventsSent, result.eventsSent === 3);
  expect('clean flush leaves nothing queued', 0, result.remaining, result.remaining === 0);
  expect('transport received every event in order', `${uuid('e1')},${uuid('e2')},${uuid('e3')}`,
    transport.sentEvents.join(','),
    transport.sentEvents.join(',') === `${uuid('e1')},${uuid('e2')},${uuid('e3')}`);
}

// ---- 2. events flush before escalations ----
  backing.clear();
{
  const queue = new TelemetryQueue();
  const transport = recordingTransport();
  queue.enqueueEscalation(escalation('esc-1', 'evt-9'));
  queue.enqueueEvent(event('evt-9'));

  await queue.flush(transport, 0);
  const order = [...transport.sentEvents, ...transport.sentEscalations].join(',');
  expect('the query event is sent before the escalation naming it', `${uuid('evt-9')},${uuid('esc-1')}`, order,
    order === `${uuid('evt-9')},${uuid('esc-1')}`);
}

// ---- 3. total outage: nothing is lost, everything is deferred ----
  backing.clear();
{
  const queue = new TelemetryQueue();
  const down = rejectingTransport(() => true);
  queue.enqueueEvent(event('e1'));
  queue.enqueueEvent(event('e2'));
  queue.enqueueEscalation(escalation('esc-1', 'e1'));

  const result = await queue.flush(down, 0);
  expect('failed flush reports every item as failed', 3, result.failed, result.failed === 3);
  expect('failed flush loses nothing', 3, result.remaining, result.remaining === 3);

  // Backoff defers the first retry by 1s.
  const tooEarly = await queue.flush(down, 500);
  expect('items inside the backoff window are not re-attempted', 0, tooEarly.eventsSent + tooEarly.escalationsSent,
    tooEarly.eventsSent + tooEarly.escalationsSent === 0);
}

// ---- 4. recovery after the outage, in virtual time ----
  backing.clear();
{
  const queue = new TelemetryQueue();
  queue.enqueueEvent(event('e1'));
  queue.enqueueEscalation(escalation('esc-1', 'e1'));

  await queue.flush(rejectingTransport(() => true), 0);

  const recovered = recordingTransport();
  const result = await queue.flush(recovered, 1_000);
  expect('recovery flush sends both items after the first backoff', 2,
    result.eventsSent + result.escalationsSent,
    result.eventsSent === 1 && result.escalationsSent === 1);
  expect('recovery flush drains the queue', 0, result.remaining, result.remaining === 0);
}

// ---- 5. backoff grows with attempts ----
  backing.clear();
{
  const queue = new TelemetryQueue();
  queue.enqueueEvent(event('e1'));
  const down = rejectingTransport(() => true);

  await queue.flush(down, 0);      // attempt 1, next try at 1_000
  const probe = new TelemetryQueue();

  await queue.flush(down, 1_000);  // attempt 2, backoff doubles → next try at 3_000
  const stillEarly = recordingTransport();
  const early = await queue.flush(stillEarly, 2_000);
  expect('second backoff window (2s) has not elapsed at t=2000', 0,
    early.eventsSent, early.eventsSent === 0);

  const onTime = recordingTransport();
  const sent = await queue.flush(onTime, 3_000);
  expect('item becomes due at t=3000', 1, sent.eventsSent, sent.eventsSent === 1);
  void probe;
}

// ---- 6. a poison item does not block the queue ----
  backing.clear();
{
  const queue = new TelemetryQueue();
  const partial = rejectingTransport((item) => item.id === uuid('bad'));
  queue.enqueueEvent(event('bad'));
  queue.enqueueEvent(event('good'));

  const result = await queue.flush(partial, 0);
  expect('healthy item sends despite the poison item failing', 1, result.eventsSent,
    result.eventsSent === 1);
  expect('only the poison item remains', 1, result.remaining, result.remaining === 1);

  const heal = recordingTransport();
  const after = await queue.flush(heal, 1_000);
  expect('poison item sends once the transport recovers', 1, after.eventsSent,
    after.eventsSent === 1 && after.remaining === 0);
}

// ---- 7. event overflow sheds the oldest, never silently ----
  backing.clear();
{
  const queue = new TelemetryQueue();
  for (let index = 0; index < MAX_EVENTS + 10; index += 1) {
    queue.enqueueEvent(event(`e${index}`));
  }

  expect('event queue holds the cap', MAX_EVENTS, queue.pending, queue.pending === MAX_EVENTS);
  expect('overflow flag is raised', true, queue.hasOverflowed, queue.hasOverflowed);

  const transport = recordingTransport();
  await queue.flush(transport, 0);
  expect('the oldest ten events were shed, not the newest',
    false, transport.sentEvents.includes(uuid('e0')) || transport.sentEvents.includes(uuid('e9')),
    !transport.sentEvents.includes(uuid('e0')) && !transport.sentEvents.includes(uuid('e9')));
  expect('the newest events all arrived', true,
    transport.sentEvents.includes(uuid(`e${MAX_EVENTS + 9}`)),
    transport.sentEvents.includes(uuid(`e${MAX_EVENTS + 9}`)));
}

backing.clear();
{
  const queue = new TelemetryQueue();
  queue.enqueueDecision(event('protected'), escalation('esc-protected', 'protected'));
  for (let index = 0; index < MAX_EVENTS; index += 1) {
    queue.enqueueEvent(event(`unreferenced-${index}`));
  }

  expect('events referenced by retained escalations are never shed', MAX_EVENTS + 1, queue.pending,
    queue.pending === MAX_EVENTS + 1);
  expect('an unshrinkable dependency backlog raises overflow', true, queue.hasOverflowed,
    queue.hasOverflowed);

  const transport = recordingTransport();
  await queue.flush(transport, 0);
  expect('the protected query event still reaches transport', true,
    transport.sentEvents.includes(uuid('protected')),
    transport.sentEvents.includes(uuid('protected')));
}

backing.clear();
{
  const queue = new TelemetryQueue();
  for (let index = 0; index < MAX_EVENTS; index += 1) {
    queue.enqueueDecision(
      event(`saturated-${index}`),
      escalation(`esc-saturated-${index}`, `saturated-${index}`),
    );
  }
  queue.enqueueDecision(event('saturated-new'), escalation('esc-saturated-new', 'saturated-new'));

  const transport = recordingTransport();
  const result = await queue.flush(transport, 0);
  expect('atomic enqueue never sheds a saturated referenced event', MAX_EVENTS + 1,
    transport.sentEvents.length, transport.sentEvents.length === MAX_EVENTS + 1);
  expect('atomic enqueue keeps every matching escalation', MAX_EVENTS + 1,
    transport.sentEscalations.length,
    transport.sentEscalations.length === MAX_EVENTS + 1 && result.remaining === 0);
}

// ---- 8. escalation records are never shed ----
  backing.clear();
{
  const queue = new TelemetryQueue();
  for (let index = 0; index < MAX_ESCALATIONS + 10; index += 1) {
    queue.enqueueEscalation(escalation(`esc-${index}`, 'evt-x'));
  }

  expect('every escalation is retained despite the cap', MAX_ESCALATIONS + 10, queue.pending,
    queue.pending === MAX_ESCALATIONS + 10);
  expect('the backlog itself raises the flag', true, queue.hasOverflowed, queue.hasOverflowed);

  const transport = recordingTransport();
  const result = await queue.flush(transport, 0);
  expect('all escalations flush', MAX_ESCALATIONS + 10, result.escalationsSent,
    result.escalationsSent === MAX_ESCALATIONS + 10);
}

// ---- 9. persistence across a reload, including the overflow flag ----
  backing.clear();
{
  const queue = new TelemetryQueue();
  queue.enqueueEvent(event('keep-1'));
  queue.enqueueEscalation(escalation('keep-esc', 'keep-1'));
  for (let index = 0; index < MAX_EVENTS + 1; index += 1) {
    queue.enqueueEvent(event(`flood-${index}`));
  }

  const reloaded = new TelemetryQueue();
  expect('queue survives a restart', queue.pending, reloaded.pending,
    reloaded.pending === queue.pending);
  expect('overflow flag survives a restart', true, reloaded.hasOverflowed, reloaded.hasOverflowed);
}

// ---- 10. a corrupt stored payload starts empty instead of crashing ----
  backing.clear();
{
  backing.set('sop-telemetry-queue-v2', '{not json');
  const recovered = new TelemetryQueue();
  expect('corrupt storage starts empty', 0, recovered.pending, recovered.pending === 0);
}

// ---- report ----
const failed = checks.filter((check) => !check.ok);

console.log('\n=== telemetry queue hardening ===');
console.log('check'.padEnd(64), 'expected'.padEnd(22), 'observed');
console.log('-'.repeat(120));
for (const check of checks) {
  console.log(
    check.name.padEnd(64),
    check.expected.padEnd(22),
    check.observed.padEnd(24),
    check.ok ? 'PASS' : 'FAIL',
  );
}
console.log('-'.repeat(120));
console.log(`checks: ${checks.length}  failures: ${failed.length}`);
console.log(failed.length === 0 ? '\nQUEUE VERIFICATION OK' : '\nQUEUE VERIFICATION FAILED');

process.exit(failed.length === 0 ? 0 : 1);
