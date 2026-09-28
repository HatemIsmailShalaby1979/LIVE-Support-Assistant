#!/usr/bin/env node
/**
 * Conflicting-procedure lint.
 *
 * The problem this exists for. The Confidence Gate measures how *decisive* a
 * match is, not whether the matched policy is internally consistent. Two
 * procedures in the same category can state different payout windows, and the
 * gate will happily answer from whichever one scores marginally higher. That is
 * exactly how the simulated contradictory-payout case
 * (`SIM-TICKET-00272`, measured margin 0.180757) was answered instead of
 * escalated: the margin was large enough to accept, and nothing checked whether
 * the corpus agreed with itself.
 *
 * What it does. Scans a tenant corpus for procedure pairs in the same category
 * whose numeric policy fields disagree, prints a report, and exits non-zero when
 * it finds a conflict. It reads the corpus only; it changes nothing.
 *
 * How a disagreement is defined. For each numeric fact key (payout/processing
 * windows in business days, minimum age, minimum followers, fees, payout
 * minimums) a procedure contributes the set of values it *asserts*. Two
 * procedures in the same category conflict on a key when their asserted value
 * sets are disjoint — no value satisfies both. For windows the comparison is
 * interval overlap; for scalars it is set intersection.
 *
 * Two deliberate scoping decisions:
 *
 * 1. Explicitly rejected values are not assertions. The simulated conflict
 *    procedure reads "Do not use the two-to-five-business-day estimate". That
 *    sentence *mentions* 2-5 days in order to discard it. Counting it as an
 *    assertion would make the procedure look consistent with the standard one
 *    and hide the conflict. Sentences that mark a value as superseded, ignored,
 *    deprecated or contradicted are therefore excluded before extraction.
 *
 * 2. Only English number words are parsed. The corpus repeats every summary in
 *    Spanish, Brazilian Portuguese and French; the translations carry the same
 *    figures in their own number words ("dos a cinco", "dois a cinco", "deux à
 *    cinq"), which this lint does not parse. That is a stated limitation, not a
 *    silent one: a corpus whose *only* numeric statement is in a non-English
 *    language would not be checked.
 *
 * Usage:
 *   node tooling/conflicts/lint-procedure-conflicts.mjs <corpus.json> [...]
 *   node tooling/conflicts/lint-procedure-conflicts.mjs --json <corpus.json>
 *
 * Exit codes: 0 no conflicts, 1 conflicts found, 2 usage or input error.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};

const NUMBER_PATTERN = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+)';
const RANGE_SEPARATOR = '(?:\\s*(?:-|–|—|to|through|and)\\s*)+';
const WINDOW_PATTERN = new RegExp(
  `\\b(${NUMBER_PATTERN})(?:\\s*${RANGE_SEPARATOR}\\s*(${NUMBER_PATTERN}))?\\s+(?:business\\s+)?(?:day|days|week|weeks)\\b`,
  'gi',
);
const AGE_PATTERN = new RegExp(
  `\\b(?:at least\\s+)?(${NUMBER_PATTERN})\\s*(?:years?\\s*(?:old|of age)|yo\\b|\\+)`
  + `|\\b(?:at least\\s+)?(${NUMBER_PATTERN})\\s*(?=,|\\s+or older\\b)`,
  'gi',
);
const FOLLOWERS_PATTERN = new RegExp(
  `\\b(${NUMBER_PATTERN})\\s*(?:followers|subscribers)\\b`,
  'gi',
);
const FEE_PATTERN = new RegExp(
  `\\b(${NUMBER_PATTERN})\\s*(?:%|percent|per cent)\\b`,
  'gi',
);
const MINIMUM_AMOUNT_PATTERN = new RegExp(
  `\\b(?:minimum|at least)\\s*[$€£]\\s*(${NUMBER_PATTERN})\\b`,
  'gi',
);

/**
 * Plausibility bounds. These are guards against a stray number being read as a
 * policy value, not tuning knobs: an "age" outside 13-120 or a fee outside
 * 0-100 percent is a parsing accident, not a policy claim.
 */
const AGE_RANGE = [13, 120];
const FEE_RANGE = [0, 100];

/** Sentences that discard a value rather than assert it. */
const REJECTION_PATTERN =
  /\b(?:do not use|don't use|do not rely|ignore|disregard|supersed\w*|deprecated|legacy|no longer|instead of|conflicts? with|contradict\w*)\b/i;

function wordValue(token) {
  const numeric = Number(token);
  if (Number.isFinite(numeric)) return numeric;
  return NUMBER_WORDS[token.toLowerCase()] ?? null;
}

/**
 * Split a procedure's text into sentences and mark the ones that reject a
 * value rather than assert it.
 *
 * The title is excluded on purpose. Titles describe a procedure ("Conflicting
 * Legacy Guide"); they do not state policy, and a title word such as "Legacy"
 * would otherwise mark the procedure's real claim as rejected. Only the summary
 * and the suggested reply carry assertions.
 */
function sentencesOf(sop) {
  const text = [sop.summary, sop.suggestedReply]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' ')
    // Join hyphenated compounds so "two-to-five-business-day" reads as words.
    .replace(/(?<=[A-Za-z])-(?=[A-Za-z])/g, ' ');
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .map((sentence) => ({ sentence, rejecting: REJECTION_PATTERN.test(sentence) }));
}

function collect(pattern, sentences, build) {
  const values = [];
  const seen = new Set();
  for (const { sentence, rejecting } of sentences) {
    if (rejecting) continue;
    for (const match of sentence.matchAll(pattern)) {
      const value = build(match);
      if (value === null) continue;
      const key = JSON.stringify(value);
      if (seen.has(key)) continue;
      seen.add(key);
      values.push({ value, evidence: sentence });
    }
  }
  return values;
}

