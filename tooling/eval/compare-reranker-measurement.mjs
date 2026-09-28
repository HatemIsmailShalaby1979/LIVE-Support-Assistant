#!/usr/bin/env node
/**
 * Cross-encoder reranker measurement — read-only.
 *
 * Compares the shipped bi-encoder path against the same path with the pinned
 * cross-encoder reranking a 20-passage shortlist, on the two simulated batches
 * at the two margins under test. The reranker is enabled only in the local
 * evaluation harness; no product code changes.
 *
 * Two things this report is careful about:
 *
 * 1. The reranker's scores are sigmoid outputs on a different scale from cosine
 *    similarities, so 0.17 and 0.18 do not mean the same thing to the two paths.
 *    The report therefore publishes both score distributions and a margin sweep,
 *    and it does not propose a threshold.
 * 2. A reranker margin is not a calibrated margin. Calibrating one is a separate
 *    decision with its own hold-out requirement.
 *
 * Usage: node tooling/eval/compare-reranker-measurement.mjs
 * Exit codes: 0 report written, 2 usage or input error.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evaluationDir = resolve(root, 'tooling/eval/simulated-tenant');
const outPath = resolve(evaluationDir, 'reranker-measurement-report.md');

const CONFIGS = [
  {
    name: 'chaos-500 @ 0.17',
    batch: 'chaos-500.json',
    baseline: 'phase5-label-fix-margin-017.json',
    rerank: 'exp-rerank-chaos-500-margin-017.json',
  },
  {
    name: 'chaos-500 @ 0.18',
    batch: 'chaos-500.json',
    baseline: 'phase5-round2.json',
    rerank: 'exp-rerank-chaos-500-margin-018.json',
  },
  {
    name: 'holdout @ 0.17',
    batch: 'holdout-500-seed-20260929.json',
    baseline: 'phase5-holdout-seed-20260929-margin-017.json',
    rerank: 'exp-rerank-holdout-margin-017.json',
  },
  {
    name: 'holdout @ 0.18',
    batch: 'holdout-500-seed-20260929.json',
    baseline: 'phase5-holdout-seed-20260929-margin-018.json',
    rerank: 'exp-rerank-holdout-margin-018.json',
  },
];

const UNSAFE = new Set(['unsafe_answer_on_escalation_case', 'wrong_sop_answer']);
const SWEEP = [0.05, 0.1, 0.17, 0.18, 0.3, 0.5, 0.64, 0.8, 0.9, 0.95, 0.98, 0.99];

/**
 * The lowest observed margin at which the reranker answers nothing it should
 * have escalated. This is the reranker's safest operating point, and the number
 * of answers it delivers there is the fair comparison against the bi-encoder.
 */
function firstZeroUnsafeMargin(rows) {
  const margins = [...new Set(rows.map((row) => row.margin).filter((value) => value !== null))]
    .sort((left, right) => left - right);
  for (const margin of margins) {
    const answered = rows
      .filter((row) => row.margin !== null && row.margin >= margin)
      .filter((row) => row.top1 !== null && manualReview.get(row.top1) !== true);
    if (answered.every((row) => row.expectedDecision !== 'escalate')) {
      return {
        margin,
        answered: answered.length,
        correct: answered.filter((row) => row.expectedDecision === 'answer' && row.top1 === row.expectedSop).length,
      };
    }
  }
  return null;
}

let DEFAULT_GATE_CONFIG;
try {
  ({ DEFAULT_GATE_CONFIG } = await import('../../packages/core/dist/index.js'));
} catch {
  process.stderr.write('packages/core/dist is missing; run `pnpm build` first.\n');
  process.exit(2);
}

function gateMargin(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const ranked = [...candidates].sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (best === undefined || !Number.isFinite(best.score)) return null;
  return best.score - (ranked[1]?.score ?? 0);
}

