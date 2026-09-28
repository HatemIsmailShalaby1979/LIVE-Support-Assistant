#!/usr/bin/env node
/**
 * Before/after comparison for the procedure-wording experiment.
 *
 * Read-only. Reads recorded evaluation results for the pre-edit corpus and the
 * post-edit corpus and reports, per configuration: accuracy, false escalations,
 * the wrong-first count, and every failure that is NEW — a ticket that was not an
 * unsafe answer before and is one now, or was not misranked before and is now.
 *
 * A ticket is "wrong-first" when the retrieval ranked a procedure other than the
 * batch's expected one first. `wrongFirstAmongFalseEscalations` is the subset that
 * matters most: the false escalations where the assistant had the wrong policy on
 * top, as opposed to the right policy on top with too small a margin.
 *
 * The per-distinct-message tables are the unit of evidence: ticket counts in this
 * batch are weighted by how often each template repeats.
 *
 * Usage: node tooling/eval/compare-wording-experiment.mjs
 * Exit codes: 0 report written, 2 usage or input error.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evaluationDir = resolve(root, 'tooling/eval/simulated-tenant');
const outPath = resolve(evaluationDir, 'wording-experiment-report.md');

const CONFIGS = [
  {
    name: 'chaos-500 @ 0.17',
    batch: 'chaos-500.json',
    before: 'phase5-label-fix-margin-017.json',
    after: 'exp-distinctness-chaos-500-margin-017.json',
  },
  {
    name: 'chaos-500 @ 0.18',
    batch: 'chaos-500.json',
    before: 'phase5-round2.json',
    after: 'exp-distinctness-chaos-500-margin-018.json',
  },
  {
    name: 'holdout @ 0.17',
    batch: 'holdout-500-seed-20260929.json',
    before: 'phase5-holdout-seed-20260929-margin-017.json',
    after: 'exp-distinctness-holdout-margin-017.json',
  },
  {
    name: 'holdout @ 0.18',
    batch: 'holdout-500-seed-20260929.json',
    before: 'phase5-holdout-seed-20260929-margin-018.json',
    after: 'exp-distinctness-holdout-margin-018.json',
  },
];

const UNSAFE = new Set(['unsafe_answer_on_escalation_case', 'wrong_sop_answer']);

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
  const rows = parsed.perTicket ?? [];
  return {
    file: fileName,
    minMargin: parsed.implementation?.minMargin ?? null,
    corpusSha256: parsed.corpusSha256 ?? null,
    rows: rows.map((row) => {
      const candidates = Array.isArray(row.candidates)
        ? [...row.candidates].sort((left, right) => right.score - left.score)
        : [];
      return {
        id: row.ticket?.ticketId ?? '(unknown)',
        language: row.ticket?.language ?? '(none)',
        chaos: row.ticket?.chaosMutation?.type ?? 'baseline',
        message: row.ticket?.message ?? '',
        expectedDecision: row.expected?.decision ?? null,
        expectedSop: row.expected?.sopId ?? null,
        decision: row.actual?.decision ?? null,
        reason: row.actual?.decision === 'escalate' ? (row.actual.reason ?? '(none)') : 'answered',
        failureCategory: row.failureCategory ?? null,
        top1: candidates[0]?.sopId ?? null,
        top2: candidates[1]?.sopId ?? null,
        margin: gateMargin(row.candidates),
      };
    }),
  };
}

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
  };
}

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const fixed = (value, digits = 6) => (value === null || value === undefined ? 'n/a' : value.toFixed(digits));
const signed = (value, digits = 1) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}`;
const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const distinct = (values) => [...new Set(values)].sort();

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

/**
 * How the margins sit relative to the two margins under test. The band between
 * them is where a threshold change flips a decision without any change in
 * retrieval quality.
 */
function marginBands(run, low, high) {
  const margins = run.rows.map((row) => row.margin).filter((value) => value !== null);
  return {
    below: margins.filter((value) => value < low).length,
    band: margins.filter((value) => value >= low && value < high).length,
    above: margins.filter((value) => value >= high).length,
    p25: percentile(margins, 0.25),
    median: percentile(margins, 0.5),
  };
}

