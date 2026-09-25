/**
 * Passage extraction.
 *
 * Measurement drove this module into existence. Embedding a whole procedure —
 * title plus a five-sentence policy summary — into a single 384-dimension vector
 * dilutes the signal: on the golden set, in-scope top-1 scores ran 0.13 to 0.72
 * while out-of-scope queries reached 0.39, so no threshold could separate them
 * and the 0.90 gate in the design document answered nothing at all.
 *
 * The corpus is therefore indexed as passages rather than documents. A query is
 * compared against focused units of text — a title, one policy sentence, an
 * escalation rule — and the best passage decides the procedure. This is also
 * what makes the answer explainable: the winning passage is the evidence shown
 * to the agent and written to the audit trail.
 */

import type { SopDocument } from '@sop/core';

/** Which part of a procedure a passage came from. */
export type PassageField = 'title' | 'summary' | 'escalation';

/** One indexable unit of text, always attributable to a procedure. */
export interface Passage {
  readonly sopId: string;
  readonly field: PassageField;
  readonly text: string;
}

/** Sentences shorter than this are fragments and are not indexed. */
const MIN_PASSAGE_LENGTH = 24;

/**
 * Split prose into sentences.
 *
 * Deliberately simple: a sentence terminator followed by whitespace. It will
 * mis-split on abbreviations and decimals, which costs a little recall and never
 * changes which procedure wins. A real corpus should carry author-supplied
 * clause boundaries instead.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= MIN_PASSAGE_LENGTH);
}

/**
 * Break one procedure into passages.
 *
 * @param document Procedure as delivered in the policy bundle.
 * @returns Passages in a stable order, so vectors stay index-aligned.
 */
export function buildPassages(document: SopDocument): Passage[] {
  const passages: Passage[] = [
    { sopId: document.id, field: 'title', text: `${document.title} — ${document.category}` },
  ];

  for (const sentence of splitSentences(document.summary)) {
    passages.push({ sopId: document.id, field: 'summary', text: sentence });
  }

  if (document.escalationReason.length >= MIN_PASSAGE_LENGTH) {
    passages.push({
      sopId: document.id,
      field: 'escalation',
      text: document.escalationReason,
    });
  }

  return passages;
}

/**
 * Break a whole corpus into passages.
 *
 * @param documents Procedures in the active policy bundle.
 * @returns A flat, order-stable passage list for the index.
 */
export function buildCorpusPassages(
  documents: readonly SopDocument[],
): Passage[] {
  return documents.flatMap((document) => buildPassages(document));
}
