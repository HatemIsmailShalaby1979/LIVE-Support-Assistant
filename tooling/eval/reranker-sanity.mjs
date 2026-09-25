#!/usr/bin/env node
/**
 * Reranker sanity check.
 *
 * A cross-encoder must score a passage that answers the query above one that does
 * not. If it cannot do that on an easy hand-picked pair, the reranker is broken —
 * most likely the query/passage pairing into the tokenizer — and its poor
 * showing in the main evaluation says nothing about reranking in general.
 *
 * Run: node tooling/eval/reranker-sanity.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CROSS_ENCODER_RERANKER,
  createReranker,
} from '../../packages/embedder/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const corpus = JSON.parse(
  readFileSync(resolve(root, 'apps/web/src/data/knowledgeBase.json'), 'utf8'),
);

const reranker = await createReranker(CROSS_ENCODER_RERANKER, {
  cacheDir: resolve(root, '.cache/transformers'),
});

/** Hand-picked pairs where the right answer is not in doubt. */
const CASES = [
  {
    query: 'my streaming access was taken away, how do I get it back',
    correct: '5',
    wrong: '1',
  },
  {
    query: 'I forgot my credentials and cannot sign in',
    correct: '3',
    wrong: '4',
  },
  {
    query: 'I sent someone a present and now I want my money back',
    correct: '1',
    wrong: '2',
  },
];

let failures = 0;

for (const testCase of CASES) {
  const correct = corpus.find((document) => document.id === testCase.correct);
  const wrong = corpus.find((document) => document.id === testCase.wrong);

  const passages = [correct.summary, wrong.summary];
  const scores = await reranker.score(testCase.query, passages);

  const correctScore = scores[0] ?? 0;
  const wrongScore = scores[1] ?? 0;
  const passed = correctScore > wrongScore;

  if (!passed) {
    failures += 1;
  }

  console.log(`query: ${testCase.query}`);
  console.log(
    `  correct (sop ${testCase.correct})  ${correctScore.toFixed(4)}  ${correct.title}`,
  );
  console.log(
    `  wrong   (sop ${testCase.wrong})  ${wrongScore.toFixed(4)}  ${wrong.title}`,
  );
  console.log(`  ${passed ? 'OK' : 'INVERTED'}`);
  console.log('');
}

console.log(failures === 0 ? 'RERANKER PAIRING OK' : `RERANKER PAIRING SUSPECT (${failures} inverted)`);

process.exit(failures === 0 ? 0 : 1);
