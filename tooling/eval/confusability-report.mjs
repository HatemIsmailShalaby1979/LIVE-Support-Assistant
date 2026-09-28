#!/usr/bin/env node
/**
 * Confusability report — read-only.
 *
 * Embeds every passage of a procedure corpus with the pinned local MiniLM and
 * measures how similar each pair of procedures is, per language. A procedure
 * pair whose passages sit close together in the embedding space is a pair at
 * risk of a low gate margin: a query can score both highly, so the top-1 vs
 * top-2 gap shrinks.
 *
 * Why this is a proxy, not a prediction. The gate's margin is a property of a
 * specific query, and this script measures no queries. It measures the corpus
 * geometry only: for two procedures it reports the highest cosine similarity
 * between any passage of one and any passage of the other, which is the
 * best-case route by which a query could bring them level. A high value means
 * the pair *can* be confused; it does not mean it is confused in practice.
 *
 * Language handling. A procedure's summary carries the same policy in four
 * languages, and `buildCorpusPassages` splits it by sentence, so passages must be
 * attributed to a language before pairs can be compared. The detector is a
 * marker-word and diacritic score over a fixed vocabulary; it is reported with
 * the count of passages it could not classify, and those passages are excluded
 * from the per-language tables rather than guessed at.
 *
 * It reads the corpus and writes a report. It changes nothing.
 *
 * Usage:
 *   node tooling/eval/confusability-report.mjs
 *   node tooling/eval/confusability-report.mjs --corpus <file> --out <file> --top 5
 *
 * Exit codes: 0 report written, 2 usage or input error.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evaluationDir = resolve(root, 'tooling/eval/simulated-tenant');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : resolve(process.argv[index + 1] ?? '');
}

const corpusPath = argument('corpus', resolve(evaluationDir, 'corpus.json'));
const outPath = argument('out', resolve(evaluationDir, 'confusability-report.md'));
const topIndex = process.argv.indexOf('--top');
const topPairs = topIndex === -1 ? 5 : Number(process.argv[topIndex + 1]);

if (!Number.isSafeInteger(topPairs) || topPairs < 1) {
  process.stderr.write('--top must be a positive integer\n');
  process.exit(2);
}
if (!existsSync(corpusPath)) {
  process.stderr.write(`corpus is missing: ${corpusPath}\n`);
  process.exit(2);
}

let EMBEDDING_MODEL;
let createEmbedder;
let buildCorpusPassages;
try {
  ({ EMBEDDING_MODEL, createEmbedder } = await import('../../packages/embedder/dist/index.js'));
  ({ buildCorpusPassages } = await import('../../packages/vector-store/dist/index.js'));
} catch {
  process.stderr.write('packages/*/dist is missing; run `pnpm build` first.\n');
  process.exit(2);
}

const LANGUAGES = ['en', 'es', 'pt-BR', 'fr'];

/**
 * Marker vocabulary for the four corpus languages. Chosen to be discriminative
 * between them rather than exhaustive: the frequent function words, plus the
 * diacritic patterns that separate Spanish from Portuguese from French.
 */
const MARKERS = {
  en: ['the', 'and', 'of', 'to', 'is', 'are', 'your', 'this', 'that', 'with', 'not', 'you', 'can', 'if', 'have', 'from', 'check', 'days', 'must', 'before', 'after'],
  es: ['el', 'la', 'los', 'las', 'un', 'una', 'y', 'o', 'es', 'son', 'que', 'del', 'al', 'en', 'por', 'para', 'con', 'no', 'se', 'su', 'si', 'más', 'está', 'días', 'pero', 'tiene', 'debe', 'sin'],
  'pt-BR': ['um', 'uma', 'e', 'ou', 'é', 'são', 'do', 'da', 'no', 'na', 'com', 'não', 'seu', 'mais', 'está', 'você', 'dias', 'mas', 'para', 'pelo', 'isso', 'pode', 'sem'],
  fr: ['le', 'les', 'des', 'et', 'est', 'sont', 'du', 'au', 'pour', 'avec', 'ne', 'pas', 'son', 'plus', 'être', 'à', 'vous', 'nous', 'jours', 'mais', 'dans', 'sur', 'votre', 'sans'],
};

/** Diacritic and orthographic patterns that are strongly indicative of one language. */
const DIACRITICS = [
  { language: 'pt-BR', pattern: /[ãõ]/, weight: 3 },
  { language: 'pt-BR', pattern: /não|ção|ções/, weight: 3 },
  { language: 'es', pattern: /ñ|¿|¡/, weight: 3 },
  { language: 'es', pattern: /ción/, weight: 3 },
  { language: 'fr', pattern: /[àèêçœ]/, weight: 2 },
];