/** The distinct messages whose decision actually changed, with their ticket counts. */
function decisionMoves(before, after) {
  const byId = new Map(after.rows.map((row) => [row.id, row]));
  const groups = new Map();
  for (const row of before.rows) {
    const later = byId.get(row.id);
    if (later === undefined || later.decision === row.decision) continue;
    const list = groups.get(row.message) ?? [];
    list.push({ row, later });
    groups.set(row.message, list);
  }
  return [...groups.entries()].map(([message, pairs]) => ({
    message,
    tickets: pairs.length,
    language: pairs[0].row.language,
    expected: pairs[0].row.expectedSop ?? '(none)',
    marginBefore: pairs[0].row.margin,
    marginAfter: pairs[0].later.margin,
    before: pairs[0].row.decision,
    after: pairs[0].later.decision,
  })).sort((left, right) => right.tickets - left.tickets);
}

/** Per distinct message, the before and after retrieval and decision. */
function distinctMessageRows(before, after) {
  const byId = new Map(after.rows.map((row) => [row.id, row]));
  const groups = new Map();
  for (const row of before.rows) {
    const key = row.message;
    const list = groups.get(key) ?? [];
    list.push({ before: row, after: byId.get(row.id) });
    groups.set(key, list);
  }
  return [...groups.entries()].map(([message, pairs]) => {
    const beforeRows = pairs.map((pair) => pair.before);
    const afterRows = pairs.map((pair) => pair.after).filter((row) => row !== undefined);
    const marginsBefore = beforeRows.map((row) => row.margin).filter((value) => value !== null);
    const marginsAfter = afterRows.map((row) => row.margin).filter((value) => value !== null);
    return {
      message,
      language: distinct(beforeRows.map((row) => row.language)).join('/'),
      expected: distinct(beforeRows.map((row) => row.expectedSop ?? '(none)')).join('/'),
      tickets: beforeRows.length,
      beforeTop1: distinct(beforeRows.map((row) => row.top1 ?? '(none)')).join('/'),
      afterTop1: distinct(afterRows.map((row) => row.top1 ?? '(none)')).join('/'),
      beforeTop2: distinct(beforeRows.map((row) => row.top2 ?? '(none)')).join('/'),
      afterTop2: distinct(afterRows.map((row) => row.top2 ?? '(none)')).join('/'),
      beforeMargin: marginsBefore.length === 0 ? null : Math.min(...marginsBefore),
      afterMargin: marginsAfter.length === 0 ? null : Math.min(...marginsAfter),
      beforeDecision: distinct(beforeRows.map((row) => row.decision)).join('/'),
      afterDecision: distinct(afterRows.map((row) => row.decision)).join('/'),
      beforeFalseEscalations: beforeRows.filter(isFalseEscalation).length,
      afterFalseEscalations: afterRows.filter(isFalseEscalation).length,
      changed: beforeRows.some((row, index) => {
        const later = pairs[index].after;
        return later === undefined || row.top1 !== later.top1 || row.decision !== later.decision;
      }),
    };
  }).sort((left, right) => left.beforeMargin - right.beforeMargin);
}

const sections = [];
const comparisons = [];

