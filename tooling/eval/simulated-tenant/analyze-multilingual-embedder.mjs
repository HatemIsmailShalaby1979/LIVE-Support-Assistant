#!/usr/bin/env node
/**
 * Embedder-swap comparison — read-only.
 *
 * Compares the shipped embedder (pinned MiniLM) against multilingual ONNX
 * candidates on the SAME batch, corpus and gate, at margins 0.17 and 0.18. The
 * only variable is the embedder spec; nothing in `packages/*` is touched.
 *
 * The unit of evidence is the **distinct message**, following
 * `analyze-false-escalations.mjs`: the 500-ticket batch draws from a small
 * template pool, so ticket counts are weighted by repetition.
 *
 * `in-scope` excludes **escalation-by-construction** rows — messages whose
 * expected outcome is escalation because no procedure covers them, or because
 * the procedure requires specialist review. Those rows cannot produce a wrong
 * procedure and are not evidence about retrieval.
 *
 * The margin is recomputed with the gate's own formula. Score scales differ by
 * model, so the distributions are reported side by side and no threshold is
 * proposed.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const load = (label) => JSON.parse(readFileSync(resolve(here, `${label}.json`), 'utf8'));

/** batch -> { batchFile, corpusFile } for the report header. */
const BATCHES = {
  'scale-rung': { batch: 'scale-rung-batch.json', corpus: 'scale-rung-corpus.json' },
  'chaos-500': { batch: 'chaos-500.json', corpus: 'corpus.json' },
};

/**
 * Every run in the comparison. `shipped` marks the incumbent MiniLM run for the
 * same batch and margin, so each candidate is compared against the same-batch
 * incumbent and nothing else.
 */
const RUNS = [
  { model: 'minilm', modelLabel: 'MiniLM (shipped)', batch: 'scale-rung', margin: 0.18, label: 'scale-rung-m018', shipped: true },
  { model: 'minilm', modelLabel: 'MiniLM (shipped)', batch: 'scale-rung', margin: 0.17, label: 'scale-rung-m017', shipped: true },
  { model: 'minilm', modelLabel: 'MiniLM (shipped)', batch: 'chaos-500', margin: 0.18, label: 'ml-base-chaos-m018', shipped: true },
  { model: 'minilm', modelLabel: 'MiniLM (shipped)', batch: 'chaos-500', margin: 0.17, label: 'ml-base-chaos-m017', shipped: true },
  { model: 'multilingual-minilm', modelLabel: 'multilingual-MiniLM-L12-v2', batch: 'scale-rung', margin: 0.18, label: 'ml-minilm-scale-m018' },
  { model: 'multilingual-minilm', modelLabel: 'multilingual-MiniLM-L12-v2', batch: 'scale-rung', margin: 0.17, label: 'ml-minilm-scale-m017' },
  { model: 'multilingual-minilm', modelLabel: 'multilingual-MiniLM-L12-v2', batch: 'chaos-500', margin: 0.18, label: 'ml-minilm-chaos-m018' },
  { model: 'multilingual-minilm', modelLabel: 'multilingual-MiniLM-L12-v2', batch: 'chaos-500', margin: 0.17, label: 'ml-minilm-chaos-m017' },
  { model: 'multilingual-e5-small', modelLabel: 'multilingual-e5-small', batch: 'scale-rung', margin: 0.18, label: 'ml-e5s-scale-m018' },
  { model: 'multilingual-e5-small', modelLabel: 'multilingual-e5-small', batch: 'scale-rung', margin: 0.17, label: 'ml-e5s-scale-m017' },
  { model: 'multilingual-e5-small', modelLabel: 'multilingual-e5-small', batch: 'chaos-500', margin: 0.18, label: 'ml-e5s-chaos-m018' },
  { model: 'multilingual-e5-small', modelLabel: 'multilingual-e5-small', batch: 'chaos-500', margin: 0.17, label: 'ml-e5s-chaos-m017' },
];

