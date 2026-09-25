/**
 * The agent view.
 *
 * What the frontline agent is allowed to see, as a type rather than a convention.
 *
 * The design's hardest rule is that a blocked query shows **no procedure content
 * at all** — not the near-miss, not a hint, not a candidate title. A rule like
 * that enforced only in a component will eventually be broken by a component.
 * Here it is enforced by the shape of the type: {@link EscalationView} has no
 * field capable of carrying procedure content, and it does not carry the
 * candidate list either. The candidates go to the ops manager through the
 * escalation record, which is a different object with a different audience.
 *
 * An agent who can see that the system was *nearly* sure will start guessing,
 * and guessing is the behaviour this product exists to prevent.
 */

import type {
  GateBlockReason,
  GateDecision,
  MatchCandidate,
  SopDocument,
} from './types.js';

/** One retrieved candidate, with the passage that produced its score. */
export interface EvidenceEntry {
  readonly sopId: string;
  readonly score: number;
  /** The passage that matched. This is the "why" behind the score. */
  readonly passage: string;
}

/** Which bundle answered the query. Shown on every answer, so staleness is visible. */
export interface BundleContext {
  readonly bundleVersion: number;
  readonly modelId: string;
  readonly modelRevision: string;
}

/** A confident match, presented with its evidence. */
export interface AnswerView {
  readonly kind: 'answer';
  readonly sop: SopDocument;
  readonly score: number;
  readonly margin: number;
  readonly bundleVersion: number;
  readonly evidence: readonly EvidenceEntry[];
}

/**
 * Why the agent is being asked to escalate.
 *
 * `bundle_inconsistent` is not a gate outcome: it means the gate named a
 * procedure that the active bundle does not contain, which is a data integrity
 * failure. `manual_review_required` means the matched SOP itself forbids an
 * automatic answer. Both are surfaced as escalations because refusing to answer
 * is the safe response.
 */
export type EscalationReason =
  | GateBlockReason
  | 'bundle_inconsistent'
  | 'manual_review_required';

/**
 * A refused query. Deliberately carries no procedure content and no candidate
 * titles — only the fact of the refusal, its cause, and a reference to the
 * escalation that was opened.
 */
export interface EscalationView {
  readonly kind: 'escalation';
  readonly reason: EscalationReason;
  readonly escalationId: string;
  readonly bundleVersion: number;
  readonly message: string;
}

export type AgentView = AnswerView | EscalationView;

/** Human-readable cause, written for an agent under time pressure. */
function messageFor(reason: EscalationReason): string {
  switch (reason) {
    case 'no_candidates':
      return 'No procedure in the current policy set resembles this request. Escalated for human handling.';
    case 'below_threshold':
      return 'The closest procedure did not reach the confidence threshold. Escalated for human handling.';
    case 'insufficient_margin':
      return 'Two or more procedures matched equally closely, so no single answer can be justified. Escalated for human handling.';
    case 'invalid_candidate':
      return 'The retrieval result failed validation. Escalated rather than answered.';
    case 'bundle_inconsistent':
      return 'The policy set is internally inconsistent. Escalated rather than answered.';
    case 'manual_review_required':
      return 'The matched policy requires human review. No procedure content or reply is shown.';
  }
}

function toEvidence(candidates: readonly MatchCandidate[]): EvidenceEntry[] {
  return candidates.map((candidate) => ({
    sopId: candidate.sopId,
    score: candidate.score,
    passage: candidate.evidence[0] ?? '',
  }));
}

/**
 * Turn a gate decision into what the agent sees.
 *
 * @param decision Outcome of {@link evaluateGate}.
 * @param corpus Procedures in the active bundle.
 * @param bundleVersion Version of the active bundle.
 * @param escalationId Identifier for the escalation to open if the gate refused.
 * @returns An answer carrying its evidence, or a refusal carrying no procedure
 * content whatsoever.
 */
export function buildAgentView(
  decision: GateDecision,
  corpus: readonly SopDocument[],
  bundleVersion: number,
  escalationId: string,
): AgentView {
  if (decision.outcome === 'blocked') {
    return {
      kind: 'escalation',
      reason: decision.reason,
      escalationId,
      bundleVersion,
      message: messageFor(decision.reason),
    };
  }

  const sop = corpus.find((document) => document.id === decision.sopId);

  if (sop === undefined) {
    // The gate named a procedure the bundle does not contain. Refusing is the
    // only safe response; answering from a stale id is not.
    return {
      kind: 'escalation',
      reason: 'bundle_inconsistent',
      escalationId,
      bundleVersion,
      message: messageFor('bundle_inconsistent'),
    };
  }

  if (sop.escalationRequired) {
    return {
      kind: 'escalation',
      reason: 'manual_review_required',
      escalationId,
      bundleVersion,
      message: messageFor('manual_review_required'),
    };
  }

  const evidence = toEvidence(decision.evidence);
  const top = evidence[0];
  const runnerUp = evidence[1];

  return {
    kind: 'answer',
    sop,
    score: decision.score,
    margin: (top?.score ?? decision.score) - (runnerUp?.score ?? 0),
    bundleVersion,
    evidence,
  };
}
