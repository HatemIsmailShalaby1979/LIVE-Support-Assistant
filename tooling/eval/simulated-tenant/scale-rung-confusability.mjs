#!/usr/bin/env node
/**
 * Confusability report for the scale-rung corpus: corpus geometry, not query
 * behaviour. Embeds every passage, then reports the highest cosine similarity
 * between any two procedures (a proxy for how easily their wording is confused).
 * Read-only; no gate, threshold, or corpus change.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmbedder, EMBEDDING_MODEL } from '../../../packages/embedder/dist/index.js';
import { buildCorpusPassages } from '../../../packages/vector-store/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(resolve(here, 'scale-rung-corpus.json'), 'utf8'));

const embedder = await createEmbedder(EMBEDDING_MODEL);
const passages = buildCorpusPassages(corpus.sops);
const vectors = await embedder.embedPassages(passages.map((p) => p.text));

const bySop = new Map();
for (const [i, p] of passages.entries()) {
  const list = bySop.get(p.sopId) ?? [];
  list.push(vectors[i]);
  bySop.set(p.sopId, list);
}
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]; return s; };

const pairs = [];
const sopIds = [...bySop.keys()];
for (let i = 0; i < sopIds.length; i += 1) {
  for (let j = i + 1; j < sopIds.length; j += 1) {
    let max = -1;
    for (const a of bySop.get(sopIds[i])) for (const b of bySop.get(sopIds[j])) max = Math.max(max, dot(a, b));
    pairs.push({ left: sopIds[i], right: sopIds[j], maxCosine: max });
  }
}
pairs.sort((a, b) => b.maxCosine - a.maxCosine);
const mean = pairs.reduce((s, p) => s + p.maxCosine, 0) / pairs.length;

const md = [
  '# Scale-rung corpus confusability',
  '',
  '**data_mode: "simulated".** Corpus geometry only — it measures how similar two procedures\u2019',
  'wording is under the pinned MiniLM embedder. It is a proxy for margin risk, not a predictor of',
  'query behaviour. No gate, threshold, or corpus text was changed.',
  '',
  `Procedures: ${sopIds.length} · passage pairs: ${pairs.length} · mean pairwise max cosine: ${mean.toFixed(4)}.`,
  '',
  '## Most confusable procedure pairs (max passage cosine)',
  '',
  '| Pair | Max cosine |',
  '|---|---:|',
  ...pairs.slice(0, 20).map((p) => `| ${p.left} \u2194 ${p.right} | ${p.maxCosine.toFixed(4)} |`),
  '',
  'Read against the shipped margin: a pair whose max cosine is at or above the margin is one where a',
  'query sitting between the two topics can be answered from either. The run\u2019s confusion pairs',
  '(`scale-rung-results.md`) are the behavioural counterpart to this geometry.',
].join('\n') + '\n';

writeFileSync(resolve(here, 'scale-rung-confusability.md'), md);
process.stdout.write(`${JSON.stringify({
  procedures: sopIds.length, pairs: pairs.length, meanPairwiseMaxCosine: mean, topPairs: pairs.slice(0, 12),
}, null, 2)}\n`);
