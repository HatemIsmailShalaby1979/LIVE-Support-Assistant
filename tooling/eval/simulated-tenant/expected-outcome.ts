/**
 * Label fix for the simulated evaluation batch — a labelling correction, not a
 * product change. No shipped code, gate logic, or threshold is touched.
 *
 * The problem. A query can be cut before any procedure keyword or meaning
 * survives; the canonical shape is `"what's the deal with..."`. No human could
 * answer that, so escalating is the correct behaviour, and scoring the
 * escalation as a *false* escalation is a labelling error that inflates the
 * failure count.
 *
 * The rule, encoded here rather than in a hand-edited list: a query is expected
 * to escalate when it is truncated AND it has fewer than four words OR it
 * contains none of its procedure's trigger keywords. Every other query keeps
 * the batch's own expected decision.
 *
 * Two scoping decisions, both measured on the approved 500-ticket batch and
 * both recorded rather than hidden:
 *
 * 1. Only a truncated query is reclassified. A query that is short but complete
 *    is still answerable, and shortness alone is not evidence of truncation.
 *    Measured on `chaos-500.json`: no message ends in an ellipsis, none ends on
 *    a dangling article, preposition or conjunction, and none is unterminated.
 *    The shortest message is 14 words.
 *
 * 2. The keyword test is language-scoped. The corpus's `triggerKeywords` are
 *    English while the corpus and the batch are English, Spanish, Brazilian
 *    Portuguese and French. An English-only keyword test would label 112
 *    non-English queries unanswerable when a human could answer every one of
 *    them — the same labelling error in the opposite direction. The test
 *    therefore runs only when the query's language matches the keyword set's
 *    language.
 *
 * Measured outcome on the approved batch: 0 of 500 queries are reclassified.
 * The batch contains no truncated query, so the rule is inert on it. It stays
 * in code so that a truncated query, if one is ever added to the batch, is
 * labelled correctly instead of being counted as a failure.
 */

export type ExpectedOutcome = 'answer' | 'escalate';

export interface QueryLabelInput {
  readonly message: string;
  readonly language: string | undefined;
  readonly expectedDecision: ExpectedOutcome;
  readonly procedureKeywords: readonly string[];
}

export interface QueryLabel {
  readonly expectedOutcome: ExpectedOutcome;
  readonly truncated: boolean;
  readonly reclassified: boolean;
  readonly reason: string;
}

/** The corpus authors its trigger keywords in English; only English queries are compared. */
const KEYWORD_LANGUAGE = 'en';

/** Below this, a truncated query carries no answerable question. */
const MIN_WORDS = 4;

/**
 * Words that cannot end a sentence, so a message that ends on one was cut off.
 *
 * Articles, prepositions and conjunctions only. Demonstratives and pronouns are
 * deliberately excluded: "The help pages do not cover this." is a complete
 * sentence, and so is "...I did not expect that." Including them would
 * misclassify eight complete tickets in this batch as truncated.
 */
const DANGLING_ENDINGS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'with', 'about', 'of', 'in', 'on', 'at',
  'from', 'by', 'as', 'because', 'if', 'my', 'your', 'our', 'their', 'its',
  'his', 'her',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Count whitespace-separated tokens in a message. */
export function countWords(message: string): number {
  return message.trim().split(/\s+/).filter((token) => token.length > 0).length;
}

/**
 * Whether a message was cut off mid-thought: it ends in an ellipsis, or it ends
 * on a word that cannot close a sentence. A guard, not a classifier — it fires
 * on no message in the approved batch.
 */
export function isTruncatedQuery(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) return true;
  if (/(?:\.\.\.|…)\s*$/.test(trimmed)) return true;
  const lastToken = trimmed.split(/\s+/).at(-1) ?? '';
  const lastWord = lastToken.replace(/[^\p{L}]/gu, '').toLowerCase();
  return lastWord.length > 0 && DANGLING_ENDINGS.has(lastWord);
}

/** Whether the message contains any of a procedure's trigger keywords. */
export function containsTriggerKeyword(
  message: string,
  keywords: readonly string[],
): boolean {
  return keywords.some((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'iu').test(message),
  );
}

/**
 * Resolve the expected outcome for one query.
 *
 * @param input The query text, its declared language, the batch's own expected
 *   decision, and the trigger keywords of the procedure the batch points at.
 * @returns The outcome the evaluator scores against, whether the query was
 *   treated as truncated, whether the label changed, and why.
 */
export function labelQuery(input: QueryLabelInput): QueryLabel {
  if (input.expectedDecision === 'escalate') {
    return {
      expectedOutcome: 'escalate',
      truncated: false,
      reclassified: false,
      reason: 'batch already expects escalation',
    };
  }
  if (!isTruncatedQuery(input.message)) {
    return {
      expectedOutcome: 'answer',
      truncated: false,
      reclassified: false,
      reason: 'query is complete',
    };
  }
  const words = countWords(input.message);
  if (words < MIN_WORDS) {
    return {
      expectedOutcome: 'escalate',
      truncated: true,
      reclassified: true,
      reason: `truncated with ${words} words, fewer than ${MIN_WORDS}`,
    };
  }
  if (
    input.language === KEYWORD_LANGUAGE
    && !containsTriggerKeyword(input.message, input.procedureKeywords)
  ) {
    return {
      expectedOutcome: 'escalate',
      truncated: true,
      reclassified: true,
      reason: 'truncated with no surviving procedure trigger keyword',
    };
  }
  return {
    expectedOutcome: 'answer',
    truncated: true,
    reclassified: false,
    reason: 'truncated but an answerable question survives',
  };
}
