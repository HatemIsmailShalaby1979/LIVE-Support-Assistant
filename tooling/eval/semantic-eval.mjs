#!/usr/bin/env node
/**
 * Phase 1 retrieval evaluation, second pass: model and reranker comparison.
 *
 * The current pass measures the completed public-policy corpus. On-device
 * semantic search still beats keyword matching by a wide margin, but the
 * product metric is narrower: a query counts as an auto-answer only when the
 * correct policy does not itself require human review. This pass compares:
 *
 *   1. a retrieval-trained bi-encoder instead of a sentence-similarity model;
 *   2. a cross-encoder reranker over the shortlist.
 *
 * Every candidate is measured on the same golden set with the same calibration
 * procedure, so the comparison is like-for-like. The gate is calibrated on the
 * top-1 minus top-2 margin, which pass one showed is the signal that carries
 * information; the absolute floor was inert and is held at zero here.
 *
 * Run after `pnpm build`:
 *     node tooling/eval/semantic-eval.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import {
  LEGACY_GATE_CONFIG,
  evaluateGate,
  scoreByKeywords,
} from '../../packages/core/dist/index.js';
import {
  CROSS_ENCODER_RERANKER,
  EMBEDDING_MODEL,
  EMBEDDING_MODELS,
  createEmbedder,
  createReranker,
} from '../../packages/embedder/dist/index.js';
import {
  buildCorpusPassages,
  searchTopK,
  searchTopKPassages,
} from '../../packages/vector-store/dist/index.js';
import { IN_SCOPE, OUT_OF_SCOPE } from './golden-set.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const cacheDir = resolve(root, '.cache/transformers');
const corpus = JSON.parse(
  readFileSync(resolve(root, 'apps/web/src/data/knowledgeBase.json'), 'utf8'),
);

const passages = buildCorpusPassages(corpus);
const TOP_K = 5;
const RERANK_CANDIDATES = 20;
const inScopeCount = IN_SCOPE.length;
const manualReviewSopIds = new Set(
  corpus.filter((document) => document.escalationRequired).map((document) => document.id),
);

const pct = (numerator, denominator) => ((100 * numerator) / denominator).toFixed(1);

function percentile(values, fraction) {
  if (values.length === 0) {
    return Number.NaN;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));

  return sorted[index];
}

/**
 * Run every golden-set query through a retriever.
 *
 * @param label Human-readable retriever name.
 * @param retrieve Query to ranked candidates, best first.
 */
async function measure(label, retrieve) {
  const inScope = [];
  const outOfScope = [];
  let correctAt1 = 0;
  let correctAt5 = 0;

  for (const item of IN_SCOPE) {
    const ranked = await retrieve(item.query);
    const top = ranked[0];
    const score = top?.score ?? 0;
    const got = top?.sopId ?? null;

    if (got === item.sopId) {
      correctAt1 += 1;
    }

    if (ranked.some((candidate) => candidate.sopId === item.sopId)) {
      correctAt5 += 1;
    }

    inScope.push({
      expected: item.sopId,
      got,
      score,
      margin: score - (ranked[1]?.score ?? 0),
    });
  }

  for (const query of OUT_OF_SCOPE) {
    const ranked = await retrieve(query);
    const score = ranked[0]?.score ?? 0;

    outOfScope.push({
      score,
      margin: score - (ranked[1]?.score ?? 0),
    });
  }

  return { label, correctAt1, correctAt5, inScope, outOfScope };
}

/**
 * Find the lowest observed margin that holds at least 0.95 answer precision,
 * then report how many in-scope queries it can answer without human handling.
 */
function scoreAtMargin(inScope, outOfScope, margin) {
  let correct = 0;
  let manualEscalations = 0;
  let wrong = 0;

  for (const result of inScope) {
    if (result.margin < margin) {
      continue;
    }

    if (result.got !== result.expected) {
      wrong += 1;
    } else if (manualReviewSopIds.has(result.expected)) {
      manualEscalations += 1;
    } else {
      correct += 1;
    }
  }

  const falseAccept = outOfScope.filter((result) => result.margin >= margin).length;
  const attempts = correct + wrong + falseAccept;

  return {
    margin,
    correct,
    manualEscalations,
    wrong,
    falseAccept,
    precision: attempts === 0 ? 1 : correct / attempts,
  };
}

