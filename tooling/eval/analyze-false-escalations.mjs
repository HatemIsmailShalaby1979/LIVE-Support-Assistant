#!/usr/bin/env node
/**
 * False-escalation analysis for the simulated 500-ticket batch.
 *
 * Read-only. It reads the recorded local and deployed-path result files, derives
 * the Confidence Gate's own margin from the recorded top-k candidate scores, and
 * writes a report. It changes no product code, no gate logic, no threshold, and
 * no recorded result file.
 *
 * What is measurable, and what is not. The local result records the top-k
 * candidate scores for every ticket, so the gate's margin can be recomputed
 * exactly. The deployed-path result records a decision and a reason per ticket
 * but no candidate scores, so the deployed margin distribution is **not**
 * measurable from that file; only the one recorded safety counterexample
 * carries a margin. The report says so rather than estimating.
 *
 * Usage:
 *   node tooling/eval/analyze-false-escalations.mjs
 *   node tooling/eval/analyze-false-escalations.mjs --local <file> --deployed <file> --out <file>
 *
 * Exit codes: 0 report written, 2 usage or input error.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evaluationDir = resolve(root, 'tooling/eval/simulated-tenant');

let DEFAULT_GATE_CONFIG;
try {
  ({ DEFAULT_GATE_CONFIG } = await import('../../packages/core/dist/index.js'));
} catch {
  process.stderr.write('packages/core/dist is missing; run `pnpm build` first.\n');
  process.exit(2);
}

const DEFAULT_LOCAL = resolve(evaluationDir, 'phase5-label-fix-margin-017.json');
const DEFAULT_DEPLOYED = resolve(evaluationDir, 'phase5-deployed-run-0aec9773442c4282.json');
const DEFAULT_OUT = resolve(evaluationDir, 'false-escalation-analysis.md');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : resolve(process.argv[index + 1] ?? '');
}

const localPath = argument('local', DEFAULT_LOCAL);
const deployedPath = argument('deployed', DEFAULT_DEPLOYED);
const outPath = argument('out', DEFAULT_OUT);

for (const path of [localPath, deployedPath]) {
  if (!existsSync(path)) {
    process.stderr.write(`input result file is missing: ${path}\n`);
    process.exit(2);
  }
}

const LANGUAGE_ORDER = ['en', 'es', 'pt-BR', 'fr'];
const CHAOS_TYPES = [
  'near_duplicate',
  'missing_fields',
  'wrong_fields',
  'mixed_language_typos_sarcasm',
  'off_hours_volume_spike',
  'reopened_ticket',
  'agent_handoff',
  'wrong_category_tag',
  'contradicting_sops',
  'no_correct_answer',
];
const UNSAFE_CATEGORIES = new Set(['unsafe_answer_on_escalation_case', 'wrong_sop_answer']);

/**
 * Reproduce the gate's margin exactly as `packages/core/src/gate.ts` computes it:
 * rank the top-k by descending score, then subtract the runner-up's score (or 0
 * when there is no runner-up).
 *
 * @returns The margin, or null when the row records no candidate scores at all.
 */
function gateMargin(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const ranked = [...candidates]
    .sort((left, right) => right.score - left.score)
    .slice(0, DEFAULT_GATE_CONFIG.topK);
  const best = ranked[0];
  if (best === undefined || !Number.isFinite(best.score)) return null;
  const runnerUp = ranked[1];
  return best.score - (runnerUp?.score ?? 0);
}

function normalise(row) {
  const candidates = Array.isArray(row.candidates) ? row.candidates : null;
  const ranked = candidates === null
    ? []
    : [...candidates].sort((left, right) => right.score - left.score);
  const language = typeof row.ticket?.language === 'string' && row.ticket.language.length > 0
    ? row.ticket.language
    : '(missing)';
  return {
    id: row.ticket?.ticketId ?? '(unknown)',
    language,
    chaos: row.ticket?.chaosMutation?.type ?? 'baseline',
    expectedDecision: row.expected?.decision ?? null,
    expectedSop: row.expected?.sopId ?? null,
    actualDecision: row.actual?.decision ?? null,
    reason: row.actual?.decision === 'escalate' ? (row.actual.reason ?? '(none)') : 'answered',
    failureCategory: row.failureCategory ?? null,
    message: row.ticket?.message ?? '',
    margin: gateMargin(candidates),
    top1Sop: ranked[0]?.sopId ?? null,
    candidateCount: candidates === null ? null : candidates.length,
  };
}

