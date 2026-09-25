/**
 * Client-side telemetry queue — Phase 5, hardened in Phase 7.
 *
 * Every query the edge engine runs emits one telemetry event; every refused
 * query also emits an escalation record. Both are buffered here and flushed in
 * order — events first, then escalations — because the escalation references its
 * query event by provenance, and the server (`app.ingest_escalation`) rejects an
 * escalation whose event is absent.
 *
 * Phase 7 hardening, in answer to three failures the prototype would have had:
 *
 *   1. A transport error previously lost everything sent after it. Each item now
 *      carries its own attempt count; a failed item stays queued and retries
 *      with capped exponential backoff, while its predecessors that succeeded
 *      are already gone.
 *   2. An offline client could buffer without bound. The queue now sheds the
 *      oldest unreferenced query events past a cap — and raises a flag the UI
 *      must surface, because a shed funnel row is a real loss. Escalation records
 *      and the query events they reference are never shed together.
 *   3. Nothing told the operator any of this. `overflowed` is a public, tested
 *      property, and the flush result reports what actually happened.
 *
 * Persistence is localStorage so an interrupted flush survives a reload. The
 * transport remains the integration seam: once Phase 3's sync transport and the
 * Supabase Edge Function exist, the transport calls `app.ingest_telemetry_event`
 * and `app.ingest_escalation`.
 */

import type { EscalationRecord } from '@sop/core';

export type Uuid = `${string}-${string}-${string}-${string}-${string}`;

export interface QueryTelemetryEvent {
  readonly id: Uuid;
  readonly deviceId: Uuid | null;
  readonly userPseudonym: string;
  readonly eventType: 'query';
  readonly bundleVersion: number;
  readonly occurredAt: string;
  readonly payload: QueryPayload;
}

export interface QueryCandidateEvidence {
  readonly sopId: string;
  readonly score: number;
  readonly passage: string;
}

export interface QueryPayload {
  readonly outcome: 'answered' | 'escalated';
  readonly sopId: string | null;
  readonly score: number | null;
  readonly margin: number | null;
  readonly gateReason: string | null;
  readonly thresholdAccept: number;
  readonly minMargin: number;
  readonly topCandidates: readonly QueryCandidateEvidence[];
}

export interface Transport {
  sendEvent(event: QueryTelemetryEvent): Promise<void>;
  sendEscalation(record: EscalationRecord): Promise<void>;
}

/** Oldest query events beyond this are shed, with the overflow flag raised. */
export const MAX_EVENTS = 200;

/** Escalation records are never shed; the cap exists to surface a backlog. */
export const MAX_ESCALATIONS = 50;

/** Backoff ceiling. A queue that has failed six times retries every minute. */
const MAX_BACKOFF_MS = 60_000;

const BASE_BACKOFF_MS = 1_000;

interface QueueItem<T> {
  readonly item: T;
  attempts: number;
  /** Earliest time the next attempt is allowed. Zero means due immediately. */
  nextAttemptAt: number;
}

interface QueueState {
  events: QueueItem<QueryTelemetryEvent>[];
  escalations: QueueItem<EscalationRecord>[];
  overflowed: boolean;
}