/**
 * Classify a passage's language.
 *
 * @returns A language code, or 'unknown' when no marker or diacritic fires.
 */
function detectLanguage(text) {
  const words = text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const scores = Object.fromEntries(LANGUAGES.map((language) => [language, 0]));
  for (const word of words) {
    for (const language of LANGUAGES) {
      if (MARKERS[language].includes(word)) scores[language] += 1;
    }
  }
  for (const { language, pattern, weight } of DIACRITICS) {
    if (pattern.test(text)) scores[language] += weight;
  }
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [bestLanguage, bestScore] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  // A tie is not a classification.
  return bestScore === 0 || bestScore === runnerUp ? 'unknown' : bestLanguage;
}

const corpusBytes = readFileSync(corpusPath);
const corpus = JSON.parse(corpusBytes.toString('utf8'));
if (corpus.data_mode !== 'simulated' || !Array.isArray(corpus.sops)) {
  process.stderr.write('the corpus must be explicitly simulated and carry a "sops" array\n');
  process.exit(2);
}

const passages = buildCorpusPassages(corpus.sops);
const annotated = passages.map((passage) => ({ ...passage, language: detectLanguage(passage.text) }));
const unknownCount = annotated.filter((passage) => passage.language === 'unknown').length;

process.stdout.write(`Embedding ${annotated.length} passages from ${corpus.sops.length} procedures with ${EMBEDDING_MODEL.id}…\n`);
const embedder = await createEmbedder(EMBEDDING_MODEL);
const vectors = await embedder.embedPassages(annotated.map((passage) => passage.text));
const entries = annotated.map((passage, index) => {
  const vector = vectors[index];
  if (vector === undefined) throw new Error(`missing vector ${index}`);
  return { ...passage, vector };
});

function cosine(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += (left[index] ?? 0) * (right[index] ?? 0);
  return sum;
}

const procedureIds = corpus.sops.map((sop) => sop.id);
const titles = Object.fromEntries(corpus.sops.map((sop) => [sop.id, sop.title]));

/** Highest and mean cosine similarity between any passage of two procedures in one language. */
function pairSimilarity(language, leftId, rightId) {
  const left = entries.filter((entry) => entry.language === language && entry.sopId === leftId);
  const right = entries.filter((entry) => entry.language === language && entry.sopId === rightId);
  if (left.length === 0 || right.length === 0) return null;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  let best = null;
  for (const a of left) {
    for (const b of right) {
      const value = cosine(a.vector, b.vector);
      sum += value;
      count += 1;
      if (value > max) {
        max = value;
        best = { left: a.text, right: b.text };
      }
    }
  }
  return { max, mean: sum / count, pairs: count, best };
}

/** Highest cosine similarity between two different passages of one procedure — the self-reference. */
function selfSimilarity(language, sopId) {
  const own = entries.filter((entry) => entry.language === language && entry.sopId === sopId);
  let max = null;
  for (let index = 0; index < own.length; index += 1) {
    for (let other = index + 1; other < own.length; other += 1) {
      const value = cosine(own[index].vector, own[other].vector);
      if (max === null || value > max) max = value;
    }
  }
  return max;
}

const perLanguage = [];
for (const language of LANGUAGES) {
  const rows = [];
  for (let left = 0; left < procedureIds.length; left += 1) {
    for (let right = left + 1; right < procedureIds.length; right += 1) {
      const similarity = pairSimilarity(language, procedureIds[left], procedureIds[right]);
      if (similarity === null) continue;
      rows.push({
        language,
        left: procedureIds[left],
        right: procedureIds[right],
        ...similarity,
        selfLeft: selfSimilarity(language, procedureIds[left]),
        selfRight: selfSimilarity(language, procedureIds[right]),
      });
    }
  }
  rows.sort((a, b) => b.max - a.max);
  perLanguage.push({ language, rows });
}

const allRows = perLanguage.flatMap((entry) => entry.rows).sort((a, b) => b.max - a.max);
const overallTop = allRows.slice(0, topPairs);

const fixed = (value, digits = 4) => (value === null || value === undefined ? 'n/a' : value.toFixed(digits));
const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const relative = (path) => path.slice(root.length + 1).replaceAll('\\', '/');
const short = (text, limit = 110) => (text.length <= limit ? text : `${text.slice(0, limit)}…`);