const LANGUAGE_ORDER = ['en', 'es', 'pt', 'pt-BR', 'fr', '(none)'];
const UNSAFE = new Set(['unsafe_answer_on_escalation_case', 'wrong_sop_answer']);

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const f4 = (v) => (v === null || v === undefined ? 'n/a' : v.toFixed(4));
const f3 = (v) => (v === null || v === undefined ? 'n/a' : v.toFixed(3));

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function dist(values) {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  return {
    count: clean.length,
    min: clean[0],
    median: percentile(clean, 0.5),
    mean: clean.reduce((s, v) => s + v, 0) / clean.length,
    max: clean.at(-1),
  };
}

/** The gate's margin: rank by descending score, subtract the runner-up (0 if none). */
function marginOf(row) {
  const c = row.candidates ?? [];
  if (c.length === 0 || !Number.isFinite(c[0]?.score)) return null;
  return c[0].score - (c[1]?.score ?? 0);
}

/**
 * Fold one run's tickets into one record per distinct message.
 *
 * A message can carry several tickets with different chaos mutations, so the
 * per-message flags are "any ticket of this message did X". `inScope` means at
 * least one ticket expects an answer — i.e. the message is not purely an
 * escalation-by-construction row.
 */
function distinctMessages(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = (row.ticket?.message ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([message, group]) => {
    const answerRows = group.filter((r) => r.expected?.decision === 'answer');
    const escalateRows = group.filter((r) => r.expected?.decision === 'escalate');
    const correctRows = group.filter((r) => r.correctAfter);
    const answerCorrect = answerRows.filter((r) => r.correctAfter);
    const falseEscalations = group.filter((r) => r.failureCategoryAfter === 'false_escalation');
    const unsafe = group.filter((r) => UNSAFE.has(r.failureCategoryAfter));
    const wrongFirst = answerRows.filter((r) => (r.candidates?.[0]?.sopId ?? null) !== r.expected?.sopId);
    return {
      message,
      languages: [...new Set(group.map((r) => r.ticket?.language ?? '(none)'))],
      expectedSops: [...new Set(answerRows.map((r) => r.expected.sopId))],
      tickets: group.length,
      answerTickets: answerRows.length,
      escalateTickets: escalateRows.length,
      inScope: answerRows.length > 0,
      // "answered correctly" requires every answer-expecting ticket to be right.
      answeredCorrectly: answerRows.length > 0 && answerCorrect.length === answerRows.length,
      allCorrect: correctRows.length === group.length,
      falseEscalated: falseEscalations.length > 0,
      unsafe: unsafe.length > 0,
      wrongFirst: wrongFirst.length > 0,
      top1: [...new Set(group.map((r) => r.candidates?.[0]?.sopId ?? '(none)'))],
      margins: group.map(marginOf).filter((v) => v !== null),
      top1Scores: group.map((r) => r.candidates?.[0]?.score).filter((v) => Number.isFinite(v)),
    };
  });
}

function summarise(rows) {
  const messages = distinctMessages(rows);
  const inScope = messages.filter((m) => m.inScope);
  const escalateOnly = messages.filter((m) => !m.inScope);
  return {
    messages,
    distinctTotal: messages.length,
    inScope: inScope.length,
    escalationByConstruction: escalateOnly.length,
    answeredCorrectly: inScope.filter((m) => m.answeredCorrectly).length,
    falseEscalations: inScope.filter((m) => m.falseEscalated).length,
    wrongFirst: inScope.filter((m) => m.wrongFirst).length,
    unsafe: messages.filter((m) => m.unsafe).length,
    top1Score: dist(messages.flatMap((m) => m.top1Scores)),
    margin: dist(messages.flatMap((m) => m.margins)),
  };
}

function byLanguage(rows) {
  const out = new Map();
  for (const row of rows) {
    const lang = row.ticket?.language ?? '(none)';
    const list = out.get(lang) ?? [];
    list.push(row);
    out.set(lang, list);
  }
  return out;
}