for (const config of CONFIGS) {
  const before = loadRun(config.before);
  const after = loadRun(config.after);
  const summaryBefore = summarise(before);
  const summaryAfter = summarise(after);
  const afterById = new Map(after.rows.map((row) => [row.id, row]));

  const newUnsafe = before.rows.filter((row) => {
    const later = afterById.get(row.id);
    return later !== undefined && !isUnsafe(row) && isUnsafe(later);
  });
  const newWrongFirst = before.rows.filter((row) => {
    const later = afterById.get(row.id);
    return later !== undefined && !isWrongFirst(row) && isWrongFirst(later);
  });
  const fixedWrongFirst = before.rows.filter((row) => {
    const later = afterById.get(row.id);
    return later !== undefined && isWrongFirst(row) && !isWrongFirst(later);
  });
  const fixedFalseEscalations = before.rows.filter((row) => {
    const later = afterById.get(row.id);
    return later !== undefined && isFalseEscalation(row) && !isFalseEscalation(later);
  });
  const newFalseEscalations = before.rows.filter((row) => {
    const later = afterById.get(row.id);
    return later !== undefined && !isFalseEscalation(row) && isFalseEscalation(later);
  });

  comparisons.push({
    config,
    before,
    after,
    summaryBefore,
    summaryAfter,
    newUnsafe,
    newWrongFirst,
    fixedWrongFirst,
    fixedFalseEscalations,
    newFalseEscalations,
    distinctRows: distinctMessageRows(before, after),
  });
}

sections.push(
  '# Procedure-wording experiment — before and after',
  '',
  '**data_mode: "simulated".** Every ticket, procedure and measurement below is fictional evaluation data. There is no design partner and no customer data.',
  '',
  'The experiment edits four procedures (`wc-live`, `wc-eligibility`, `wc-payout`, `wc-gifts`) in all four languages: each opening sentence names the procedure\'s own topic, and cross-references that name another procedure\'s topic are removed. No policy fact changed — every number, window, age and follower count is identical, and the conflicting-procedure lint still reports 0 conflicts.',
  '',
  'Gate logic, the shipped threshold, `chaos-500.json` and the holdout batch are untouched. The "before" figures are the recorded runs on the pre-edit corpus; the "after" figures are fresh runs on the edited corpus.',
  '',
  '| Configuration | Corpus SHA (before → after) |',
  '|---|---|',
  ...comparisons.map(({ config, before, after }) =>
    `| ${config.name} | \`${(before.corpusSha256 ?? '').slice(0, 12)}…\` → \`${(after.corpusSha256 ?? '').slice(0, 12)}…\` |`),
  '',
  '## Summary',
  '',
  '| Configuration | Correct before | Correct after | Δ | False escalations before | after | Δ | Wrong-first before | after | Δ | Unsafe before | after |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...comparisons.map(({ config, summaryBefore: b, summaryAfter: a }) =>
    `| ${config.name} | ${b.correct}/${b.tickets} (${pct(b.accuracy)}) | ${a.correct}/${a.tickets} (${pct(a.accuracy)}) | ${signed(a.accuracy - b.accuracy)} | ${b.falseEscalations} | ${a.falseEscalations} | ${a.falseEscalations - b.falseEscalations} | ${b.wrongFirstAmongFalseEscalations} | ${a.wrongFirstAmongFalseEscalations} | ${a.wrongFirstAmongFalseEscalations - b.wrongFirstAmongFalseEscalations} | ${b.unsafeAnswers} | ${a.unsafeAnswers} |`),
  '',
  '`Wrong-first` counts false escalations where the procedure ranked first was not the batch\'s expected procedure. `Unsafe` counts answers given where escalation was expected, plus answers from the wrong procedure.',
  '',
);

sections.push('## Failures introduced and repaired', '');
for (const entry of comparisons) {
  sections.push(
    `### ${entry.config.name}`,
    '',
    `- New unsafe answers: **${entry.newUnsafe.length}**${entry.newUnsafe.length === 0 ? '' : ` — ${entry.newUnsafe.map((row) => row.id).join(', ')}`}`,
    `- New wrong-first tickets: **${entry.newWrongFirst.length}**${entry.newWrongFirst.length === 0 ? '' : ` — ${entry.newWrongFirst.map((row) => row.id).join(', ')}`}`,
    `- Wrong-first tickets repaired: ${entry.fixedWrongFirst.length}`,
    `- False escalations repaired: ${entry.fixedFalseEscalations.length}`,
    `- New false escalations: ${entry.newFalseEscalations.length}`,
    '',
  );
  for (const row of entry.newUnsafe) {
    sections.push(
      `  - **NEW UNSAFE** \`${row.id}\` (${row.language}, ${row.chaos}): expected ${row.expectedDecision}${row.expectedSop ? ` ${row.expectedSop}` : ''}, now answered from ${entry.after.rows.find((later) => later.id === row.id)?.top1 ?? '?'}.`,
      '',
    );
  }
}

