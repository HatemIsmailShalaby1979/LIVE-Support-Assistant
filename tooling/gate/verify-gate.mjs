#!/usr/bin/env node
/**
 * Phase 4 verification — the gate in the client, and the escalation flow.
 *
 * The design's hardest rule is that a blocked query shows the agent **no
 * procedure content at all**. A rule like that is easy to state, easy to
 * implement, and easy to break six months later in a component nobody re-reads.
 * So it is verified here as a leak test: every blocked query in the golden set has
 * its agent view serialised and searched for every procedure title, summary,
 * suggested reply and escalation reason in the corpus, for the retrieved passages,
 * and for the query text itself.
 *
 * Also verified:
 *
 *   - the escalation record carries the candidates the ops manager needs, while
 *     the agent view carries none of them
 *   - a query produces the same score and the same decision on two independently
 *     constructed indexes, which is what makes the audit trail worth keeping
 *   - an accepted answer always carries non-empty evidence
 *
 * Run after `pnpm build`:
 *     node tooling/gate/verify-gate.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_GATE_CONFIG,
  buildAgentView,
  buildEscalationRecord,
  evaluateGate,
} from '../../packages/core/dist/index.js';
import { EMBEDDING_MODEL, createEmbedder } from '../../packages/embedder/dist/index.js';
import { buildCorpusPassages, searchTopK } from '../../packages/vector-store/dist/index.js';
import { IN_SCOPE, OUT_OF_SCOPE } from '../eval/golden-set.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

function uuid(value) {
  const tail = String(value).padStart(12, '0');
  return `00000000-0000-4000-8000-${tail}`;
}

const corpus = JSON.parse(
  readFileSync(resolve(root, 'apps/web/src/data/knowledgeBase.json'), 'utf8'),
);

const passages = buildCorpusPassages(corpus);
const cacheDir = resolve(root, '.cache/transformers');

/** The audited prototype configuration; tenant calibration is not connected. */
const GATE = DEFAULT_GATE_CONFIG;

const checks = [];

function expect(name, expected, observed) {
  checks.push({
    name,
    expected: String(expected),
    observed: String(observed),
    ok: String(expected) === String(observed),
  });
}

function expectTrue(name, condition, detail = '') {
  checks.push({
    name,
    expected: 'true',
    observed: condition ? 'true' : `false ${detail}`,
    ok: condition === true,
  });
}

// ---------------------------------------------------------------------------
// Two independently constructed indexes. If these disagree, the audit trail is
// not evidence of anything.
// ---------------------------------------------------------------------------

async function buildIndex() {
  const embedder = await createEmbedder(EMBEDDING_MODEL, { cacheDir });
  const vectors = await embedder.embedPassages(passages.map((passage) => passage.text));

  const entries = passages.map((passage, index) => ({
    sopId: passage.sopId,
    vector: vectors[index],
    text: passage.text,
  }));

  return {
    embedder,
    entries,
    async retrieve(query) {
      const vector = await embedder.embedQuery(query);

      return searchTopK(vector, entries, GATE.topK);
    },
  };
}

const primary = await buildIndex();
const secondary = await buildIndex();

// ---------------------------------------------------------------------------
// Walk the golden set
// ---------------------------------------------------------------------------

const allQueries = [
  ...IN_SCOPE.map((item) => ({ query: item.query, expected: item.sopId })),
  ...OUT_OF_SCOPE.map((query) => ({ query, expected: null })),
];

/** Full procedure text, for the leak scan. */
const forbidden = corpus.flatMap((sop) => [
  sop.title,
  sop.summary,
  sop.suggestedReply,
  sop.escalationReason,
]);

let accepted = 0;
let blocked = 0;
const acceptedQueries = [];
let answersWithEvidence = 0;
let blockedWithLeak = 0;
let blockedCarryingQuery = 0;
let escalationMissingCandidates = 0;
let manualReviewSopsAnswered = 0;
let manualReviewEscalations = 0;
const manualReviewQueries = [];
let structurallyWrong = 0;

const blockedKeysExpected = ['bundleVersion', 'escalationId', 'kind', 'message', 'reason'];