export interface FlushResult {
  readonly eventsSent: number;
  readonly escalationsSent: number;
  readonly failed: number;
  /** Items still queued after this flush (failed, deferred, or never attempted). */
  readonly remaining: number;
}

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export class TelemetryQueue {
  private events: QueueItem<QueryTelemetryEvent>[] = [];
  private escalations: QueueItem<EscalationRecord>[] = [];
  private overflowed = false;
  private readonly storageKey = 'sop-telemetry-queue-v2';

  constructor() {
    this.load();
  }

  enqueueEvent(event: QueryTelemetryEvent): void {
    this.events.push({ item: event, attempts: 0, nextAttemptAt: 0 });
    this.trimEvents();
    this.persist();
  }

  enqueueDecision(event: QueryTelemetryEvent, escalation: EscalationRecord | null): void {
    if (escalation !== null && escalation.queryEventId !== event.id) {
      throw new Error('escalation does not reference the query event');
    }

    if (escalation !== null) {
      this.escalations.push({ item: escalation, attempts: 0, nextAttemptAt: 0 });
      this.overflowed = this.overflowed || this.escalations.length > MAX_ESCALATIONS;
    }

    this.events.push({ item: event, attempts: 0, nextAttemptAt: 0 });
    this.trimEvents();
    this.persist();
  }

  enqueueEscalation(record: EscalationRecord): void {
    this.escalations.push({ item: record, attempts: 0, nextAttemptAt: 0 });
    // Deliberately no shedding here. An escalation is the durable record that a
    // customer question went unanswered; the cap surfaces the backlog instead.
    this.overflowed = this.overflowed || this.escalations.length > MAX_ESCALATIONS;
    this.persist();
  }

  get pending(): number {
    return this.events.length + this.escalations.length;
  }

  /** True once any telemetry has been shed or the escalation backlog is over cap. */
  get hasOverflowed(): boolean {
    return this.overflowed;
  }

  /** Items whose backoff has elapsed — what the next flush would attempt. */
  due(now: number): number {
    return (
      this.events.filter((entry) => entry.nextAttemptAt <= now).length +
      this.escalations.filter((entry) => entry.nextAttemptAt <= now).length
    );
  }

  /**
   * Attempts every due item, events before escalations so the referenced query
   * event exists on the server before the escalation names it.
   *
   * A failed send keeps its item queued with a longer backoff; sends after a
   * failure are still attempted, because a poison item must not block the
   * queue. Ordering therefore holds per flush pass, not across retries — the
   * server's own integrity trigger makes a late event sibling safe, since the
   * escalation would be rejected and retried rather than half-applied.
   *
   * @param transport The send side.
   * @param now Clock override for tests; defaults to wall time.
   */
  async flush(
    transport: Transport,
    now: number = Date.now(),
  ): Promise<FlushResult> {
    let eventsSent = 0;
    let escalationsSent = 0;
    let failed = 0;

    for (const entry of this.events) {
      if (entry.nextAttemptAt > now) continue;

      try {
        await transport.sendEvent(entry.item);
        entry.attempts = -1; // mark for removal without mutating during iteration
        eventsSent += 1;
      } catch {
        entry.attempts += 1;
        entry.nextAttemptAt = now + backoffMs(entry.attempts);
        failed += 1;
      }
    }

    for (const entry of this.escalations) {
      if (entry.nextAttemptAt > now) continue;

      try {
        await transport.sendEscalation(entry.item);
        entry.attempts = -1;
        escalationsSent += 1;
      } catch {
        entry.attempts += 1;
        entry.nextAttemptAt = now + backoffMs(entry.attempts);
        failed += 1;
      }
    }

    this.events = this.events.filter((entry) => entry.attempts !== -1);
    this.escalations = this.escalations.filter((entry) => entry.attempts !== -1);
    this.persist();

    return {
      eventsSent,
      escalationsSent,
      failed,
      remaining: this.pending,
    };
  }

  private trimEvents(): void {
    while (this.events.length > MAX_EVENTS) {
      const referencedEventIds = new Set(
        this.escalations.map((entry) => entry.item.queryEventId),
      );
      const sheddable = this.events.findIndex((entry) => !referencedEventIds.has(entry.item.id));
      if (sheddable === -1) {
        this.overflowed = true;
        break;
      }
      this.events.splice(sheddable, 1);
      this.overflowed = true;
    }
  }

  private persist(): void {
    try {
      const state: QueueState = {
        events: this.events,
        escalations: this.escalations,
        overflowed: this.overflowed,
      };
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch {
      // storage unavailable (private mode / SSR) — keep the in-memory buffer
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw === null) return;

      const parsed = JSON.parse(raw) as Partial<QueueState>;
      this.events = Array.isArray(parsed.events)
        ? parsed.events.filter((entry) => entry && typeof entry === 'object' && 'item' in entry)
        : [];
      this.escalations = Array.isArray(parsed.escalations)
        ? parsed.escalations.filter((entry) => entry && typeof entry === 'object' && 'item' in entry)
        : [];
      this.overflowed = parsed.overflowed === true;
    } catch {
      // corrupt payload — start empty rather than crash the client
    }
  }
}