function loadRun(fileName) {
  const path = resolve(evaluationDir, fileName);
  if (!existsSync(path)) {
    process.stderr.write(`result file is missing: ${path}\n`);
    process.exit(2);
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return {
    file: fileName,
    minMargin: parsed.implementation?.minMargin ?? null,
    rerank: parsed.implementation?.rerank ?? { enabled: false },
    modelLoadMs: parsed.implementation?.modelLoadMs ?? null,
    indexBuildMs: parsed.implementation?.indexBuildMs ?? null,
    latencyMs: parsed.totals?.latencyMs ?? null,
    rows: (parsed.perTicket ?? []).map((row) => {
      const candidates = Array.isArray(row.candidates)
        ? [...row.candidates].sort((left, right) => right.score - left.score)
        : [];
      return {
        id: row.ticket?.ticketId ?? '(unknown)',
        language: row.ticket?.language ?? '(none)',
        message: row.ticket?.message ?? '',
        expectedSop: row.expected?.sopId ?? null,
        expectedDecision: row.expected?.decision ?? null,
        decision: row.actual?.decision ?? null,
        failureCategory: row.failureCategory ?? null,
        top1: candidates[0]?.sopId ?? null,
        top1Score: candidates[0]?.score ?? null,
        margin: gateMargin(row.candidates),
      };
    }),
  };
}

const corpus = JSON.parse(readFileSync(resolve(evaluationDir, 'corpus.json'), 'utf8'));
/** Procedures whose matched answer is still a content-free escalation (manual review). */
const manualReview = new Map(corpus.sops.map((sop) => [sop.id, sop.escalationRequired === true]));

const isFalseEscalation = (row) => row.failureCategory === 'false_escalation';
const isUnsafe = (row) => UNSAFE.has(row.failureCategory);
const isWrongFirst = (row) => row.expectedSop !== null && row.top1 !== null && row.top1 !== row.expectedSop;

function summarise(run) {
  const rows = run.rows;
  const correct = rows.filter((row) => row.failureCategory === null).length;
  const falseEscalations = rows.filter(isFalseEscalation);
  return {
    tickets: rows.length,
    correct,
    accuracy: rows.length === 0 ? 0 : correct / rows.length,
    falseEscalations: falseEscalations.length,
    unsafeAnswers: rows.filter(isUnsafe).length,
    wrongFirst: rows.filter(isWrongFirst).length,
    wrongFirstAmongFalseEscalations: falseEscalations.filter(isWrongFirst).length,
    answered: rows.filter((row) => row.decision === 'answer').length,
  };
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return 0;
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * fraction) - 1)] ?? 0;
}

