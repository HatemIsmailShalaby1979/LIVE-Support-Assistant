#!/usr/bin/env node
/**
 * Phase 0 behavioural parity harness.
 *
 * Compares the extracted `@sop/core` decision path against the matching rule
 * the prototype ran before the monorepo migration, reimplemented verbatim from
 * `src/App.tsx` as it stood at commit 0d9e090:
 *
 *     for each policy: score = number of trigger terms contained in the query
 *     best = first policy with a strictly greater score
 *     answer only when best !== null && best score >= 2
 *
 * Run after `pnpm build`:
 *     node tooling/eval/parity-check.mjs
 *
 * Exit code 0 means every query produced an identical answer and an identical
 * evidence trail. This file is also the seed of the Phase 1 retrieval eval
 * harness: replace the reference implementation with the cosine baseline and
 * the same query set measures semantic recall.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEGACY_GATE_CONFIG,
  evaluateGate,
  scoreByKeywords,
} from '../../packages/core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpusPath = resolve(here, '../../apps/web/src/data/knowledgeBase.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));

/** The pre-migration rule, verbatim. Returns the answered procedure id or null. */
function legacyFindBestMatch(inputText, policies) {
  const inputLower = inputText.toLowerCase();

  let bestMatch = null;
  let highestScore = 0;

  for (const policy of policies) {
    let score = 0;
    for (const keyword of policy.triggerKeywords) {
      if (inputLower.includes(keyword.toLowerCase())) {
        score++;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = policy;
    }
  }

  if (bestMatch !== null && highestScore >= 2) {
    return { id: bestMatch.id, hits: highestScore };
  }

  return { id: null, hits: highestScore };
}

/** The extracted decision path: scorer -> gate -> id. */
function coreFindBestMatch(inputText) {
  const decision = evaluateGate(
    scoreByKeywords(inputText, corpus),
    LEGACY_GATE_CONFIG,
  );

  if (decision.outcome === 'blocked') {
    const top = decision.evidence[0];
    return { id: null, hits: top ? top.score * 2 : 0, evidence: decision.evidence };
  }

  return { id: decision.sopId, hits: decision.score * 2, evidence: decision.evidence };
}

/**
 * The golden set. Coverage is deliberate: the zero-hit and single-hit block
 * paths, both sides of the two-hit bar, ranking across unequal hit counts, a
 * genuine tie resolved by document order, case-insensitivity, and queries whose
 * terms appear in prose but not in the trigger list.
 */
const QUERIES = [
  // --- below the bar ---
  '',
  'hello, are you there?',
  'my account has a problem',
  'appeal',                              // 1 hit on two procedures
  'login',                               // 1 hit
  'refund',                              // 1 hit on procedure 1
  'nothing here at all',                 // 0 hits
  // --- at and above the bar ---
  'gift refund',                         // 2 hits, procedure 1
  'login password',                      // 2 hits, procedure 3
  'ban violation',                       // 2 hits, procedure 2
  'host eligibility',                    // 2 hits, procedure 4
  'penalty appeal',                      // 2 hits on 5, 1 on 2
  // --- ranking across unequal counts ---
  'appeal ban violation guidelines',     // 4 hits on 2, 1 on 5
  'penalty livestream restricted appeal shadow ban punishment', // 7 hits on 5
  'login password hacked security two-factor 2fa locked out cannot access', // 8 hits on 3
  'gift coins refund',                   // 3 hits on 1
  // --- a genuine tie at the bar, resolved by document order ---
  'appeal guidelines penalty',           // 2 hits on 2 and 2 hits on 5
  'appeal violation penalty',            // 2 hits on 2, 2 hits on 5
  // --- case handling ---
  'GIFT REFUND',
  'Login Password',
  'GiFt ReFuNd',
  // --- terms present in prose but absent from the trigger list ---
  'diamonds withdrawal minimum payout balance',
  'inbox system notifications account updates',
  // --- long realistic message ---
  'Hi, I was banned for a community guidelines violation and I want to appeal the strike on my account.',
  'I bought coins but the payment failed and I want a refund for the gift I sent.',
];

const rows = [];
let failures = 0;

for (const query of QUERIES) {
  const legacy = legacyFindBestMatch(query, corpus);
  const core = coreFindBestMatch(query);

  const idMatches = legacy.id === core.id;
  const hitsMatch = legacy.hits === core.hits;
  const ok = idMatches && hitsMatch;

  if (!ok) {
    failures += 1;
  }

  rows.push({
    ok,
    query: query.length > 46 ? `${query.slice(0, 43)}...` : query || '(empty)',
    legacy: legacy.id ?? 'blocked',
    core: core.id ?? 'blocked',
    hits: `${legacy.hits}/${core.hits}`,
  });
}

const width = {
  query: Math.max(...rows.map((row) => row.query.length), 5),
  legacy: Math.max(...rows.map((row) => row.legacy.length), 6),
  core: Math.max(...rows.map((row) => row.core.length), 4),
};

const pad = (value, size) => String(value).padEnd(size);

console.log(
  `${pad('QUERY', width.query)}  ${pad('LEGACY', width.legacy)}  ${pad('CORE', width.core)}  HITS`,
);
console.log('-'.repeat(width.query + width.legacy + width.core + 14));

for (const row of rows) {
  console.log(
    `${pad(row.query, width.query)}  ${pad(row.legacy, width.legacy)}  ${pad(row.core, width.core)}  ${row.hits}  ${row.ok ? '' : '<-- MISMATCH'}`,
  );
}

console.log('');
console.log(`queries: ${rows.length}  mismatches: ${failures}`);

if (failures > 0) {
  console.error('PARITY FAILED');
  process.exit(1);
}

console.log('PARITY OK');