sections.push('## Per distinct message', '');
sections.push(
  'One row per distinct message, ordered by the pre-edit margin. Identical text repeats across tickets, so ticket counts are weighted by repetition; these rows are the unit of evidence.',
  '',
);
for (const entry of comparisons) {
  const changed = entry.distinctRows.filter((row) => row.changed);
  sections.push(
    `### ${entry.config.name} — ${entry.distinctRows.length} distinct messages, ${changed.length} changed`,
    '',
    '| Language | Expected | Tickets | top-1 before | top-1 after | top-2 before | top-2 after | Margin before | Margin after | Decision before | Decision after | fe before | fe after |',
    '|---|---|---:|---|---|---|---|---:|---:|---|---|---:|---:|',
    ...entry.distinctRows.map((row) =>
      `| ${row.language} | ${row.expected} | ${row.tickets} | ${row.beforeTop1} | ${row.afterTop1} | ${row.beforeTop2} | ${row.afterTop2} | ${fixed(row.beforeMargin)} | ${fixed(row.afterMargin)} | ${row.beforeDecision} | ${row.afterDecision} | ${row.beforeFalseEscalations} | ${row.afterFalseEscalations} |`),
    '',
  );
}

const testMargins = [...new Set(comparisons
  .flatMap((entry) => [entry.before.minMargin, entry.after.minMargin])
  .filter((value) => value !== null))].sort((left, right) => left - right);
const bandLow = testMargins[0] ?? 0.17;
const bandHigh = testMargins.at(-1) ?? 0.18;
const movesByConfig = comparisons.map((entry) => ({
  config: entry.config,
  moves: decisionMoves(entry.before, entry.after),
  bandsBefore: marginBands(entry.before, bandLow, bandHigh),
  bandsAfter: marginBands(entry.after, bandLow, bandHigh),
}));

sections.push(
  `## Where the margins sit — the band between ${bandLow.toFixed(2)} and ${bandHigh.toFixed(2)}`,
  '',
  `A ticket whose margin falls between ${bandLow.toFixed(2)} and ${bandHigh.toFixed(2)} is decided by the threshold rather than by retrieval: it is a false escalation at ${bandHigh.toFixed(2)} and an answer at ${bandLow.toFixed(2)}. The size of that band is therefore the size of the effect any threshold move would have.`,
  '',
  `| Configuration | Below ${bandLow.toFixed(2)} before | after | In band before | after | At or above ${bandHigh.toFixed(2)} before | after | Median margin before | after |`,
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...movesByConfig.map(({ config, bandsBefore: b, bandsAfter: a }) =>
    `| ${config.name} | ${b.below} | ${a.below} | ${b.band} | ${a.band} | ${b.above} | ${a.above} | ${fixed(b.median)} | ${fixed(a.median)} |`),
  '',
  '## What actually moved',
  '',
  'Distinct messages whose decision changed, with the number of tickets each carries.',
  '',
);
for (const { config, moves } of movesByConfig) {
  sections.push(`### ${config.name}`, '');
  if (moves.length === 0) {
    sections.push('No ticket changed decision.', '');
    continue;
  }
  sections.push(
    '| Language | Expected | Tickets | Margin before | Margin after | Decision before | Decision after | Query text |',
    '|---|---|---:|---:|---:|---|---|---|',
    ...moves.map((move) =>
      `| ${move.language} | ${move.expected} | ${move.tickets} | ${fixed(move.marginBefore)} | ${fixed(move.marginAfter)} | ${move.before} | ${move.after} | ${escapeCell(move.message)} |`),
    '',
  );
}

