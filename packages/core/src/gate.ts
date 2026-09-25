/**
 * The Confidence Gate.
 *
 * A deterministic comparison over a normalised score. There is no generative
 * component anywhere in this path: the gate either returns the matched
 * procedure together with its evidence, or it blocks the answer and hands the
 * case to a human. Nothing here synthesises, paraphrases, or guesses.
 */

import type {
  ConfidenceGateConfig,
  GateDecision,
  MatchCandidate,
} from './types.js';

/**
 * Rank the candidates, then accept or block.
 *
 * Ranking is a stable sort by descending score, so candidates that tie keep the
 * order they arrived in. Acceptance requires both signals: the winner must clear
 * `config.thresholdAccept` and must hold a gap of at least `config.minMargin`
 * over the runner-up. There is no review band and no fallback path.
 *
 * @param candidates Scored candidates from the active scorer.
 * @param config Gate configuration for the calling tenant.
 * @returns An acceptance carrying the winning procedure id, or a block carrying
 * the reason and the top-`k` evidence that justified it.
 */
export function evaluateGate(
  candidates: readonly MatchCandidate[],
  config: ConfidenceGateConfig,
): GateDecision {
  if (
    !Number.isFinite(config.thresholdAccept) ||
    !Number.isFinite(config.minMargin) ||
    !Number.isSafeInteger(config.topK) ||
    config.topK < 1
  ) {
    return { outcome: 'blocked', reason: 'invalid_candidate', evidence: [] };
  }

  const ranked = [...candidates]
    .sort((left, right) => right.score - left.score)
    .slice(0, config.topK);

  if (ranked.some((candidate) => !Number.isFinite(candidate.score))) {
    return { outcome: 'blocked', reason: 'invalid_candidate', evidence: [] };
  }

  const best = ranked[0];

  if (best === undefined) {
    return { outcome: 'blocked', reason: 'no_candidates', evidence: [] };
  }

  if (best.score < config.thresholdAccept) {
    return { outcome: 'blocked', reason: 'below_threshold', evidence: ranked };
  }

  const runnerUp = ranked[1];
  const margin = best.score - (runnerUp?.score ?? 0);

  if (margin < config.minMargin) {
    return {
      outcome: 'blocked',
      reason: 'insufficient_margin',
      evidence: ranked,
    };
  }

  return {
    outcome: 'accepted',
    sopId: best.sopId,
    score: best.score,
    evidence: ranked,
  };
}