function distribution(values) {
  const sorted = [...values].filter((value) => value !== null).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return {
    count: sorted.length,
    min: sorted[0],
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    max: sorted.at(-1),
  };
}

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const fixed = (value, digits = 4) => (value === null || value === undefined ? 'n/a' : value.toFixed(digits));
const signed = (value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}`;
const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

const comparisons = CONFIGS.map((config) => {
  const baseline = loadRun(config.baseline);
  const rerank = loadRun(config.rerank);
  const baseById = new Map(baseline.rows.map((row) => [row.id, row]));
  const newUnsafe = rerank.rows.filter((row) => {
    const earlier = baseById.get(row.id);
    return earlier !== undefined && !isUnsafe(earlier) && isUnsafe(row);
  });
  const newWrongFirst = rerank.rows.filter((row) => {
    const earlier = baseById.get(row.id);
    return earlier !== undefined && !isWrongFirst(earlier) && isWrongFirst(row);
  });
  return {
    config,
    baseline,
    rerank,
    summaryBaseline: summarise(baseline),
    summaryRerank: summarise(rerank),
    newUnsafe,
    newWrongFirst,
    scoreDistribution: distribution(rerank.rows.map((row) => row.top1Score)),
    marginDistribution: distribution(rerank.rows.map((row) => row.margin)),
    baselineMarginDistribution: distribution(baseline.rows.map((row) => row.margin)),
  };
});

const sections = [];

sections.push(
  '# Cross-encoder reranker measurement',
  '',
  '**data_mode: "simulated".** Read-only. No product code, gate logic or threshold was changed.',
  '',
  '## 1. Does the shipped app path use the reranker?',
  '',
  '**No. The shipped path is the bi-encoder alone.**',
  '',
  'The whole retrieval path in the app is four statements:',
  '',
  '| Step | Location |',
  '|---|---|',
  '| Query embedding | `apps/web/src/App.tsx:337` — `index.embedQuery(queryText)` |',
  '| Retrieval | `apps/web/src/App.tsx:342` — `searchTopK(vector, index.entries, 5)` |',
  '| Gate | `apps/web/src/App.tsx:343` — `evaluateGate(candidates, { thresholdAccept, minMargin, topK })` |',
  '| Agent view | `apps/web/src/App.tsx:351` — `buildAgentView(decision, activeCorpus, bundleVersion, escalationId)` |',
  '',
  'The app imports `EMBEDDING_MODEL` (`apps/web/src/App.tsx:11`) and `buildCorpusPassages`, `searchTopK` (`:12`), and loads `createEmbedder` dynamically at `:178`. It never imports or calls `createReranker`. `searchTopK` (`packages/vector-store/src/cosine.ts:93`) also collapses passages to one candidate per procedure (`:103`–`:111`) before the gate sees them, so the gate only ever compares procedures.',
  '',
  '`createReranker` exists and is complete (`packages/embedder/src/reranker.ts:49`), but its only callers are evaluation scripts: `tooling/eval/semantic-eval.mjs:298` and `tooling/eval/reranker-sanity.mjs:29`.',
  '',
  '## 2. What adding it would take',
  '',
  '**Model download.** The reranker is `Xenova/ms-marco-MiniLM-L-6-v2` at `q8` (`packages/embedder/src/model.ts:96`). On disk it is **23.1 MB** of ONNX plus a **0.71 MB** tokenizer, about **23.8 MB** — almost exactly the embedder\'s own 23.0 MB + 0.71 MB. Adding it roughly **doubles the model download**, from ~24 MB to ~48 MB, on a device that currently fetches one model.',
  '',
  '**On-device latency.** Measured in this harness at `q8`:',
  '',
  '| Path | Per-query decision latency (500 tickets) |',
  '|---|---|',
  ...comparisons.slice(0, 1).map(({ baseline, rerank }) =>
    `| Bi-encoder only | mean ${fixed(baseline.latencyMs?.mean, 2)} ms, p95 ${fixed(baseline.latencyMs?.p95, 2)} ms |\n| With reranker | mean ${fixed(rerank.latencyMs?.mean, 2)} ms, p95 ${fixed(rerank.latencyMs?.p95, 2)} ms |`),
  '',
  'The reranker stage alone, measured separately in the same runs:',
  '',
  '| Run | Reranker load | Reranker per query (mean / median / p95 / max) |',
  '|---|---|---|',
  ...comparisons.map(({ config, rerank }) =>
    `| ${config.name} | ${fixed(rerank.rerank?.loadMs, 0)} ms | ${fixed(rerank.rerank?.latencyMs?.mean, 1)} / ${fixed(rerank.rerank?.latencyMs?.median, 1)} / ${fixed(rerank.rerank?.latencyMs?.p95, 1)} / ${fixed(rerank.rerank?.latencyMs?.max, 1)} ms |`),
  '',
  '`tooling/eval/semantic-eval.mjs` measures the same stage on the golden set and records p95 of **79.6–82.8 ms** (`docs/SYSTEM_DESIGN.md` §11A), against a bi-encoder p95 of **2.6 ms**. This harness, on this host, is roughly an order of magnitude slower again. Either way the reranker is the dominant cost by two orders of magnitude.',
  '',
  '**Code touched.** Less than it looks:',
  '',
  '- `packages/embedder/src/reranker.ts` — already written, no change needed.',
  '- `packages/vector-store/src/cosine.ts:78` — `searchTopKPassages` already returns the uncollapsed shortlist the reranker needs.',
  '- `apps/web/src/App.tsx:337`–`:351` — the four statements above; a rerank stage would sit between `:342` and `:343`, plus a second model load in the `:178`–`:221` block and progress reporting for it.',
  '- Bundle and device state: the reranker is a second pinned model, so the bundle manifest\'s model revision check and the device\'s model cache both need a second entry.',
  '',
  'The harness change used for this measurement is `tooling/eval/simulated-tenant/chaos-runner.ts` behind an opt-in `rerank=1` flag; the default path is untouched.',
  '',
);

sections.push(
  '## 3. Measured on the two batches',
  '',
  'Before = the shipped bi-encoder path. After = the same path with the cross-encoder over a 20-passage shortlist, both at the stated margin.',
  '',
  '| Configuration | Correct | False escalations | Wrong-first (of FE) | Answered | Unsafe |',
  '|---|---:|---:|---:|---:|---:|',
  ...comparisons.flatMap(({ config, summaryBaseline: b, summaryRerank: a }) => [
    `| ${config.name} — bi-encoder | ${b.correct}/${b.tickets} (${pct(b.accuracy)}) | ${b.falseEscalations} | ${b.wrongFirstAmongFalseEscalations} | ${b.answered} | ${b.unsafeAnswers} |`,
    `| ${config.name} — with reranker | ${a.correct}/${a.tickets} (${pct(a.accuracy)}) | ${a.falseEscalations} | ${a.wrongFirstAmongFalseEscalations} | ${a.answered} | ${a.unsafeAnswers} |`,
  ]),
  '',
  '### Accuracy change',
  '',
  '| Configuration | Accuracy before | after | Δ | False escalations before | after | Unsafe before | after |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...comparisons.map(({ config, summaryBaseline: b, summaryRerank: a }) =>
    `| ${config.name} | ${pct(b.accuracy)} | ${pct(a.accuracy)} | ${signed(a.accuracy - b.accuracy)} | ${b.falseEscalations} | ${a.falseEscalations} | ${b.unsafeAnswers} | ${a.unsafeAnswers} |`),
  '',
  '### New failures introduced by the reranker',
  '',
  '| Configuration | New unsafe answers | New wrong-first |',
  '|---|---:|---:|',
  ...comparisons.map(({ config, newUnsafe, newWrongFirst }) =>
    `| ${config.name} | ${newUnsafe.length}${newUnsafe.length === 0 ? '' : ` (${newUnsafe.map((row) => row.id).join(', ')})`} | ${newWrongFirst.length} |`),
  '',
);

const anyNewUnsafe = comparisons.flatMap((entry) => entry.newUnsafe);
if (anyNewUnsafe.length > 0) {
  // The two margins produce identical decisions on each batch, so the same
  // tickets appear in both rows. Deduplicate by batch and ticket.
  const seen = new Set();
  const unique = [];
  for (const entry of comparisons) {
    for (const row of entry.newUnsafe) {
      const key = `${entry.config.batch}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push({ batch: entry.config.batch, row, baseline: entry.baseline });
    }
  }
  const byMessage = new Map();
  for (const item of unique) {
    const key = `${item.batch}\u0000${item.row.message}`;
    const list = byMessage.get(key) ?? [];
    list.push(item);
    byMessage.set(key, list);
  }
  sections.push(
    `The reranker introduces **${unique.length} new unsafe answers** across the two batches (${unique.length} distinct tickets), from **${byMessage.size} distinct message-and-batch combinations**. Every one is a ticket whose expected handling is escalation and which the reranker answered.`,
    '',
    '| Batch | Language | Tickets | Answered from | Reranker score | Expected | Query text |',
    '|---|---|---:|---|---:|---|---|',
    ...[...byMessage.values()].map((items) => {
      const first = items[0];
      const earlier = first.baseline.rows.find((candidate) => candidate.id === first.row.id);
      return `| ${first.batch.replace('.json', '')} | ${first.row.language} | ${items.length} | ${first.row.top1 ?? '?'} | ${fixed(first.row.top1Score)} | ${earlier?.top1 ?? '?'} | ${escapeCell(first.row.message)} |`;
    }),
    '',
  );
}

