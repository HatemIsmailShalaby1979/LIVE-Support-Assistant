#!/usr/bin/env node
/**
 * Regression test for the conflicting-procedure lint.
 *
 * It reproduces the measured unsafe case from the deployed-path run — the
 * synthetic contradictory payout ticket `SIM-TICKET-00272` — from the pinned
 * batch itself rather than from a copy, and asserts that the lint catches it.
 *
 * The case: the tenant corpus states that a processed payout takes two to five
 * business days, and the injected legacy procedure states one business day.
 * Both are in the "Creator payouts" category. The Confidence Gate answered from
 * the ordinary payout procedure at a measured top-one/top-two margin of
 * 0.180757, just above the shipped 0.18 default, because the gate compares how
 * decisive a match is, not whether the matched policies agree. The lint exists
 * to catch that condition before publication.
 *
 * No threshold is tuned here, and the lint has no threshold to tune: it reports
 * a conflict only when two procedures in one category assert numeric policy
 * values that share no common value.
 *
 * Usage: node tooling/conflicts/verify-conflict-lint.mjs
 * Verdict: prints CONFLICT LINT VERIFICATION OK on success.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractPolicyFacts,
  findConflicts,
  loadCorpus,
  runCli,
} from './lint-procedure-conflicts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const corpusPath = resolve(root, 'tooling/eval/simulated-tenant/corpus.json');
const batchPath = resolve(root, 'tooling/eval/simulated-tenant/chaos-500.json');

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

/** The injected conflicting procedure, read from the pinned batch. */
function injectedConflictSop() {
  const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
  const ticket = batch.tickets.find((candidate) => candidate.ticketId === 'SIM-TICKET-00272');
  if (ticket === undefined) throw new Error('SIM-TICKET-00272 is missing from the pinned batch');
  const injected = ticket.testEnvironment?.additionalSops?.[0];
  if (injected === undefined) throw new Error('SIM-TICKET-00272 carries no injected conflicting procedure');
  return { batch, ticket, injected };
}

const corpusSops = loadCorpus([corpusPath]);
const { batch, ticket, injected } = injectedConflictSop();

// 1. The measured case is still present in the batch, unchanged.
check(ticket.expected?.reason === 'conflicting_procedure_guidance', 'SIM-TICKET-00272 no longer expects conflicting-guidance escalation');
check(injected.id === 'wc-payout-conflict', `unexpected injected procedure id: ${injected.id}`);
check(injected.category === 'Creator payouts', `unexpected injected procedure category: ${injected.category}`);
const conflictTickets = batch.tickets.filter((candidate) => candidate.chaosMutation?.type === 'contradicting_sops');
check(conflictTickets.length === 7, `expected 7 contradictory-policy tickets, found ${conflictTickets.length}`);
check(
  conflictTickets.every((candidate) => candidate.testEnvironment?.additionalSops?.[0]?.id === 'wc-payout-conflict'),
  'a contradictory-policy ticket does not inject wc-payout-conflict',
);

// 2. Fact extraction reads the asserted claim, not the value the procedure discards.
const payoutFacts = extractPolicyFacts(corpusSops.find((sop) => sop.id === 'wc-payout'));
const injectedFacts = extractPolicyFacts(injected);
const payoutWindows = payoutFacts.window_days.map((entry) => entry.value);
const injectedWindows = injectedFacts.window_days.map((entry) => entry.value);
check(
  payoutWindows.some(([low, high]) => low === 2 && high === 5),
  `wc-payout no longer asserts a 2-5 business-day window: ${JSON.stringify(payoutWindows)}`,
);
check(
  injectedWindows.some(([low, high]) => low === 1 && high === 1),
  `wc-payout-conflict no longer asserts a 1 business-day window: ${JSON.stringify(injectedWindows)}`,
);
check(
  !injectedWindows.some(([low, high]) => low === 2 && high === 5),
  'the lint counted the explicitly rejected 2-5 day estimate as an assertion',
);