function calibrate(measured) {
  let best = null;
  const margins = [
    ...new Set([
      0,
      ...measured.inScope.map((result) => result.margin),
      ...measured.outOfScope.map((result) => result.margin),
    ]),
  ].sort((left, right) => left - right);

  for (const margin of margins) {
    const point = scoreAtMargin(measured.inScope, measured.outOfScope, margin);
    const better =
      best === null ||
      point.correct > best.correct ||
      (point.correct === best.correct && point.margin < best.margin);

    if (point.precision >= 0.95 && better) {
      best = point;
    }
  }

  return best;
}

function describe(point) {
  return point === null
    ? 'no operating point reaches 0.95 precision'
    : `margin ${point.margin.toFixed(4)} -> ${point.correct}/${inScopeCount} (${pct(point.correct, inScopeCount)}%) auto-answered, ${point.manualEscalations} manual-only matches, ${point.wrong} wrong, ${point.falseAccept} false accepts, precision ${point.precision.toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// 1. Keyword baseline
// ---------------------------------------------------------------------------

let keywordCorrectAt1 = 0;
let keywordCorrectAt5 = 0;
let keywordNoCandidates = 0;

for (const item of IN_SCOPE) {
  const candidates = scoreByKeywords(item.query, corpus);
  candidates.sort((left, right) => right.score - left.score);
  const ranked = candidates.slice(0, TOP_K);

  if (ranked.length === 0) {
    keywordNoCandidates += 1;
  }

  if (ranked[0]?.sopId === item.sopId) {
    keywordCorrectAt1 += 1;
  }

  if (ranked.some((candidate) => candidate.sopId === item.sopId)) {
    keywordCorrectAt5 += 1;
  }
}

const keywordGateAnswered = IN_SCOPE.filter(
  (item) => evaluateGate(scoreByKeywords(item.query, corpus), LEGACY_GATE_CONFIG).outcome === 'accepted',
).length;

console.log('=== keyword baseline (legacy parity path) ===');
console.log(`recall@1                 ${pct(keywordCorrectAt1, inScopeCount)}%  (${keywordCorrectAt1}/${inScopeCount})`);
console.log(`recall@5                 ${pct(keywordCorrectAt5, inScopeCount)}%  (${keywordCorrectAt5}/${inScopeCount})`);
console.log(`no candidates at all     ${keywordNoCandidates} of ${inScopeCount}`);
console.log(`gate answered            ${keywordGateAnswered} of ${inScopeCount}`);
console.log('');

// ---------------------------------------------------------------------------
// 2. Bi-encoder comparison
// ---------------------------------------------------------------------------

const passageTexts = passages.map((passage) => passage.text);
const results = [];

for (const spec of EMBEDDING_MODELS) {
  process.stdout.write(`embedding with ${spec.id} ... `);

  const loadStart = performance.now();
  const embedder = await createEmbedder(spec, { cacheDir });
  const loadMs = performance.now() - loadStart;

  const indexStart = performance.now();
  const vectors = await embedder.embedPassages(passageTexts);
  const indexMs = performance.now() - indexStart;

  const entries = passages.map((passage, index) => ({
    sopId: passage.sopId,
    vector: vectors[index],
    text: passage.text,
  }));

  const measured = await measure(spec.id, async (query) => {
    const vector = await embedder.embedQuery(query);

    return searchTopK(vector, entries, TOP_K);
  });

  results.push({ spec, embedder, entries, measured, loadMs, indexMs });
  console.log('done');
}

console.log('');
console.log('=== bi-encoder comparison ===');
console.log('model                        recall@1  recall@5   best gate at >=0.95 precision');

for (const result of results) {
  const best = calibrate(result.measured);
  console.log(
    `${result.spec.id.padEnd(28)} ${(pct(result.measured.correctAt1, inScopeCount) + '%').padStart(7)}  ${(pct(result.measured.correctAt5, inScopeCount) + '%').padStart(7)}   ${describe(best)}`,
  );
}

console.log('');

const observedLeader = [...results].sort(
  (left, right) =>
    (calibrate(right.measured)?.correct ?? -1) - (calibrate(left.measured)?.correct ?? -1),
)[0];

console.log(`highest observed bi-encoder: ${observedLeader.spec.id}`);

const champion = results.find((result) => result.spec.id === EMBEDDING_MODEL.id);
if (champion === undefined) {
  throw new Error('predeclared incumbent model missing from evaluation');
}
console.log(`predeclared incumbent for hold-out: ${champion.spec.id}`);
console.log('');

console.log('=== incumbent fixed-threshold audit ===');
for (const margin of [0.15, 0.18, 0.19, 0.2]) {
  console.log(`margin ${margin.toFixed(2)} -> ${describe(scoreAtMargin(champion.measured.inScope, champion.measured.outOfScope, margin))}`);
}
console.log('');

// ---------------------------------------------------------------------------
// 3. Cross-encoder reranking
// ---------------------------------------------------------------------------

process.stdout.write(`loading reranker ${CROSS_ENCODER_RERANKER.id} ... `);
const rerankLoadStart = performance.now();
const reranker = await createReranker(CROSS_ENCODER_RERANKER, { cacheDir });
const rerankLoadMs = performance.now() - rerankLoadStart;
console.log(`done (${rerankLoadMs.toFixed(0)} ms)`);
console.log('');

const rerankLatencies = [];

const reranked = await measure(
  `${champion.spec.id} + ${CROSS_ENCODER_RERANKER.id}`,
  async (query) => {
    const vector = await champion.embedder.embedQuery(query);
    const candidates = searchTopKPassages(vector, champion.entries, RERANK_CANDIDATES);

    const rerankStart = performance.now();
    const scores = await reranker.score(
      query,
      candidates.map((candidate) => candidate.evidence[0] ?? ''),
    );
    rerankLatencies.push(performance.now() - rerankStart);

    const rankedPassages = candidates
      .map((candidate, index) => ({
        sopId: candidate.sopId,
        score: scores[index] ?? 0,
        evidence: candidate.evidence,
      }))
      .sort((left, right) => right.score - left.score);
    const bestPerProcedure = new Map();

    for (const candidate of rankedPassages) {
      if (!bestPerProcedure.has(candidate.sopId)) {
        bestPerProcedure.set(candidate.sopId, candidate);
      }
    }

    return [...bestPerProcedure.values()].slice(0, TOP_K);
  },
);

console.log('=== reranked retrieval ===');
console.log(`shortlist                ${RERANK_CANDIDATES} passages per query`);
console.log(`recall@1                 ${pct(reranked.correctAt1, inScopeCount)}%  (${reranked.correctAt1}/${inScopeCount})`);
console.log(`recall@5                 ${pct(reranked.correctAt5, inScopeCount)}%  (${reranked.correctAt5}/${inScopeCount})`);
console.log(`best gate at >=0.95      ${describe(calibrate(reranked))}`);
console.log('');

const championBest = calibrate(champion.measured);
const rerankedBest = calibrate(reranked);

console.log('=== answer rate at >=0.95 precision ===');
console.log(`bi-encoder only          ${describe(championBest)}`);
console.log(`with reranker            ${describe(rerankedBest)}`);
console.log('');

// ---------------------------------------------------------------------------
// 3b. Does the calibrated margin generalise?
//
// If a threshold calibrated on half the golden set does not hold on the other
// half, then no global constant is defensible and calibration has to be a
// per-tenant onboarding step rather than a shipped default.
// ---------------------------------------------------------------------------

function calibrateMarginOnly(train, outOfScope) {
  let best = null;
  const margins = [
    ...new Set([
      0,
      ...train.map((result) => result.margin),
      ...outOfScope.map((result) => result.margin),
    ]),
  ].sort((left, right) => left - right);

  for (const margin of margins) {
    const point = scoreAtMargin(train, outOfScope, margin);
    const better =
      best === null ||
      point.correct > best.correct ||
      (point.correct === best.correct && point.margin < best.margin);

    if (point.precision >= 0.95 && better) {
      best = point;
    }
  }

  return best;
}

function evaluateAtMargin(test, outOfScope, point) {
  if (point === null) {
    return null;
  }

  return {
    ...scoreAtMargin(test, outOfScope, point.margin),
    total: test.length,
  };
}

console.log('=== hold-out validation of the margin threshold ===');

const halves = [
  {
    label: 'calibrate on even queries, test on odd',
    train: champion.measured.inScope.filter((_, index) => index % 2 === 0),
    test: champion.measured.inScope.filter((_, index) => index % 2 === 1),
    trainOutOfScope: champion.measured.outOfScope.filter((_, index) => index % 2 === 0),
    testOutOfScope: champion.measured.outOfScope.filter((_, index) => index % 2 === 1),
  },
  {
    label: 'calibrate on odd queries, test on even',
    train: champion.measured.inScope.filter((_, index) => index % 2 === 1),
    test: champion.measured.inScope.filter((_, index) => index % 2 === 0),
    trainOutOfScope: champion.measured.outOfScope.filter((_, index) => index % 2 === 1),
    testOutOfScope: champion.measured.outOfScope.filter((_, index) => index % 2 === 0),
  },
];

for (const half of halves) {
  const point = calibrateMarginOnly(half.train, half.trainOutOfScope);
  const held = evaluateAtMargin(half.test, half.testOutOfScope, point);

  console.log(`  ${half.label}`);
  console.log(
    point === null
      ? '    no threshold reaches 0.95 precision on the training half'
      : `    calibrated margin ${point.margin.toFixed(4)} -> held-out ${held.correct}/${held.total} auto-answered, ${held.manualEscalations} manual-only, ${held.wrong} wrong, ${held.falseAccept} false accepts, precision ${held.precision.toFixed(3)}`,
  );
}

console.log('');

// ---------------------------------------------------------------------------
// 4. Latency
// ---------------------------------------------------------------------------

for (let index = 0; index < 3; index += 1) {
  await champion.embedder.embedQuery('warm up');
}

const queryLatencies = [];

for (const item of IN_SCOPE.slice(0, 25)) {
  const start = performance.now();
  const vector = await champion.embedder.embedQuery(item.query);
  searchTopK(vector, champion.entries, TOP_K);
  queryLatencies.push(performance.now() - start);
}

const batchStart = performance.now();
await champion.embedder.embedPassages(passageTexts.slice(0, Math.min(200, passageTexts.length)));
const batchMs = performance.now() - batchStart;
const throughput = (Math.min(200, passageTexts.length) * 1000) / batchMs;

const passagesPerProcedure = passages.length / corpus.length;
const projectedSeconds = (5000 * passagesPerProcedure) / throughput;

console.log('=== edge latency ===');
console.log(`retrieval p50 / p95      ${percentile(queryLatencies, 0.5).toFixed(1)} ms / ${percentile(queryLatencies, 0.95).toFixed(1)} ms`);
console.log(`reranker p50 / p95       ${percentile(rerankLatencies, 0.5).toFixed(1)} ms / ${percentile(rerankLatencies, 0.95).toFixed(1)} ms`);
console.log(`model load, cold         ${champion.loadMs.toFixed(0)} ms (reranker ${rerankLoadMs.toFixed(0)} ms)`);
console.log(`projected index build    ${projectedSeconds.toFixed(1)} s for 5,000 procedures`);
console.log('');

// ---------------------------------------------------------------------------
// 5. Exit criteria
// ---------------------------------------------------------------------------

const bestOverall = [championBest, rerankedBest]
  .filter((point) => point !== null)
  .sort((left, right) => right.correct - left.correct)[0] ?? null;

const criteria = [
  {
    name: 'recall@5 beats keyword baseline by >= 15 points',
    passed:
      (100 * champion.measured.correctAt5) / inScopeCount -
        (100 * keywordCorrectAt5) / inScopeCount >=
      15,
    detail: `+${(((100 * champion.measured.correctAt5) / inScopeCount) - ((100 * keywordCorrectAt5) / inScopeCount)).toFixed(1)} points`,
  },
  {
    name: 'retrieval p95 < 80 ms',
    passed: percentile(queryLatencies, 0.95) < 80,
    detail: `${percentile(queryLatencies, 0.95).toFixed(1)} ms`,
  },
  {
    name: 'projected 5,000-procedure index build < 120 s',
    passed: projectedSeconds < 120,
    detail: `${projectedSeconds.toFixed(1)} s`,
  },
  {
    name: 'gate at >=0.95 precision answers >= 50% of in-scope queries',
    passed: bestOverall !== null && bestOverall.correct >= inScopeCount / 2,
    detail: bestOverall === null ? 'none' : `${bestOverall.correct}/${inScopeCount}`,
  },
];

console.log('=== exit criteria ===');

for (const criterion of criteria) {
  console.log(`  [${criterion.passed ? 'PASS' : 'FAIL'}] ${criterion.name} (${criterion.detail})`);
}

const failures = criteria.filter((criterion) => !criterion.passed).length;
console.log('');
console.log(failures === 0 ? 'ALL CRITERIA MET' : `${failures} CRITERION(A) NOT MET`);

process.exit(failures === 0 ? 0 : 1);