const lines = [
  '# Confusability report — procedure pairs per language',
  '',
  '**data_mode: "simulated".** Read-only corpus geometry. No procedure was modified and no query was run.',
  '',
  `Corpus: \`${relative(corpusPath)}\` — ${corpus.sops.length} procedures, ${passages.length} passages, SHA-256 \`${createHash('sha256').update(corpusBytes).digest('hex').slice(0, 16)}…\``,
  `Embedding: ${embedder.modelId} (${embedder.revision}, ${embedder.dtype}).`,
  '',
  '## How to read this',
  '',
  'For each pair of procedures and each language, the table reports the **highest cosine similarity between any passage of one and any passage of the other**. That is the best-case route by which a single query could bring the two level, which is what makes a pair a risk for a low gate margin. Each language section also lists a within-procedure reference: the highest similarity between two of a single procedure\'s *own* passages. A pair whose cross-similarity approaches that level is as close to its neighbour as it is to itself.',
  '',
  'This measures corpus geometry, not query behaviour. A high value means a pair *can* be confused; whether it is confused in practice is measured by running the batch, not here.',
  '',
  `**Language attribution.** ${annotated.length - unknownCount} of ${annotated.length} passages were classified; ${unknownCount} were not (${fixed((unknownCount / annotated.length) * 100, 1)}%) and are excluded from the tables below rather than guessed at.`,
  '',
  `## Top ${overallTop.length} riskiest pairs, all languages`,
  '',
  '| Rank | Language | Procedure A | Procedure B | Max similarity | Mean similarity | Passages compared |',
  '|---:|---|---|---|---:|---:|---:|',
  ...overallTop.map((row, index) =>
    `| ${index + 1} | ${row.language} | \`${row.left}\` | \`${row.right}\` | **${fixed(row.max)}** | ${fixed(row.mean)} | ${row.pairs} |`),
  '',
];

for (const { language, rows } of perLanguage) {
  lines.push(
    `## ${language}`,
    '',
    `Within-procedure reference (highest similarity between two passages of the same procedure): ${procedureIds
      .map((id) => `\`${id}\` ${fixed(selfSimilarity(language, id))}`)
      .join(' · ')}.`,
    '',
    '| Procedure A | Procedure B | Max similarity | Mean similarity | Closest passage pair |',
    '|---|---|---:|---:|---|',
    ...rows.map((row) =>
      `| \`${row.left}\` | \`${row.right}\` | **${fixed(row.max)}** | ${fixed(row.mean)} | ${escapeCell(short(row.best.left, 70))} ↔ ${escapeCell(short(row.best.right, 70))} |`),
    '',
  );
}

lines.push(
  '## Method notes',
  '',
  `- Passages come from \`buildCorpusPassages\` (\`packages/vector-store/src/chunk.ts\`): each procedure\'s title, each summary sentence of at least 24 characters, and the escalation reason. ${passages.length} passages across ${corpus.sops.length} procedures.`,
  '- Similarity is the dot product of unit-length embeddings, which is cosine similarity.',
  '- The language detector is a marker-word and diacritic score over a fixed vocabulary. It is deliberately reported with its unclassified count, and it is the one part of this report that is a heuristic rather than a measurement.',
  '- Procedure titles (`${procedureIds.length} passages`) carry no language and fall into the unclassified count.',
  '',
);

const markdown = `${lines.join('\n')}\n`;
writeFileSync(outPath, markdown);
writeFileSync(outPath.replace(/\.md$/, '.json'), `${JSON.stringify({
  data_mode: 'simulated',
  corpus: relative(corpusPath),
  corpusSha256: createHash('sha256').update(corpusBytes).digest('hex'),
  model: { id: embedder.modelId, revision: embedder.revision, dtype: embedder.dtype },
  procedures: corpus.sops.length,
  passages: passages.length,
  unclassifiedPassages: unknownCount,
  topPairs: overallTop.map((row) => ({
    language: row.language,
    left: row.left,
    right: row.right,
    max: row.max,
    mean: row.mean,
  })),
  perLanguage: Object.fromEntries(perLanguage.map(({ language, rows }) => [
    language,
    rows.map((row) => ({ left: row.left, right: row.right, max: row.max, mean: row.mean })),
  ])),
}, null, 2)}\n`);

process.stdout.write(`${markdown}\n`);
process.stdout.write(`Saved ${outPath} and ${outPath.replace(/\.md$/, '.json')}\n`);
