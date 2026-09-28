#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const evaluationDir = resolve(root, 'tooling/eval/simulated-tenant');
const runnerUrl = resolve(evaluationDir, 'chaos-runner.html');
const runLabel = process.env.SIMULATION_RUN_LABEL ?? 'phase4-report';
if (!/^[a-z0-9-]+$/.test(runLabel)) throw new Error('SIMULATION_RUN_LABEL must contain only lowercase letters, digits, and hyphens');
const batchName = process.env.SIMULATION_BATCH ?? 'chaos-500.json';
const corpusName = process.env.SIMULATION_CORPUS ?? 'corpus.json';
const inputPattern = /^[a-z0-9-]+\.json$/;
if (!inputPattern.test(batchName) || !inputPattern.test(corpusName)) {
  throw new Error('SIMULATION_BATCH and SIMULATION_CORPUS must be JSON basenames using lowercase letters, digits, and hyphens');
}
const batchPath = resolve(evaluationDir, batchName);
const corpusPath = resolve(evaluationDir, corpusName);
const minMargin = process.env.SIMULATION_MIN_MARGIN;
const modelKey = process.env.SIMULATION_MODEL ?? 'minilm';
if (!/^[a-z0-9-]+$/.test(modelKey)) {
  throw new Error('SIMULATION_MODEL must contain only lowercase letters, digits, and hyphens');
}
const queryInputMode = process.env.SIMULATION_QUERY_INPUT ?? 'message';
if (!['message', 'subject-message'].includes(queryInputMode)) {
  throw new Error('SIMULATION_QUERY_INPUT must be message or subject-message');
}
if (minMargin !== undefined && (!Number.isFinite(Number(minMargin)) || Number(minMargin) < 0 || Number(minMargin) > 1)) {
  throw new Error('SIMULATION_MIN_MARGIN must be a number between 0 and 1');
}
const reportPath = resolve(evaluationDir, `${runLabel}.json`);
const markdownPath = resolve(evaluationDir, `${runLabel}.md`);
if (existsSync(reportPath) || existsSync(markdownPath)) {
  throw new Error(`refusing to overwrite an existing evaluation report for run label ${runLabel}`);
}
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (chromePath === undefined) throw new Error('Chrome is required for the browser-local evaluation');
for (const path of [
  batchPath,
  corpusPath,
  resolve(root, 'packages/core/dist/index.js'),
  resolve(root, 'packages/embedder/dist/index.js'),
  resolve(root, 'packages/vector-store/dist/index.js'),
]) {
  if (!existsSync(path)) throw new Error(`Required evaluation input/build output is missing: ${path}`);
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('could not obtain an ephemeral port');
  const { port } = address;
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return port;
}

const vitePath = resolve(root, 'apps/web/node_modules/vite/bin/vite.js');
const vitePort = await unusedPort();
const cdpPort = await unusedPort();
const vite = spawn(process.execPath, [
  vitePath,
  root,
  '--config', resolve(root, 'apps/web/vite.config.ts'),
  '--port', String(vitePort),
  '--host', '127.0.0.1',
  '--strictPort',
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let viteLog = '';
vite.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
vite.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });

const profileDir = mkdtempSync(join(tmpdir(), 'sop-simulated-eval-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--window-size=1280,900',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveClose) => child.once('close', resolveClose)),
    sleep(5000),
  ]);
}

async function cleanup() {
  await Promise.all([stop(chrome), stop(vite)]);
  try {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    process.stderr.write(`Could not remove isolated browser profile ${profileDir}: ${String(error)}\n`);
  }
}

