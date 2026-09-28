#!/usr/bin/env node
/**
 * False-escalation analysis for the simulated 500-ticket batch.
 *
 * Read-only. It reads the recorded local and deployed-path result files, derives
 * the Confidence Gate's own margin from the recorded top-k candidate scores, and
 * writes a report. It changes no product code, no gate logic, no threshold, no
 * procedure, and no recorded result file.
 *
 * The unit of evidence is the **distinct message**, not the ticket. The batch
 * draws from a small template pool, so ticket counts are weighted by how often
 * each template repeats; a rate computed over tickets is a rate over
 * repetitions, not over questions.
 *
 * What is measurable, and what is not. The local result records the top-k
 * candidate scores for every ticket, so the gate's margin can be recomputed
 * exactly. The deployed-path result records a decision and a reason per ticket
 * but no candidate scores, so the deployed margin distribution is **not**
 * measurable from that file; only the one recorded safety counterexample carries
 * a margin. The report says so rather than estimating.
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
/** Chaos types whose expected outcome is escalation on every ticket, so they cannot produce a false escalation. */
const CORRECT_BY_CONSTRUCTION_CHAOS = new Set(['contradicting_sops', 'no_correct_answer']);
/** Procedures whose expected outcome is escalation, so they cannot produce a false escalation. */
const ESCALATION_ONLY_PROCEDURES = new Set(['wc-security', 'wc-appeal', '(none)']);
const UNSAFE_CATEGORIES = new Set(['unsafe_answer_on_escalation_case', 'wrong_sop_answer']);
/** The overlaps named in the brief, plus the largest runner-up for the wc-live group. */
const OVERLAP_PAIRS = [
  { label: 'wc-payout vs wc-gifts', top1: 'wc-payout', top2: 'wc-gifts' },
  { label: 'wc-eligibility vs wc-live', top1: 'wc-eligibility', top2: 'wc-live' },
  { label: 'wc-eligibility vs wc-appeal', top1: 'wc-eligibility', top2: 'wc-appeal' },
];

