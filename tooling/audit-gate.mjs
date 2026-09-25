#!/usr/bin/env node
/**
 * A dependency gate that fails on regressions, not on history.
 *
 * The workspace currently carries 36 production advisories, all reachable
 * through `apps/mobile` -> `expo` (1 critical, 25 high, 9 moderate, 1 low).
 * They are a real release gate and they are not this slice's job to clear — the
 * mobile app is unbuilt and the upgrade belongs with the packaging work.
 *
 * What would be dishonest is either of two easy mistakes. Silently ignoring
 * `pnpm audit` means the 36 become 300 unnoticed. Failing the build on all 36
 * means the gate is red on day one, gets disabled, and protects nothing. A gate
 * nobody trusts is worse than no gate.
 *
 * So this compares against a committed baseline keyed on the GitHub advisory ID
 * and fails only on something new or something worse. Advisories going away is
 * never a failure, so the baseline does not need editing when the count drops.
 * Severity is compared by rank, so an advisory cannot be reclassified upward
 * without the build noticing.
 *
 * Deliberately NOT keyed on the affected paths: pnpm reports them
 * OS-dependently (`apps__mobile>expo` on Linux, backslashes on Windows), and a
 * baseline that breaks per platform trains people to ignore it.
 *
 * When the count reaches zero, delete the baseline file and the gate becomes
 * strict with no code change.
 *
 * Usage:
 *   node tooling/audit-gate.mjs             # fail on new or escalated advisories
 *   node tooling/audit-gate.mjs --update    # rewrite the baseline from the audit
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = resolve(root, 'tooling/audit-baseline.json');
const update = process.argv.includes('--update');

const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

const audit = spawnSync('pnpm', ['audit', '--prod', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  // pnpm is a .cmd shim on Windows; without a shell it is not resolvable.
  shell: process.platform === 'win32',
});

if (audit.error) {
  process.stderr.write(`could not run pnpm audit: ${audit.error}\n`);
  process.exit(2);
}

const raw = (audit.stdout ?? '').trim();

if (raw === '') {
  process.stderr.write(
    `pnpm audit produced no output (exit ${audit.status})\n` +
      'refusing to treat an unreadable audit as a clean one\n',
  );
  process.exit(2);
}

/** pnpm sometimes prefixes the JSON with progress noise; be tolerant, not naive. */
function parse(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    const start = stdout.indexOf('{');
    const end = stdout.lastIndexOf('}');
    if (start === -1 || end <= start) {
      return null;
    }
    try {
      return JSON.parse(stdout.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

const report = parse(raw);

if (report === null || typeof report.advisories !== 'object' || report.advisories === null) {
  process.stderr.write('could not parse the pnpm audit report\n');
  process.exit(2);
}

/** @type {Map<string, {severity: string, module: string, title: string}>} */
const current = new Map();

for (const advisory of Object.values(report.advisories)) {
  if (advisory === null || typeof advisory !== 'object') {
    continue;
  }
  current.set(String(advisory.github_advisory_id ?? advisory.id), {
    severity: String(advisory.severity ?? 'unknown'),
    module: String(advisory.module_name ?? 'unknown'),
    title: String(advisory.title ?? ''),
  });
}

const counts = report.metadata?.vulnerabilities ?? {};

if (update) {
  const baseline = {
    note: 'Committed by `pnpm run audit:update`. See tooling/audit-gate.mjs.',
    advisories: Object.fromEntries(
      [...current.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, info]) => [id, info.severity]),
    ),
  };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `baseline rewritten: ${current.size} advisories -> ${baselinePath}\n`,
  );
  process.exit(0);
}

let baseline;

try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).advisories ?? {};
} catch {
  process.stderr.write(
    `no readable baseline at ${baselinePath}\n` +
      'run `pnpm run audit:update` once, and commit the result\n',
  );
  process.exit(2);
}

const introduced = [];
const escalated = [];

for (const [id, info] of current) {
  const known = baseline[id];

  if (known === undefined) {
    introduced.push({ id, ...info });
    continue;
  }

  if ((SEVERITY_RANK[info.severity] ?? 0) > (SEVERITY_RANK[known] ?? 0)) {
    escalated.push({ id, from: known, to: info.severity, ...info });
  }
}

const resolved = Object.keys(baseline).filter((id) => !current.has(id)).length;

process.stdout.write(
  `production advisories: ${current.size} ` +
    `(critical ${counts.critical ?? 0}, high ${counts.high ?? 0}, ` +
    `moderate ${counts.moderate ?? 0}, low ${counts.low ?? 0})\n` +
    `baseline: ${Object.keys(baseline).length}   ` +
    `new: ${introduced.length}   escalated: ${escalated.length}   ` +
    `resolved since baseline: ${resolved}\n`,
);

for (const advisory of introduced) {
  process.stdout.write(`  NEW       ${advisory.id} ${advisory.module} ${advisory.severity}\n`);
}
for (const advisory of escalated) {
  process.stdout.write(
    `  ESCALATED ${advisory.id} ${advisory.module} ${advisory.from} -> ${advisory.to}\n`,
  );
}

if (introduced.length > 0 || escalated.length > 0) {
  process.stderr.write('\ndependency gate FAILED: the advisory set regressed\n');
  process.exit(1);
}

process.stdout.write('dependency gate passed\n');
process.exit(0);
