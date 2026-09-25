/**
 * Cosine retrieval.
 *
 * A full scan over an in-memory matrix, not an approximate index. Enterprise SOP
 * corpora run to the low thousands of procedures; at 384 dimensions a complete
 * scan is a fraction of a millisecond, and in exchange the score for a given
 * query and bundle version is exactly reproducible — which is what makes the
 * audit trail worth keeping. An ANN index would trade that guarantee for speed
 * this workload does not need.
 */

import type { MatchCandidate } from '@sop/core';

/** A procedure's passage vector, as held in the active bundle. */
export interface VectorEntry {
  readonly sopId: string;
  readonly vector: Float32Array;
  /** Source passage, returned as evidence when this entry wins. */
  readonly text?: string;
}

/**
 * Dot product of two equal-length vectors.
 *
 * Vectors from {@link createEmbedder} are unit length, so this is cosine
 * similarity; {@link cosineSimilarity} is used when that cannot be assumed.
 */
export function dot(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length) {
    throw new Error(`vector width mismatch: ${left.length} !== ${right.length}`);
  }

  let sum = 0;

  for (let index = 0; index < left.length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return sum;
}

/** Euclidean norm. */
export function magnitude(vector: Float32Array): number {
  return Math.sqrt(dot(vector, vector));
}

/**
 * Cosine similarity, normalising first.
 *
 * Use this for vectors of unknown provenance — for example a bundle produced by
 * an older model build. It is roughly twice the cost of {@link dot}.
 */
export function cosineSimilarity(
  left: Float32Array,
  right: Float32Array,
): number {
  const denominator = magnitude(left) * magnitude(right);

  if (denominator === 0) {
    return 0;
  }

  return dot(left, right) / denominator;
}

/**
 * Score every entry against a query and return the best `k`.
 *
 * Ties keep corpus order, so the result is a pure function of the bundle and the
 * query vector.
 *
 * @param query Unit-length query vector.
 * @param entries Passages in the active bundle.
 * @param k Maximum candidates to return.
 * @returns Candidates ordered by descending score, with the winning passage text
 * carried as evidence.
 */
export function searchTopKPassages(
  query: Float32Array,
  entries: readonly VectorEntry[],
  k: number,
): MatchCandidate[] {
  return entries
    .map((entry) => ({
      sopId: entry.sopId,
      score: dot(query, entry.vector),
      evidence: [entry.text ?? ''],
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, k);
}

export function searchTopK(
  query: Float32Array,
  entries: readonly VectorEntry[],
  k: number,
): MatchCandidate[] {
  const scored = searchTopKPassages(query, entries, entries.length);

  // Collapse passages to procedures, keeping each procedure's best passage. A
  // procedure that matches on several clauses must not crowd out the rest of the
  // candidate list.
  const bestPerProcedure = new Map<string, MatchCandidate>();

  for (const candidate of scored) {
    if (!bestPerProcedure.has(candidate.sopId)) {
      bestPerProcedure.set(candidate.sopId, candidate);
    }
  }

  return [...bestPerProcedure.values()].slice(0, k);
}