const chaosMoves = movesByConfig.find((entry) => entry.config.batch === 'chaos-500.json');
const holdoutMoves = movesByConfig.find((entry) => entry.config.batch !== 'chaos-500.json');
const chaosSummary = comparisons.find((entry) => entry.config.batch === 'chaos-500.json' && entry.config.name.endsWith('0.17'));
const holdoutSummary = comparisons.find((entry) => entry.config.batch !== 'chaos-500.json' && entry.config.name.endsWith('0.17'));
const totalNewUnsafe = comparisons.reduce((sum, entry) => sum + entry.newUnsafe.length, 0);
const distinctMovedChaos = chaosMoves?.moves.length ?? 0;
const distinctMovedHoldout = holdoutMoves?.moves.length ?? 0;

sections.push(
  '## Interpretation',
  '',
  `1. **No new unsafe answer appeared in any of the four configurations** (${totalNewUnsafe} total). The new wrong-first tickets are all tickets whose expected outcome is escalation and whose decision did not change — their top-1 flipped between two procedures at margins near 0.01, where the ranking is noise rather than signal.`,
  `2. **The sign of the result depends on the margin.** At the shipped default ${bandHigh.toFixed(2)} the edit reduces false escalations on both batches (chaos-500 ${comparisons[1].summaryBefore.falseEscalations} → ${comparisons[1].summaryAfter.falseEscalations}, holdout ${comparisons[3].summaryBefore.falseEscalations} → ${comparisons[3].summaryAfter.falseEscalations}). At the evaluation margin ${bandLow.toFixed(2)} it increases them (chaos-500 ${chaosSummary?.summaryBefore.falseEscalations} → ${chaosSummary?.summaryAfter.falseEscalations}, holdout ${holdoutSummary?.summaryBefore.falseEscalations} → ${holdoutSummary?.summaryAfter.falseEscalations}). Both after-runs at the two margins produced identical decisions on each batch, because the edit emptied the band between them.`,
  `3. **The effect is a few templates crossing the ${bandHigh.toFixed(2)} line, not a broad gain in separation.** On chaos-500 every changed decision comes from ${distinctMovedChaos} distinct message${distinctMovedChaos === 1 ? '' : 's'}; on the holdout, ${distinctMovedHoldout}. Each template carries many tickets, so a per-ticket rate makes this look like a multi-point accuracy move when it is one wording change moving one way and another moving the other way.`,
  '4. **The corpus\'s worst confusion pair did not improve.** Between the two confusability reports the mean pairwise similarity fell only slightly (0.5046 → 0.4956), the single riskiest pair rose (es `wc-gifts` ↔ `wc-payout`, 0.6704 → 0.6819), and the largest reductions were all `wc-live` pairs — the one cross-reference the edit removed. The topic prefixes on the other three procedures did not separate them.',
  '5. **The edit is therefore not a principled improvement on this evidence.** It is a perturbation whose measured benefit depends on where the threshold sits, driven by templates rather than by the confusion the analysis identified.',
  '',
  '**Recommendation: do not merge.** The change is not unsafe, but it is not shown to help: it helps at 0.18 and hurts at 0.17 on both batches, the effect is a handful of templates rather than a separation gain, and the corpus\'s dominant confusion pair got slightly worse. A second wording iteration would be tuning to these templates, which is what the experiment was set up to avoid. If the direction is worth pursuing, it should start from the `wc-gifts` ↔ `wc-payout` overlap with a corpus that is not built from 47 repeated templates.',
  '',
  '## Method notes',
  '',
  `- The margin is recomputed with the gate\'s own formula from the recorded top-k candidate scores; the shipped default margin is ${DEFAULT_GATE_CONFIG.minMargin}.`,
  '- The "before" runs are the recorded evaluations on the pre-edit corpus, whose SHA-256 is shown above. The "after" runs are fresh, on the edited corpus.',
  '- Nothing here measures why a margin moved. The confusability reports (`confusability-report-before.md`, `confusability-report-after.md`) record the corpus geometry either side of the edit.',
  '',
);

const markdown = `${sections.join('\n')}\n`;
writeFileSync(outPath, markdown);
process.stdout.write(markdown);
process.stdout.write(`\nSaved ${outPath}\n`);