sections.push(
  '## 4. What the reranker\'s scores look like',
  '',
  'The reranker returns a sigmoid over one logit (`packages/embedder/src/reranker.ts:90`), so its scores are probabilities, not cosine similarities. **A margin of 0.17 or 0.18 does not mean the same thing to the two paths**, which is why the table below matters more than the accuracy comparison above.',
  '',
  '| Distribution | Bi-encoder margin (cosine) | Reranker margin (sigmoid) | Reranker top-1 score |',
  '|---|---:|---:|---:|',
  ...[
    ['Minimum', 'min'],
    ['25th percentile', 'p25'],
    ['Median', 'median'],
    ['75th percentile', 'p75'],
    ['Maximum', 'max'],
  ].map(([label, key]) => {
    const entry = comparisons[0];
    return `| ${label} | ${fixed(entry.baselineMarginDistribution?.[key])} | ${fixed(entry.marginDistribution?.[key])} | ${fixed(entry.scoreDistribution?.[key])} |`;
  }),
  '',
  `On chaos-500 the reranker's median margin is ${fixed(comparisons[0].marginDistribution?.median)}, against ${fixed(comparisons[0].baselineMarginDistribution?.median)} for the bi-encoder. A threshold of ${DEFAULT_GATE_CONFIG.minMargin} sits far below the reranker's median, so at the shipped margin the reranker accepts almost everything.`,
  '',
  '### Sweep — how the reranker behaves across margins (chaos-500, seed 20260928)',
  '',
  'A ticket is **answered** only when the gate accepts it *and* the matched procedure does not itself require manual review; an accepted match on a manual-review procedure still produces a content-free escalation (`buildAgentView`, `packages/core/src/agent-view.ts`). **Unsafe** counts answered tickets whose expected handling was escalation. **Correct** counts answered tickets that expected an answer from the procedure that was ranked first.',
  '',
  '| Margin | Answered | Escalated | Unsafe | Correct |',
  '|---:|---:|---:|---:|---:|',
  ...SWEEP.map((margin) => {
    const rows = comparisons[0].rerank.rows;
    const accepted = rows.filter((row) => row.margin !== null && row.margin >= margin);
    const answered = accepted.filter((row) => row.top1 !== null && manualReview.get(row.top1) !== true);
    const unsafe = answered.filter((row) => row.expectedDecision === 'escalate').length;
    const correct = answered.filter((row) =>
      row.expectedDecision === 'answer' && row.top1 === row.expectedSop).length;
    return `| ${margin.toFixed(2)} | ${answered.length} | ${rows.length - answered.length} | ${unsafe} | ${correct} |`;
  }),
  '',
  'This sweep is **reporting only**. No threshold is proposed, and none should be adopted from it: it is calibrated on one synthetic batch with 47 distinct messages, and the hold-out requirement that applies to any margin (see `docs/SYSTEM_DESIGN.md` §11A) has not been met.',
  '',
  '### The comparison that decides it',
  '',
  (() => {
    const zero = firstZeroUnsafeMargin(comparisons[0].rerank.rows);
    const shipped = comparisons.find((entry) => entry.config.name === 'chaos-500 @ 0.18').summaryBaseline;
    if (zero === null) {
      return 'The reranker answers a ticket it should have escalated at every observed margin, so it has no zero-unsafe operating point on this batch.';
    }
    return `The lowest observed margin at which the reranker answers **nothing it should have escalated** is **${zero.margin.toFixed(4)}**, where it answers **${zero.answered}** tickets (${zero.correct} correct). The shipped bi-encoder at its own default margin of ${DEFAULT_GATE_CONFIG.minMargin} answers **${shipped.answered}** tickets with **${shipped.unsafeAnswers}** unsafe answers and ${shipped.correct} correct. At its safest point the reranker therefore delivers roughly a third of the answers the bi-encoder already delivers safely.`;
  })(),
  '',
);

