#!/usr/bin/env node
/**
 * Conflicting-procedure lint — command line.
 *
 * Report-only scanner: it reads a tenant corpus, reports any same-category
 * numeric policy conflict, and exits non-zero on a conflict. It changes nothing.
 *
 * The detection logic lives in `conflict-core.mjs` so it can be reused by the
 * publish gate and the verification harnesses without a second copy of the
 * grammar. This file is the CLI wrapper: it loads files and prints the report.
 *
 * Usage:
 *   node tooling/conflicts/lint-procedure-conflicts.mjs <corpus.json> [...]
 *   node tooling/conflicts/lint-procedure-conflicts.mjs --json <corpus.json>
 *
 * Exit codes: 0 no conflicts, 1 conflicts found, 2 usage or input error.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractPolicyFacts, findConflicts } from './conflict-core.mjs';

export { extractPolicyFacts, findConflicts };

function formatValues(key, values) {
  return values
    .map(({ value }) => (key === 'window_days' ? `${value[0]}–${value[1]}` : String(value)))
    .join(', ');
}

function report(conflicts, sops) {
  const lines = [
    'SIMULATED DATA | conflicting-procedure lint',
    '',
    `Procedures scanned: ${sops.length}`,
    `Conflicts found: ${conflicts.length}`,
    '',
  ];
  if (conflicts.length === 0) {
    lines.push('No same-category numeric disagreement was found.');
    return lines.join('\n');
  }
  for (const conflict of conflicts) {
    lines.push(
      `CONFLICT [${conflict.category}] ${conflict.key}`,
      `  ${conflict.left.sopId} (${conflict.left.title}) asserts ${formatValues(conflict.key, conflict.left.values)}`,
      `  ${conflict.right.sopId} (${conflict.right.title}) asserts ${formatValues(conflict.key, conflict.right.values)}`,
      `  Evidence (${conflict.left.sopId}): ${conflict.left.values[0].evidence}`,
      `  Evidence (${conflict.right.sopId}): ${conflict.right.values[0].evidence}`,
      '',
    );
  }
  return lines.join('\n');
}

/** Load and merge one or more corpus files into a single procedure list. */
export function loadCorpus(paths) {
  const sops = [];
  for (const path of paths) {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed.sops)) {
      throw new Error(`${path} does not contain a "sops" array`);
    }
    sops.push(...parsed.sops);
  }
  return sops;
}

/**
 * Run the lint as a command line.
 *
 * Exported so the regression test can assert the exit-code contract without
 * spawning a child process — `spawnSync` is unreliable in this host's sandbox,
 * and a test that cannot run is worse than no test.
 *
 * @param argv Arguments after the script name.
 * @param write Sink for report output. Defaults to stdout.
 * @param writeError Sink for the usage message. Defaults to stderr.
 * @returns 0 no conflicts, 1 conflicts found, 2 usage or input error.
 */
export function runCli(
  argv,
  write = (text) => process.stdout.write(text),
  writeError = (text) => process.stderr.write(text),
) {
  const json = argv.includes('--json');
  const paths = argv.filter((argument) => !argument.startsWith('--'));
  if (paths.length === 0) {
    writeError(
      'usage: node tooling/conflicts/lint-procedure-conflicts.mjs [--json] <corpus.json> [...]\n',
    );
    return 2;
  }
  const sops = loadCorpus(paths.map((path) => resolve(path)));
  const conflicts = findConflicts(sops);
  write(json
    ? `${JSON.stringify({ data_mode: 'simulated', procedures: sops.length, conflicts }, null, 2)}\n`
    : `${report(conflicts, sops)}\n`);
  return conflicts.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