const missing = RUNS.filter((run) => !existsSync(resolve(here, `${run.label}.json`)));
if (missing.length > 0) {
  process.stderr.write(`missing run reports:\n${missing.map((r) => `  ${r.label}.json`).join('\n')}\n`);
  process.exit(2);
}

const loaded = RUNS.map((run) => {
  const report = load(run.label);
  return {
    ...run,
    report,
    rows: report.perTicket,
    modelId: report.implementation.modelId,
    revision: report.implementation.modelRevision,
    dtype: report.implementation.dtype,
    appliedMargin: report.implementation.minMargin,
    batchSha: (report.batchSha256 ?? '').slice(0, 12),
    summary: summarise(report.perTicket),
  };
});

// ---------------------------------------------------------------- report

const lines = [];
lines.push(
  '# Embedder swap — multilingual candidates against the shipped MiniLM',
  '',
  '**data_mode: "simulated".** Fictional evaluation data only; there is no design partner and no customer data.',
  '',
  'Read-only measurement. **The gate, its logic, and every threshold are unchanged.**',
  'The shipped default embedder is unchanged; the alternate specs live in the harness runner only.',
  'The unit of evidence is the **distinct message**, not the ticket.',
  '',
  '## Models under test',
  '',
  '| Key | Model | Dims | q8 size | Trained for | Prefixes |',
  '|---|---|---:|---:|---|---|',
  '| `minilm` | `Xenova/all-MiniLM-L6-v2` | 384 | 21.91 MB | sentence similarity, English-oriented | none |',
  '| `multilingual-minilm` | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | 384 | 112.83 MB | sentence similarity, 50+ languages | none |',
  '| `multilingual-e5-small` | `Xenova/multilingual-e5-small` | 384 | 112.83 MB | retrieval, 100 languages | `query: ` / `passage: ` |',
  '',
  'All three run in the same runtime (transformers.js / ONNX Runtime, `q8`).',
  '',
  '## Headline — by distinct message',
  '',
  '`answered correctly` counts only in-scope messages (those with at least one ticket expecting an',
  'answer) where every such ticket was answered with the right procedure. **Escalation-by-construction',
  'rows are excluded**: a message whose expected outcome is escalation cannot produce a wrong',
  'procedure, so counting it would inflate every column equally.',
  '',
);

const head = (batch) => {
  const runs = loaded.filter((r) => r.batch === batch);
  const out = [];
  out.push(`### ${batch}`, '');
  out.push('| Embedder | Margin | Distinct msgs | In-scope | Answered correctly | False escalations | Wrong-first | Unsafe | Escalation-only |');
  out.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const run of runs) {
    const s = run.summary;
    out.push(`| ${run.modelLabel} | ${run.margin.toFixed(2)} | ${s.distinctTotal} | ${s.inScope} | ${s.answeredCorrectly} (${pct(s.inScope === 0 ? 0 : s.answeredCorrectly / s.inScope)}) | ${s.falseEscalations} | ${s.wrongFirst} | ${s.unsafe} | ${s.escalationByConstruction} |`);
  }
  out.push('');
  return out;
};

lines.push(...head('scale-rung'));
lines.push(...head('chaos-500'));

