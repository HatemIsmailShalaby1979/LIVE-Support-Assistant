/**
 * Conflicting-procedure detection — the single source of truth.
 *
 * Pure, dependency-free ESM. No `node:` built-ins and no DOM, so it loads
 * unchanged in three places:
 *   1. the lint CLI (`lint-procedure-conflicts.mjs`),
 *   2. the publish gate (`supabase/functions/publish-bundle/index.ts`, Deno),
 *   3. the verification harnesses (node).
 *
 * Keeping it dependency-free is what lets one copy of the grammar be reused by
 * both the Node CLI and the Deno edge function. The Deno import path is
 * `../../../tooling/conflicts/conflict-core.mjs`, the same cross-directory
 * relative import the function already uses for `packages/sync/dist`.
 *
 * Why this exists. The Confidence Gate measures how *decisive* a match is, not
 * whether the matched policy is internally consistent. Two procedures in the
 * same category can state different payout windows, and the gate will answer
 * from whichever scores marginally higher. That is exactly how the simulated
 * contradictory-payout case (`SIM-TICKET-00272`, measured margin 0.180757) was
 * answered instead of escalated. This module catches that condition before a
 * bundle is published, so a tenant can never be served contradictory policy.
 *
 * How a disagreement is defined. For each numeric fact key (payout/processing
 * windows in business days, minimum age, minimum followers, fees, payout
 * minimums) a procedure contributes the set of values it *asserts*. Two
 * procedures in the same category conflict on a key when their asserted value
 * sets are disjoint — no value satisfies both. For windows the comparison is
 * interval overlap; for scalars it is set intersection.
 *
 * Two deliberate scoping decisions (carried over from the original lint):
 *
 * 1. Explicitly rejected values are not assertions. The simulated conflict
 *    procedure reads "Do not use the two-to-five-business-day estimate". That
 *    sentence *mentions* 2-5 days in order to discard it. Counting it as an
 *    assertion would make the procedure look consistent with the standard one
 *    and hide the conflict. Sentences that mark a value as superseded, ignored,
 *    deprecated or contradicted are excluded before extraction.
 *
 * 2. Only English number words are parsed. The corpus repeats every summary in
 *    Spanish, Brazilian Portuguese and French; the translations carry the same
 *    figures in their own number words ("dos a cinco", "dois a cinco", "deux à
 *    cinq"), which this module does not parse. That is a stated limitation, not
 *    a silent one: a corpus whose *only* numeric statement is in a non-English
 *    language is not checked. `verify-publish-conflict-block.mjs` (case e)
 *    locks this behaviour so it cannot change silently.
 */

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
 * Plausibility bounds. Guards against a stray number being read as a policy
 * value, not tuning knobs: an "age" outside 13-120 or a fee outside 0-100
 * percent is a parsing accident, not a policy claim.
 */
const AGE_RANGE = [13, 120];
const FEE_RANGE = [0, 100];

/** Sentences that discard a value rather than assert it. */
const REJECTION_PATTERN =
  /\b(?:do not use|don't use|do not rely|ignore|disregard|supersed\w*|deprecated|legacy|no longer|instead of|conflicts? with|contradict\w*)\b/i;

export function wordValue(token) {
  const numeric = Number(token);
  if (Number.isFinite(numeric)) return numeric;
  return NUMBER_WORDS[token.toLowerCase()] ?? null;
}

/**
 * Split a procedure's text into sentences and mark the ones that reject a value
 * rather than assert it. The title is excluded on purpose: titles describe a
 * procedure ("Conflicting Legacy Guide"); they do not state policy.
 */
export function sentencesOf(sop) {
  const text = [sop.summary, sop.suggestedReply]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' ')
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

/** Extract the numeric policy facts a procedure asserts. */
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

function formatValues(key, values) {
  return values
    .map(({ value }) => (key === 'window_days' ? `${value[0]}–${value[1]}` : String(value)))
    .join(', ');
}

/**
 * One human-readable sentence for a single conflict, naming both procedures,
 * the field, and both asserted values.
 */
export function formatConflictMessage(conflict) {
  const side = (c) => `${c.sopId} (${c.title}) asserts ${formatValues(conflict.key, c.values)}`;
  return (
    `Procedure conflict in category "${conflict.category}", field "${conflict.key}": ` +
    `${side(conflict.left)}; ${side(conflict.right)}. ` +
    'Publish blocked: a tenant must not be served contradictory policy.'
  );
}

/**
 * The publish-gate decision.
 *
 * @param sops The procedures of one tenant corpus (the same list the publisher
 *   is about to sign and ship).
 * @returns `{ ok: true, conflicts: [] }` when no same-category numeric conflict
 *   exists, or `{ ok: false, conflicts, message }` when at least one does. The
 *   caller blocks the publish on `ok === false` and returns `message` plus the
 *   structured `conflicts` to the requester.
 */
export function lintCorpusForPublish(sops) {
  const conflicts = findConflicts(sops);
  if (conflicts.length === 0) return { ok: true, conflicts: [] };
  const message =
    conflicts.length === 1
      ? formatConflictMessage(conflicts[0])
      : `${conflicts.length} procedure conflicts block publication. ` +
        conflicts.map(formatConflictMessage).join(' ');
  return { ok: false, conflicts, message };
}
