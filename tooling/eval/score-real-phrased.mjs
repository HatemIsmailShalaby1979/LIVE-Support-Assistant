#!/usr/bin/env node
/**
 * Score the operator-labelled real-phrased query sets.
 *
 * Two inputs, both produced outside this repository:
 *
 * 1. `tooling/eval/simulated-tenant/real-phrased-queries.csv` — real support
 *    questions collected from public sources. Wording only; no usernames and no
 *    personal details.
 * 2. `tooling/eval/simulated-tenant/my-floor-queries.csv` — the operator's own
 *    frontline patterns, supplied from `my-floor-queries.template.csv`.
 *
 * Each query runs through the same decision path as the 500-ticket batch: the
 * browser-local pinned MiniLM, passage cosine retrieval, the shipped Confidence
 * Gate, and the agent view. Nothing here signs in, loads a tenant bundle, writes
 * telemetry, or calls the database.
 *
 * The script refuses to run while any row is unlabelled and names those rows.
 * It does not guess, infer, or fill in a label.
 *
 * Labels (the operator's, never the model's):
 *   answerable — a competent agent answers this from the corpus.
 *   escalate   — the correct handling is a human handoff.
 *   ambiguous  — either outcome is defensible. Reported separately and excluded
 *                from the headline accuracy, false-escalation and unsafe counts,
 *                because scoring them would invent a decision the operator
 *                declined to make.
 *
 * `my_sop_id` is optional. When an `answerable` row leaves it empty, the row is
 * scored on the decision alone and counted in `sopUnspecified`.
 *
 * Usage:
 *   node tooling/eval/score-real-phrased.mjs                       # both CSVs if present
 *   node tooling/eval/score-real-phrased.mjs <a.csv> [<b.csv> ...]  # explicit inputs
 *
 * Environment:
 *   REAL_PHRASED_MIN_MARGIN   confidence margin (default 0.17, the recorded
 *                             simulated-batch baseline; the shipped default is 0.18)
 *   REAL_PHRASED_RUN_LABEL    output basename (default real-phrased-report)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evaluationDir = resolve(root, 'tooling/eval/simulated-tenant');
const runnerUrl = resolve(evaluationDir, 'real-phrased-runner.html');
const tempInputName = '_tmp_real-phrased-input.json';
const tempInputPath = resolve(evaluationDir, tempInputName);

const EXPECTED_COLUMNS = ['id', 'query', 'source_type', 'my_label', 'my_sop_id', 'notes'];
const ALLOWED_LABELS = new Set(['answerable', 'escalate', 'ambiguous']);
const DATA_MODE = 'public-wording';

const minMargin = process.env.REAL_PHRASED_MIN_MARGIN ?? '0.17';
if (!Number.isFinite(Number(minMargin)) || Number(minMargin) < 0 || Number(minMargin) > 1) {
  process.stderr.write('REAL_PHRASED_MIN_MARGIN must be a number between 0 and 1\n');
  process.exit(2);
}
const runLabel = process.env.REAL_PHRASED_RUN_LABEL ?? 'real-phrased-report';
if (!/^[a-z0-9-]+$/.test(runLabel)) {
  process.stderr.write('REAL_PHRASED_RUN_LABEL must contain only lowercase letters, digits, and hyphens\n');
  process.exit(2);
}
const reportPath = resolve(evaluationDir, `${runLabel}.json`);
const markdownPath = resolve(evaluationDir, `${runLabel}.md`);
if (existsSync(reportPath) || existsSync(markdownPath)) {
  process.stderr.write(`refusing to overwrite an existing report for run label ${runLabel}\n`);
  process.exit(2);
}

/** RFC 4180 reader, tolerant of a UTF-8 byte-order mark and CRLF endings. */
function parseCsv(text) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.length > 1 || entry[0] !== '');
}

function readSource(path) {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const [header, ...body] = rows;
  if (header === undefined) return { path, header: [], rows: [], problems: [`${basename(path)} is empty`] };
  const normalised = header.map((column) => column.trim().toLowerCase());
  const problems = [];
  if (normalised.join(',') !== EXPECTED_COLUMNS.join(',')) {
    problems.push(`${basename(path)} header must be ${EXPECTED_COLUMNS.join(',')}, found ${normalised.join(',')}`);
  }
  return { path, header: normalised, rows: body, problems };
}