// 3. The clean corpus is clean, and the contaminated corpus is not.
check(findConflicts(corpusSops).length === 0, 'the unmodified simulated corpus reports a conflict');
const conflicts = findConflicts([...corpusSops, injected]);
check(conflicts.length === 1, `expected exactly one conflict, found ${conflicts.length}`);
const [conflict] = conflicts;
if (conflict !== undefined) {
  check(conflict.category === 'Creator payouts', `unexpected conflict category: ${conflict.category}`);
  check(conflict.key === 'window_days', `unexpected conflict key: ${conflict.key}`);
  const ids = [conflict.left.sopId, conflict.right.sopId].sort();
  check(ids.join(',') === 'wc-payout,wc-payout-conflict', `unexpected conflicting pair: ${ids.join(',')}`);
  check(conflict.left.values.length > 0 && conflict.right.values.length > 0, 'a conflict was reported without evidence on both sides');
}

// 4. Negative control: a pair that agrees is not flagged.
const agreeing = findConflicts([...corpusSops, { ...corpusSops.find((sop) => sop.id === 'wc-payout'), id: 'wc-payout-copy' }]);
check(agreeing.length === 0, 'two procedures stating the same window were reported as a conflict');

// 5. The command-line contract: exit 0 on a clean corpus, exit 1 on a conflict.
const baseOutput = [];
const baseStatus = runCli([corpusPath], (text) => baseOutput.push(text));
check(baseStatus === 0, `lint returned ${baseStatus} on the clean corpus`);
check(baseOutput.join('').includes('Conflicts found: 0'), 'lint did not report zero conflicts on the clean corpus');

const scratch = mkdtempSync(join(tmpdir(), 'sop-conflict-lint-'));
try {
  const mergedPath = resolve(scratch, 'corpus-with-conflict.json');
  writeFileSync(mergedPath, `${JSON.stringify({ data_mode: 'simulated', sops: [...corpusSops, injected] }, null, 2)}\n`);
  const conflictOutput = [];
  const conflictStatus = runCli([mergedPath], (text) => conflictOutput.push(text));
  check(conflictStatus === 1, `lint returned ${conflictStatus} on the conflicting corpus, expected 1`);
  check(conflictOutput.join('').includes('CONFLICT [Creator payouts] window_days'), 'lint output does not name the payout window conflict');

  const jsonOutput = [];
  const jsonStatus = runCli(['--json', mergedPath], (text) => jsonOutput.push(text));
  check(jsonStatus === 1, `lint returned ${jsonStatus} for the JSON report on the conflicting corpus`);
  const parsed = JSON.parse(jsonOutput.join(''));
  check(parsed.conflicts?.length === 1, 'the JSON report does not contain exactly one conflict');

  const usageStatus = runCli([], () => {}, () => {});
  check(usageStatus === 2, `lint returned ${usageStatus} with no arguments, expected 2`);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

if (failures.length > 0) {
  process.stderr.write(`CONFLICT LINT VERIFICATION FAILED: ${failures.join('; ')}\n`);
  process.exit(1);
}
process.stdout.write('CONFLICT LINT VERIFICATION OK\n');
process.stdout.write(`${JSON.stringify({
  data_mode: 'simulated',
  corpusProcedures: corpusSops.length,
  contaminatedProcedures: corpusSops.length + 1,
  conflictsOnCleanCorpus: 0,
  conflictsOnContaminatedCorpus: conflicts.length,
  conflict: conflict === undefined ? null : {
    category: conflict.category,
    key: conflict.key,
    left: { sopId: conflict.left.sopId, values: conflict.left.values.map((entry) => entry.value) },
    right: { sopId: conflict.right.sopId, values: conflict.right.values.map((entry) => entry.value) },
  },
  reproducedFrom: 'tooling/eval/simulated-tenant/chaos-500.json SIM-TICKET-00272',
}, null, 2)}\n`);