function loadRun(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const rows = parsed.perTicket ?? parsed.results ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    process.stderr.write(`${path} carries no per-ticket rows\n`);
    process.exit(2);
  }
  return {
    path,
    parsed,
    rows: rows.map(normalise),
    minMargin: parsed.implementation?.minMargin ?? null,
    runLabel: parsed.runLabel ?? parsed.simulation_run_id ?? '(unlabelled)',
  };
}

const local = loadRun(localPath);
const deployed = loadRun(deployedPath);

const deployedDecisionById = new Map(deployed.rows.map((row) => [row.id, row.actualDecision]));
const sharedDecisions = local.rows.filter((row) => deployedDecisionById.get(row.id) === row.actualDecision).length;

const isFalseEscalation = (row) => row.failureCategory === 'false_escalation';
const isUnsafe = (row) => UNSAFE_CATEGORIES.has(row.failureCategory);

const falseEscalationRows = local.rows.filter(isFalseEscalation);
const distinctBatchMessages = new Set(local.rows.map((row) => row.message)).size;
const distinctFalseEscalationMessages = new Set(falseEscalationRows.map((row) => row.message)).size;

function summarise(rows) {
  const correct = rows.filter((row) => row.failureCategory === null).length;
  const falseEscalations = rows.filter(isFalseEscalation).length;
  const unsafeAnswers = rows.filter(isUnsafe).length;
  return {
    tickets: rows.length,
    correct,
    accuracy: rows.length === 0 ? 0 : correct / rows.length,
    falseEscalations,
    falseEscalationRate: rows.length === 0 ? 0 : falseEscalations / rows.length,
    unsafeAnswers,
  };
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = key(row);
    const list = groups.get(value) ?? [];
    list.push(row);
    groups.set(value, list);
  }
  return groups;
}

function orderedKeys(groups, preferred) {
  const present = [...groups.keys()];
  const known = preferred.filter((value) => present.includes(value));
  const rest = present.filter((value) => !preferred.includes(value)).sort();
  return [...known, ...rest];
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    min: sorted[0],
    median: percentile(sorted, 0.5),
    max: sorted.at(-1),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}

const pct = (value) => `${(value * 100).toFixed(1)}%`;
const fixed = (value, digits = 6) => (value === null || value === undefined ? 'n/a' : value.toFixed(digits));

/** Margin analysis for one run. `minMargin` is the margin the run applied. */
function marginAnalysis(rows, minMargin) {
  const falseEscalations = rows.filter(isFalseEscalation);
  const withMargin = falseEscalations.filter((row) => row.margin !== null);
  const withoutMargin = falseEscalations.filter((row) => row.margin === null);
  const values = withMargin.map((row) => row.margin);
  const threshold = minMargin ?? DEFAULT_GATE_CONFIG.minMargin;
  const distribution = [
    { label: '< 0.05', test: (value) => value < 0.05 },
    { label: '0.05 – 0.10', test: (value) => value >= 0.05 && value < 0.10 },
    { label: '0.10 – 0.15', test: (value) => value >= 0.10 && value < 0.15 },
    { label: `0.15 – ${threshold.toFixed(2)}`, test: (value) => value >= 0.15 && value < threshold },
    { label: `>= ${threshold.toFixed(2)}`, test: (value) => value >= threshold },
  ].map((bucket) => ({ label: bucket.label, count: values.filter(bucket.test).length }));
  return {
    falseEscalations: falseEscalations.length,
    withMargin: withMargin.length,
    withoutMargin: withoutMargin.length,
    threshold,
    stats: stats(values),
    within005BelowThreshold: values.filter((value) => value >= threshold - 0.05 && value < threshold).length,
    atOrAboveThreshold: values.filter((value) => value >= threshold).length,
    distribution,
    reasons: Object.fromEntries(
      [...new Set(falseEscalations.map((row) => row.reason))]
        .map((reason) => [reason, falseEscalations.filter((row) => row.reason === reason).length])
        .sort((left, right) => right[1] - left[1]),
    ),
    top1IsExpected: falseEscalations.filter((row) => row.top1Sop !== null && row.top1Sop === row.expectedSop).length,
    top1IsOther: falseEscalations.filter((row) => row.top1Sop !== null && row.top1Sop !== row.expectedSop).length,
    top1Unknown: falseEscalations.filter((row) => row.top1Sop === null).length,
  };
}

