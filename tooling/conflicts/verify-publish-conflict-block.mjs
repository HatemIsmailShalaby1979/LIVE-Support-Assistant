#!/usr/bin/env node
/**
 * Verification for decision-doc option (a): a tenant bundle whose corpus carries
 * a same-category numeric conflict is blocked at publish time, before signing.
 *
 * It exercises the exact module the Deno publish function imports
 * (`conflict-core.mjs` -> `lintCorpusForPublish`), so the gate that runs in
 * production is the one under test. No network, no signing, no database.
 *
 * Coverage:
 *   (a) a conflicting corpus is blocked,
 *   (b) a non-conflicting corpus publishes,
 *   (c) the SIM-TICKET-00272 payout-conflict case is blocked and names both
 *       procedures, the field, and both values,
 *   (d) negative control: two procedures stating the same value are not flagged,
 *   (e) the lint's stated limitation (English number words only) is locked: a
 *       Spanish-only conflicting pair is NOT flagged while the English equivalent
 *       IS, proving the behaviour is the language, not the data.
 *
 * Usage: node tooling/conflicts/verify-publish-conflict-block.mjs
 * Verdict: prints PUBLISH CONFLICT BLOCK OK on success.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractPolicyFacts, findConflicts, lintCorpusForPublish } from './conflict-core.mjs';
import { loadCorpus } from './lint-procedure-conflicts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const corpusPath = resolve(root, 'tooling/eval/simulated-tenant/corpus.json');
const batchPath = resolve(root, 'tooling/eval/simulated-tenant/chaos-500.json');

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const corpusSops = loadCorpus([corpusPath]);

/** The injected conflicting procedure, read from the pinned batch. */
function injectedConflictSop() {
  const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
  const ticket = batch.tickets.find((candidate) => candidate.ticketId === 'SIM-TICKET-00272');
  if (ticket === undefined) throw new Error('SIM-TICKET-00272 is missing from the pinned batch');
  const injected = ticket.testEnvironment?.additionalSops?.[0];
  if (injected === undefined) throw new Error('SIM-TICKET-00272 carries no injected conflicting procedure');
  return injected;
}
const injected = injectedConflictSop();

// (a) a conflicting corpus is blocked.
const conflictingCorpus = [...corpusSops, injected];
const blocked = lintCorpusForPublish(conflictingCorpus);
check(blocked.ok === false, `(a) a corpus with wc-payout-conflict was not blocked`);
check(blocked.conflicts.length >= 1, `(a) the block reported no conflicts`);

// (b) a non-conflicting corpus publishes.
const clean = lintCorpusForPublish(corpusSops);
check(clean.ok === true, `(b) the clean ${corpusSops.length}-procedure corpus was blocked`);
check(clean.conflicts.length === 0, `(b) the clean corpus reported conflicts`);

// (c) the SIM-TICKET-00272 case is blocked and names the field + both values.
const cConflicts = findConflicts(conflictingCorpus);
const payoutConflict = cConflicts.find(
  (c) => c.category === 'Creator payouts' && c.key === 'window_days',
);
check(payoutConflict !== undefined, `(c) SIM-TICKET-00272 payout conflict not found`);
if (payoutConflict !== undefined) {
  const ids = [payoutConflict.left.sopId, payoutConflict.right.sopId].sort();
  check(
    ids.join(',') === 'wc-payout,wc-payout-conflict',
    `(c) unexpected conflicting pair: ${ids.join(',')}`,
  );
  const allValues = [
    ...payoutConflict.left.values.map((v) => JSON.stringify(v.value)),
    ...payoutConflict.right.values.map((v) => JSON.stringify(v.value)),
  ].sort();
  // The contradictory payout-arrival windows are 1 business day vs 2-5 business
  // days. `wc-payout` also asserts a 7-business-day routing window; that is a
  // pre-existing extraction from its escalation sentence and is not the conflict,
  // so we assert the two payout-arrival values are present rather than exact match.
  check(allValues.includes('[1,1]'), `(c) the 1-business-day conflicting claim is missing: ${allValues.join('|')}`);
  check(allValues.includes('[2,5]'), `(c) the 2-5-business-day standard claim is missing: ${allValues.join('|')}`);
  check(
    /wc-payout-conflict/.test(blocked.message) && /window_days/.test(blocked.message),
    `(c) block message does not name the procedure and field: ${blocked.message}`,
  );
}

// (d) negative control: two procedures stating the same value are not flagged.
const copy = { ...corpusSops.find((sop) => sop.id === 'wc-payout'), id: 'wc-payout-copy' };
const agreeing = lintCorpusForPublish([...corpusSops, copy]);
check(agreeing.ok === true, `(d) two procedures stating the same window were flagged as a conflict`);
check(findConflicts([...corpusSops, copy]).length === 0, `(d) findConflicts flagged an agreeing pair`);

// (e) the lint's known limitation (English number words only) is locked.
const spanishPair = [
  {
    id: 'es-a', title: 'Pago A', category: 'Creator payouts', triggerKeywords: [],
    summary: 'El pago procesado llega en dos a cinco días hábiles.',
    suggestedReply: 'Revisa en dos a cinco días hábiles.',
    escalationRequired: false, escalationReason: '',
  },
  {
    id: 'es-b', title: 'Pago B', category: 'Creator payouts', triggerKeywords: [],
    summary: 'El pago llega en uno día hábil.',
    suggestedReply: 'Un día hábil.',
    escalationRequired: false, escalationReason: '',
  },
];
const spanishResult = lintCorpusForPublish(spanishPair);
check(
  spanishResult.ok === true,
  `(e) the Spanish-only conflicting pair was flagged — the English-only limitation has silently changed`,
);

const englishPair = [
  {
    id: 'en-a', title: 'Payout A', category: 'Creator payouts', triggerKeywords: [],
    summary: 'A processed payout arrives in two to five business days.',
    suggestedReply: 'Check in two to five business days.',
    escalationRequired: false, escalationReason: '',
  },
  {
    id: 'en-b', title: 'Payout B', category: 'Creator payouts', triggerKeywords: [],
    summary: 'A payout arrives in one business day.',
    suggestedReply: 'One business day.',
    escalationRequired: false, escalationReason: '',
  },
];
const englishResult = lintCorpusForPublish(englishPair);
check(
  englishResult.ok === false,
  `(e) the English equivalent was NOT flagged — the limitation test is inconsistent with itself`,
);
// Sanity: extraction must still read English windows, so the contrast is real.
const enFacts = extractPolicyFacts(englishPair[0]);
check(
  enFacts.window_days.some((entry) => entry.value[0] === 2 && entry.value[1] === 5),
  `(e) English window extraction no longer reads 2-5 days, so the contrast is meaningless`,
);

if (failures.length > 0) {
  process.stderr.write(`PUBLISH CONFLICT BLOCK FAILED: ${failures.join('; ')}\n`);
  process.exit(1);
}

process.stdout.write('PUBLISH CONFLICT BLOCK OK\n');
process.stdout.write(`${JSON.stringify({
  data_mode: 'simulated',
  cleanCorpusProcedures: corpusSops.length,
  conflictingCorpusBlocked: blocked.ok === false,
  conflictsOnConflictingCorpus: blocked.conflicts.length,
  simTicket00272Blocked: payoutConflict !== undefined,
  sameValueNotFlagged: agreeing.ok === true,
  englishOnlyLimitationLocked: spanishResult.ok === true && englishResult.ok === false,
}, null, 2)}\n`);