function inRange(value, [low, high]) {
  return value !== null && value >= low && value <= high;
}

/**
 * Extract the numeric policy facts a procedure asserts.
 *
 * @param sop A corpus procedure.
 * @returns A map of fact key to the values asserted, each with its evidence.
 */
export function extractPolicyFacts(sop) {
  const sentences = sentencesOf(sop);
  return {
    window_days: collect(WINDOW_PATTERN, sentences, (match) => {
      const low = wordValue(match[1]);
      if (low === null) return null;
      const high = match[2] === undefined ? null : wordValue(match[2]);
      return [low, high ?? low];
    }),
    minimum_age_years: collect(AGE_PATTERN, sentences, (match) => {
      const value = wordValue(match[1] ?? match[2]);
      return inRange(value, AGE_RANGE) ? value : null;
    }),
    minimum_followers: collect(FOLLOWERS_PATTERN, sentences, (match) => wordValue(match[1])),
    fee_percent: collect(FEE_PATTERN, sentences, (match) => {
      const value = wordValue(match[1]);
      return inRange(value, FEE_RANGE) ? value : null;
    }),
    payout_minimum: collect(MINIMUM_AMOUNT_PATTERN, sentences, (match) => wordValue(match[1])),
  };
}

function windowsOverlap(left, right) {
  return left[0] <= right[1] && right[0] <= left[1];
}

/** Whether two asserted value sets have any value in common. */
function agrees(key, left, right) {
  if (key === 'window_days') {
    return left.some((a) => right.some((b) => windowsOverlap(a.value, b.value)));
  }
  return left.some((a) => right.some((b) => a.value === b.value));
}

/**
 * Find same-category procedure pairs whose numeric facts disagree.
 *
 * @param sops The procedures of one tenant corpus.
 * @returns Every disjoint numeric claim between two procedures of a category.
 */
export function findConflicts(sops) {
  const byCategory = new Map();
  for (const sop of sops) {
    const category = typeof sop.category === 'string' ? sop.category : '(uncategorised)';
    const list = byCategory.get(category) ?? [];
    list.push(sop);
    byCategory.set(category, list);
  }

  const conflicts = [];
  for (const [category, members] of byCategory) {
    if (members.length < 2) continue;
    for (let left = 0; left < members.length; left += 1) {
      for (let right = left + 1; right < members.length; right += 1) {
        const factsLeft = extractPolicyFacts(members[left]);
        const factsRight = extractPolicyFacts(members[right]);
        for (const key of Object.keys(factsLeft)) {
          const valuesLeft = factsLeft[key];
          const valuesRight = factsRight[key];
          if (valuesLeft.length === 0 || valuesRight.length === 0) continue;
          if (agrees(key, valuesLeft, valuesRight)) continue;
          conflicts.push({
            category,
            key,
            left: { sopId: members[left].id, title: members[left].title, values: valuesLeft },
            right: { sopId: members[right].id, title: members[right].title, values: valuesRight },
          });
        }
      }
    }
  }
  return conflicts;
}

/** Load and merge one or more corpus files into a single procedure list. */
export function loadCorpus(paths) {
  const sops = [];
  for (const path of paths) {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed.sops)) {
      throw new Error(`${path} does not contain a "sops" array`);
    }
    sops.push(...parsed.sops);
  }
  return sops;
}

function formatValues(key, values) {
  return values
    .map(({ value }) => (key === 'window_days' ? `${value[0]}–${value[1]}` : String(value)))
    .join(', ');
}

function report(conflicts, sops) {
  const lines = [
    'SIMULATED DATA | conflicting-procedure lint',
    '',
    `Procedures scanned: ${sops.length}`,
    `Conflicts found: ${conflicts.length}`,
    '',
  ];
  if (conflicts.length === 0) {
    lines.push('No same-category numeric disagreement was found.');
    return lines.join('\n');
  }
  for (const conflict of conflicts) {
    lines.push(
      `CONFLICT [${conflict.category}] ${conflict.key}`,
      `  ${conflict.left.sopId} (${conflict.left.title}) asserts ${formatValues(conflict.key, conflict.left.values)}`,
      `  ${conflict.right.sopId} (${conflict.right.title}) asserts ${formatValues(conflict.key, conflict.right.values)}`,
      `  Evidence (${conflict.left.sopId}): ${conflict.left.values[0].evidence}`,
      `  Evidence (${conflict.right.sopId}): ${conflict.right.values[0].evidence}`,
      '',
    );
  }
  return lines.join('\n');
}

/**
 * Run the lint as a command line.
 *
 * Exported so the regression test can assert the exit-code contract without
 * spawning a child process — `spawnSync` is unreliable in this host's sandbox,
 * and a test that cannot run is worse than no test.
 *
 * @param argv Arguments after the script name.
 * @param write Sink for report output. Defaults to stdout.
 * @param writeError Sink for the usage message. Defaults to stderr.
 * @returns 0 no conflicts, 1 conflicts found, 2 usage or input error.
 */
export function runCli(
  argv,
  write = (text) => process.stdout.write(text),
  writeError = (text) => process.stderr.write(text),
) {
  const json = argv.includes('--json');
  const paths = argv.filter((argument) => !argument.startsWith('--'));
  if (paths.length === 0) {
    writeError(
      'usage: node tooling/conflicts/lint-procedure-conflicts.mjs [--json] <corpus.json> [...]\n',
    );
    return 2;
  }
  const sops = loadCorpus(paths.map((path) => resolve(path)));
  const conflicts = findConflicts(sops);
  write(json
    ? `${JSON.stringify({ data_mode: 'simulated', procedures: sops.length, conflicts }, null, 2)}\n`
    : `${report(conflicts, sops)}\n`);
  return conflicts.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