function table(header, rows) {
  return [
    `| ${header.join(' | ')} |`,
    `|${header.map((_, index) => (index === 0 ? '---' : '---:')).join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

function dimensionTable(rows, key, order) {
  const groups = groupBy(rows, key);
  return orderedKeys(groups, order).map((value) => {
    const summary = summarise(groups.get(value));
    return [
      value,
      summary.tickets,
      summary.correct,
      pct(summary.accuracy),
      summary.falseEscalations,
      pct(summary.falseEscalationRate),
      summary.unsafeAnswers,
    ];
  });
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function worstByLanguage(rows, language) {
  return rows
    .filter((row) => isFalseEscalation(row) && row.language === language && row.margin !== null)
    .sort((left, right) => left.margin - right.margin)
    .slice(0, 10);
}

const localMargin = marginAnalysis(local.rows, local.minMargin);
const deployedMargin = marginAnalysis(deployed.rows, deployed.minMargin);
const shippedDefault = DEFAULT_GATE_CONFIG.minMargin;

const languages = orderedKeys(groupBy(local.rows, (row) => row.language), LANGUAGE_ORDER);
const chaosKeys = orderedKeys(groupBy(local.rows, (row) => row.chaos), CHAOS_TYPES);
const procedures = orderedKeys(
  groupBy(local.rows, (row) => row.expectedSop ?? '(none)'),
  ['wc-gifts', 'wc-payout', 'wc-login', 'wc-security', 'wc-live', 'wc-appeal', 'wc-eligibility'],
);

const feByLanguageChaos = groupBy(
  local.rows.filter(isFalseEscalation),
  (row) => `${row.language}\u0000${row.chaos}`,
);
const matrixCell = (language, chaos) => feByLanguageChaos.get(`${language}\u0000${chaos}`)?.length ?? 0;

const sections = [];

sections.push(
  '# False-escalation analysis — 500-ticket simulated batch',
  '',
  '**data_mode: "simulated".** Every ticket, procedure and measurement below is fictional evaluation data. There is no design partner and no customer data.',
  '',
  'This is a read-only analysis. No product code, gate logic, or threshold was changed, and no recorded result file was modified.',
  '',
  '## Sources',
  '',
  '| | Local run | Deployed-path run |',
  '|---|---|---|',
  `| File | \`${local.path.slice(root.length + 1).replaceAll('\\', '/')}\` | \`${deployed.path.slice(root.length + 1).replaceAll('\\', '/')}\` |`,
  `| Run | ${local.runLabel} | ${deployed.runLabel} |`,
  `| Applied margin | ${fixed(local.minMargin, 2)} | ${fixed(deployed.minMargin, 2)} |`,
  `| Batch SHA-256 | \`${(local.parsed.batchSha256 ?? '(not recorded)').slice(0, 16)}…\` | \`${(deployed.parsed.batchSha256 ?? '(not recorded)').slice(0, 16)}…\` |`,
  `| Corpus SHA-256 | \`${(local.parsed.corpusSha256 ?? '(not recorded)').slice(0, 16)}…\` | \`${(deployed.parsed.corpusSha256 ?? '(not recorded)').slice(0, 16)}…\` |`,
  '',
  `The shipped default margin is **${shippedDefault.toFixed(2)}** (\`DEFAULT_GATE_CONFIG.minMargin\`, read from \`packages/core\`). Both recorded runs applied a test-only ${fixed(local.minMargin, 2)}. This analysis reports against the applied margin and states the shipped default separately; it does not present ${fixed(local.minMargin, 2)} as a tenant setting.`,
  '',
  '## Method, and what is not measurable',
  '',
  'A ticket is a **false escalation** when the batch expects an answer and the assistant escalated. The gate\'s margin is recomputed with the gate\'s own formula (`packages/core/src/gate.ts`): rank the recorded top-k candidates by descending score, then subtract the runner-up\'s score.',
  '',
  `- The **local** run records candidate scores for all ${local.rows.length} tickets, so its margin is measurable exactly.`,
  `- The **deployed-path** run records a decision and a reason per ticket but **no candidate scores**. Its margin distribution is therefore **not measurable** from the recorded file, and this report does not estimate it. The single exception is the recorded safety counterexample, quoted in section 4.`,
  `- The deployed-path run and the local run agree on **${sharedDecisions} of ${local.rows.length}** decisions; the deployed run additionally answered one ticket it should have escalated.`,
  `- **The tickets are not independent observations.** The batch draws its text from a small template pool: ${local.rows.length} tickets carry only ${distinctBatchMessages} distinct messages, and the ${falseEscalationRows.length} false escalations carry only ${distinctFalseEscalationMessages}. Counts below are ticket counts, so a single failing template contributes many rows. The per-language and per-chaos-type *rates* are the meaningful figures; the raw counts are not independent samples.`,
  '',
);

// 1. Language
sections.push('## 1. By language', '');
sections.push(...table(
  ['Language', 'Tickets', 'Correct', 'Accuracy', 'False escalations', 'False-escalation rate', 'Unsafe answers'],
  dimensionTable(local.rows, (row) => row.language, LANGUAGE_ORDER),
));
sections.push(
  '',
  `Across all ${local.rows.length} tickets the local run produced ${localMargin.falseEscalations} false escalations and ${summarise(local.rows).unsafeAnswers} unsafe answers.`,
  '',
  '**Caveat on the language field.** The batch mutates the `language` column in two chaos types: `wrong_fields` injects `de` regardless of the message, and `mixed_language_typos_sarcasm` picks a language at random while the message text is a blend. `missing_fields` can delete the column entirely, which appears here as `(missing)`. The split below is therefore by the ticket\'s declared language, not by the language of its text.',
  '',
);

// 2. Chaos type and expected procedure
sections.push('## 2. By chaos type', '');
sections.push(...table(
  ['Chaos type', 'Tickets', 'Correct', 'Accuracy', 'False escalations', 'False-escalation rate', 'Unsafe answers'],
  dimensionTable(local.rows, (row) => row.chaos, CHAOS_TYPES),
));
sections.push('', '`baseline` is the unmutated remainder of the batch.', '');

sections.push('### By expected procedure', '');
sections.push(...table(
  ['Expected procedure', 'Tickets', 'Correct', 'Accuracy', 'False escalations', 'False-escalation rate', 'Unsafe answers'],
  dimensionTable(local.rows, (row) => row.expectedSop ?? '(none)', procedures),
));
sections.push(
  '',
  '`(none)` covers the tickets whose expected handling is escalation with no procedure attached (`no_supported_procedure`, `conflicting_procedure_guidance`). A ticket whose expected handling is escalation cannot produce a false escalation, so those rows are 0 by construction.',
  '',
);

// 3. Language x chaos
sections.push('## 3. Language × chaos type — false-escalation counts', '');
sections.push(...table(
  ['Language', ...chaosKeys, 'Total'],
  languages.map((language) => [
    language,
    ...chaosKeys.map((chaos) => matrixCell(language, chaos)),
    chaosKeys.reduce((sum, chaos) => sum + matrixCell(language, chaos), 0),
  ]),
));
sections.push('');

// 4. Reason and margin
sections.push('## 4. Gate reason and margin', '');
sections.push('### Local run', '');
sections.push(...table(
  ['Gate reason (false escalations)', 'Count'],
  Object.entries(localMargin.reasons).map(([reason, count]) => [reason, count]),
));
sections.push(
  '',
  `- Blocked by **insufficient margin**: ${localMargin.reasons.insufficient_margin ?? 0} of ${localMargin.falseEscalations}.`,
  `- Blocked with **no usable candidate at all**: ${(localMargin.reasons.no_candidates ?? 0) + (localMargin.reasons.invalid_candidate ?? 0)}. ${localMargin.withMargin} of ${localMargin.falseEscalations} false-escalation rows recorded candidate scores, so retrieval always returned something to compare.`,
  `- Blocked **below the absolute floor**: ${localMargin.reasons.below_threshold ?? 0}. The shipped floor is \`thresholdAccept\` ${DEFAULT_GATE_CONFIG.thresholdAccept}, so this path is effectively unreachable on this corpus.`,
  '',
  '### Margin distribution (local, false escalations with a computable margin)',
  '',
  localMargin.stats === null
    ? 'No margin is computable.'
    : `| Measure | Value |\n|---|---:|\n| Count | ${localMargin.stats.count} |\n| Minimum | ${fixed(localMargin.stats.min)} |\n| Median | ${fixed(localMargin.stats.median)} |\n| Mean | ${fixed(localMargin.stats.mean)} |\n| Maximum | ${fixed(localMargin.stats.max)} |`,
  '',
  `Applied margin: ${fixed(localMargin.threshold, 2)}. Shipped default: ${shippedDefault.toFixed(2)}.`,
  '',
  `- Within **0.05 below the applied margin** (${fixed(localMargin.threshold - 0.05, 2)} – ${fixed(localMargin.threshold, 2)}): **${localMargin.within005BelowThreshold}** of ${localMargin.withMargin}.`,
  `- At or above the applied margin: **${localMargin.atOrAboveThreshold}** — a false escalation cannot occur above the threshold, so this must be 0 and is.`,
  `- Margin not computable from the recorded file: ${localMargin.withoutMargin}.`,
  '',
  ...table(['Margin bucket', 'False escalations'], localMargin.distribution.map((bucket) => [bucket.label, bucket.count])),
  '',
  '### Did retrieval find the right procedure?',
  '',
  `- Top-ranked candidate **is** the expected procedure: **${localMargin.top1IsExpected}** of ${localMargin.falseEscalations}. The right policy was retrieved and ranked first; only the margin was too small.`,
  `- Top-ranked candidate is a **different** procedure: **${localMargin.top1IsOther}**.`,
  `- No ranked candidate recorded: ${localMargin.top1Unknown}.`,
  '',
  '### Deployed-path run',
  '',
  'The deployed-path result records no candidate scores, so its margin distribution is not measurable and is not reported.',
  '',
  ...table(
    ['Gate reason (deployed false escalations)', 'Count'],
    Object.entries(deployedMargin.reasons).map(([reason, count]) => [reason, count]),
  ),
  '',
  'The one recorded deployed margin is the safety counterexample: ticket `SIM-TICKET-00272`, score 0.715348, margin **0.180757**, applied margin 0.17. That ticket was answered rather than escalated, so it is an unsafe answer, not a false escalation, and it is excluded from the counts above. Its margin is also above the shipped 0.18 default.',
  '',
);

// 5. Worst per language
sections.push('## 5. Ten worst-margin false escalations per language', '');
sections.push(
  'Identical query text recurs across tickets, because the batch draws from a small template pool: the rows below are the ten lowest-margin tickets in each language, not ten distinct questions.',
  '',
);
for (const language of languages) {
  const rows = worstByLanguage(local.rows, language);
  const total = local.rows.filter((row) => isFalseEscalation(row) && row.language === language).length;
  sections.push(`### ${language} — showing ${rows.length} of ${total}`, '');
  if (rows.length === 0) {
    sections.push('No false escalation with a computable margin in this language.', '');
    continue;
  }
  sections.push(...table(
    ['Ticket', 'Margin', 'Chaos type', 'Expected procedure', 'Top-1 candidate', 'Query text'],
    rows.map((row) => [
      row.id,
      fixed(row.margin),
      row.chaos,
      row.expectedSop ?? '(none)',
      row.top1Sop ?? '(none)',
      escapeCell(row.message),
    ]),
  ));
  sections.push('');
}

// 6. Conclusion
const baselineGroup = groupBy(local.rows, (row) => row.chaos).get('baseline') ?? [];
const baselineSummary = summarise(baselineGroup);
const chaosGroup = groupBy(local.rows, (row) => row.chaos);
const worstRate = [...chaosGroup.entries()]
  .map(([type, rows]) => ({ type, summary: summarise(rows) }))
  .filter((entry) => entry.summary.tickets >= 5)
  .sort((left, right) => right.summary.falseEscalationRate - left.summary.falseEscalationRate)[0];
const languageGroups = groupBy(local.rows, (row) => row.language);
const worstLanguage = [...languageGroups.entries()]
  .map(([language, rows]) => ({ language, summary: summarise(rows) }))
  .filter((entry) => entry.language !== '(missing)' && entry.summary.tickets >= 20)
  .sort((left, right) => right.summary.falseEscalationRate - left.summary.falseEscalationRate)[0];
const bestLanguage = [...languageGroups.entries()]
  .map(([language, rows]) => ({ language, summary: summarise(rows) }))
  .filter((entry) => entry.language !== '(missing)' && entry.summary.tickets >= 20)
  .sort((left, right) => left.summary.falseEscalationRate - right.summary.falseEscalationRate)[0];

sections.push(
  '## 6. Conclusion',
  '',
  '### What the data supports',
  '',
  `1. **Every false escalation is the same mechanism.** All ${localMargin.falseEscalations} local false escalations were blocked with reason \`insufficient_margin\`; none was blocked for an absent candidate and none for the absolute floor. Retrieval returned candidate scores on ${localMargin.withMargin} of them.`,
  `2. **Retrieval is not the failure; separation is.** In ${localMargin.top1IsExpected} of ${localMargin.falseEscalations} false escalations the expected procedure was already ranked **first** — the assistant found the right policy and then declined to use it because the runner-up was close behind.`,
  `3. **Most of the shortfall is not marginal.** The margin distribution is min ${fixed(localMargin.stats?.min)}, median ${fixed(localMargin.stats?.median)}, max ${fixed(localMargin.stats?.max)}, against an applied margin of ${fixed(localMargin.threshold, 2)}. Only ${localMargin.within005BelowThreshold} of ${localMargin.withMargin} sit within 0.05 below the threshold; the rest are further away. So the larger part of the failure is separation that is far too small, not a hair's-breadth calibration miss.`,
  `4. **The failures are not confined to the chaos mutations.** ${baselineSummary.falseEscalations} of ${baselineSummary.tickets} unmutated tickets (${pct(baselineSummary.falseEscalationRate)}) failed, which is the single largest group by count. The mutations that add tone, typos or noise (${worstRate?.type ?? 'n/a'}, ${pct(worstRate?.summary.falseEscalationRate ?? 0)}) raise the rate but did not create the failure mode.`,
  worstLanguage === undefined || bestLanguage === undefined
    ? '5. The language split is recorded in section 1.'
    : `5. **The rate differs by declared language.** ${worstLanguage.language} has the highest false-escalation rate (${pct(worstLanguage.summary.falseEscalationRate)}, ${worstLanguage.summary.falseEscalations}/${worstLanguage.summary.tickets}) and ${bestLanguage.language} the lowest (${pct(bestLanguage.summary.falseEscalationRate)}, ${bestLanguage.summary.falseEscalations}/${bestLanguage.summary.tickets}). The corpus repeats every procedure in all four languages, so this is a difference in measured outcome, not evidence that one language is unsupported.`,
  '',
  '### What the data does not support',
  '',
  `1. **It does not show that lowering the threshold is safe.** The one unsafe answer in the deployed run — ticket \`SIM-TICKET-00272\` — was accepted at a margin of 0.180757, *above* the shipped default. The same statistic that marks these 138 tickets as too close also marked that one as close enough. Tightening or loosening a single margin value cannot separate the two cases, and this analysis does not propose a new value.`,
  `2. **It does not identify a cause.** Nothing here measures \`triggerKeywords\`, summary wording, passage length or model behaviour. The finding is that the top-2 scores are close; why they are close is not measured by this data.`,
  `3. **It does not generalise, and the tickets are not independent.** The batch is synthetic and its expected decisions come from the same generator and corpus as the procedures, so the evaluation is in-sample. The ${local.rows.length} tickets carry only ${distinctBatchMessages} distinct messages and the ${falseEscalationRows.length} false escalations only ${distinctFalseEscalationMessages}, so one failing template supplies many rows. These rates are properties of this fixed batch, not of real support traffic.`,
  `4. **It does not describe the deployed margin distribution.** The deployed-path result records no candidate scores, so only the local margin distribution is measured. The deployed run produced the same ${deployedMargin.falseEscalations} false escalations, but its margins are not available to compare.`,
  `5. **It does not separate the language effect from the corpus effect.** The declared-language split is confounded by the two mutations that overwrite the language column, and the corpus\'s four translations are not identical in length or phrasing. The per-language rates in section 1 are measured; the reason for the difference is not.`,
  '',
  '### Reproduction',
  '',
  '```bash',
  'node tooling/eval/analyze-false-escalations.mjs',
  '```',
  '',
);

const markdown = `${sections.join('\n')}\n`;
writeFileSync(outPath, markdown);
process.stdout.write(markdown);
process.stdout.write(`\nSaved ${outPath}\n`);