/**
 * Reproduce the gate's margin exactly as `packages/core/src/gate.ts` computes it:
 * rank the top-k by descending score, then subtract the runner-up's score (or 0
 * when there is no runner-up).
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
    : '(none)';
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
    top2Sop: ranked[1]?.sopId ?? null,
    top1Evidence: ranked[0]?.evidence ?? '',
    top2Evidence: ranked[1]?.evidence ?? '',
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

const isFalseEscalation = (row) => row.failureCategory === 'false_escalation';
const isUnsafe = (row) => UNSAFE_CATEGORIES.has(row.failureCategory);
const isCorrect = (row) => row.failureCategory === null;

const falseEscalations = local.rows.filter(isFalseEscalation);
const deployedDecisionById = new Map(deployed.rows.map((row) => [row.id, row.actualDecision]));
const sharedDecisions = local.rows.filter((row) => deployedDecisionById.get(row.id) === row.actualDecision).length;

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

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return 0;
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * fraction) - 1)] ?? 0;
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
const distinct = (values) => [...new Set(values)];

function summarise(rows) {
  const correct = rows.filter(isCorrect).length;
  const falseEscalationCount = rows.filter(isFalseEscalation).length;
  return {
    tickets: rows.length,
    correct,
    accuracy: rows.length === 0 ? 0 : correct / rows.length,
    falseEscalations: falseEscalationCount,
    falseEscalationRate: rows.length === 0 ? 0 : falseEscalationCount / rows.length,
    unsafeAnswers: rows.filter(isUnsafe).length,
  };
}

/** Markdown table with per-column alignment ('l' or 'r'). */
function table(header, rows, align = header.map((_, index) => (index === 0 ? 'l' : 'r'))) {
  return [
    `| ${header.join(' | ')} |`,
    `|${align.map((side) => (side === 'l' ? '---' : '---:')).join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
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

// ---------------------------------------------------------------- distinct messages

/**
 * One record per distinct message, with the ticket-level counts folded in.
 *
 * A message can carry more than one declared language and more than one expected
 * procedure — the chaos mutations overwrite both — so those columns list the
 * distinct values. The margin is the minimum observed for the message; when it
 * varies across the message's tickets, `marginVaries` is true.
 */
function distinctMessageTable(rows) {
  return [...groupBy(rows, (row) => row.message).entries()].map(([message, group]) => {
    const margins = [...group.map((row) => row.margin).filter((value) => value !== null)]
      .sort((left, right) => left - right);
    return {
      message,
      languages: distinct(group.map((row) => row.language)),
      expected: distinct(group.map((row) => row.expectedSop ?? '(none)')),
      tickets: group.length,
      correct: group.filter(isCorrect).length,
      falseEscalations: group.filter(isFalseEscalation).length,
      top1: distinct(group.map((row) => row.top1Sop ?? '(none)')),
      top2: distinct(group.map((row) => row.top2Sop ?? '(none)')),
      margin: margins[0] ?? null,
      marginMax: margins.at(-1) ?? null,
      marginVaries: margins.length > 0 && margins[0] !== margins.at(-1),
      hasRankableExpected: group.some((row) => row.expectedSop !== null),
      // "Expected first" means the expected procedure outranks every other
      // procedure on every ticket of this message that has one to rank.
      expectedFirst: group
        .filter((row) => row.expectedSop !== null)
        .every((row) => row.top1Sop === row.expectedSop),
    };
  }).sort((left, right) => (left.margin ?? 0) - (right.margin ?? 0));
}

const distinctMessages = distinctMessageTable(local.rows);
const failingDistinctMessages = distinctMessages.filter((entry) => entry.falseEscalations > 0);
const failingExpectedFirst = failingDistinctMessages.filter((entry) => entry.hasRankableExpected && entry.expectedFirst);
const failingExpectedNotFirst = failingDistinctMessages.filter((entry) => entry.hasRankableExpected && !entry.expectedFirst);
const failingMixed = failingDistinctMessages.length - failingExpectedFirst.length - failingExpectedNotFirst.length;

// ---------------------------------------------------------------- confusion pairs

function confusionPairs(rows) {
  const groups = groupBy(
    rows.filter(isFalseEscalation),
    (row) => `${row.top1Sop ?? '(none)'}|${row.top2Sop ?? '(none)'}`,
  );
  return [...groups.entries()].map(([key, group]) => {
    const [top1, top2] = key.split('|');
    const margins = [...group.map((row) => row.margin).filter((value) => value !== null)]
      .sort((left, right) => left - right);
    return {
      top1,
      top2,
      tickets: group.length,
      distinctMessages: distinct(group.map((row) => row.message)).length,
      medianMargin: percentile(margins, 0.5),
    };
  }).sort((left, right) => right.tickets - left.tickets);
}

const pairs = confusionPairs(local.rows);
const sameProcedureRunnerUp = falseEscalations
  .filter((row) => row.top1Sop !== null && row.top1Sop === row.top2Sop).length;

// ---------------------------------------------------------------- overlap observation

const STOPWORDS = new Set((
  'the a an and or but if is are was were be been being to of in on at for with from by as not no '
  + 'this that these those it its their our your his her my we you they he she i '
  + 'have has had do does did can could would should will shall may might must '
  + 'de la el los las un una unos unas y o si se es son como que del al en por para con sin sobre '
  + 'mais e um uma uns umas nao sim sao foi ser esta estao pelo pela dos das ao aos '
  + 'au aux du des le les une est sont ce cette ces il elle ils elles qui ne pas plus et ou dans sur pour avec '
  + 'não já até também'
).split(/\s+/));

function tokenise(text, minimumLength = 4) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= minimumLength && !STOPWORDS.has(word));
}

function ngrams(text, size) {
  const words = text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let index = 0; index + size <= words.length; index += 1) {
    out.push(words.slice(index, index + size).join(' '));
  }
  return out;
}

/** Shared tokens and multi-word phrases between two passages. */
function sharedPhrases(left, right) {
  const rightWords = new Set(tokenise(right));
  const words = distinct(tokenise(left).filter((word) => rightWords.has(word)));
  const phrase = (size) => {
    const rightSet = new Set(ngrams(right, size));
    return distinct(ngrams(left, size).filter((candidate) =>
      rightSet.has(candidate) && !candidate.split(' ').some((word) => STOPWORDS.has(word))));
  };
  return { words, bigrams: phrase(2), trigrams: phrase(3) };
}

/**
 * The competing passages that actually scored for a procedure pair: the most
 * common (top-1 evidence, top-2 evidence) combination across its tickets.
 */
function modalCompetingPassages(rows, top1, top2) {
  const matching = rows.filter((row) =>
    isFalseEscalation(row) && row.top1Sop === top1 && row.top2Sop === top2);
  if (matching.length === 0) return null;
  const counts = new Map();
  for (const row of matching) {
    const key = `${row.top1Evidence}\u0000${row.top2Evidence}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [key, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  const [leftEvidence, rightEvidence] = key.split('\u0000');
  return { count, tickets: matching.length, leftEvidence, rightEvidence };
}

// ---------------------------------------------------------------- margin analysis

function marginAnalysis(rows, minMargin) {
  const failures = rows.filter(isFalseEscalation);
  const withMargin = failures.filter((row) => row.margin !== null);
  const values = withMargin.map((row) => row.margin);
  const threshold = minMargin ?? DEFAULT_GATE_CONFIG.minMargin;
  const buckets = [
    { label: '< 0.05', test: (value) => value < 0.05 },
    { label: '0.05 – 0.10', test: (value) => value >= 0.05 && value < 0.10 },
    { label: '0.10 – 0.15', test: (value) => value >= 0.10 && value < 0.15 },
    { label: `0.15 – ${threshold.toFixed(2)}`, test: (value) => value >= 0.15 && value < threshold },
    { label: `>= ${threshold.toFixed(2)}`, test: (value) => value >= threshold },
  ];
  return {
    falseEscalations: failures.length,
    withMargin: withMargin.length,
    withoutMargin: failures.length - withMargin.length,
    threshold,
    stats: stats(values),
    within005BelowThreshold: values.filter((value) => value >= threshold - 0.05 && value < threshold).length,
    atOrAboveThreshold: values.filter((value) => value >= threshold).length,
    distribution: buckets.map((bucket) => ({ label: bucket.label, count: values.filter(bucket.test).length })),
    reasons: Object.fromEntries(
      [...new Set(failures.map((row) => row.reason))]
        .map((reason) => [reason, failures.filter((row) => row.reason === reason).length])
        .sort((left, right) => right[1] - left[1]),
    ),
    top1IsExpected: failures.filter((row) => row.top1Sop !== null && row.top1Sop === row.expectedSop).length,
    top1IsOther: failures.filter((row) => row.top1Sop !== null && row.top1Sop !== row.expectedSop).length,
  };
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

const languageCounts = Object.fromEntries(languages.map((language) => [
  language,
  distinct(local.rows.filter((row) => row.language === language).map((row) => row.message)).length,
]));
const languageSummary = LANGUAGE_ORDER
  .map((language) => `${language} ${languageCounts[language] ?? 0}`)
  .join(', ');
const languageSetSum = LANGUAGE_ORDER
  .reduce((sum, language) => sum + (languageCounts[language] ?? 0), 0);

const feByLanguageChaos = groupBy(falseEscalations, (row) => `${row.language}\u0000${row.chaos}`);
const matrixCell = (language, chaos) => feByLanguageChaos.get(`${language}\u0000${chaos}`)?.length ?? 0;

const relative = (path) => path.slice(root.length + 1).replaceAll('\\', '/');
const sections = [];

sections.push(
  '# False-escalation analysis — 500-ticket simulated batch',
  '',
  '**data_mode: "simulated".** Every ticket, procedure and measurement below is fictional evaluation data. There is no design partner and no customer data.',
  '',
  'This is a read-only analysis. No product code, gate logic, threshold, procedure, or recorded result file was changed.',
  '',
  '## Scale, stated once',
  '',
  `- **500 tickets are ${distinctMessages.length} distinct messages.** By declared language the distinct-message counts are ${languageSummary}; those four sets sum to ${languageSetSum} because one message is declared both en and fr. One further ticket has no language column at all (\`missing_fields\` removed it) and carries a message already counted under es.`,
  '- **7 procedures**, each indexed as several passages (title, summary sentences, escalation rule).',
  `- Applied margin **${fixed(local.minMargin, 2)}** — test-only. Shipped default **${shippedDefault.toFixed(2)}**.`,
  '- The batch draws its text from a small template pool, so ticket counts are weighted by repetition. The distinct-message table in section 1 is the unit of evidence; the ticket-level rates elsewhere are repetition-weighted.',
  '',
  '## Sources',
  '',
  '| | Local run | Deployed-path run |',
  '|---|---|---|',
  `| File | \`${relative(local.path)}\` | \`${relative(deployed.path)}\` |`,
  `| Run | ${local.runLabel} | ${deployed.runLabel} |`,
  `| Applied margin | ${fixed(local.minMargin, 2)} | ${fixed(deployed.minMargin, 2)} |`,
  `| Batch SHA-256 | \`${(local.parsed.batchSha256 ?? '(not recorded)').slice(0, 16)}…\` | \`${(deployed.parsed.batchSha256 ?? '(not recorded)').slice(0, 16)}…\` |`,
  `| Corpus SHA-256 | \`${(local.parsed.corpusSha256 ?? '(not recorded)').slice(0, 16)}…\` | \`${(deployed.parsed.corpusSha256 ?? '(not recorded)').slice(0, 16)}…\` |`,
  '',
  '## Method, and what is not measurable',
  '',
  'A ticket is a **false escalation** when the batch expects an answer and the assistant escalated. The gate\'s margin is recomputed with the gate\'s own formula (`packages/core/src/gate.ts`): rank the recorded top-k candidates by descending score, then subtract the runner-up\'s score.',
  '',
  `- The **local** run records candidate scores for all ${local.rows.length} tickets, so its margin is measurable exactly.`,
  '- The **deployed-path** run records a decision and a reason per ticket but **no candidate scores**. Its margin distribution is therefore **not measurable** from the recorded file, and this report does not estimate it. The single exception is the recorded safety counterexample, quoted in section 5.',
  `- The deployed-path run and the local run agree on **${sharedDecisions} of ${local.rows.length}** decisions; the deployed run additionally answered one ticket it should have escalated.`,
  `- **Ticket counts are not independent observations.** ${local.rows.length} tickets carry only ${distinctMessages.length} distinct messages, and the ${falseEscalations.length} false escalations only ${failingDistinctMessages.length}. One failing template therefore supplies many rows, so the distinct-message table in section 1 — not a ticket count — is the unit of evidence.`,
  '',
);

// 1. Distinct messages
sections.push(
  `## 1. Distinct messages — all ${distinctMessages.length}, by ascending margin`,
  '',
  'One row per distinct message. `Tickets` counts the tickets carrying it, `ok` the correct ones and `fe` the false escalations. `top-1` and `top-2` are the procedures retrieval ranked first and second on those tickets; the margin is the minimum observed for the message.',
  '',
  'A low margin is not the same as a failure. Several of the lowest-margin messages are **correct**, because the batch expects escalation on them and the gate escalated. Those rows are correct by construction and cannot fail.',
  '',
  ...table(
    ['Language', 'Expected', 'Tickets', 'ok', 'fe', 'top-1', 'top-2', 'Margin'],
    distinctMessages.map((entry) => [
      entry.languages.join('/'),
      entry.expected.join('/'),
      entry.tickets,
      entry.correct,
      entry.falseEscalations,
      entry.top1.join('/'),
      entry.top2.join('/'),
      entry.marginVaries ? `${fixed(entry.margin)} – ${fixed(entry.marginMax)}` : fixed(entry.margin),
    ]),
    ['l', 'l', 'r', 'r', 'r', 'l', 'l', 'r'],
  ),
  '',
  `### The ${failingDistinctMessages.length} failing distinct messages`,
  '',
  `- Expected procedure ranked **first on every ticket of the message**: **${failingExpectedFirst.length}** of ${failingDistinctMessages.length}.`,
  `- Expected procedure **not** ranked first: **${failingExpectedNotFirst.length}**.`,
  `- No procedure to rank (the batch expects escalation with no procedure attached): ${failingMixed}.`,
  '',
  `At ticket level the same split is **${localMargin.top1IsExpected} of ${localMargin.falseEscalations}** with the expected procedure first and **${localMargin.top1IsOther}** without.`,
  '',
);

// 2. By language
sections.push('## 2. By language', '');
sections.push(
  ...table(
    ['Language', 'Tickets', 'Correct', 'Accuracy', 'False escalations', 'Rate', 'Unsafe'],
    dimensionTable(local.rows, (row) => row.language, LANGUAGE_ORDER),
  ),
  '',
  `These rates are **weighted by template repetition**: each language's ticket count is a multiple of how often its templates were drawn, and the distinct-message counts behind them are ${languageSummary}. A rate over tickets is not a rate over questions.`,
  '',
  '**Caveat on the language field.** The batch overwrites the `language` column in two chaos types: `wrong_fields` injects `de` regardless of the message, and `mixed_language_typos_sarcasm` picks a language at random while the message text is a blend. `missing_fields` can delete the column entirely, which appears as `(none)`. The split is by the ticket\'s declared language, not by the language of its text.',
  '',
);

// 3. By chaos type and procedure
sections.push('## 3. By chaos type', '');
sections.push(
  ...table(
    ['Chaos type', 'Tickets', 'Correct', 'Accuracy', 'False escalations', 'Rate', 'Unsafe'],
    dimensionTable(local.rows, (row) => row.chaos, CHAOS_TYPES),
  ),
  '',
  '`baseline` is the unmutated remainder of the batch.',
  '',
  '**Sample size.** Each mutated type carries only 7–8 tickets and one or two distinct messages. Those counts are far too small to compare types against one another, and no ordering of them is meaningful. `baseline` (425 tickets) is the only row with enough volume to read as a rate.',
  '',
  `**Correct by construction.** \`${[...CORRECT_BY_CONSTRUCTION_CHAOS].join('\` and \`')}\` expect escalation on every ticket, so they cannot produce a false escalation. Their 100% is a property of the batch design, not a measured strength.`,
  '',
);

sections.push('### By expected procedure', '');
sections.push(
  ...table(
    ['Expected procedure', 'Tickets', 'Correct', 'Accuracy', 'False escalations', 'Rate', 'Unsafe'],
    dimensionTable(local.rows, (row) => row.expectedSop ?? '(none)', procedures).map((row) =>
      (ESCALATION_ONLY_PROCEDURES.has(row[0]) ? [`${row[0]} †`, ...row.slice(1)] : row)),
  ),
  '',
  '† `wc-security` and `wc-appeal` expect specialist review — escalation — on every ticket, and `(none)` has no procedure attached, so none of the three can produce a false escalation. Their 100% is correct by construction, not a measured strength.',
  '',
);

// 4. Language x chaos
sections.push('## 4. Language × chaos type — false-escalation counts', '');
sections.push(
  ...table(
    ['Language', ...chaosKeys, 'Total'],
    languages.map((language) => [
      language,
      ...chaosKeys.map((chaos) => matrixCell(language, chaos)),
      chaosKeys.reduce((sum, chaos) => sum + matrixCell(language, chaos), 0),
    ]),
    ['l', ...chaosKeys.map(() => 'r'), 'r'],
  ),
  '',
);

// 5. Reason and margin
sections.push('## 5. Gate reason and margin', '');
sections.push('### Local run', '');
sections.push(
  ...table(
    ['Gate reason (false escalations)', 'Count'],
    Object.entries(localMargin.reasons).map(([reason, count]) => [reason, count]),
    ['l', 'r'],
  ),
  '',
  `- Blocked by **insufficient margin**: ${localMargin.reasons.insufficient_margin ?? 0} of ${localMargin.falseEscalations}.`,
  `- Blocked with **no usable candidate at all**: ${(localMargin.reasons.no_candidates ?? 0) + (localMargin.reasons.invalid_candidate ?? 0)}. ${localMargin.withMargin} of ${localMargin.falseEscalations} false-escalation rows recorded candidate scores.`,
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
  '',
  ...table(
    ['Margin bucket', 'False escalations'],
    localMargin.distribution.map((bucket) => [bucket.label, bucket.count]),
    ['l', 'r'],
  ),
  '',
  '### Deployed-path run',
  '',
  'The deployed-path result records no candidate scores, so its margin distribution is not measurable and is not reported.',
  '',
  ...table(
    ['Gate reason (deployed false escalations)', 'Count'],
    Object.entries(deployedMargin.reasons).map(([reason, count]) => [reason, count]),
    ['l', 'r'],
  ),
  '',
  'The one recorded deployed margin is the safety counterexample: ticket `SIM-TICKET-00272`, score 0.715348, margin **0.180757**, applied margin 0.17. That ticket was answered rather than escalated, so it is an unsafe answer, not a false escalation, and it is excluded from the counts above. Its margin is also above the shipped 0.18 default.',
  '',
);

// 6. Confusion pairs
sections.push('## 6. Runner-up identity and confusion pairs', '');
sections.push(
  `Every false escalation has a runner-up. The pair below is (procedure ranked first, procedure ranked second) across the ${localMargin.falseEscalations} false escalations.`,
  '',
  ...table(
    ['Top-1', 'Top-2 (runner-up)', 'Distinct messages', 'Tickets', 'Median margin'],
    pairs.map((pair) => [pair.top1, pair.top2, pair.distinctMessages, pair.tickets, fixed(pair.medianMargin)]),
    ['l', 'l', 'r', 'r', 'r'],
  ),
  '',
  '### Is any runner-up another passage of the same procedure?',
  '',
  '**No — and it cannot be, by construction.** `searchTopK` in `packages/vector-store/src/cosine.ts` scores every passage and then collapses them to procedures before returning:',
  '',
  '```ts',
  'const bestPerProcedure = new Map<string, MatchCandidate>();',
  'for (const candidate of scored) {',
  '  if (!bestPerProcedure.has(candidate.sopId)) bestPerProcedure.set(candidate.sopId, candidate);',
  '}',
  'return [...bestPerProcedure.values()].slice(0, k);',
  '```',
  '',
  `Each procedure contributes at most one candidate — its best-scoring passage — so the gate never compares two passages of the same procedure. The candidates recorded in the result file are always distinct procedures, and the measured count of same-procedure runner-ups is **${sameProcedureRunnerUp} of ${localMargin.falseEscalations}**. That is what the code requires, not an empirical result. Every false escalation is therefore a cross-procedure confusion, and the evidence text recorded for each candidate is that procedure's best-scoring passage.`,
  '',
);

// 7. Overlap observation
sections.push('## 7. Overlap observation — read-only', '');
sections.push(
  'The competing passages behind the most frequent confusion pairs, side by side, taken from the evidence recorded with each candidate. **This is an observation about the text, not a cause.** No procedure was edited, and nothing here establishes why the scores are close.',
  '',
);
const overlapObservations = OVERLAP_PAIRS
  .map((pair) => {
    const modal = modalCompetingPassages(local.rows, pair.top1, pair.top2);
    return modal === null
      ? null
      : { ...pair, ...modal, shared: sharedPhrases(modal.leftEvidence, modal.rightEvidence) };
  })
  .filter((entry) => entry !== null);
const widestSharedWords = overlapObservations
  .map((entry) => entry.shared.words.length)
  .reduce((most, count) => Math.max(most, count), 0);
const anySharedPhrase = overlapObservations.some((entry) =>
  entry.shared.bigrams.length > 0 || entry.shared.trigrams.length > 0);

for (const entry of overlapObservations) {
  sections.push(
    `### ${entry.label}`,
    '',
    `Most common competing pair, on ${entry.count} of the ${entry.tickets} tickets in this confusion pair.`,
    '',
    '| Procedure | Passage text |',
    '|---|---|',
    `| \`${entry.top1}\` (top-1) | ${escapeCell(entry.leftEvidence)} |`,
    `| \`${entry.top2}\` (top-2) | ${escapeCell(entry.rightEvidence)} |`,
    '',
    `- Shared words (length ≥ 4, function words removed): ${entry.shared.words.length === 0 ? 'none' : entry.shared.words.map((word) => `\`${word}\``).join(', ')}.`,
    `- Shared two-word phrases: ${entry.shared.bigrams.length === 0 ? 'none' : entry.shared.bigrams.map((phrase) => `\`${phrase}\``).join(', ')}.`,
    `- Shared three-word phrases: ${entry.shared.trigrams.length === 0 ? 'none' : entry.shared.trigrams.map((phrase) => `\`${phrase}\``).join(', ')}.`,
    '',
  );
}
sections.push(
  `**What this shows, and what it does not.** The competing passages share almost no wording: across these ${overlapObservations.length} pairs the most any two passages share is ${widestSharedWords} word${widestSharedWords === 1 ? '' : 's'}${anySharedPhrase ? '' : ', and no multi-word phrase at all'}. What they share is a *topic* — payout against purchase settlement, LIVE access against LIVE technical faults. That is an observation about lexical overlap only; it does not establish that topical adjacency caused the score gap, because nothing here measures the embedding space.`,
  '',
  'One textual detail is worth recording because it is visible: in this corpus the `wc-live` passage states that a streaming fault is "not an eligibility question", which places the word `elegibilidade` inside the LIVE passage while the eligibility passage carries `LIVE`. Whether that influences the ranking is a **hypothesis, not a finding**, and it has not been tested.',
  '',
);

// 8. Worst per language
sections.push('## 8. Lowest-margin false escalations per language', '');
sections.push(
  'Collapsed to distinct queries, because identical text repeats across tickets. Up to ten lowest-margin distinct queries per language, with the number of tickets each carries.',
  '',
);
for (const language of languages) {
  const grouped = groupBy(
    falseEscalations.filter((row) => row.language === language && row.margin !== null),
    (row) => row.message,
  );
  const entries = [...grouped.entries()].map(([message, group]) => ({
    message,
    count: group.length,
    margin: Math.min(...group.map((row) => row.margin)),
    expected: distinct(group.map((row) => row.expectedSop ?? '(none)')).join('/'),
    top1: distinct(group.map((row) => row.top1Sop ?? '(none)')).join('/'),
    top2: distinct(group.map((row) => row.top2Sop ?? '(none)')).join('/'),
  })).sort((left, right) => left.margin - right.margin).slice(0, 10);
  const total = falseEscalations.filter((row) => row.language === language).length;
  if (total === 0) continue;
  sections.push(`### ${language} — ${entries.length} distinct of ${total} tickets`, '');
  if (entries.length === 0) {
    sections.push('No false escalation with a computable margin in this language.', '');
    continue;
  }
  sections.push(...table(
    ['Query text', 'Tickets', 'Margin', 'Expected', 'Top-1', 'Top-2'],
    entries.map((entry) => [
      escapeCell(entry.message),
      entry.count,
      fixed(entry.margin),
      entry.expected,
      entry.top1,
      entry.top2,
    ]),
    ['l', 'r', 'r', 'l', 'l', 'l'],
  ));
  sections.push('');
}

// 9. Conclusion
const baselineSummary = summarise(groupBy(local.rows, (row) => row.chaos).get('baseline') ?? []);
const languageRates = [...groupBy(local.rows, (row) => row.language).entries()]
  .map(([language, rows]) => ({ language, summary: summarise(rows), distinct: languageCounts[language] ?? 0 }))
  .filter((entry) => LANGUAGE_ORDER.includes(entry.language))
  .sort((left, right) => right.summary.falseEscalationRate - left.summary.falseEscalationRate);
const worstLanguage = languageRates[0];
const bestLanguage = languageRates.at(-1);
const biggestPair = pairs[0];

sections.push(
  '## 9. Conclusion',
  '',
  '### What the data supports',
  '',
  `1. **Every false escalation is the same mechanism.** All ${localMargin.falseEscalations} local false escalations were blocked with reason \`insufficient_margin\`; none was blocked for an absent candidate and none for the absolute floor. Retrieval returned candidate scores on ${localMargin.withMargin} of them.`,
  `2. **Mostly a separation problem, but roughly a third are also misranked.** At ticket level the expected procedure was ranked **first in ${localMargin.top1IsExpected} of ${localMargin.falseEscalations}** and **not first in ${localMargin.top1IsOther}** (${pct(localMargin.top1IsOther / localMargin.falseEscalations)}). At distinct-message level, of the ${failingDistinctMessages.length} failing messages, **${failingExpectedFirst.length}** have the expected procedure ranked first throughout and **${failingExpectedNotFirst.length}** do not. So the assistant usually found the right policy and declined to use it because the runner-up was close, but in a substantial minority it did not find the right policy at all.`,
  `3. **Most of the shortfall is not marginal.** The margin distribution is min ${fixed(localMargin.stats?.min)}, median ${fixed(localMargin.stats?.median)}, max ${fixed(localMargin.stats?.max)}, against an applied margin of ${fixed(localMargin.threshold, 2)}. Only ${localMargin.within005BelowThreshold} of ${localMargin.withMargin} sit within 0.05 below the threshold.`,
  `4. **The failures are not confined to the chaos mutations.** ${baselineSummary.falseEscalations} of ${baselineSummary.tickets} unmutated tickets (${pct(baselineSummary.falseEscalationRate)}) failed. Each mutated type carries only 7–8 tickets, too few to compare against one another.`,
  `5. **The confusion is concentrated in a few procedure pairs.** The largest is \`${biggestPair.top1}\` → \`${biggestPair.top2}\`: ${biggestPair.tickets} tickets across ${biggestPair.distinctMessages} distinct messages, median margin ${fixed(biggestPair.medianMargin)}.`,
  worstLanguage === undefined || bestLanguage === undefined
    ? '6. The language split is recorded in section 2.'
    : `6. **The ticket-level rate differs by declared language**, from ${bestLanguage.language} at ${pct(bestLanguage.summary.falseEscalationRate)} (${bestLanguage.distinct} distinct messages) to ${worstLanguage.language} at ${pct(worstLanguage.summary.falseEscalationRate)} (${worstLanguage.distinct} distinct messages). The corpus repeats every procedure in all four languages, so this is a difference in measured outcome, not evidence that one language is unsupported — and with ${worstLanguage.distinct} distinct messages behind the worst figure, it rests on a small sample.`,
  '',
  '### What the data does not support',
  '',
  `1. **It does not show that lowering the threshold is safe.** The one unsafe answer in the deployed run — ticket \`SIM-TICKET-00272\` — was accepted at a margin of 0.180757, *above* the shipped default. The same statistic that marks these ${localMargin.falseEscalations} tickets as too close also marked that one as close enough. This analysis does not propose a new value.`,
  '2. **It does not identify a cause.** Nothing here measures keywords, summary wording, passage length or the embedding space. Section 7 shows the competing passages share almost no wording; why they score closely is not measured by this data.',
  `3. **It does not generalise.** The batch is synthetic and its expected decisions come from the same generator and corpus as the procedures, so the evaluation is in-sample. ${local.rows.length} tickets carry only ${distinctMessages.length} distinct messages and the ${falseEscalations.length} false escalations only ${failingDistinctMessages.length}; the ticket counts are not independent samples.`,
  `4. **It does not describe the deployed margin distribution.** The deployed-path result records no candidate scores, so only the local margin distribution is measured. The deployed run produced the same ${deployedMargin.falseEscalations} false escalations, but its margins are not available to compare.`,
  '5. **It does not separate the language effect from the corpus effect.** The declared-language split is confounded by the two mutations that overwrite the language column, and the four translations are not identical in length or phrasing. The per-language figures are measured; the reason for the difference is not.',
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