try {
  const serverDeadline = Date.now() + 90_000;
  let viteReady = false;
  let cdpVersion;
  while (Date.now() < serverDeadline && (!viteReady || cdpVersion === undefined)) {
    if (!viteReady) {
      const response = await fetch(`http://127.0.0.1:${vitePort}/tooling/eval/simulated-tenant/chaos-runner.html`).catch(() => null);
      viteReady = response?.ok === true;
    }
    if (cdpVersion === undefined) {
      cdpVersion = await fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((response) => response.ok ? response.json() : undefined)
        .catch(() => undefined);
    }
    if (!viteReady || cdpVersion === undefined) await sleep(300);
  }
  if (!viteReady) throw new Error(`Vite did not serve the evaluation harness:\n${viteLog.slice(-2000)}`);
  if (cdpVersion === undefined) throw new Error('Chrome did not open its debugging endpoint');

  const socket = new WebSocket(cdpVersion.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const browserErrors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolveCall, rejectCall } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCall(new Error(message.error.message));
      else resolveCall(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      browserErrors.push(detail.exception?.description ?? detail.text ?? 'browser exception');
    }
  });

  function send(method, params = {}, sessionId) {
    const id = ++nextId;
    return new Promise((resolveCall, rejectCall) => {
      pending.set(id, { resolveCall, rejectCall });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Page.navigate', {
    url: `http://127.0.0.1:${vitePort}/tooling/eval/simulated-tenant/chaos-runner.html?${new URLSearchParams({
      batch: batchName,
      corpus: corpusName,
      queryInput: queryInputMode,
      model: modelKey,
      ...(minMargin === undefined ? {} : { minMargin }),
    })}`,
  }, sessionId);

  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result.value;
  }

  process.stdout.write(`SIMULATED DATA — evaluating ${batchName} with ${corpusName} in a local headless browser; no Supabase session or telemetry transport.\n`);
  const evaluationDeadline = Date.now() + 15 * 60_000;
  let state;
  while (Date.now() < evaluationDeadline) {
    state = await evaluate('window.__SIMULATION_STATE__ ?? null').catch(() => null);
    if (state?.status === 'complete') break;
    if (state?.status === 'failed') throw new Error(`browser evaluation failed: ${state.detail ?? 'unknown error'}`);
    await sleep(500);
  }
  if (state?.status !== 'complete') {
    const status = await evaluate('document.querySelector("#status")?.textContent ?? "runner did not start"').catch(() => 'runner did not start');
    throw new Error(`browser evaluation timed out: ${status}; errors: ${browserErrors.join(' | ')}`);
  }

  const report = await evaluate('window.__SIMULATION_RESULT__');
  if (report === undefined || report === null) throw new Error('browser completed without returning the evaluation report');
  report.runLabel = runLabel;
  report.batchSha256 = createHash('sha256').update(readFileSync(batchPath)).digest('hex');
  report.corpusSha256 = createHash('sha256')
    .update(readFileSync(corpusPath))
    .digest('hex');
  report.browser = {
    userAgent: await evaluate('navigator.userAgent'),
    consoleExceptions: browserErrors,
    telemetryTransport: 'not initialized',
    externalServicesUsed: ['Hugging Face model-file delivery only; query text is embedded locally in the browser'],
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const totals = report.totals;
  const rows = report.perTicket;
  const labelFix = report.labelFix;
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  const markdown = [
    `# ${runLabel} — simulated chaos-batch evaluation`,
    '',
    '**data_mode: "simulated" — all tickets, corpus content, and outcomes in this report are fictional.**',
    '',
    `Evaluated ${report.batch.tickets} synthetic tickets (${report.batch.chaosTickets} flagged, ${report.batch.chaosRateActual * 100}% chaos) using seed ${report.batch.seed}.`,
    `Query text: ${report.queryInputMode}.`,
    `Embedder: \`${report.implementation.modelId}\` @ \`${report.implementation.modelRevision}\` (${report.implementation.dtype}); applied margin ${report.implementation.minMargin}.`,
    '',
    `Decision-path accuracy against the batch's own labels: **${(totals.accuracy * 100).toFixed(1)}%** (${totals.correct}/${totals.tickets}). Failure rate: **${(totals.failureRate * 100).toFixed(1)}%** (${totals.failures}/${totals.tickets}).`,
    `Latency per query decision: mean ${(totals.latencyMs.mean).toFixed(2)} ms; median ${totals.latencyMs.median.toFixed(2)} ms; p95 ${totals.latencyMs.p95.toFixed(2)} ms; max ${totals.latencyMs.max.toFixed(2)} ms.`,
    '',
    `- Chaos subset: ${(report.cohorts.chaos.accuracy * 100).toFixed(1)}% accurate (${report.cohorts.chaos.correct}/${report.cohorts.chaos.tickets}).`,
    `- Baseline subset: ${(report.cohorts.baseline.accuracy * 100).toFixed(1)}% accurate (${report.cohorts.baseline.correct}/${report.cohorts.baseline.tickets}).`,
    `- False escalations: ${totals.falseEscalations}; unsafe/wrong-SOP answers: ${totals.unsafeAnswers}; runtime errors: ${totals.runtimeErrors}.`,
    '',
    '## Label fix — expectedOutcome (before / after)',
    '',
    'A labelling correction, not a product change. No shipped code, gate logic, or threshold is touched.',
    `Rule, encoded in \`expected-outcome.ts\`: ${labelFix.rule}.`,
    '',
    `Truncated queries detected: ${labelFix.truncatedDetected}. Queries reclassified: ${labelFix.reclassified}${labelFix.reclassified > 0 ? ` (${labelFix.reclassifiedTicketIds.join(', ')})` : ''}.`,
    '',
    '| Measure | Before (batch labels) | After (label fix) |',
    '|---|---:|---:|',
    `| Correct | ${labelFix.before.correct}/${labelFix.before.tickets} (${pct(labelFix.before.accuracy)}) | ${labelFix.after.correct}/${labelFix.after.tickets} (${pct(labelFix.after.accuracy)}) |`,
    `| False escalations | ${labelFix.before.falseEscalations} | ${labelFix.after.falseEscalations} |`,
    `| Unsafe answers | ${labelFix.before.unsafeAnswers} | ${labelFix.after.unsafeAnswers} |`,
    `| Runtime errors | ${labelFix.before.runtimeErrors} | ${labelFix.after.runtimeErrors} |`,
    '',
    '### Per technique (before / after)',
    '',
    '| Technique | Tickets | Before correct | Before false escalations | After correct | After false escalations | Reclassified |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(labelFix.byTechnique).map(([technique, row]) =>
      `| ${technique} | ${row.tickets} | ${row.before.correct}/${row.before.tickets} (${pct(row.before.accuracy)}) | ${row.before.falseEscalations} | ${row.after.correct}/${row.after.tickets} (${pct(row.after.accuracy)}) | ${row.after.falseEscalations} | ${row.reclassified} |`,
    ),
    '',
    '## Failure categories (ranked)',
    '',
    ...Object.entries(totals.failureCategories).map(([category, count]) => `- ${category}: ${count}`),
    ...(Object.keys(totals.failureCategories).length === 0 ? ['- None.'] : []),
    '',
    '### Gate/runtime causes',
    '',
    ...Object.entries(totals.failureCauses).map(([cause, count]) => `- ${cause}: ${count}`),
    '',
    '### Failures by ticket type',
    '',
    ...Object.entries(totals.failuresByInputType).map(([type, count]) => `- ${type}: ${count}`),
    '',
    '## Up to 10 worst failures',
    '',
    ...(report.topFailures.length === 0 ? ['No failed tickets.'] : report.topFailures.flatMap((row, index) => [
      `### ${index + 1}. ${row.ticket.ticketId} — ${row.failureCategory} (${row.latencyMs?.toFixed(2) ?? 'n/a'} ms)`,
      '',
      '**data_mode: "simulated"**',
      `- Expected: ${row.expected.decision}${row.expected.sopId ? ` (${row.expected.sopId})` : ''}${row.expected.reason ? ` — ${row.expected.reason}` : ''}`,
      `- Actual: ${row.actual.decision}${row.actual.sopId ? ` (${row.actual.sopId})` : ''}${row.actual.reason ? ` — ${row.actual.reason}` : ''}`,
      `- Subject: ${row.ticket.subject}`,
      `- Message: ${row.ticket.message}`,
      ...(row.error ? [`- Error: ${row.error}`] : []),
      '',
    ])),
    'The evaluation runs the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, use a tenant bundle, write telemetry, or call the live database. See the JSON report for per-ticket candidates and results.',
  ].join('\n');
  writeFileSync(markdownPath, `${markdown}\n`);

  process.stdout.write(`${markdown}\n`);
  process.stdout.write(`\nSaved ${reportPath} and ${markdownPath}\n`);
  await send('Target.closeTarget', { targetId }).catch(() => {});
  socket.close();
} finally {
  await cleanup();
}
