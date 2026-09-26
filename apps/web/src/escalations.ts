import type { EscalationReason } from '@sop/core';
import { supabase } from './supabase';

/**
 * The escalation console: where a human picks up what the gate refused.
 *
 * The agent view is deliberately content-free on a refusal — no title, no passage,
 * no suggested reply — because a low-confidence answer is worse than a handover.
 * That decision makes this screen load-bearing rather than optional: the person who
 * gets the escalation is the only one who can see the query and the candidates, so
 * the handover has to actually arrive somewhere. If nothing renders it, the
 * content-free design is just a query that disappears.
 *
 * Everything here is a read or a workflow write against `escalations`, and
 * row-level security is the authority for who may do what. This file decides what
 * the screen offers; it does not decide what is allowed.
 *
 * What the schema already guarantees, and what therefore shapes the design:
 *
 * - `ops_manager`, `team_lead` and `auditor` may read; a frontline `agent` and a
 *   `sop_editor` may not. The tab is gated, so a role that cannot read is not shown
 *   a queue that would load empty and look broken.
 * - Only `ops_manager` and `team_lead` may update, and only the columns `status`,
 *   `assigned_to`, `resolution`, `linked_sop_version` and `resolved_at`. The grant is
 *   per-column, so a caller cannot rewrite the evidence even if a policy were wrong.
 * - `evidence` is a `jsonb` snapshot taken at the moment of refusal, and it is the
 *   reason the record outlives the telemetry partition it came from.
 */

/** The workflow states a row can hold, enforced by a check constraint. */
export type EscalationWorkflow = 'open' | 'assigned' | 'resolved';

export interface EscalationCandidate {
  readonly sopId: string;
  readonly score: number;
  readonly passage: string;
}

/** The snapshot stored on the row. Matches `EscalationEvidence` in `@sop/core`. */
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

export interface Escalation {
  readonly id: string;
  readonly queryText: string;
  readonly reason: EscalationReason;
  readonly status: EscalationWorkflow;
  readonly occurredAt: string;
  readonly assignedTo: string | null;
  readonly resolution: string | null;
  readonly resolvedAt: string | null;
  readonly candidates: readonly EscalationCandidate[];
  readonly bundleVersion: number | null;
}

/** The row as PostgREST returns it: snake_case columns, everything else in `evidence`. */
interface EscalationRow {
  readonly id: string;
  readonly status: string;
  readonly query_occurred_at: string;
  readonly assigned_to: string | null;
  readonly resolution: string | null;
  readonly resolved_at: string | null;
  readonly evidence: Partial<EscalationEvidence> | null;
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

const asNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null);

function toCandidates(value: unknown): readonly EscalationCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object') return [];
    const candidate = entry as Record<string, unknown>;
    return [
      {
        sopId: asText(candidate.sopId),
        score: asNumber(candidate.score) ?? 0,
        passage: asText(candidate.passage),
      },
    ];
  });
}

/**
 * Assemble a row, defaulting anything the snapshot does not carry.
 *
 * The evidence is `jsonb` written by a client that may since have changed, so a
 * missing field is a normal condition rather than a reason to throw. Throwing here
 * would take down the whole queue over one malformed row, and an operator needs to
 * see the malformed row to report it.
 */
function toEscalation(row: EscalationRow): Escalation {
  const evidence = row.evidence ?? {};
  return {
    id: row.id,
    queryText: asText(evidence.queryText),
    reason: asText(evidence.reason) as EscalationReason,
    status: row.status as EscalationWorkflow,
    occurredAt: row.query_occurred_at,
    assignedTo: row.assigned_to,
    resolution: row.resolution,
    resolvedAt: row.resolved_at,
    candidates: toCandidates(evidence.candidates),
    bundleVersion: asNumber(evidence.bundleVersion),
  };
}

/**
 * Why a query was refused, in words a person can act on.
 *
 * The stored `reason` is a machine code. Showing the raw code would make the reader
 * look it up, and the code alone does not say what to do next.
 */
export function explainReason(reason: EscalationReason): string {
  switch (reason) {
    case 'insufficient_margin':
      return 'Two procedures scored almost the same, so the gate would not choose between them.';
    case 'below_threshold':
      return 'Nothing in the tenant policy scored high enough to answer.';
    case 'manual_review_required':
      return 'A confident match, but this procedure is marked as always needing a human.';
    case 'bundle_inconsistent':
      return 'The bundle on this device did not verify, so the query could not be trusted.';
    default:
      return 'The gate refused this query.';
  }
}

export async function listEscalations(limit = 50): Promise<Escalation[]> {
  // No filter argument is passed, so the tenant comes from the JWT through
  // `app.current_tenant()` and RLS does the scoping. A caller cannot widen it.
  const { data, error } = await supabase()
    .from('escalations')
    .select('id, status, query_occurred_at, assigned_to, resolution, resolved_at, evidence')
    .order('query_occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`could not load the escalation queue: ${error.message}`);
  }

  return (data as EscalationRow[]).map(toEscalation);
}

/**
 * Move a row through its workflow.
 *
 * The status change and the note travel together, because a resolved row with no
 * explanation is not a resolution — it is a deletion with a timestamp on it.
 */
export async function updateEscalation(
  id: string,
  patch: { status: EscalationWorkflow; resolution?: string },
): Promise<void> {
  const body: Record<string, string> = { status: patch.status };
  if (patch.resolution !== undefined) {
    body.resolution = patch.resolution;
    if (patch.status === 'resolved') {
      body.resolved_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase().from('escalations').update(body).eq('id', id).select('id');

  if (error) {
    throw new Error(`could not update the escalation: ${error.message}`);
  }

  // A no-op update returns no rows, and row-level security filters rows rather than
  // raising — so an update silently filtered to zero reports success while changing
  // nothing. Selecting the affected rows and checking the count is the difference
  // between "it worked" and "it looked like it worked". This is the same trap as the
  // device re-key in the bundle slice, and the reason this check exists.
  if ((data as { id: string }[] | null)?.length === 0) {
    throw new Error('the update matched no escalation on this tenant, so nothing changed');
  }
}
