/**
 * The escalation record.
 *
 * A different audience from the agent view, and deliberately a different object.
 * The ops manager needs everything: the query, the scores, the passages that
 * nearly matched. The agent needs none of it. Keeping them as separate types
 * means neither can be leaked into the other's surface by accident.
 *
 * The shape maps onto `escalations` in the Command Center:
 *
 *   escalationId       -> escalations.id
 *   queryEventId       -> escalations.query_event_id
 *   queryOccurredAt    -> escalations.query_occurred_at
 *   evidence           -> escalations.evidence  (jsonb)
 *
 * `evidence` is stored on the row rather than joined back to telemetry, because
 * telemetry partitions are retired and an escalation must outlive them. See the
 * design, §13.
 */

import type { GateBlockReason, GateDecision, GateParameters, MatchCandidate } from './types.js';
import type { EscalationReason } from './agent-view.js';

/** One near-miss, kept so the ops manager can see what the agent almost got. */
export interface EscalationCandidate {
  readonly sopId: string;
  readonly score: number;
  readonly passage: string;
}

/**
 * The jsonb payload stored on the escalation row.
 *
 * Carries the model identity as well as the bundle version: a score is only
 * meaningful against the model that produced it, and a threshold is only
 * meaningful against the bundle it was calibrated for.
 */
export interface EscalationEvidence {
  readonly queryText: string;
  readonly reason: EscalationReason;
  readonly thresholdAccept: number;
  readonly minMargin: number;
  readonly bundleVersion: number;
  readonly modelId: string;
  readonly modelRevision: string;
  readonly candidates: readonly EscalationCandidate[];
}

/** Everything needed to insert one row into `escalations`. */
export interface EscalationRecord {
  readonly escalationId: string;
  readonly queryEventId: string;
  readonly queryOccurredAt: string;
  readonly evidence: EscalationEvidence;
}

export interface EscalationInput {
  readonly escalationId: string;
  readonly queryEventId: string;
  readonly queryOccurredAt: string;
  readonly queryText: string;
  readonly bundleVersion: number;
  readonly modelId: string;
  readonly modelRevision: string;
  readonly parameters: GateParameters;
}

function toCandidates(candidates: readonly MatchCandidate[]): EscalationCandidate[] {
  return candidates.map((candidate) => ({
    sopId: candidate.sopId,
    score: candidate.score,
    passage: candidate.evidence[0] ?? '',
  }));
}

/**
 * Build the record for a refused query.
 *
 * @param reason Why the gate refused.
 * @param decision The gate decision, whose evidence becomes the candidate list.
 * @param input Identifiers, query text and the parameters in force.
 * @returns A record ready to insert into `escalations`.
 */
export function buildEscalationRecord(
  reason: EscalationReason,
  decision: GateDecision,
  input: EscalationInput,
): EscalationRecord {
  const candidates = toCandidates(decision.evidence);

  return {
    escalationId: input.escalationId,
    queryEventId: input.queryEventId,
    queryOccurredAt: input.queryOccurredAt,
    evidence: {
      queryText: input.queryText,
      reason,
      thresholdAccept: input.parameters.thresholdAccept,
      minMargin: input.parameters.minMargin,
      bundleVersion: input.bundleVersion,
      modelId: input.modelId,
      modelRevision: input.modelRevision,
      candidates,
    },
  };
}

/** Narrowing helper for callers that hold a `GateBlockReason`. */
export function isBlockReason(reason: EscalationReason): reason is GateBlockReason {
  return reason !== 'bundle_inconsistent' && reason !== 'manual_review_required';
}