for (const [index, item] of allQueries.entries()) {
  const candidates = await primary.retrieve(item.query);
  const decision = evaluateGate(candidates, GATE);
  const escalationId = uuid(index);

  const agentView = buildAgentView(decision, corpus, 1, escalationId);
  const serialised = JSON.stringify(agentView);

  if (agentView.kind === 'answer') {
    accepted += 1;
    acceptedQueries.push(item.query);

    if (agentView.evidence.length > 0 && agentView.evidence[0].passage.length > 0) {
      answersWithEvidence += 1;
    }

    // An answer must name a procedure that exists in the bundle.
    if (!corpus.some((sop) => sop.id === agentView.sop.id)) {
      structurallyWrong += 1;
    }

    if (agentView.sop.escalationRequired) {
      manualReviewSopsAnswered += 1;
    }

    continue;
  }

  blocked += 1;

  if (agentView.reason === 'manual_review_required') {
    manualReviewEscalations += 1;
    manualReviewQueries.push(item.query);
  }

  // 1. No procedure content, in any form.
  for (const text of forbidden) {
    if (text.length > 0 && serialised.includes(text)) {
      blockedWithLeak += 1;
      break;
    }
  }

  // 2. Not even any retrieved passage.
  for (const candidate of decision.evidence) {
    for (const passage of candidate.evidence) {
      if (passage.length > 0 && serialised.includes(passage)) {
        blockedWithLeak += 1;
      }
    }
  }

  // 3. The query the agent typed is not echoed back to them.
  if (serialised.includes(item.query)) {
    blockedCarryingQuery += 1;
  }

  // 4. The view has exactly the fields it is allowed to have — no evidence
  //    field, no candidates, no sop. Checked structurally, not by convention.
  const keys = Object.keys(agentView).sort();
  if (JSON.stringify(keys) !== JSON.stringify(blockedKeysExpected)) {
    structurallyWrong += 1;
  }

  // 5. The escalation record, which the ops manager sees, must carry them.
  const record = buildEscalationRecord(agentView.reason, decision, {
    escalationId,
    queryEventId: uuid(index),
    queryOccurredAt: '2026-09-25T07:30:00.000Z',
    queryText: item.query,
    bundleVersion: 1,
    modelId: EMBEDDING_MODEL.id,
    modelRevision: EMBEDDING_MODEL.revision,
    parameters: GATE,
  });

  if (decision.evidence.length > 0 && record.evidence.candidates.length === 0) {
    escalationMissingCandidates += 1;
  }

  if (record.evidence.modelRevision !== EMBEDDING_MODEL.revision) {
    structurallyWrong += 1;
  }
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

let determinismMismatches = 0;
const determinismSample = allQueries.slice(0, 20);

for (const item of determinismSample) {
  const first = await primary.retrieve(item.query);
  const second = await secondary.retrieve(item.query);

  for (let index = 0; index < first.length; index += 1) {
    if (first[index]?.score !== second[index]?.score) {
      determinismMismatches += 1;
    }

    if (first[index]?.sopId !== second[index]?.sopId) {
      determinismMismatches += 1;
    }
  }

  const firstDecision = evaluateGate(first, GATE);
  const secondDecision = evaluateGate(second, GATE);

  if (firstDecision.outcome !== secondDecision.outcome) {
    determinismMismatches += 1;
  }
}

const invalidDecision = evaluateGate(
  [{ sopId: 'invalid', score: Number.NaN, evidence: ['invalid'] }],
  GATE,
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

expectTrue('every accepted answer carries evidence', answersWithEvidence === accepted, `(${answersWithEvidence}/${accepted})`);
expectTrue('manual-review SOPs never become answers', manualReviewSopsAnswered === 0, `(${manualReviewSopsAnswered} exposed)`);
expectTrue('manual-review matches become escalations', manualReviewEscalations > 0, `(${manualReviewEscalations})`);
expect('blocked views leaking procedure content', 0, blockedWithLeak);
expect('blocked views echoing the query text', 0, blockedCarryingQuery);
expect('blocked views with wrong field set', 0, structurallyWrong);
expect('escalation records missing candidates', 0, escalationMissingCandidates);
expect('score/decision mismatches across indexes', 0, determinismMismatches);
expectTrue('non-finite retrieval scores fail closed',
  invalidDecision.outcome === 'blocked' && invalidDecision.reason === 'invalid_candidate',
  JSON.stringify(invalidDecision));
expectTrue('the golden set produced both outcomes', accepted > 0 && blocked > 0, `(accepted ${accepted}, blocked ${blocked})`);

console.log('');
console.log('=== gate and escalation ===');
console.log(`queries walked          ${allQueries.length}`);
console.log(`accepted                ${accepted}`);
console.log(`accepted queries        ${acceptedQueries.join(' | ')}`);
console.log(`escalated               ${blocked}`);
console.log(`manual-review subset    ${manualReviewEscalations}`);
console.log(`manual-review queries   ${manualReviewQueries.join(' | ')}`);
console.log(`determinism sample      ${determinismSample.length} queries x 2 indexes`);
console.log('');

const width = {
  name: Math.max(...checks.map((check) => check.name.length), 5),
  expected: Math.max(...checks.map((check) => check.expected.length), 8),
};

console.log(`${'CHECK'.padEnd(width.name)}  ${'EXPECTED'.padEnd(width.expected)}  ${'OBSERVED'.padEnd(width.expected)}  RESULT`);
console.log('-'.repeat(width.name + width.expected * 2 + 16));

for (const check of checks) {
  console.log(
    `${check.name.padEnd(width.name)}  ${check.expected.padEnd(width.expected)}  ${check.observed.padEnd(width.expected)}  ${check.ok ? 'PASS' : 'FAIL'}`,
  );
}

const failures = checks.filter((check) => !check.ok).length;

console.log('');
console.log(`checks: ${checks.length}  failures: ${failures}`);
console.log('');
console.log(failures === 0 ? 'GATE VERIFICATION OK' : 'GATE VERIFICATION FAILED');

process.exit(failures === 0 ? 0 : 1);