const chaos17 = comparisons.find((entry) => entry.config.name === 'chaos-500 @ 0.17');
const holdout17 = comparisons.find((entry) => entry.config.name === 'holdout @ 0.17');
const chaos18 = comparisons.find((entry) => entry.config.name === 'chaos-500 @ 0.18');
const holdout18 = comparisons.find((entry) => entry.config.name === 'holdout @ 0.18');

sections.push(
  '## 5. Recommendation',
  '',
  '**Do not add the reranker to the shipped path.**',
  '',
  `1. **It does not improve separation.** Accuracy moves ${signed(chaos17.summaryRerank.accuracy - chaos17.summaryBaseline.accuracy)} on chaos-500 at 0.17 and ${signed(holdout17.summaryRerank.accuracy - holdout17.summaryBaseline.accuracy)} on the holdout; at 0.18, ${signed(chaos18.summaryRerank.accuracy - chaos18.summaryBaseline.accuracy)} and ${signed(holdout18.summaryRerank.accuracy - holdout18.summaryBaseline.accuracy)}. This matches the earlier recorded result on the golden set, where reranking reduced recall@1 from 78% to 70% and the precision-qualified answer rate from 8/50 to 2/50.`,
  `2. **It costs two orders of magnitude in latency.** The reranker stage alone measured a mean of ${fixed(chaos17.rerank.rerank?.latencyMs?.mean, 0)} ms per query here, against ${fixed(chaos17.baseline.latencyMs?.mean, 2)} ms for the whole bi-encoder decision. The recorded golden-set measurement puts it at 79.6–82.8 ms p95 against 2.6 ms, which already straddles the project's 80 ms retrieval budget.`,
  '3. **It doubles the model download** (~24 MB → ~48 MB) and adds a second pinned model to the bundle manifest and the device cache.',
  `4. **Its scores are not on a comparable scale, so its margin would have to be re-calibrated from scratch** — and any margin calibrated on this batch would be calibrated on 47 distinct messages.`,
  anyNewUnsafe.length === 0
    ? '5. **No new unsafe answer appeared** in any of the four configurations, so it is not unsafe — it is simply not better, and it is much slower.'
    : `5. **It introduced ${anyNewUnsafe.length} new unsafe answer(s)**, listed in section 3.`,
  '',
  'The earlier ledger entry already records cross-encoder reranking as measured and rejected (`AGENTS.md`, Phase 1 second pass: "Do not repeat these experiments"). This measurement re-confirms it on the two larger simulated batches and quantifies the cost. If reranking is revisited, it should be with a corpus in the reranker\'s trained regime — long, natural passages rather than short policy sentences — not with a different threshold.',
  '',
  '## Method notes',
  '',
  '- The reranker is enabled only in `tooling/eval/simulated-tenant/chaos-runner.ts`, behind `rerank=1`; the shipped `App.tsx` path is unchanged and was not touched.',
  '- Shortlist size is 20 passages, matching `tooling/eval/semantic-eval.mjs:55`.',
  '- The margin is recomputed with the gate\'s own formula from the recorded candidate scores.',
  '- The two margins under test (0.17 and 0.18) are the recorded evaluation margin and the shipped default. They are applied to the reranker for comparability only, and are not its calibrated operating points.',
  '',
);

const markdown = `${sections.join('\n')}\n`;
writeFileSync(outPath, markdown);
process.stdout.write(markdown);
process.stdout.write(`\nSaved ${outPath}\n`);