const explicit = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const defaultPaths = [
  resolve(evaluationDir, 'real-phrased-queries.csv'),
  resolve(evaluationDir, 'my-floor-queries.csv'),
];
const sourcePaths = explicit.length > 0
  ? explicit.map((path) => resolve(path))
  : defaultPaths.filter((path) => existsSync(path));

if (sourcePaths.length === 0) {
  process.stderr.write(
    'no query CSV found. Expected tooling/eval/simulated-tenant/real-phrased-queries.csv\n'
    + '(and optionally my-floor-queries.csv), or pass CSV paths as arguments.\n',
  );
  process.exit(2);
}

const sources = sourcePaths.map(readSource);
const headerProblems = sources.flatMap((source) => source.problems);

// Refuse to run on rows with empty or invalid labels, and name every one of them.
const missingLabels = [];
const invalidLabels = [];
const unlabelledRows = [];
const duplicateIds = new Map();
const seenIds = new Set();
for (const source of sources) {
  const labelIndex = source.header.indexOf('my_label');
  for (const [position, row] of source.rows.entries()) {
    const id = row[0] ?? `row ${position + 2}`;
    const label = (row[labelIndex] ?? '').trim();
    const where = `${basename(source.path)}:${position + 2}`;
    if (seenIds.has(id)) {
      duplicateIds.set(id, (duplicateIds.get(id) ?? 1) + 1);
    }
    seenIds.add(id);
    if (label.length === 0) {
      missingLabels.push(`${where} (${id})`);
      continue;
    }
    if (!ALLOWED_LABELS.has(label.toLowerCase())) {
      invalidLabels.push(`${where} (${id}) has label "${label}"`);
      continue;
    }
    unlabelledRows.push({ source: basename(source.path), row, label: label.toLowerCase(), where });
  }
}

const blocking = [...headerProblems, ...invalidLabels];
if (missingLabels.length > 0) {
  blocking.push(
    `${missingLabels.length} row(s) have an empty my_label: ${missingLabels.join(', ')}`,
  );
}
if (duplicateIds.size > 0) {
  blocking.push(`duplicate ids: ${[...duplicateIds.keys()].join(', ')}`);
}
if (blocking.length > 0) {
  process.stderr.write('REFUSING TO SCORE\n');
  for (const problem of blocking) process.stderr.write(`  ${problem}\n`);
  process.stderr.write('\nFill my_label on every row (answerable | escalate | ambiguous) and re-run.\n');
  process.exit(2);
}

const queries = unlabelledRows.map((entry) => ({
  id: entry.row[0],
  query: entry.row[1],
  source_type: entry.row[2],
  my_label: entry.label,
  my_sop_id: (entry.row[4] ?? '').trim(),
}));
const bySourceType = Object.fromEntries(
  [...new Set(queries.map((row) => row.source_type))].sort().map((type) => [
    type,
    queries.filter((row) => row.source_type === type).length,
  ]),
);

writeFileSync(tempInputPath, `${JSON.stringify({
  data_mode: DATA_MODE,
  provenance: `Real-phrased wording collected from public sources; ${sourcePaths.map((path) => basename(path)).join(', ')}`,
  queries,
}, null, 2)}\n`);

const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
];
const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (chromePath === undefined) {
  rmSync(tempInputPath, { force: true });
  process.stderr.write('Chrome is required for the browser-local scoring path\n');
  process.exit(2);
}
for (const path of [
  resolve(root, 'packages/core/dist/index.js'),
  resolve(root, 'packages/embedder/dist/index.js'),
  resolve(root, 'packages/vector-store/dist/index.js'),
]) {
  if (!existsSync(path)) {
    rmSync(tempInputPath, { force: true });
    process.stderr.write(`build output missing, run pnpm build first: ${path}\n`);
    process.exit(2);
  }
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

const vitePort = await unusedPort();
const cdpPort = await unusedPort();
const vite = spawn(process.execPath, [
  resolve(root, 'apps/web/node_modules/vite/bin/vite.js'),
  root,
  '--config', resolve(root, 'apps/web/vite.config.ts'),
  '--port', String(vitePort),
  '--host', '127.0.0.1',
  '--strictPort',
], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let viteLog = '';
vite.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
vite.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });

