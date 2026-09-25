#!/usr/bin/env node
/**
 * The verification gate.
 *
 * Every harness that backs a claim in AGENTS.md, run in one command, in one
 * place, with a verdict that cannot be faked.
 *
 * Why this exists. Until now the harnesses were only ever run by hand, one at a
 * time, by whoever wrote them. Nothing ran on a commit, so "31 checks, 0
 * failures" was a recollection rather than a fact. This runner is what turns it
 * into a fact, and it is the command CI runs.
 *
 * Two independent signals per suite, following the pattern the database scripts
 * already use: the process must exit 0 AND the suite must print its own verdict
 * line. A suite that exits 0 while reporting failures is precisely the failure
 * mode worth catching, and it is the one a naive `&&` chain would wave through.
 *
 * The database suites are not here. They need a throwaway PostgreSQL and live in
 * `pnpm verify:db`, which supersedes the phase 2 and phase 5 scripts by running
 * all three SQL suites against one freshly created database.
 *
 * The `semantic-eval` and `reranker-sanity` scripts are deliberately excluded:
 * they measure and report, they are the experiments AGENTS.md already records as
 * rejected, and a number that moves is not a regression. Model swapping has
 * been measured and rejected twice; it does not belong in a merge gate.
 *
 * Usage:
 *   node tooling/run-verification.mjs              # every suite
 *   node tooling/run-verification.mjs sync gate    # only the named suites
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build outputs the harnesses import. Without these they fail with a module
 * resolution error, which says nothing about the code under test; this turns
 * that into an instruction.
 */
const REQUIRED_BUILDS = [
  'packages/core/dist/index.js',
  'packages/embedder/dist/index.js',
  'packages/vector-store/dist/index.js',
  'packages/sync/dist/index.js',
];

const SUITES = [
  {
    key: 'parity',
    name: 'legacy parity (keyword rule)',
    script: 'tooling/eval/parity-check.mjs',
    verdict: 'PARITY OK',
  },
  {
    key: 'sync',
    name: 'encrypted sync protocol',
    script: 'tooling/sync/verify-sync.mjs',
    verdict: 'SYNC VERIFICATION OK',
    downloadsModel: true,
  },
  {
    key: 'persistence',
    name: 'persistence adapters',
    script: 'tooling/sync/verify-persistence.mjs',
    verdict: 'PERSISTENCE VERIFICATION OK',
  },
  {
    key: 'rotation',
    name: 'key rotation and revocation',
    script: 'tooling/sync/verify-rotation.mjs',
    verdict: 'ROTATION VERIFICATION OK',
  },
  {
    key: 'gate',
    name: 'confidence gate and manual review',
    script: 'tooling/gate/verify-gate.mjs',
    verdict: 'GATE VERIFICATION OK',
    downloadsModel: true,
  },
  {
    key: 'queue',
    name: 'telemetry queue',
    script: 'tooling/telemetry/verify-queue.mjs',
    verdict: 'QUEUE VERIFICATION OK',
  },
];

const requested = process.argv.slice(2);
const selected =
  requested.length === 0
    ? SUITES
    : SUITES.filter((suite) => requested.includes(suite.key));

if (selected.length === 0) {
  process.stderr.write(
    `no suite matched: ${requested.join(', ')}\n` +
      `available: ${SUITES.map((suite) => suite.key).join(', ')}\n`,
  );
  process.exit(2);
}

const missing = REQUIRED_BUILDS.filter((path) => !existsSync(resolve(root, path)));

if (missing.length > 0) {
  process.stderr.write(
    'build output missing, so these suites cannot run:\n' +
      missing.map((path) => `  ${path}\n`).join('') +
      '\nrun `pnpm build` first.\n',
  );
  process.exit(2);
}

if (selected.some((suite) => suite.downloadsModel)) {
  process.stdout.write(
    'note: the pinned embedding model is fetched from Hugging Face on first run ' +
      'and cached in ./.cache\n\n',
  );
}

function runSuite(suite) {
  return new Promise((settle) => {
    const child = spawn(process.execPath, [suite.script], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });

    child.on('error', (error) => settle({ ok: false, reason: String(error) }));
    child.on('close', (code) => {
      if (code !== 0) {
        settle({ ok: false, reason: `exited ${code}` });
        return;
      }
      if (!output.includes(suite.verdict)) {
        settle({ ok: false, reason: `exited 0 but never printed "${suite.verdict}"` });
        return;
      }
      settle({ ok: true });
    });
  });
}

const results = [];

for (const suite of selected) {
  process.stdout.write(`==> ${suite.name}\n\n`);
  const started = process.hrtime.bigint();
  const result = await runSuite(suite);
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  results.push({ suite, ...result, seconds });
  process.stdout.write(`    ${result.ok ? 'pass' : `FAIL — ${result.reason}`} (${seconds.toFixed(1)}s)\n\n`);
}

const passed = results.filter((result) => result.ok).length;

process.stdout.write('verification summary\n');
for (const result of results) {
  const status = result.ok ? 'pass' : `FAIL (${result.reason})`;
  process.stdout.write(`  ${status.padEnd(6)} ${result.suite.name}\n`);
}
process.stdout.write(`\n${passed} of ${results.length} suites passed\n`);

process.exit(passed === results.length ? 0 : 1);