lines.push(
  '## Per language — in-scope answered correctly / in-scope',
  '',
  'Declared language of the ticket. The chaos mutations overwrite this column in the 500-ticket',
  'batch (`wrong_fields` injects `de`, `mixed_language_typos_sarcasm` picks at random, `missing_fields`',
  'deletes it), so the 500-batch split is by declared language, not by the language of the text.',
  '',
);
for (const batch of ['scale-rung', 'chaos-500']) {
  const runs = loaded.filter((r) => r.batch === batch);
  const langs = [...new Set(runs.flatMap((r) => [...byLanguage(r.rows).keys()]))]
    .sort((a, b) => {
      const ia = LANGUAGE_ORDER.indexOf(a); const ib = LANGUAGE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  lines.push(`### ${batch}`, '');
  lines.push(`| Embedder | Margin | ${langs.join(' | ')} |`);
  lines.push(`|---|---:${langs.map(() => '|---:').join('')}|`);
  for (const run of runs) {
    const groups = byLanguage(run.rows);
    const cells = langs.map((lang) => {
      const s = summarise(groups.get(lang) ?? []);
      return s.inScope === 0 ? '—' : `${s.answeredCorrectly}/${s.inScope} (${pct(s.answeredCorrectly / s.inScope)})`;
    });
    lines.push(`| ${run.modelLabel} | ${run.margin.toFixed(2)} | ${cells.join(' | ')} |`);
  }
  lines.push('');
}

lines.push(
  '## Score distribution — ticket-level rows',
  '',
  'The gate compares `top-1 minus top-2` against the margin. Cosine scales are **not comparable',
  'across models**, so each model is reported on its own scale and no threshold is proposed.',
  'One row per ticket (not per distinct message), so the 500-ticket batch is repetition-weighted here.',
  '',
  '| Embedder | Batch | Margin | Top-1 score min | median | mean | max | Margin min | median | mean | max |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
);
for (const run of loaded) {
  const t = run.summary.top1Score;
  const m = run.summary.margin;
  lines.push(`| ${run.modelLabel} | ${run.batch} | ${run.margin.toFixed(2)} | ${f4(t?.min)} | ${f4(t?.median)} | ${f4(t?.mean)} | ${f4(t?.max)} | ${f4(m?.min)} | ${f4(m?.median)} | ${f4(m?.mean)} | ${f4(m?.max)} |`);
}
lines.push('');

lines.push(
  '## Margin buckets — distinct in-scope messages, by each message\'s minimum margin',
  '',
  'Buckets are on each model\'s own scale. Read as "how much of the corpus sits near the applied',
  'margin", which is what decides whether the margin statistic can separate at all.',
  '',
);
const BUCKETS = [
  { label: '< 0.05', test: (v) => v < 0.05 },
  { label: '0.05 – 0.10', test: (v) => v >= 0.05 && v < 0.10 },
  { label: '0.10 – 0.15', test: (v) => v >= 0.10 && v < 0.15 },
  { label: '0.15 – 0.20', test: (v) => v >= 0.15 && v < 0.20 },
  { label: '>= 0.20', test: (v) => v >= 0.20 },
];
lines.push(`| Embedder | Batch | Margin | ${BUCKETS.map((b) => b.label).join(' | ')} |`);
lines.push(`|---|---|---:${BUCKETS.map(() => '|---:').join('')}|`);
for (const run of loaded) {
  const inScope = run.summary.messages.filter((m) => m.inScope);
  // One value per distinct message — its minimum margin — so the bucket counts
  // are message counts, not repetition-weighted ticket counts.
  const margins = inScope.map((m) => (m.margins.length === 0 ? null : Math.min(...m.margins)))
    .filter((v) => v !== null);
  const cells = BUCKETS.map((b) => margins.filter(b.test).length);
  lines.push(`| ${run.modelLabel} | ${run.batch} | ${run.margin.toFixed(2)} | ${cells.join(' | ')} |`);
}
lines.push('');

lines.push(
  '## Change against the shipped embedder — in-scope distinct messages answered correctly',
  '',
  'Percentage-point change versus the incumbent MiniLM run on the **same batch and margin**.',
  'This is the comparison the swap exists to make: does multilingual coverage move non-English',
  'without giving back English?',
  '',
);
for (const batch of ['scale-rung', 'chaos-500']) {
  const runs = loaded.filter((r) => r.batch === batch);
  const langs = [...new Set(runs.flatMap((r) => [...byLanguage(r.rows).keys()]))]
    .sort((a, b) => {
      const ia = LANGUAGE_ORDER.indexOf(a); const ib = LANGUAGE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  lines.push(`### ${batch}`, '');
  lines.push(`| Embedder | Margin | All in-scope | ${langs.join(' | ')} |`);
  lines.push(`|---|---:|---:${langs.map(() => '|---:').join('')}|`);
  for (const run of runs.filter((r) => !r.shipped)) {
    const base = runs.find((r) => r.shipped && r.margin === run.margin);
    if (base === undefined) continue;
    const rate = (r2, lang) => {
      const rows = lang === null ? r2.rows : (byLanguage(r2.rows).get(lang) ?? []);
      const s = summarise(rows);
      return s.inScope === 0 ? null : s.answeredCorrectly / s.inScope;
    };
    const delta = (lang) => {
      const a = rate(run, lang); const b = rate(base, lang);
      if (a === null || b === null) return '—';
      const d = (a - b) * 100;
      return `${d >= 0 ? '+' : ''}${d.toFixed(1)} pp`;
    };
    lines.push(`| ${run.modelLabel} | ${run.margin.toFixed(2)} | ${delta(null)} | ${langs.map((l) => delta(l)).join(' | ')} |`);
  }
  lines.push('');
}

lines.push(
  '## Cost — download, load and per-query latency',
  '',
  'Download sizes are the published `q8` ONNX blob sizes from the Hugging Face model API',
  '(`onnx/model_quantized.onnx`). Load and latency are measured in this run. **The load figure is a',
  'cold load in a fresh browser profile, so it includes the one-time fetch of the weights over the',
  'network** — it is not a warm-start cost. The per-query figure is steady-state inference.',
  '',
  '| Embedder | q8 download | vs shipped | Cold model load | Index build (48 proc / 7 proc) | Decision mean | Decision p95 |',
  '|---|---:|---:|---:|---:|---:|---:|',
);
const SIZES = {
  'Xenova/all-MiniLM-L6-v2': 21.91,
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2': 112.83,
  'Xenova/multilingual-e5-small': 112.83,
};
const BASE_SIZE = SIZES['Xenova/all-MiniLM-L6-v2'];
for (const run of loaded) {
  const size = SIZES[run.modelId];
  const load = run.report.implementation.modelLoadMs;
  const index = run.report.implementation.indexBuildMs;
  const lat = run.report.totals.latencyMs;
  lines.push(`| ${run.modelLabel} (${run.batch}) | ${size.toFixed(2)} MB | ${size === BASE_SIZE ? '—' : `+${(size - BASE_SIZE).toFixed(2)} MB (${(size / BASE_SIZE).toFixed(1)}×)`} | ${(load / 1000).toFixed(1)} s | ${(index / 1000).toFixed(1)} s | ${lat.mean.toFixed(2)} ms | ${lat.p95.toFixed(2)} ms |`);
}
lines.push('');

lines.push(
  '## Provenance',
  '',
  '| Run label | Embedder id | Revision | Batch SHA-256 | Applied margin |',
  '|---|---|---|---|---:|',
);
for (const run of loaded) {
  lines.push(`| \`${run.label}\` | \`${run.modelId}\` | \`${(run.revision ?? '').slice(0, 12)}…\` | \`${run.batchSha}…\` | ${run.appliedMargin} |`);
}
lines.push('');
const scaleRuns = loaded.filter((r) => r.batch === 'scale-rung');
const base18 = scaleRuns.find((r) => r.shipped && r.margin === 0.18);
const ml18 = scaleRuns.find((r) => r.model === 'multilingual-minilm' && r.margin === 0.18);
const base17 = scaleRuns.find((r) => r.shipped && r.margin === 0.17);
const ml17 = scaleRuns.find((r) => r.model === 'multilingual-minilm' && r.margin === 0.17);
const rateFor = (run, lang) => {
  const rows = lang === null ? run.rows : (byLanguage(run.rows).get(lang) ?? []);
  const s = summarise(rows);
  return s.inScope === 0 ? null : s.answeredCorrectly / s.inScope;
};
const pp = (candidate, base, lang) => {
  const a = rateFor(candidate, lang); const b = rateFor(base, lang);
  return a === null || b === null ? 'n/a' : `${(a - b) * 100 >= 0 ? '+' : ''}${((a - b) * 100).toFixed(1)} pp`;
};

lines.push(
  '## Recommendation — do not swap the embedder',
  '',
  `**Measured on the 414-distinct-message batch, the multilingual candidate is a wash overall and a`,
  `language trade underneath.** Against the shipped MiniLM at margin 0.18, \`multilingual-MiniLM-L12-v2\``,
  `moves in-scope accuracy by **${pp(ml18, base18, null)}**, made up of **${pp(ml18, base18, 'en')} English**,`,
  `**${pp(ml18, base18, 'es')} Spanish** and **${pp(ml18, base18, 'pt')} Portuguese**. At 0.17 the same`,
  `shape appears (${pp(ml17, base17, null)} overall, ${pp(ml17, base17, 'en')} en, ${pp(ml17, base17, 'es')} es,`,
  `${pp(ml17, base17, 'pt')} pt).`,
  '',
  'Reasons, in order of weight:',
  '',
  `1. **The product metric does not move.** The auto-answer rate is the number the gate exists to`,
  `   raise, and it is flat (${pp(ml18, base18, null)} at 0.18). A swap that leaves it flat has no`,
  '   product case on its own.',
  `2. **It is a language trade, not a gain.** English loses ${pp(ml18, base18, 'en')} while Spanish and`,
  `   Portuguese gain ${pp(ml18, base18, 'es')} and ${pp(ml18, base18, 'pt')}. English is the majority`,
  '   language of both batches and the only one where the shipped path is strong. Whether that trade',
  '   is worth taking is a **tenant-traffic question**, not something this experiment can settle.',
  `3. **The cost is large for an on-device model.** ${(SIZES['Xenova/paraphrase-multilingual-MiniLM-L12-v2'] / BASE_SIZE).toFixed(1)}× the download`,
  '   (21.91 MB → 112.83 MB) and roughly 1.7× the per-query latency, on a path whose stated product',
  '   experience is the escalation handover rather than the auto-answer.',
  '4. **The retrieval-trained candidate cannot be compared at these margins.** `multilingual-e5-small`',
  '   answers 1 of 302 in-scope messages at 0.18 because its margin scale is far below the shipped',
  '   margin — median margin 0.0164 against MiniLM\'s 0.0891. That is a *scale* result, not evidence',
  '   that the model is worse; it would need its own calibrated operating point, which is a per-tenant',
  '   onboarding step and is explicitly out of scope here.',
  '',
  '**What would change the recommendation.** A tenant whose traffic is majority non-English, and a',
  'per-tenant margin calibrated for the swapped model. Neither is established by this data.',
  '',
  'This result is consistent with the existing do-not-repeat record: an English bi-encoder swap was',
  'already measured and rejected on this corpus. This experiment extends that finding to multilingual',
  'candidates — the aggregate does not move — and adds the one thing the earlier record did not have:',
  'the per-language trade, measured.',
  '',
);

lines.push(
  '## What this does not show', '')

lines.push(
  '- It does not propose or validate a new threshold. Score scales differ per model; a margin that is',
  '  "safe" on one model is not transferable to another, and none of these figures is a tenant setting.',
  '- It does not generalise beyond these two synthetic batches, which are in-sample and authored by the',
  '  same agent that wrote the corpus.',
  '- The 500-ticket batch carries only 47 distinct messages; its distinct-message figures rest on that.',
  '',
);

const markdown = `${lines.join('\n')}\n`;
writeFileSync(resolve(here, 'multilingual-embedder-results.md'), markdown);
process.stdout.write(markdown);