const profileDir = mkdtempSync(resolve(tmpdir(), 'sop-real-phrased-'));
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
  rmSync(tempInputPath, { force: true });
  try {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    process.stderr.write(`could not remove isolated browser profile ${profileDir}: ${String(error)}\n`);
  }
}

let report;
try {
  const deadline = Date.now() + 90_000;
  let viteReady = false;
  let cdpVersion;
  while (Date.now() < deadline && (!viteReady || cdpVersion === undefined)) {
    if (!viteReady) {
      const response = await fetch(`http://127.0.0.1:${vitePort}/tooling/eval/simulated-tenant/real-phrased-runner.html`).catch(() => null);
      viteReady = response?.ok === true;
    }
    if (cdpVersion === undefined) {
      cdpVersion = await fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((response) => response.ok ? response.json() : undefined)
        .catch(() => undefined);
    }
    if (!viteReady || cdpVersion === undefined) await sleep(300);
  }
  if (!viteReady) throw new Error(`Vite did not serve the scoring harness:\n${viteLog.slice(-2000)}`);
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
    url: `http://127.0.0.1:${vitePort}/tooling/eval/simulated-tenant/real-phrased-runner.html?${new URLSearchParams({
      input: tempInputName,
      minMargin,
    })}`,
  }, sessionId);

  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    }
    return response.result.value;
  }

  process.stdout.write(`Scoring ${queries.length} real-phrased queries in a local headless browser; no sign-in, no tenant bundle, no telemetry transport.\n`);
  const evaluationDeadline = Date.now() + 15 * 60_000;
  let state;
  while (Date.now() < evaluationDeadline) {
    state = await evaluate('window.__REAL_PHRASED_STATE__ ?? null').catch(() => null);
    if (state?.status === 'complete') break;
    if (state?.status === 'failed') throw new Error(`browser scoring failed: ${state.detail ?? 'unknown error'}`);
    await sleep(500);
  }
  if (state?.status !== 'complete') {
    const status = await evaluate('document.querySelector("#status")?.textContent ?? "runner did not start"').catch(() => 'runner did not start');
    throw new Error(`browser scoring timed out: ${status}; errors: ${browserErrors.join(' | ')}`);
  }
  report = await evaluate('window.__REAL_PHRASED_RESULT__');
  if (report === null || report === undefined) throw new Error('browser completed without returning a result');
  report.browser = {
    userAgent: await evaluate('navigator.userAgent'),
    consoleExceptions: browserErrors,
    telemetryTransport: 'not initialized',
  };
  await send('Target.closeTarget', { targetId }).catch(() => {});
  socket.close();
} finally {
  await cleanup();
}

/**
 * Score one query against the operator's label.
 *
 * `answerable` scores the decision, and the procedure when one was named.
 * `escalate` scores the decision only. `ambiguous` is carried but not scored.
 */
function scoreRow(row) {
  const actual = row.actual ?? { decision: 'escalate', reason: 'evaluation_error' };
  const answered = actual.decision === 'answer';
  if (row.my_label === 'ambiguous') {
    return { scored: false, outcome: 'ambiguous', category: null };
  }
  if (row.my_label === 'escalate') {
    return answered
      ? { scored: true, outcome: 'incorrect', category: 'unsafe_answer' }
      : { scored: true, outcome: 'correct', category: null };
  }
  // answerable
  if (!answered) {
    return { scored: true, outcome: 'incorrect', category: 'false_escalation' };
  }
  if (row.my_sop_id.length > 0 && actual.sopId !== row.my_sop_id) {
    return { scored: true, outcome: 'incorrect', category: 'wrong_sop_answer' };
  }
  return { scored: true, outcome: 'correct', category: null };
}

const scored = report.queries.map((row) => ({ ...row, ...scoreRow(row) }));
const considered = scored.filter((row) => row.scored);
const correct = considered.filter((row) => row.outcome === 'correct').length;
const falseEscalations = considered.filter((row) => row.category === 'false_escalation').length;
const unsafeAnswers = considered.filter((row) => row.category === 'unsafe_answer' || row.category === 'wrong_sop_answer').length;
const ambiguousRows = scored.filter((row) => row.outcome === 'ambiguous');
const sopUnspecified = considered.filter((row) => row.my_label === 'answerable' && row.my_sop_id.length === 0).length;

