/**
 * Transitional keyword scorer.
 *
 * Reproduces the prototype's original matching rule verbatim so that Phase 0 is
 * a pure structural change: a procedure scores one point per trigger term found
 * in the query, compared case-insensitively, and only procedures with at least
 * one hit become candidates.
 *
 * The score is reported in units of required matches rather than as a ratio, so
 * `1.0` equals the legacy bar of {@link LEGACY_REQUIRED_MATCHES} hits and the
 * ranking of procedures with three or more hits is preserved exactly. Phase 1
 * deletes this module and the unit with it, replacing both with the on-device
 * embedding scorer and a cosine threshold.
 */

import type { MatchCandidate, SopDocument } from '../types.js';
import { LEGACY_REQUIRED_MATCHES } from '../types.js';

/**
 * Score every procedure in the corpus against a query.
 *
 * @param query Raw agent-entered customer message.
 * @param corpus Procedures in the active policy bundle.
 * @returns One candidate per procedure with at least one trigger-term hit.
 */
export function scoreByKeywords(
  query: string,
  corpus: readonly SopDocument[],
): MatchCandidate[] {
  const haystack = query.toLowerCase();
  const candidates: MatchCandidate[] = [];

  for (const document of corpus) {
    const hits = document.triggerKeywords.filter((term) =>
      haystack.includes(term.toLowerCase()),
    );

    if (hits.length === 0) {
      continue;
    }

    candidates.push({
      sopId: document.id,
      score: hits.length / LEGACY_REQUIRED_MATCHES,
      evidence: hits,
    });
  }

  return candidates;
}