const bySource = Object.fromEntries(
  [...new Set(scored.map((row) => row.source_type))].sort().map((type) => {
    const selected = scored.filter((row) => row.source_type === type && row.scored);
    const correctHere = selected.filter((row) => row.outcome === 'correct').length;
    return [type, {
      queries: scored.filter((row) => row.source_type === type).length,
      scored: selected.length,
      correct: correctHere,
      accuracy: selected.length === 0 ? 0 : correctHere / selected.length,
      falseEscalations: selected.filter((row) => row.category === 'false_escalation').length,
      unsafeAnswers: selected.filter((row) => row.category === 'unsafe_answer' || row.category === 'wrong_sop_answer').length,
    }];
  }),
);

const totals = {
  queries: scored.length,
  scored: considered.length,
  correct,
  accuracy: considered.length === 0 ? 0 : correct / considered.length,
  falseEscalations,
  unsafeAnswers,
  runtimeErrors: scored.filter((row) => row.error !== undefined).length,
  ambiguous: ambiguousRows.length,
  sopUnspecified,
  bySourceType,
  bySource,
};

const written = {
  data_mode: DATA_MODE,
  evaluatedAt: new Date().toISOString(),
  evaluation: 'Local browser decision-path scoring of operator-labelled real-phrased queries; no live tenant, hosted database, or telemetry transport used.',
  sources: sourcePaths.map((path) => basename(path)),
  marginNote: `minMargin ${minMargin}; the recorded simulated-batch baseline used 0.17 and the shipped default is 0.18`,
  implementation: report.implementation,
  browser: report.browser,
  provenance: report.provenance,
  totals,
  perQuery: scored,
};
writeFileSync(reportPath, `${JSON.stringify(written, null, 2)}\n`);

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const markdown = [
  `# ${runLabel} — real-phrased query scoring`,
  '',
  `Provenance: ${report.provenance}`,
  'These are real support questions collected from public sources; the wording is quoted, and no usernames or personal details are recorded.',
  '',
  `Scored ${totals.scored} of ${totals.queries} queries (${totals.ambiguous} labelled ambiguous and excluded from the headline).`,
  `Margin: ${report.implementation.minMargin} (evaluation-only; the shipped default is 0.18).`,
  '',
  `- Accuracy: **${pct(totals.accuracy)}** (${totals.correct}/${totals.scored}).`,
  `- False escalations: ${totals.falseEscalations}.`,
  `- Unsafe answers: ${totals.unsafeAnswers}.`,
  `- Runtime errors: ${totals.runtimeErrors}.`,
  `- \`answerable\` rows without a named procedure: ${totals.sopUnspecified}.`,
  '',
  '## By source type',
  '',
  '| Source type | Queries | Scored | Correct | Accuracy | False escalations | Unsafe answers |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...Object.entries(totals.bySource).map(([type, row]) =>
    `| ${type} | ${row.queries} | ${row.scored} | ${row.correct}/${row.scored} | ${pct(row.accuracy)} | ${row.falseEscalations} | ${row.unsafeAnswers} |`,
  ),
  '',
  '## Every scored query',
  '',
  '| id | source | label | expected procedure | decision | procedure | outcome |',
  '|---|---|---|---|---|---|---|',
  ...scored.map((row) =>
    `| ${row.id} | ${row.source_type} | ${row.my_label} | ${row.my_sop_id || '—'} | ${row.actual?.decision ?? 'error'} | ${row.actual?.sopId ?? row.actual?.reason ?? '—'} | ${row.outcome} |`,
  ),
  '',
  'The runner executes the browser-local MiniLM → passage retrieval → Confidence Gate → agent-view path. It does not sign in, load a tenant bundle, write telemetry, or call the live database.',
].join('\n');
writeFileSync(markdownPath, `${markdown}\n`);

process.stdout.write(`${markdown}\n`);
process.stdout.write(`\nSaved ${reportPath} and ${markdownPath}\n`);
process.exit(totals.unsafeAnswers === 0 ? 0 : 1);
